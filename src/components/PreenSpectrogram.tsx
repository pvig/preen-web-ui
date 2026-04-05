import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useThemeStore } from '../theme/themeStore';

// ============================================================
// Constants
// ============================================================

/** FFT window size. Controls frequency resolution: more bins = finer detail. */
const FFT_SIZE = 2048;

/** Number of frequency bins output by the AnalyserNode (FFT_SIZE / 2). */
const FREQ_BINS = FFT_SIZE / 2; // 1024

/**
 * Number of time-frames kept in the internal circular buffer.
 * Together with FREQ_BINS this produces a 128×1024 data matrix.
 */
const BUFFER_FRAMES = 128;

/** Pixel height of the rendered spectrogram canvas. */
const CANVAS_HEIGHT = 256;

// ============================================================
// Theme Colormap
// ============================================================

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Builds a 256-entry RGB LUT from 6 evenly-spaced theme color stops. */
function buildThemeLUT(c1: string, c2: string, c3: string, c4: string, c5: string, c6: string): Uint8ClampedArray {
  const stops: [number, number, number, number][] = [
    [0.00, ...hexToRgb(c1)],
    [0.20, ...hexToRgb(c2)],
    [0.40, ...hexToRgb(c3)],
    [0.60, ...hexToRgb(c4)],
    [0.80, ...hexToRgb(c5)],
    [1.00, ...hexToRgb(c6)],
  ];
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let lo = stops[0];
    let hi = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        lo = stops[s]; hi = stops[s + 1]; break;
      }
    }
    const range = hi[0] - lo[0];
    const f = range > 0 ? (t - lo[0]) / range : 0;
    lut[i * 3 + 0] = Math.round(lo[1] + f * (hi[1] - lo[1]));
    lut[i * 3 + 1] = Math.round(lo[2] + f * (hi[2] - lo[2]));
    lut[i * 3 + 2] = Math.round(lo[3] + f * (hi[3] - lo[3]));
  }
  return lut;
}

// ============================================================
// Logarithmic frequency scale
// ============================================================

/** Lower bound of the displayed frequency axis (Hz). Below this is mostly DC/rumble. */
const LOG_F_MIN = 20;
/** Assumed Nyquist frequency (Hz) — valid for both 44.1 kHz and 48 kHz sessions. */
const LOG_F_NYQ = 22050;

/**
 * Pre-computed log-scale LUT: canvas pixel (0..FREQ_BINS-1) → FFT bin index.
 *
 * Converts the linear FFT output into a perceptually-uniform frequency axis
 * where one octave always occupies the same horizontal distance, matching
 * how the human auditory system perceives pitch.
 */
/**
 * Fractional bin positions for log-scale mapping (Float32Array).
 * Storing sub-integer positions allows the render loop to linearly
 * interpolate between adjacent FFT bins, eliminating the block artifacts
 * that appear when many pixels round to the same integer bin (bass region).
 */
const LOG_BINS_LUT: Float32Array = (() => {
  const lut      = new Float32Array(FREQ_BINS);
  const logRange = Math.log(LOG_F_NYQ / LOG_F_MIN);
  const maxBin   = FREQ_BINS - 1;
  for (let x = 0; x < FREQ_BINS; x++) {
    const t    = x / maxBin;
    const freq = LOG_F_MIN * Math.exp(t * logRange);
    const bin  = freq / LOG_F_NYQ * maxBin;          // fractional
    lut[x] = Math.min(Math.max(bin, 0), maxBin);
  }
  return lut;
})();

/**
 * Tick marks for the logarithmic frequency axis.
 * pct: horizontal position [0–100] computed from the same log formula as LOG_BINS_LUT.
 */
const FREQ_AXIS_TICKS: { label: string; pct: number }[] = (() => {
  const freqs  = [100, 500, 1_000, 2_000, 5_000, 10_000, 20_000];
  const labels = ['100', '500', '1k',  '2k',  '5k',   '10k',  '20k'];
  const logRange = Math.log(LOG_F_NYQ / LOG_F_MIN);
  return freqs.map((f, i) => ({
    label: labels[i],
    pct:   Math.log(f / LOG_F_MIN) / logRange * 100,
  }));
})();

