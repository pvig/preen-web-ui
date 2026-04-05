/**
 * PresetBankHarvester
 * ─────────────────────────────────────────────────────────────
 * Automated dataset harvester for PreenFM3 using Multi-Octave Bank Scanning.
 *
 * For each selected bank (CC32 0-9), for each slot (PC 0-127):
 *   1. Navigate to the slot (Bank Select + Program Change) and pull the patch
 *      via NRPN dump, then re-apply via NRPN to guarantee correct synth state.
 *   2. Trigger 4 MIDI notes in sequence: C1=36, C2=48, C3=60, C4=72.
 *      Each note: noteOn → hold recordingDurationMs → noteOff
 *               → tail detection (VCA release) → capture spectrogram.
 *   3. For each of the 4 recordings, generate `augmentationSteps` time-stretched
 *      variants (X-axis scaling) to simulate envelope timing variations.
 *      Total per patch: 4 octaves × (1 original + augmentationSteps) samples.
 *
 * Dataset format (JSONL, per sample):
 *   X: spectrogram Float32[128 × 1024]  — layout [frame * 128 + freq_bin]
 *   Y: params      Float32[37]          — normalized FM parameters in [0, 1]
 *   meta: { patch_name, bank_id, bank_label, slot_id, midi_note, note_label,
 *           augmentation_idx, stretch_factor, timestamp }
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import styled from 'styled-components';
import { patchToNRPNMessages } from '../midi/patchSerializer';
import {
  sendNRPN, clearNRPNQueue, drainNRPNQueue,
  sendCC, sendProgramChange, requestPatchDump, onNRPNScoped,
} from '../midi/midiService';
import { useMidiStore } from '../midi/usePreenFM3Midi';
import { PreenFM3Parser } from '../midi/preenFM3Parser';
import type { PreenSpectrogramHandle } from './PreenSpectrogram';
import type { Patch } from '../types/patch';

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'presetBankHarvester_v3_progress';
const PARAM_VECTOR_SIZE = 37;

// Multi-octave scanning: C1 C2 C3 C4
const OCTAVE_NOTES = [36, 48, 60, 72] as const;
const NOTE_LABELS: Record<number, string> = { 36: 'C1', 48: 'C2', 60: 'C3', 72: 'C4' };

// Time-stretch factors for augmented variants (factor > 1 = expand, < 1 = compress)
const AUGMENTATION_FACTORS = [0.75, 1.2, 1.5] as const;

const FREQ_BINS   = 128;   // spectrogram frequency bins
const TIME_FRAMES = 1024;  // spectrogram time frames

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HarvestConfig {
  bankStart:                    number;  // 0-based, first bank to scan
  bankEnd:                      number;  // 0-based, last bank to scan (inclusive)
  slotsPerBank:                 number;  // 1–128 slots to pull per bank
  midiThrottleMs:               number;  // extra delay after NRPN queue drains
  pullTimeoutMs:                number;  // max ms to wait for a patch dump reply
  pullNavigationMs:             number;  // ms to wait after bank/slot navigation before pulling
  pullInactivityMs:             number;  // ms of silence after last NRPN before declaring done
  recordingDurationMs:          number;  // note hold time (noteOn → noteOff)
  maxTailMs:                    number;  // max additional time to wait for VCA release tail
  tailSilenceMs:                number;  // silence duration that confirms tail end
  augmentationSteps:            number;  // time-stretch variants per recording (0–3)
  pitchNormalizeBinsPerSemitone: number; // 0 = disabled; ~2 to enable linear bin shift
  energyThreshold:              number;  // min mean energy to accept a sample
  batchSize:                    number;  // auto-export every N samples
}

const DEFAULT_CONFIG: HarvestConfig = {
  bankStart:                     0,
  bankEnd:                       9,
  slotsPerBank:                  128,
  midiThrottleMs:                150,
  pullTimeoutMs:                 5000,
  pullNavigationMs:              400,
  pullInactivityMs:              80,
  recordingDurationMs:           2000,
  maxTailMs:                     4000,
  tailSilenceMs:                 400,
  augmentationSteps:             3,
  pitchNormalizeBinsPerSemitone: 0,
  energyThreshold:               0.01,
  batchSize:                     200,
};


interface HarvestProgress {
  nextBankIdx:    number;   // bank-level resume: banks 0..nextBankIdx-1 are done
  totalStepsDone: number;
  skippedEmpty:   number;
  skippedSilent:  number;
}

export interface HarvestSample {
  meta: {
    patch_name:       string;
    bank_id:          number;
    bank_label:       string;
    slot_id:          number;
    midi_note:        number;
    note_label:       string;
    augmentation_idx: number;  // 0 = original, 1..N = time-stretched
    stretch_factor:   number;  // 1.0 for original
    timestamp:        number;
  };
  params:      number[];
  spectrogram: number[];
  energy:      number;
}

interface Props {
  spectrogramRef: RefObject<PreenSpectrogramHandle | null>;
}

type Phase = 'idle' | 'running';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function isEmptyPatch(p: Patch): boolean {
  const n = p?.name?.trim().toLowerCase() ?? '';
  return n === '' || n === 'init' || /^init(\s|$)/.test(n);
}

function computeEnergy(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i];
  return buf.length > 0 ? s / buf.length : 0;
}

/** Mean energy of the most recent `recentFrames` time frames. Layout: buf[frame * FREQ_BINS + bin]. */
function computeRecentEnergy(buf: Float32Array, recentFrames: number): number {
  const totalFrames = buf.length / FREQ_BINS;
  const startFrame  = Math.max(0, totalFrames - recentFrames);
  let s = 0, count = 0;
  for (let t = startFrame; t < totalFrames; t++) {
    for (let f = 0; f < FREQ_BINS; f++) { s += buf[t * FREQ_BINS + f]; count++; }
  }
  return count > 0 ? s / count : 0;
}

