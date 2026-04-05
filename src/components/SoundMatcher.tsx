/**
 * SoundMatcher
 * ──────────────────────────────────────────────────────────────────────────────
 * Converts an external audio file (.wav / .mp3) into a PreenFM3 patch via the
 * trained CVAE encoder → decoder pipeline.
 *
 * Flow:
 *   1. User drops / selects an audio file.
 *   2. The file is decoded with the Web Audio API.
 *   3. A 128×1024 STFT spectrogram is computed using the same FFT parameters
 *      as PreenSpectrogram (FFT_SIZE=2048, N_BINS=1024, N_FRAMES=128).
 *   4. The spectrogram is fed to the CVAE encoder together with the current
 *      patch params, yielding a latent mean z.
 *   5. z is decoded back to a 37-dim FM parameter vector → Patch.
 *   6. The result is sent to the PreenFM3 via NRPN so the user hears it live.
 *
 * Fine-Tune button: once a match exists, generates 5 nearby variations at
 * low chaos using the matched patch + same spectrogram as style input.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import styled, { useTheme } from 'styled-components';
import * as tf from '@tensorflow/tfjs';
import { useCurrentPatch, usePatchStore } from '../stores/patchStore';
import { useMidiStore } from '../midi/usePreenFM3Midi';
import { patchToNRPNMessages } from '../midi/patchSerializer';
import { sendNRPN, clearNRPNQueue, drainNRPNQueue } from '../midi/midiService';
import { variator, generateVariations } from '../ml/patchVariator';
import type { Patch } from '../types/patch';

// ── Spectrogram constants (must match PreenSpectrogram.tsx) ───────────────────

const FFT_SIZE = 2048;
const N_BINS   = FFT_SIZE / 2; // 1024
const N_FRAMES = 128;

// ── Audio helpers ─────────────────────────────────────────────────────────────

/**
 * Decode a File (wav/mp3/…) to an AudioBuffer using a one-shot AudioContext.
 */
async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close();
  }
}

/**
 * Compute a 128×1024 spectrogram from an AudioBuffer using Hann-windowed STFT
 * (tf.signal.stft).
 *
 * Output values are in [0, 1] using the same dB-to-byte normalisation as the
 * Web Audio AnalyserNode defaults (minDecibels=-100, maxDecibels=-30):
 *   normalised = clamp((dBFS + 100) / 70, 0, 1)
 * where dBFS = 20 * log10(magnitude / (FFT_SIZE/4)).
 * This matches the byte/255 values stored in JSONL spectrograms by PresetBankHarvester.
 */
async function computeSpectrogram(
  audioBuffer: AudioBuffer,
  onProgress?: (pct: number) => void,
): Promise<Float32Array> {
  const length = audioBuffer.length;

  // Mix all channels to mono
  const mono = new Float32Array(length);
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / audioBuffer.numberOfChannels;
  }

  onProgress?.(0.1);
  await new Promise<void>(r => setTimeout(r, 0)); // let UI breathe

  // Hop size so the STFT produces at least N_FRAMES frames
  const hopSize = Math.max(1, Math.floor(Math.max(1, length - FFT_SIZE) / (N_FRAMES - 1)));

  // Run the full STFT in a single tf.tidy to minimise allocations.
  // tf.signal.stft returns a complex tensor [numFrames, FFT_SIZE / 2 + 1].
  const magTensor = tf.tidy(() => {
    const signal  = tf.tensor1d(mono);
    const stftOut = tf.signal.stft(signal, FFT_SIZE, hopSize, FFT_SIZE, tf.signal.hannWindow);
    const mags    = tf.abs(stftOut); // [numFrames, FFT_SIZE/2 + 1]
    // Keep exactly N_FRAMES rows and N_BINS columns
    const framesAvail = Math.min(N_FRAMES, mags.shape[0]);
    return mags.slice([0, 0], [framesAvail, N_BINS]);
  }) as tf.Tensor2D;

  onProgress?.(0.85);
  await new Promise<void>(r => setTimeout(r, 0));

  const magData         = magTensor.dataSync();
  const framesAvail     = magTensor.shape[0];
  magTensor.dispose();

  // Normalise with (dBFS + 100) / 70 — matches getByteFrequencyData / 255.0 used by
  // PreenSpectrogram / PresetBankHarvester (AnalyserNode defaults: min=-100, max=-30 dBFS).
  // REF_MAG = FFT_SIZE/4 gives 0 dBFS for a full-scale Hann-windowed sine (TF.js unnormalized FFT).
  const REF_MAG = FFT_SIZE / 4;
  const output = new Float32Array(N_FRAMES * N_BINS);
  for (let f = 0; f < framesAvail; f++) {
    for (let k = 0; k < N_BINS; k++) {
      const mag = magData[f * N_BINS + k];
      const dBFS = mag > 0 ? 20 * Math.log10(mag / REF_MAG) : -300;
      output[f * N_BINS + k] = Math.max(0, Math.min(1, (dBFS + 100) / 70));
    }
  }

  onProgress?.(1);
  return output;
}