// ============================================================
// Public handle (imperative API exposed via forwardRef)
// ============================================================

export interface PreenSpectrogramHandle {
  /**
   * Returns the internal ring buffer as a flat Float32Array of shape
   * [BUFFER_FRAMES × FREQ_BINS] = [128 × 1024], values in [0.0, 1.0].
   *
   * // Ready for TensorFlow.js input
   * Example:
   *   const tensor = tf.tensor2d(spectrogramRef.current.getNormalizedBuffer(),
   *                              [BUFFER_FRAMES, FREQ_BINS]);
   */
  getNormalizedBuffer: () => Float32Array;
  /** Exposes the buffer dimensions for external consumers. */
  bufferShape: { frames: number; bins: number };
  /** True when the spectrogram is actively capturing audio (AnalyserNode running). */
  isListening: boolean;
}

// ============================================================
// Styled Components
// ============================================================

const SpectrogramSection = styled.section`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  display: none;
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
  white-space: nowrap;
`;

const CanvasWrapper = styled.div`
  position: relative;
  width: 100%;
  background: #000004; /* Matches the Magma black base */
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};

  canvas {
    display: block;
    /* CSS-scale the 1024-wide pixel buffer to fill the container
       while preserving all frequency bins in the underlying data. */
    width: 100%;
    height: ${CANVAS_HEIGHT}px;
    image-rendering: pixelated;
  }
`;

/** Frequency axis labels overlaid on the canvas. */
const FreqAxis = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 18px;
  pointer-events: none;
`;

const FreqLabel = styled.span<{ $left: number }>`
  position: absolute;
  left: ${({ $left }) => $left}%;
  transform: translateX(-50%);
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.55);
  font-family: monospace;
  line-height: 18px;
  white-space: nowrap;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`;

const ControlButton = styled.button<{ $variant: 'start' | 'stop' }>`
  padding: 6px 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  background: ${({ $variant, theme }) =>
    $variant === 'start' ? theme.colors.primary : theme.colors.button};
  color: ${({ $variant, theme }) =>
    $variant === 'start' ? theme.colors.background : theme.colors.text};

  &:hover:not(:disabled) {
    opacity: 0.85;
    transform: scale(1.02);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    transform: none;
  }
`;

const StatusDot = styled.span<{ $active: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $active }) => ($active ? '#10b981' : '#6b7280')};
  box-shadow: ${({ $active }) =>
    $active ? '0 0 6px 2px rgba(16,185,129,0.55)' : 'none'};
  transition: background 0.3s, box-shadow 0.3s;
`;

const StatusText = styled.span`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.textMuted};
  font-family: monospace;
`;

const ErrorMessage = styled.p`
  margin: 0;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 6px;
  color: #f87171;
  font-size: 0.8rem;
`;

const SelectRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
`;

const SelectGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 160px;
`;

const SelectLabel = styled.label`
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.textMuted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const StyledSelect = styled.select`
  background: ${({ theme }) => theme.colors.button};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
  width: 100%;

  &:focus {
    outline: 1px solid ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  option {
    background: ${({ theme }) => theme.colors.panel};
  }
`;

const RefreshButton = styled.button`
  align-self: flex-end;
  padding: 5px 10px;
  background: ${({ theme }) => theme.colors.button};
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.colors.buttonHover};
  }
`;

const WarningBox = styled.div`
  padding: 10px 14px;
  background: rgba(251, 191, 36, 0.09);
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 6px;
  font-size: 0.8rem;
  color: #fcd34d;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const WarningTitle = styled.strong`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  width: 100%;
`;

const DismissButton = styled.button`
  margin-left: auto;
  background: none;
  border: none;
  color: #fcd34d;
  font-size: 0.9rem;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
  opacity: 0.7;
  flex-shrink: 0;

  &:hover {
    opacity: 1;
  }
`;

const HelpToggle = styled.button`
  background: none;
  border: none;
  padding: 0;
  color: #93c5fd;
  font-size: 0.78rem;
  cursor: pointer;
  text-decoration: underline;
  text-align: left;
  width: fit-content;

  &:hover {
    color: #bfdbfe;
  }