/**
 * Time-stretch a spectrogram along the time axis.
 *   factor > 1 → expand  (simulate slower/longer envelope, zero-pad end)
 *   factor < 1 → compress (simulate faster/shorter envelope)
 * Layout in/out: buf[frame * FREQ_BINS + freq_bin], same size TIME_FRAMES × FREQ_BINS.
 */
function timeStretchSpectrogram(buf: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(TIME_FRAMES * FREQ_BINS).fill(0);
  for (let t = 0; t < TIME_FRAMES; t++) {
    const srcT = t / factor;
    const t0   = Math.floor(srcT);
    if (t0 >= TIME_FRAMES) break;            // zero-pad remainder
    const t1    = Math.min(t0 + 1, TIME_FRAMES - 1);
    const alpha = srcT - t0;
    for (let f = 0; f < FREQ_BINS; f++) {
      const v0 = buf[t0 * FREQ_BINS + f];
      const v1 = buf[t1 * FREQ_BINS + f];
      out[t * FREQ_BINS + f] = v0 * (1 - alpha) + v1 * alpha;
    }
  }
  return out;
}

/**
 * Shift the spectrogram vertically so all octaves are centered on C3 (MIDI 60).
 * Uses a linear-bin approximation; set binsPerSemitone=0 to skip.
 */
function pitchNormalizeSpectrogram(buf: Float32Array, midiNote: number, binsPerSemitone: number): Float32Array {
  const shift = Math.round((midiNote - 60) * binsPerSemitone);
  if (shift === 0) return buf;
  const out = new Float32Array(TIME_FRAMES * FREQ_BINS).fill(0);
  for (let t = 0; t < TIME_FRAMES; t++) {
    for (let f = 0; f < FREQ_BINS; f++) {
      const srcF = f + shift;
      if (srcF < 0 || srcF >= FREQ_BINS) continue;
      out[t * FREQ_BINS + f] = buf[t * FREQ_BINS + srcF];
    }
  }
  return out;
}

/**
 * Poll the spectrogram ring buffer after noteOff until the VCA release tail
 * has decayed: recent energy stays below `energyThreshold` for `tailSilenceMs`,
 * or `maxTailMs` elapses — whichever comes first.
 */