/**
 * Draw a mono waveform onto a canvas.
 */
function drawWaveform(
  canvas: HTMLCanvasElement,
  audioBuffer: AudioBuffer,
  primaryColor: string,
  bgColor: string,
  borderColor: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, W, H);

  // Mix channels
  const length = audioBuffer.length;
  const mono   = new Float32Array(length);
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += ch[i] / audioBuffer.numberOfChannels;
  }

  // Center line
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
  ctx.stroke();

  // Waveform bars
  const spp = Math.max(1, Math.ceil(length / W));
  ctx.fillStyle = primaryColor;
  for (let x = 0; x < W; x++) {
    let min = 0, max = 0;
    for (let i = 0; i < spp; i++) {
      const s = mono[x * spp + i] ?? 0;
      if (s < min) min = s;
      if (s > max) max = s;
    }
    const yTop = H / 2 - max * (H / 2 - 2);
    const yBot = H / 2 - min * (H / 2 - 2);
    ctx.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
  }
}

// ── Styled components ─────────────────────────────────────────────────────────

const Section = styled.section`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  letter-spacing: 0.03em;
`;

const DropZone = styled.div<{ $over: boolean; $hasFile: boolean }>`
  position: relative;
  border: 2px dashed ${({ $over, $hasFile, theme }) =>
    $over        ? theme.colors.primary :
    $hasFile     ? '#10b981' :
    theme.colors.border};
  border-radius: 8px;
  background: ${({ $over, theme }) => $over ? `${theme.colors.primary}10` : theme.colors.button};
  transition: border-color 0.15s, background 0.15s;
  cursor: pointer;
  overflow: hidden;
`;

const DropHint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 28px 16px;
  pointer-events: none;
`;

const DropIcon = styled.div`
  font-size: 2rem;
  line-height: 1;
`;

const DropText = styled.div`
  font-size: 0.78rem;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;

const DropSub = styled.div`
  font-size: 0.68rem;
  color: ${({ theme }) => theme.colors.textMuted};
  opacity: 0.6;
  font-family: monospace;
`;

const HiddenInput = styled.input`
  display: none;
`;

const WaveformCanvas = styled.canvas`
  display: block;
  width: 100%;
  height: 80px;
`;

const FileBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: ${({ theme }) => theme.colors.backgroundSecondary};
  font-size: 0.74rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const ProgressTrack = styled.div`
  width: 100%;
  height: 4px;
  background: ${({ theme }) => theme.colors.border};
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => $pct * 100}%;
  background: #6366f1;
  transition: width 0.1s linear;
`;

const ControlsRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'warn' | 'default' }>`
  padding: 7px 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  background: ${({ $variant, theme }) =>
    $variant === 'primary' ? theme.colors.primary :
    $variant === 'danger'  ? '#ef4444' :
    $variant === 'warn'    ? '#f59e0b' :
    theme.colors.button};
  color: ${({ $variant, theme }) =>
    $variant === 'primary' || $variant === 'danger' || $variant === 'warn'
      ? '#fff' : theme.colors.text};
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
  padding: 4px 10px;
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  border-radius: 5px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  background: ${({ $active, theme }) => $active ? `${theme.colors.primary}22` : theme.colors.button};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textMuted};
  transition: all 0.15s;
  &:hover { opacity: 0.8; }
`;

const ModeTag = styled.span`
  font-size: 0.7rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 3px 7px;
  margin-left: auto;
`;

const ResultCard = styled.div`
  background: ${({ theme }) => `${theme.colors.primary}0d`};
  border: 1.5px solid ${({ theme }) => theme.colors.primary};
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ResultName = styled.div`
  font-size: 0.9rem;
  font-family: monospace;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const ResultMeta = styled.div`
  font-size: 0.7rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.7;
`;

const ResultActions = styled.div`
  display: flex;
  gap: 6px;
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
`;