`;

const HelpPanel = styled.div`
  margin-top: 4px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 5px;
  font-size: 0.76rem;
  color: #cbd5e0;
  line-height: 1.6;

  p {
    margin: 0 0 6px 0;
  }

  code {
    display: block;
    margin: 4px 0;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 4px;
    padding: 6px 10px;
    font-family: monospace;
    font-size: 0.73rem;
    color: #86efac;
    white-space: pre-wrap;
    word-break: break-all;
  }

  ol {
    margin: 4px 0;
    padding-left: 18px;
  }

  li {
    margin-bottom: 4px;
  }

  a {
    color: #93c5fd;
  }
`;

// (Frequency axis data is defined above in LOG_BINS_LUT / FREQ_AXIS_TICKS)

// ============================================================
// Component
// ============================================================

/**
 * PreenSpectrogram
 * ─────────────────────────────────────────────────────────────
 * Real-time, scrolling spectrogram for the PreenFM3 synthesizer.
 *
 * Audio pipeline:
 *   getUserMedia (deviceId, up to 4 ch) → ChannelSplitterNode → AnalyserNode (fftSize 2048)
 *
 * Data pipeline:
 *   AnalyserNode → Uint8Array[1024] → circular buffer[128×1024]
 *                                  → getNormalizedBuffer() → Float32Array
 *
 * Canvas rendering:
 *   Each animation frame, the existing image is shifted up 1 pixel using
 *   ctx.drawImage() (GPU-accelerated), then a new bottom row is painted
 *   using a pre-computed Magma colormap LUT.
 *
 * ML readiness:
 *   getNormalizedBuffer() returns a flat Float32Array[131072] that can be
 *   reshaped into a tf.Tensor2D([128, 1024]) for sound-matching models.
 */
const PreenSpectrogram = forwardRef<PreenSpectrogramHandle>(
  function PreenSpectrogram(_props, ref) {
    const { t } = useTranslation();
    const { theme } = useThemeStore();
    // ── Refs ───────────────────────────────────────────────────
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lutRef = useRef<Uint8ClampedArray>(buildThemeLUT(theme.colors.spectro1, theme.colors.spectro2, theme.colors.spectro3, theme.colors.spectro4, theme.colors.spectro5, theme.colors.spectro6));
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const splitterRef = useRef<ChannelSplitterNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number | null>(null);

    /**
     * Pre-allocated ImageData for a single pixel row (1024×1).
     * Reusing this object every frame avoids GC pressure.
     */
    const rowImageDataRef = useRef<ImageData | null>(null);

    /**
     * Flat Uint8Array used as the read target for getByteFrequencyData().
     * Allocated once to avoid repeated allocations in the hot path.
     */
    const freqDataRef = useRef(new Uint8Array(FREQ_BINS));

    /**
     * Circular buffer — stores the last BUFFER_FRAMES frequency snapshots.
     * dataBuffer[writeHead] is overwritten on each animation frame.
     * Shape: Array<Uint8Array[FREQ_BINS]>  →  [128][1024]
     */
    const dataBufferRef = useRef<Uint8Array[]>([]);
    const writeHeadRef = useRef(0);

    // ── State ──────────────────────────────────────────────────
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sampleRate, setSampleRate] = useState<number | null>(null);
    /** All audioinput devices reported by the browser. */
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    /** deviceId of the selected audio input ('default' = browser default). */
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    /** Actual number of channels obtained from the stream (may be < requested). */
    const [channelCount, setChannelCount] = useState<number>(1);
    /** Currently monitored channel index (0-based). */
    const [selectedChannel, setSelectedChannel] = useState<number>(0);
    /** Reference to the monitor node (GainNode for mute/unmute). */
    const monitorGainRef = useRef<GainNode | null>(null);
    /**
     * Set to true when the browser granted fewer channels than the 4 we
     * requested — signals that inputs 3-4 need a virtual OS device.
     */
    const [channelsCapped, setChannelsCapped] = useState(false);
    /**
     * True once the user explicitly dismisses the channel-cap warning.
     * Backed by sessionStorage so it survives stop/start cycles within
     * the same browser tab, but resets on next page load.
     */
    const [warningDismissed, setWarningDismissed] = useState(
      () => sessionStorage.getItem('spectrogram-ch-warning-dismissed') === '1'
    );
    /** Controls visibility of the multi-channel setup help panel. */
    const [showHelp, setShowHelp] = useState(false);

    const dismissWarning = useCallback(() => {
      sessionStorage.setItem('spectrogram-ch-warning-dismissed', '1');
      setWarningDismissed(true);
      setShowHelp(false);
    }, []);

    // ── Initialise circular buffer once ────────────────────────
    useEffect(() => {
      dataBufferRef.current = Array.from(
        { length: BUFFER_FRAMES },
        () => new Uint8Array(FREQ_BINS)
      );
    }, []);

    // ── Rebuild LUT when theme colors change ───────────────────
    useEffect(() => {
      lutRef.current = buildThemeLUT(theme.colors.spectro1, theme.colors.spectro2, theme.colors.spectro3, theme.colors.spectro4, theme.colors.spectro5, theme.colors.spectro6);
    }, [theme.colors.spectro1, theme.colors.spectro2, theme.colors.spectro3, theme.colors.spectro4, theme.colors.spectro5, theme.colors.spectro6]);

    // ── Device enumeration ─────────────────────────────────────
    /**
     * Queries the browser for available audio input devices.
     * Labels are empty until the user grants microphone permission;
     * call again after getUserMedia succeeds to populate them.
     */
    const refreshDevices = useCallback(async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter(d => d.kind === 'audioinput');
        setDevices(inputs);
        setSelectedDeviceId(prev =>
          inputs.find(d => d.deviceId === prev)
            ? prev
            : (inputs[0]?.deviceId ?? '')
        );
      } catch {
        // enumerateDevices not supported — graceful degradation
      }
    }, []);

    useEffect(() => {
      refreshDevices();
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () =>
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    }, [refreshDevices]);

    // ── Imperative handle (exposed to parent via ref) ───────────
    useImperativeHandle(ref, () => ({
      /**
       * Converts the internal 128×1024 ring buffer to a normalized
       * Float32Array with values in [0.0, 1.0], oldest frame first.
       *
       * // Ready for TensorFlow.js input
       */
      getNormalizedBuffer(): Float32Array {
        const result = new Float32Array(BUFFER_FRAMES * FREQ_BINS);
        const head = writeHeadRef.current;
        for (let i = 0; i < BUFFER_FRAMES; i++) {
          // Re-order so the oldest frame appears at index 0
          const frameIdx = (head + i) % BUFFER_FRAMES;
          const frame = dataBufferRef.current[frameIdx];
          const offset = i * FREQ_BINS;
          for (let j = 0; j < FREQ_BINS; j++) {
            result[offset + j] = frame[j] / 255.0;
          }
        }
        return result;
      },
      bufferShape: { frames: BUFFER_FRAMES, bins: FREQ_BINS },
      isListening,
    }), [isListening]);

    // ── Animation loop ─────────────────────────────────────────

    /**
     * drawFrame — called once per requestAnimationFrame tick.
     *
     * 1. Read frequency data from the AnalyserNode.
     * 2. Store it in the circular buffer.
     * 3. Scroll the canvas content up by 1 px via drawImage()
     *    (leverages GPU compositing — no pixel enumeration needed).
     * 4. Paint the new bottom row using the pre-computed Magma LUT.
     * 5. Request the next frame.
     */
    const drawFrame = useCallback(() => {
      const analyser = analyserRef.current;
      const canvas = canvasRef.current;
      if (!analyser || !canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const freqData = freqDataRef.current;
      const rowImageData = rowImageDataRef.current;
      if (!rowImageData) return;

      // Step 1 — Read frequency data (byte values 0–255)
      analyser.getByteFrequencyData(freqData);

      // Step 2 — Write to circular buffer
      const head = writeHeadRef.current;
      dataBufferRef.current[head].set(freqData);
      writeHeadRef.current = (head + 1) % BUFFER_FRAMES;

      // Step 3 — Scroll existing content up by 1 pixel.
      //   drawImage(source, dx, dy) copies the canvas onto itself at offset
      //   (0, -1), which shifts all content 1 px upward.  No pixel-by-pixel
      //   loop is needed — the GPU handles the blit.
      ctx.drawImage(canvas, 0, -1);

      // Step 4 — Build the new bottom row using the Magma LUT (log-scale axis).
      // LOG_BINS_LUT[x] is a fractional bin index; we linearly interpolate
      // between the two surrounding FFT bins to avoid the staircase banding
      // that appears when several pixels share the same integer bin (bass region).
      const pixels = rowImageData.data;
      for (let x = 0; x < FREQ_BINS; x++) {
        const fBin = LOG_BINS_LUT[x];
        const lo   = fBin | 0;                    // Math.floor via bitwise OR
        const hi   = lo < FREQ_BINS - 1 ? lo + 1 : lo;
        const frac = fBin - lo;                   // interpolation weight [0, 1)
        const amp  = (freqData[lo] * (1 - frac) + freqData[hi] * frac) | 0;
        const px = x * 4; // RGBA stride
        pixels[px + 0] = lutRef.current[amp * 3 + 0]; // R
        pixels[px + 1] = lutRef.current[amp * 3 + 1]; // G
        pixels[px + 2] = lutRef.current[amp * 3 + 2]; // B
        pixels[px + 3] = 255;                      // A — fully opaque
      }

      // Step 5 — Paint the row at the very bottom of the canvas.
      ctx.putImageData(rowImageData, 0, CANVAS_HEIGHT - 1);

      // Step 6 — Schedule the next frame.
      animFrameRef.current = requestAnimationFrame(drawFrame);
    }, []);

    // ── Start / Stop ───────────────────────────────────────────

    /**
     * Requests microphone / line-in access via getUserMedia,
     * wires up the Web Audio pipeline, and kicks off the render loop.
     */
    // Start FFT listening (spectrogram + monitor)
    const startListening = useCallback(async () => {
      try {
        setError(null);

        // Request all channels the device supports (up to 4 for most pro interfaces).
        // echoCancellation / noiseSuppression / autoGainControl must be disabled
        // for accurate line-in capture of an FM synthesizer.
        const audioConstraints: MediaTrackConstraints = {
          channelCount: { ideal: 4 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };
        if (selectedDeviceId) {
          audioConstraints.deviceId = { exact: selectedDeviceId };
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
        streamRef.current = stream;

        // Refresh device list now that permission is granted (labels become available)
        refreshDevices();

        // Create the AudioContext (deferred until a user gesture per spec)
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        setSampleRate(audioCtx.sampleRate);

        // Detect the actual channel count reported by the driver.
        // getSettings() reflects what was actually granted, not what was requested.
        const track = stream.getAudioTracks()[0];
        const actualChannels = track?.getSettings().channelCount ?? 1;
        setChannelCount(actualChannels);
        // Warn when the browser/WebRTC stack caps channels below 4.
        // This is the expected behaviour on Linux for multi-channel interfaces;
        // inputs 3-4 must be exposed as a separate OS virtual device.
        setChannelsCapped(actualChannels < 4);
        // Clamp channel selection to what is actually available
        const ch = Math.min(selectedChannel, actualChannels - 1);
        setSelectedChannel(ch);

        // Configure the AnalyserNode
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.75; // Light temporal smoothing
        analyserRef.current = analyser;


        // Wire up: MediaStream → (ChannelSplitter) → AnalyserNode
        // Optionally: → GainNode (monitor) → destination
        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;

        // Create a GainNode for monitoring (allows mute/unmute)
        const monitorGain = audioCtx.createGain();
        monitorGain.gain.value = 1;
        monitorGainRef.current = monitorGain;

        if (actualChannels > 1) {
          // ChannelSplitterNode exposes each channel on a separate output.
          // output[0] = ch 1, output[1] = ch 2, etc.
          const splitter = audioCtx.createChannelSplitter(actualChannels);
          splitterRef.current = splitter;
          source.connect(splitter);
          splitter.connect(analyser, ch); // second arg = output (= channel) index
          // Monitor: connect selected channel to monitorGain → destination
          splitter.connect(monitorGain, ch);
        } else {
          source.connect(analyser);
          // Monitor: connect to monitorGain → destination
          source.connect(monitorGain);
        }
        monitorGain.connect(audioCtx.destination);

        // Pre-allocate a reusable single-row ImageData (1024 px wide × 1 px tall)
        const ctx = canvasRef.current!.getContext('2d')!;
        rowImageDataRef.current = ctx.createImageData(FREQ_BINS, 1);

        // Fill the canvas with the darkest Magma colour before the first frame
        ctx.fillStyle = '#000004';
        ctx.fillRect(0, 0, FREQ_BINS, CANVAS_HEIGHT);

        setIsListening(true);
        animFrameRef.current = requestAnimationFrame(drawFrame);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(t('spectrogram.errorAccess', { msg }));
      }
    }, [drawFrame]);

    /** Cancels the animation loop and releases all audio/stream resources. */
    const stopListening = useCallback(() => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      splitterRef.current = null;
      sourceRef.current = null;
      // Disconnect monitor node if present
      if (monitorGainRef.current) {
        try { monitorGainRef.current.disconnect(); } catch {}
        monitorGainRef.current = null;
      }
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
      analyserRef.current = null;
      setIsListening(false);
      setChannelCount(1);
      setChannelsCapped(false);
      setShowHelp(false);
      // Note: warningDismissed is intentionally NOT reset here —
      // the user chose to hide it for the session.
    }, []);

    /**
     * Switches the monitored channel without restarting the stream.
     * Disconnects the splitter from the current analyser output and
     * reconnects it to the newly selected channel index.
     */
    const changeChannel = useCallback((ch: number) => {
      setSelectedChannel(ch);
      const analyser = analyserRef.current;
      const splitter = splitterRef.current;
      const monitorGain = monitorGainRef.current;
      if (!analyser || !splitter) return;
      splitter.disconnect(analyser);
      splitter.connect(analyser, ch);
      // Also update monitor routing
      if (monitorGain) {
        splitter.disconnect(monitorGain);
        splitter.connect(monitorGain, ch);
      }
    }, []);
    // Clean up if the component unmounts while listening
    useEffect(() => () => { stopListening(); }, [stopListening]);

    // ── Helpers ────────────────────────────────────────────────

    /** Format Hz to a human-readable string for the footer label. */
    const formatSampleRate = (hz: number | null) =>
      hz ? `${(hz / 1000).toFixed(1)} kHz` : '—';

    // ── Render ─────────────────────────────────────────────────
    return (
      <SpectrogramSection>
        <Header>
          <Title>{t('spectrogram.title')}</Title>
          <BadgeRow>
            <Badge>fftSize: {FFT_SIZE}</Badge>
            <Badge>Buffer: {BUFFER_FRAMES}×{FREQ_BINS}</Badge>
            {sampleRate && <Badge>Fs: {formatSampleRate(sampleRate)}</Badge>}
            {channelCount > 1 && <Badge>{t('spectrogram.badgeCh', { count: channelCount, ch: selectedChannel + 1 })}</Badge>}
          </BadgeRow>
        </Header>

        {/* ── Device & channel selectors ─────────────────────── */}
        <SelectRow>
          <SelectGroup>
            <SelectLabel htmlFor="spectrogram-device">{t('spectrogram.deviceLabel')}</SelectLabel>
            <StyledSelect
              id="spectrogram-device"
              value={selectedDeviceId}
              onChange={e => setSelectedDeviceId(e.target.value)}
              disabled={isListening}
            >
              {devices.length === 0 && (
                <option value="">{t('spectrogram.deviceDefault')}</option>
              )}
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || t('spectrogram.deviceInput', { n: devices.indexOf(d) + 1 })}
                </option>
              ))}
            </StyledSelect>
          </SelectGroup>

          <SelectGroup>
            <SelectLabel htmlFor="spectrogram-channel">
              {t('spectrogram.channelLabel')}{channelCount > 1 ? ` ${t('spectrogram.channelAvailable', { max: channelCount })}` : ''}
            </SelectLabel>
            <StyledSelect
              id="spectrogram-channel"
              value={selectedChannel}
              onChange={e => changeChannel(Number(e.target.value))}
              disabled={channelCount <= 1}
            >
              {Array.from({ length: Math.max(channelCount, 1) }, (_, i) => (
                <option key={i} value={i}>
                  {t('spectrogram.channelOption', { n: i + 1 })}
                </option>
              ))}
            </StyledSelect>
          </SelectGroup>

          <RefreshButton onClick={refreshDevices} disabled={isListening} title={t('spectrogram.refreshTitle')}>
            {t('spectrogram.refresh')}
          </RefreshButton>
        </SelectRow>

        {/* ── Channel cap warning ────────────────────────────── */}
        {isListening && channelsCapped && !warningDismissed && (
          <WarningBox>
            <WarningTitle>
              {t('spectrogram.warnTitle', { count: channelCount })}
              <DismissButton onClick={dismissWarning} title={t('spectrogram.warnDismissTitle')}>
                ✕
              </DismissButton>
            </WarningTitle>
            <span>{t('spectrogram.warnBody')}</span>
            <HelpToggle onClick={() => setShowHelp(v => !v)}>
              {showHelp ? t('spectrogram.helpHide') : t('spectrogram.helpShow')}
            </HelpToggle>
            {showHelp && (
              <HelpPanel>
                <p>
                  <strong>{t('spectrogram.helpPanel.whyTitle')}</strong>{' '}
                  {t('spectrogram.helpPanel.whyBody')}
                </p>
                <ol>
                  <li>
                    <strong>{t('spectrogram.helpPanel.step1Title')}</strong>
                    <code>pw-cli list-objects | grep -i saffire</code>
                    {t('spectrogram.helpPanel.step1Note')}
                  </li>
                  <li>
                    <strong>{t('spectrogram.helpPanel.step2Title')}</strong>
                    <code>pw-cli dump short Node | grep saffire</code>
                  </li>
                  <li>
                    <strong>{t('spectrogram.helpPanel.step3Title')}</strong>{' '}
                    {t('spectrogram.helpPanel.step3Suffix')}
                    <code>{`pw-loopback \
  --capture-props='node.name=saffire_in34 \
                   target.object=<your-saffire-node-name> \
                   audio.position=[AUX2 AUX3]' \
  --playback-props='media.class=Audio/Source \
                    audio.position=[FL FR] \
                    node.description="Saffire Inputs 3-4"'`}</code>
                    {t('spectrogram.helpPanel.step3Note')}
                  </li>
                  <li>
                    {t('spectrogram.helpPanel.step4')}
                  </li>
                </ol>
                <p>
                  {t('spectrogram.helpPanel.permanent')}
                  <code>~/.config/pipewire/pipewire.conf.d/saffire-34.conf</code>
                </p>
              </HelpPanel>
            )}
          </WarningBox>
        )}

        <CanvasWrapper>
          {/* Pixel buffer: 1024 bins wide × CANVAS_HEIGHT px tall.
              CSS stretches it to fill the container. */}
          <canvas
            ref={canvasRef}
            width={FREQ_BINS}
            height={CANVAS_HEIGHT}
            aria-label={t('spectrogram.canvasAriaLabel')}
          />

          {/* Frequency axis (approximate — valid at 44.1 kHz sample rate) */}
          <FreqAxis>
            {FREQ_AXIS_TICKS.map(({ label, pct }) => (
              <FreqLabel key={label} $left={pct}>{label}</FreqLabel>
            ))}
          </FreqAxis>
        </CanvasWrapper>

        <Controls>
          {isListening ? (
            <ControlButton $variant="stop" onClick={stopListening}>
              {t('spectrogram.stop')}
            </ControlButton>
          ) : (
            <ControlButton $variant="start" onClick={startListening}>
              {t('spectrogram.start')}
            </ControlButton>
          )}
          <StatusDot $active={isListening} />
          <StatusText>
            {isListening ? t('spectrogram.statusLive') : t('spectrogram.statusStopped')}
          </StatusText>
        </Controls>

        {error && <ErrorMessage>⚠ {error}</ErrorMessage>}
      </SpectrogramSection>
    );
  }
);

export { PreenSpectrogram };
export { BUFFER_FRAMES, FREQ_BINS, FFT_SIZE };