async function waitForTail(
  spectrogramRef: RefObject<PreenSpectrogramHandle | null>,
  energyThreshold: number,
  tailSilenceMs: number,
  maxTailMs: number,
): Promise<void> {
  const POLL_MS    = 80;
  const TAIL_FRAMES = 30;  // last ~30 frames (~500 ms at 60 fps)
  let silenceAccum  = 0;
  const deadline    = Date.now() + maxTailMs;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const buf = spectrogramRef.current?.getNormalizedBuffer();
    if (!buf) break;
    if (computeRecentEnergy(buf, TAIL_FRAMES) < energyThreshold) {
      silenceAccum += POLL_MS;
      if (silenceAccum >= tailSilenceMs) break;
    } else {
      silenceAccum = 0;
    }
  }
}

function patchToParamVector(patch: Patch): number[] {
  const p = new Array<number>(PARAM_VECTOR_SIZE).fill(0);
  const algId = patch.algorithm?.id ?? 'alg1';
  const algNum = parseInt(String(algId).replace(/\D/g, ''), 10) - 1;
  p[0] = Math.max(0, Math.min(isNaN(algNum) ? 0 : algNum, 14)) / 14;
  const ops = patch.operators ?? [];
  for (let i = 0; i < 6; i++) {
    const op = ops[i]; if (!op) continue;
    p[1  + i] = Math.max(0, Math.min(op.frequency   ?? 1, 16)) / 16;
    p[7  + i] = Math.max(0, Math.min(op.amplitude   ?? 0, 1));
    p[13 + i] = Math.max(0, Math.min(op.adsr?.attack?.time   ?? 0, 100)) / 100;
    p[19 + i] = Math.max(0, Math.min(op.adsr?.decay?.time    ?? 0, 100)) / 100;
    p[25 + i] = Math.max(0, Math.min(op.adsr?.sustain?.level ?? 0, 100)) / 100;
    p[31 + i] = Math.max(0, Math.min(op.adsr?.release?.time  ?? 0, 100)) / 100;
  }
  return p;
}

function defaultHarvestProgress(): HarvestProgress {
  return { nextBankIdx: 0, totalStepsDone: 0, skippedEmpty: 0, skippedSilent: 0 };
}