const Card = styled.div<{ $active: boolean; $sending: boolean }>`
  background: ${({ $active, theme }) => $active ? `${theme.colors.primary}1a` : theme.colors.backgroundSecondary};
  border: 1.5px solid ${({ $active, $sending, theme }) =>
    $sending ? '#f59e0b' : $active ? theme.colors.primary : theme.colors.border};
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s, background 0.2s;
`;

const CardName = styled.div`
  font-size: 0.82rem;
  font-family: monospace;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardActions = styled.div`
  display: flex;
  gap: 5px;
`;

const CardBtn = styled.button<{ $variant?: 'send' | 'load' }>`
  flex: 1;
  padding: 4px 0;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 5px;
  border: 1px solid ${({ $variant, theme }) =>
    $variant === 'send' ? theme.colors.primary :
    $variant === 'load' ? '#10b981' :
    theme.colors.border};
  background: ${({ $variant, theme }) =>
    $variant === 'send' ? `${theme.colors.primary}22` :
    $variant === 'load' ? '#10b98122' :
    theme.colors.button};
  color: ${({ $variant, theme }) =>
    $variant === 'send' ? theme.colors.primary :
    $variant === 'load' ? '#10b981' :
    theme.colors.text};
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.75; }
  &:disabled { opacity: 0.35; cursor: not-allowed; }
`;

const SectionLabel = styled.div`
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ErrorMsg = styled.div`
  font-size: 0.78rem;
  color: #ef4444;
  font-family: monospace;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 6px;
`;

// ── Component ─────────────────────────────────────────────────────────────────