function saveHarvestProgress(p: HarvestProgress): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
function loadHarvestProgress(): HarvestProgress | null {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
}
function clearHarvestProgress(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

function downloadJSONL(data: HarvestSample[], filename: string): void {
  const blob = new Blob([data.map(s => JSON.stringify(s)).join('\n')], { type: 'application/jsonlines' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/**
 * Navigate the PreenFM3 to a given bank/slot, then pull the patch via NRPN.
 * Returns { patch, nrpnCount }:
 *   - patch: parsed Patch, or null on failure.
 *   - nrpnCount: number of NRPNs actually received (used for auto-calibration).
 *
 * If expectedCount > 0, resolves immediately when that many NRPNs are received,
 * bypassing the inactivity timer entirely.
 */
function pullPatchFromSlot(
  bank: number,
  slot: number,
  channel: number,
  navigationMs: number,
  inactivityMs: number,
  timeoutMs: number,
  expectedCount: number,
): Promise<{ patch: Patch | null; nrpnCount: number }> {
  return new Promise(async resolve => {
    // 1. Navigate: Bank Select (CC0=0, CC32=bank) + Program Change
    sendCC(0,  0,    channel);  // Bank MSB (always 0 for PreenFM3)
    sendCC(32, bank, channel);  // Bank LSB 0-9
    sendProgramChange(slot, channel);
    await sleep(navigationMs);

    // 2. Pull via NRPN dump
    const parser = new PreenFM3Parser();
    parser.reset();
    let settled = false;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    let securityTimer:   ReturnType<typeof setTimeout> | null = null;

    const finish = (unsub: () => void) => {
      if (settled) return; settled = true;
      if (inactivityTimer) clearTimeout(inactivityTimer);
      if (securityTimer)   clearTimeout(securityTimer);
      unsub();
      try {
        const stats = parser.getStats();
        if (stats.count < 5) { resolve({ patch: null, nrpnCount: stats.count }); return; }
        resolve({ patch: parser.toPatch(), nrpnCount: stats.count });
      } catch { resolve({ patch: null, nrpnCount: 0 }); }
    };

    let unsubFn: (() => void) | null = null;

    const rawUnsub = onNRPNScoped((nrpn: any) => {
      if (settled) return;
      parser.addNRPN(nrpn);
      const count = parser.getStats().count;

      // Auto-calibration: resolve immediately when expected count is reached
      if (expectedCount > 0 && count >= expectedCount) {
        if (unsubFn) finish(unsubFn);
        return;
      }

      // Fallback: short inactivity timer
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => { if (unsubFn) finish(unsubFn); }, inactivityMs);
    });

    if (!rawUnsub) { resolve({ patch: null, nrpnCount: 0 }); return; }
    unsubFn = rawUnsub;

    securityTimer = setTimeout(() => {
      const stats = parser.getStats();
      if (stats.count >= 5 && !settled) finish(rawUnsub);
      else { settled = true; rawUnsub(); resolve({ patch: null, nrpnCount: 0 }); }
    }, timeoutMs);

    requestPatchDump(0, channel);
  });
}

// ── Styled components ─────────────────────────────────────────────────────────

const HarvesterSection = styled.section`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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

const BadgeRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const Badge = styled.span`
  background: ${({ theme }) => theme.colors.button};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.75rem;
  font-family: monospace;
`;

const SectionBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.h4`
  margin: 0;
  font-size: 0.76rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ConfigGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
  gap: 8px;
`;

const ConfigField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ConfigInput = styled.input`
  background: ${({ theme }) => theme.colors.button};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 0.82rem;
  font-family: monospace;
  width: 100%;
  box-sizing: border-box;
  &:focus { outline: 1px solid ${({ theme }) => theme.colors.primary}; }
  &:disabled { opacity: 0.45; }
`;

const ProgressBarTrack = styled.div`
  width: 100%;
  height: 10px;
  background: ${({ theme }) => theme.colors.button};
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const ProgressBarFill = styled.div<{ $pct: number; $color?: string }>`
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  background: ${({ $color }) => $color ?? '#10b981'};
  transition: width 0.35s ease;
`;

const ProgressLabel = styled.div`
  font-size: 0.76rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const StatsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const StatBadge = styled.span<{ $color?: string }>`
  background: ${({ theme }) => theme.colors.button};
  color: ${({ $color, theme }) => $color ?? theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.74rem;
  font-family: monospace;
`;

const Controls = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'warn' | 'default' }>`
  padding: 6px 16px;
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
      ? '#fff'
      : theme.colors.text};
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
`;

const InfoBox = styled.div`
  padding: 10px 13px;
  background: rgba(99, 102, 241, 0.06);
  border: 1px solid rgba(99, 102, 241, 0.22);
  border-radius: 6px;
  font-size: 0.76rem;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.7;
  p { margin: 0 0 4px 0; }
  code {
    display: inline;
    background: rgba(0,0,0,0.25);
    border-radius: 3px;
    padding: 1px 4px;
    font-family: monospace;
    font-size: 0.72rem;
    color: #86efac;
  }
`;

const PhaseBox = styled.div<{ $active: boolean }>`
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  border-radius: 8px;
  padding: 12px 14px;
  background: ${({ $active, theme }) => $active ? `${theme.colors.primary}0d` : 'transparent'};
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s, background 0.2s;
`;

const PhaseTitle = styled.div<{ $active: boolean }>`
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.textMuted};
`;

// ── Component ─────────────────────────────────────────────────────────────────

export function PresetBankHarvester({ spectrogramRef }: Props) {
  const midiOutput  = useMidiStore(s => s.selectedOutput);
  const midiInput   = useMidiStore(s => s.selectedInput);
  const midiChannel = useMidiStore(s => s.channel);

  const [phase, setPhase]       = useState<Phase>('idle');
  const [isPaused, setIsPaused] = useState(false);
  const [config, setConfig]     = useState<HarvestConfig>(DEFAULT_CONFIG);

  const [harvestProgress, setHarvestProgress] = useState<HarvestProgress>(defaultHarvestProgress);
  const [currentLabel, setCurrentLabel]       = useState('\u2014');
  // Running display counters
  const [banksDone,  setBanksDone]  = useState(0);
  const [totalBanks, setTotalBanks] = useState(0);
  const [slotLabel,  setSlotLabel]  = useState('');

  // Timing
  const samplesRef    = useRef<HarvestSample[]>([]);
  const batchCountRef = useRef(0);
  const abortRef      = useRef(false);
  const pauseRef      = useRef(false);
  // Auto-calibrated NRPN count: set after first successful pull, used to skip inactivity wait
  const expectedNrpnCountRef = useRef(0);

  // Poll spectrogram isListening state
  const [spectrogramOk, setSpectrogramOk] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setSpectrogramOk(!!spectrogramRef.current?.isListening), 500);
    return () => clearInterval(id);
  }, [spectrogramRef]);

  // Restore saved harvest progress on mount
  useEffect(() => {
    const saved = loadHarvestProgress();
    if (saved) setHarvestProgress(saved);
  }, []);

  // ── Batch export ───────────────────────────────────────────────────────────

  const flushBatch = useCallback(() => {
    if (samplesRef.current.length === 0) return;
    const idx = ++batchCountRef.current;
    downloadJSONL(samplesRef.current, `harvest_batch_${String(idx).padStart(3, '0')}.jsonl`);
    samplesRef.current = [];
  }, []);

  // ── Streaming harvest: pull slot → capture pairs immediately ─────────────

  const runHarvest = useCallback(async (startProg: HarvestProgress) => {
    abortRef.current = false;
    pauseRef.current = false;
    expectedNrpnCountRef.current = 0;
    setPhase('running');

    const {
      bankStart, bankEnd, slotsPerBank,
      midiThrottleMs, recordingDurationMs,
      maxTailMs, tailSilenceMs,
      augmentationSteps, pitchNormalizeBinsPerSemitone,
      energyThreshold, batchSize,
    } = config;

    const numBanks   = bankEnd - bankStart + 1;
    const augFactors = AUGMENTATION_FACTORS.slice(0, augmentationSteps);
    setTotalBanks(numBanks);

    let { nextBankIdx, totalStepsDone, skippedEmpty, skippedSilent } = startProg;
    setBanksDone(nextBankIdx);

    outer: for (let bIdx = nextBankIdx; bIdx < numBanks; bIdx++) {
      const bankId    = bankStart + bIdx;
      const bankLabel = `User${bankId + 1}`;
      setBanksDone(bIdx);

      for (let s = 0; s < slotsPerBank; s++) {
        while (pauseRef.current) { await sleep(200); if (abortRef.current) break; }
        if (abortRef.current) break outer;

        setSlotLabel(`Bank ${bankId + 1}/${bankEnd + 1}  ·  Slot ${s + 1}/${slotsPerBank}`);

        // 1. Pull patch via NRPN dump
        const { patch, nrpnCount } = await pullPatchFromSlot(
          bankId, s, midiChannel,
          config.pullNavigationMs, config.pullInactivityMs,
          config.pullTimeoutMs, expectedNrpnCountRef.current,
        );
        if (patch && nrpnCount > 0 && expectedNrpnCountRef.current === 0) {
          expectedNrpnCountRef.current = nrpnCount;
        }
        if (!patch || isEmptyPatch(patch)) { skippedEmpty++; continue; }

        const patchName = patch.name?.trim() ?? `Slot${s}`;
        const paramVec  = patchToParamVector(patch);

        // 2. Re-apply patch via NRPN to guarantee correct synth state
        clearNRPNQueue();
        for (const msg of patchToNRPNMessages(patch)) sendNRPN(msg, midiChannel);
        await drainNRPNQueue();
        await sleep(midiThrottleMs);

        // 3. Record each octave: C1(36), C2(48), C3(60), C4(72)
        for (const midiNote of OCTAVE_NOTES) {
          while (pauseRef.current) { await sleep(200); if (abortRef.current) break; }
          if (abortRef.current) break outer;

          const noteLabel = NOTE_LABELS[midiNote] ?? `N${midiNote}`;
          setCurrentLabel(`"${patchName}"  ·  ${noteLabel}  ·  Recording…`);

          const midiOut = useMidiStore.getState().selectedOutput;
          if (!midiOut) continue;

          // a. noteOn → hold → noteOff → wait for VCA release tail
          midiOut.sendNoteOn(midiNote,  { channels: [midiChannel], rawAttack: 100 });
          await sleep(recordingDurationMs);
          midiOut.sendNoteOff(midiNote, { channels: [midiChannel] });
          await waitForTail(spectrogramRef, energyThreshold, tailSilenceMs, maxTailMs);

          // b. Capture spectrogram
          const rawBuf = spectrogramRef.current?.getNormalizedBuffer() ?? null;
          if (!rawBuf) { skippedSilent++; continue; }

          // c. Optional pitch normalization (center on C3)
          const workBuf: Float32Array = pitchNormalizeBinsPerSemitone > 0
            ? pitchNormalizeSpectrogram(rawBuf, midiNote, pitchNormalizeBinsPerSemitone)
            : rawBuf;

          const energy = computeEnergy(workBuf);
          if (energy < energyThreshold) { skippedSilent++; continue; }

          // d. Save original (augmentation_idx=0, stretch_factor=1.0)
          samplesRef.current.push({
            meta: {
              patch_name:       patchName,
              bank_id:          bankId,
              bank_label:       bankLabel,
              slot_id:          s,
              midi_note:        midiNote,
              note_label:       noteLabel,
              augmentation_idx: 0,
              stretch_factor:   1.0,
              timestamp:        Date.now(),
            },
            params:      paramVec,
            spectrogram: Array.from(workBuf),
            energy,
          });
          if (samplesRef.current.length >= batchSize) flushBatch();
          totalStepsDone++;

          // e. Time-stretched augmentations
          if (augFactors.length > 0) {
            setCurrentLabel(`"${patchName}"  ·  ${noteLabel}  ·  Augmenting (${augFactors.length}\u00d7)…`);
            for (let aIdx = 0; aIdx < augFactors.length; aIdx++) {
              const factor    = augFactors[aIdx];
              const stretched = timeStretchSpectrogram(workBuf, factor);
              samplesRef.current.push({
                meta: {
                  patch_name:       patchName,
                  bank_id:          bankId,
                  bank_label:       bankLabel,
                  slot_id:          s,
                  midi_note:        midiNote,
                  note_label:       noteLabel,
                  augmentation_idx: aIdx + 1,
                  stretch_factor:   factor,
                  timestamp:        Date.now(),
                },
                params:      paramVec,
                spectrogram: Array.from(stretched),
                energy:      computeEnergy(stretched),
              });
              if (samplesRef.current.length >= batchSize) flushBatch();
              totalStepsDone++;
            }
          }

          const prog: HarvestProgress = { nextBankIdx: bIdx, totalStepsDone, skippedEmpty, skippedSilent };
          setHarvestProgress({ ...prog });
          saveHarvestProgress(prog);
        }
      }

      // Bank fully processed — advance resume checkpoint
      const prog: HarvestProgress = { nextBankIdx: bIdx + 1, totalStepsDone, skippedEmpty, skippedSilent };
      setHarvestProgress({ ...prog });
      saveHarvestProgress(prog);
    }

    if (!abortRef.current) {
      flushBatch();
      clearHarvestProgress();
      setHarvestProgress(defaultHarvestProgress());
      setBanksDone(0);
      setCurrentLabel('\u2713 Harvest complete! All batches exported.');
    } else {
      setCurrentLabel('\u23f8 Stopped \u2014 progress saved.');
    }

    setSlotLabel('');
    expectedNrpnCountRef.current = 0;
    setPhase('idle');
    abortRef.current = false;
  }, [config, midiChannel, spectrogramRef, flushBatch]);

  // ── Controls ───────────────────────────────────────────────────────────────

  const startHarvest = useCallback(() => { if (phase === 'idle') runHarvest(harvestProgress); }, [phase, harvestProgress, runHarvest]);

  const pause  = useCallback(() => { pauseRef.current = true;  setIsPaused(true);  }, []);
  const resume = useCallback(() => { pauseRef.current = false; setIsPaused(false); }, []);
  const stop   = useCallback(() => { abortRef.current = true;  pauseRef.current = false; setIsPaused(false); }, []);

  const resetHarvest = useCallback(() => {
    clearHarvestProgress();
    setHarvestProgress(defaultHarvestProgress());
    setBanksDone(0);
    samplesRef.current = [];
    batchCountRef.current = 0;
    setCurrentLabel('\u2014');
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isRunning  = phase !== 'idle';
  const banksPct   = totalBanks > 0 ? Math.min(100, (banksDone / totalBanks) * 100) : 0;
  const canHarvest = !!midiOutput && !!midiInput && spectrogramOk && !isRunning;

  const prereqs: { ok: boolean; label: string }[] = [
    { ok: !!midiInput,   label: 'MIDI input selected (open MIDI menu)' },
    { ok: !!midiOutput,  label: 'MIDI output selected (open MIDI menu)' },
    { ok: spectrogramOk, label: 'Spectrogram active (click \u25b6 Start Listening above)' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <HarvesterSection>
      <Header>
        <Title>Preset Bank Harvester</Title>
        <BadgeRow>
          <Badge>4 oct × {config.augmentationSteps + 1} variants</Badge>
          <Badge>X: 128×1024 spectrogram</Badge>
          <Badge>Y: {PARAM_VECTOR_SIZE} FM params</Badge>
          {harvestProgress.nextBankIdx > 0 && !isRunning && (
            <Badge style={{ color: '#10b981' }}>↺ Resume from bank {harvestProgress.nextBankIdx + 1}</Badge>
          )}
        </BadgeRow>
      </Header>

      {/* Prerequisites (only when idle) */}
      {!isRunning && (
        <SectionBlock>
          <SectionTitle>Prerequisites</SectionTitle>
          {prereqs.map(p => (
            <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontFamily: 'monospace', color: p.ok ? '#10b981' : '#f87171' }}>
              <span>{p.ok ? '\u2713' : '\u2717'}</span>
              {p.label}
            </div>
          ))}
        </SectionBlock>
      )}

      {/* Configuration */}
      {!isRunning && (
        <SectionBlock>
          <SectionTitle>Configuration</SectionTitle>
          <ConfigGrid>
            {([
              ['bankStart',                    'Bank start (0-9)',               0,   9,      1],
              ['bankEnd',                      'Bank end (0-9)',                 0,   9,      1],
              ['slotsPerBank',                 'Slots per bank (1-128)',         1, 128,      1],
              ['pullNavigationMs',             'Nav delay (ms)',               100, 2000,    50],
              ['pullInactivityMs',             'Pull inactivity (ms)',          20,  500,    10],
              ['pullTimeoutMs',                'Pull timeout (ms)',            500, 15000,  500],
              ['midiThrottleMs',               'MIDI throttle (ms)',            50, 1000,   10],
              ['recordingDurationMs',          'Note hold (ms)',               500, 6000,  100],
              ['maxTailMs',                    'Max tail wait (ms)',           500, 10000,  500],
              ['tailSilenceMs',               'Tail silence (ms)',             50, 2000,   50],
              ['augmentationSteps',            'Augmentation steps (0–3)',       0,   3,      1],
              ['pitchNormalizeBinsPerSemitone','Pitch norm. bins/semi (0=off)',  0,  10,    0.5],
              ['energyThreshold',              'Energy threshold',           0.001,  0.5, 0.001],
              ['batchSize',                    'Batch size',                   10, 1000,   10],
            ] as [keyof HarvestConfig, string, number, number, number][]).map(([key, label, min, max, step]) => (
              <ConfigField key={key}>
                {label}
                <ConfigInput
                  type="number" min={min} max={max} step={step}
                  value={config[key] as number}
                  onChange={e => setConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                />
              </ConfigField>
            ))}
          </ConfigGrid>
        </SectionBlock>
      )}

      {/* Harvest progress */}
      <PhaseBox $active={isRunning}>
        <PhaseTitle $active={isRunning}>
          Harvest — pull → record × 4 octaves → augment
        </PhaseTitle>
        <ProgressBarTrack>
          <ProgressBarFill $pct={banksPct} $color="#6366f1" />
        </ProgressBarTrack>
        {isRunning && slotLabel && <ProgressLabel style={{ color: '#6366f1' }}>{slotLabel}</ProgressLabel>}
        {isRunning && currentLabel && <ProgressLabel>{currentLabel}</ProgressLabel>}
        {!isRunning && harvestProgress.totalStepsDone > 0 && (
          <ProgressLabel>↺ Resumable from bank {harvestProgress.nextBankIdx + 1} — {harvestProgress.totalStepsDone.toLocaleString()} steps saved</ProgressLabel>
        )}
        <StatsRow>
          {isRunning && <StatBadge $color="#6366f1">Bank {banksDone + 1} / {totalBanks}</StatBadge>}
          <StatBadge $color="#10b981">✓ {harvestProgress.totalStepsDone.toLocaleString()} saved</StatBadge>
          <StatBadge $color="#f59e0b">⏭ {harvestProgress.skippedEmpty} empty</StatBadge>
          <StatBadge $color="#f87171">✕ {harvestProgress.skippedSilent} silent</StatBadge>
          <StatBadge>{samplesRef.current.length} pending</StatBadge>
          <StatBadge>{batchCountRef.current} batches exported</StatBadge>
        </StatsRow>
        <Controls>
          {!isRunning && (
            <>
              <Btn $variant="primary" onClick={startHarvest} disabled={!canHarvest}>
                ▶ {harvestProgress.nextBankIdx > 0 ? 'Resume Harvest' : 'Start Harvest'}
              </Btn>
              {harvestProgress.totalStepsDone > 0 && (
                <Btn onClick={resetHarvest}>↺ Reset progress</Btn>
              )}
              {samplesRef.current.length > 0 && (
                <Btn onClick={flushBatch}>⬇ Export {samplesRef.current.length} pending</Btn>
              )}
            </>
          )}
          {isRunning && !isPaused && <Btn onClick={pause}>⏸ Pause</Btn>}
          {isRunning && isPaused  && <Btn $variant="primary" onClick={resume}>▶ Resume</Btn>}
          {isRunning && <Btn $variant="danger" onClick={stop}>■ Stop</Btn>}
        </Controls>
      </PhaseBox>

      {/* Dataset info */}
      <InfoBox>
        <p><strong>Output:</strong> JSONL \u2014 one JSON object per line, auto-downloaded every {config.batchSize} samples.</p>
        <p>
          Each patch × 4 octaves (C1/C2/C3/C4) × (1 original + {config.augmentationSteps} augmented) ={' '}
          <strong>{4 * (1 + config.augmentationSteps)} samples/patch</strong>.
          Time-stretch factors: <code>{AUGMENTATION_FACTORS.slice(0, config.augmentationSteps).join(', ') || '—'}</code>.
        </p>
        <p>
          <code>X</code> = <code>spectrogram float[131072]</code> · layout <code>[frame × 128 + freq_bin]</code>.
          {' '}<code>Y</code> = <code>params float[{PARAM_VECTOR_SIZE}]</code> ∈ <code>[0, 1]</code>.
        </p>
        <p>
          Bank navigation: <code>CC0=0</code> + <code>CC32=bankNum</code> + <code>PC=slot</code>.{' '}
          Compatible with PreenFM3 MIDI spec.
        </p>
      </InfoBox>
    </HarvesterSection>
  );
}