export function SoundMatcher() {
  const currentPatch  = useCurrentPatch();
  const { loadPatch } = usePatchStore();
  const midiChannel   = useMidiStore(s => s.channel);
  const midiOutput    = useMidiStore(s => s.selectedOutput);
  const theme         = useTheme();

  // ── File / audio state
  const [dragOver,     setDragOver]     = useState(false);
  const [fileName,     setFileName]     = useState('');
  const [audioDuration, setAudioDuration] = useState(0);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const spectrogramRef = useRef<Float32Array | null>(null);

  // ── Processing state
  const [phase,      setPhase]      = useState<'idle' | 'decoding' | 'computing' | 'matching' | 'done' | 'error'>('idle');
  const [progress,   setProgress]   = useState(0);
  const [errorMsg,   setErrorMsg]   = useState('');

  // ── Result state
  const [matchedPatch,  setMatchedPatch]  = useState<Patch | null>(null);
  const [sendingMatch,  setSendingMatch]  = useState(false);
  const [refinements,   setRefinements]  = useState<Patch[]>([]);
  const [finetuning,    setFinetuning]   = useState(false);
  const [activeRefIdx,  setActiveRefIdx] = useState<number | null>(null);
  const [sendingRefIdx, setSendingRefIdx] = useState<number | null>(null);

  // ── Options
  const [algoLocked, setAlgoLocked] = useState(false);

  // ── Model loading (mirror PatchVariatorEditor so weights are ready)
  const [modelReady, setModelReady] = useState(variator.weightsLoaded);
  const [modelError, setModelError] = useState(false);

  useEffect(() => {
    if (variator.weightsLoaded) return;
    variator.loadWeights('/models/encoder/model.json', '/models/decoder/model.json')
      .then(() => setModelReady(true))
      .catch(err => {
        console.error('[SoundMatcher] Failed to load CVAE weights:', err);
        setModelError(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Canvas ref for waveform
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-draw waveform whenever audioBuffer or canvas size changes
  useEffect(() => {
    if (!audioBufferRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width  = canvas.offsetWidth  || 600;
    canvas.height = canvas.offsetHeight || 80;
    drawWaveform(
      canvas,
      audioBufferRef.current,
      '#6366f1',
      theme.colors.button,
      theme.colors.border,
    );
  }, [fileName, theme]);

  // ── File handling ───────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|ogg|flac|aac|m4a)$/i.test(file.name)) {
      setPhase('error');
      setErrorMsg('Unsupported file type. Please drop a .wav or .mp3 file.');
      return;
    }

    setFileName(file.name);
    setPhase('decoding');
    setProgress(0);
    setMatchedPatch(null);
    setRefinements([]);
    spectrogramRef.current = null;

    try {
      const ab = await decodeAudioFile(file);
      audioBufferRef.current = ab;
      setAudioDuration(ab.duration);
      setPhase('idle');
    } catch (err) {
      setPhase('error');
      setErrorMsg(`Cannot decode audio: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  // ── Match ───────────────────────────────────────────────────────────────────

  const handleMatch = useCallback(async () => {
    const ab = audioBufferRef.current;
    const base = currentPatch;
    if (!ab || !base) return;

    setPhase('computing');
    setProgress(0);
    setMatchedPatch(null);
    setRefinements([]);

    try {
      // Step 1: compute spectrogram (async, ~128 RFFT calls)
      const spect = await computeSpectrogram(ab, pct => setProgress(pct * 0.8));
      spectrogramRef.current = spect;

      // Step 2: CVAE inference
      if (!variator.weightsLoaded) {
        throw new Error('Neural weights are not loaded. Check the browser console for loading errors.');
      }
      setPhase('matching');
      setProgress(0.85);
      await new Promise<void>(r => setTimeout(r, 0)); // paint update

      const patch = variator.matchSpectrogram(spect, base, algoLocked);
      if (!patch) throw new Error('Inference returned null — model may be incompatible.');

      setProgress(1);
      setMatchedPatch(patch);
      setPhase('done');

      // Step 3: auto-send to MIDI
      if (midiOutput) {
        setSendingMatch(true);
        clearNRPNQueue();
        for (const msg of patchToNRPNMessages(patch)) sendNRPN(msg, midiChannel);
        await drainNRPNQueue();
        setSendingMatch(false);
      }
    } catch (err) {
      setPhase('error');
      setErrorMsg(`Match failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [currentPatch, algoLocked, midiOutput, midiChannel]);

  // ── Fine-tune ────────────────────────────────────────────────────────────────

  const handleFineTune = useCallback(() => {
    if (!matchedPatch || !spectrogramRef.current) return;
    setFinetuning(true);
    setActiveRefIdx(null);
    setTimeout(() => {
      // Use matched patch as source + target spectrogram for style conditioning
      const refs = generateVariations(matchedPatch, 0.25, 5, spectrogramRef.current ?? undefined);
      setRefinements(refs);
      setFinetuning(false);
    }, 0);
  }, [matchedPatch]);

  // ── Send / load helpers ──────────────────────────────────────────────────────

  const sendPatch = useCallback(async (patch: Patch) => {
    if (!midiOutput) return;
    clearNRPNQueue();
    for (const msg of patchToNRPNMessages(patch)) sendNRPN(msg, midiChannel);
    await drainNRPNQueue();
  }, [midiOutput, midiChannel]);

  const sendRefinement = useCallback(async (patch: Patch, idx: number) => {
    setSendingRefIdx(idx);
    setActiveRefIdx(idx);
    await sendPatch(patch);
    setSendingRefIdx(null);
  }, [sendPatch]);

  const loadRefinement = useCallback(async (patch: Patch, idx: number) => {
    loadPatch(patch);
    await sendRefinement(patch, idx);
  }, [loadPatch, sendRefinement]);

  const loadMatchedPatch = useCallback(async () => {
    if (!matchedPatch) return;
    loadPatch(matchedPatch);
    await sendPatch(matchedPatch);
  }, [matchedPatch, loadPatch, sendPatch]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const hasFile    = !!audioBufferRef.current && fileName !== '';
  const isWorking  = phase === 'decoding' || phase === 'computing' || phase === 'matching';
  const canMatch   = hasFile && !isWorking && !!currentPatch;
  const canSend    = !!midiOutput;

  const statusLabel = (() => {
    if (phase === 'decoding')  return 'Decoding audio…';
    if (phase === 'computing') return `Computing spectrogram… ${Math.round(progress * 100)}%`;
    if (phase === 'matching')  return 'Running CVAE inference…';
    if (phase === 'done')      return '✓ Match complete';
    return '';
  })();

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Section>
      <Header>
        <Title>Sound Matcher</Title>
        <ModeTag title={
          modelReady ? 'CVAE neural inference ready' :
          modelError  ? 'Neural weights unavailable' :
          'Loading CVAE weights…'
        }>
          {modelReady ? '⚡ neural' : modelError ? '~ unavailable' : '⏳ loading…'}
        </ModeTag>
      </Header>

      {/* ── Drop zone ──────────────────────────────────────────────────── */}
      <DropZone
        $over={dragOver}
        $hasFile={hasFile}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isWorking && fileInputRef.current?.click()}
      >
        <HiddenInput
          ref={fileInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.flac,.aac,.m4a"
          onChange={handleFileInput}
        />

        {hasFile ? (
          <>
            <WaveformCanvas ref={canvasRef} height={80} />
            <FileBar>
              <span>{fileName}</span>
              <span>{audioDuration.toFixed(2)} s · {audioBufferRef.current?.sampleRate} Hz · {audioBufferRef.current?.numberOfChannels}ch</span>
            </FileBar>
          </>
        ) : (
          <DropHint>
            <DropIcon>🎵</DropIcon>
            <DropText>Drop an audio file here</DropText>
            <DropSub>wav · mp3 · ogg · flac · aac</DropSub>
          </DropHint>
        )}
      </DropZone>

      {/* ── Progress bar (while working) ───────────────────────────────── */}
      {isWorking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <ProgressTrack>
            <ProgressFill $pct={progress} />
          </ProgressTrack>
          <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: theme.colors.textMuted }}>
            {statusLabel}
          </div>
        </div>
      )}

      {/* ── Error message ──────────────────────────────────────────────── */}
      {phase === 'error' && <ErrorMsg>{errorMsg}</ErrorMsg>}

      {/* ── Controls ───────────────────────────────────────────────────── */}
      <ControlsRow>
        <Btn
          $variant="primary"
          onClick={handleMatch}
          disabled={!canMatch}
          title={
            !hasFile      ? 'Drop an audio file first' :
            !currentPatch ? 'No source patch' :
            !modelReady   ? 'Neural weights still loading…' :
            'Match audio to PreenFM3 patch'
          }
        >
          {phase === 'computing' || phase === 'matching' ? '⏳ Matching…' : '⚡ Match Sound'}
        </Btn>

        {matchedPatch && (
          <Btn onClick={handleFineTune} disabled={finetuning}>
            {finetuning ? '⏳…' : '✦ Fine-Tune'}
          </Btn>
        )}

        <ToggleBtn
          $active={algoLocked}
          onClick={() => setAlgoLocked(v => !v)}
          title={algoLocked ? 'Algorithm locked to source patch' : 'Algorithm may change during matching'}
        >
          {algoLocked ? '🔒 Algo locked' : '🔓 Algo free'}
        </ToggleBtn>

        <ModeTag>{canSend ? '● MIDI ready' : '○ no MIDI output'}</ModeTag>
      </ControlsRow>

      {/* ── Match result ───────────────────────────────────────────────── */}
      {matchedPatch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Matched patch</SectionLabel>
          <ResultCard>
            <ResultName title={matchedPatch.name}>{matchedPatch.name}</ResultName>
            <ResultMeta>
              algo: {matchedPatch.algorithm?.id ?? '?'} · source: {currentPatch?.name ?? '?'}
            </ResultMeta>
            <ResultActions>
              <Btn
                $variant="primary"
                disabled={!canSend || sendingMatch}
                onClick={() => sendPatch(matchedPatch)}
              >
                {sendingMatch ? '…' : '▶ Send'}
              </Btn>
              <Btn onClick={loadMatchedPatch} disabled={sendingMatch}>
                ↓ Load
              </Btn>
            </ResultActions>
          </ResultCard>
        </div>
      )}

      {/* ── Fine-tune cards ─────────────────────────────────────────────── */}
      {refinements.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SectionLabel>Fine-tuned variants</SectionLabel>
          <CardsGrid>
            {refinements.map((p, i) => (
              <Card key={i} $active={activeRefIdx === i} $sending={sendingRefIdx === i}>
                <CardName title={p.name}>{p.name}</CardName>
                <CardActions>
                  <CardBtn
                    $variant="send"
                    disabled={!canSend || sendingRefIdx !== null}
                    onClick={() => sendRefinement(p, i)}
                  >
                    {sendingRefIdx === i ? '…' : '▶ Send'}
                  </CardBtn>
                  <CardBtn
                    $variant="load"
                    disabled={sendingRefIdx !== null}
                    onClick={() => loadRefinement(p, i)}
                  >
                    ↓ Load
                  </CardBtn>
                </CardActions>
              </Card>
            ))}
          </CardsGrid>
        </div>
      )}

      {/* ── Info ───────────────────────────────────────────────────────── */}
      {!hasFile && !isWorking && (
        <div style={{ fontSize: '0.72rem', color: theme.colors.textMuted, lineHeight: 1.7, fontFamily: 'monospace' }}>
          The CVAE encoder maps your audio's spectral character to a 16-dim latent vector,
          then the decoder builds the closest FM patch from that representation.
          Results are conditioned on the currently selected patch.
        </div>
      )}
    </Section>
  );
}
