import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  useSpectrogramBridge,
  audioBands,
} from '../stores/spectrogramBridge';
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

/**
 * Bin ranges for the 4 audio bands fed to StarfieldCanvas shells.
 * Indices into the 1024-bin FFT array at 44.1 kHz (binHz ≈ 21.5 Hz).
 */
const BAND_BINS = {
  band0: { lo:   1, hi:  11 },  // ~20–237 Hz   (sub/bass)
  band1: { lo:  12, hi:  92 },  // ~258–1978 Hz  (low-mid)
  band2: { lo:  93, hi: 371 },  // ~2000–7977 Hz (hi-mid)
  band3: { lo: 372, hi: 930 },  // ~7998–19993 Hz (high)
} as const;

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

/** Builds a 256-entry RGB LUT from 12 evenly-spaced color stops. */
function buildThemeLUT(
  c1: string,  c2: string,  c3: string,  c4: string,
  c5: string,  c6: string,  c7: string,  c8: string,
  c9: string,  c10: string, c11: string, c12: string
): Uint8ClampedArray {
  const stops: [number, number, number, number][] = [
    [ 0/11, ...hexToRgb(c1)],
    [ 1/11, ...hexToRgb(c2)],
    [ 2/11, ...hexToRgb(c3)],
    [ 3/11, ...hexToRgb(c4)],
    [ 4/11, ...hexToRgb(c5)],
    [ 5/11, ...hexToRgb(c6)],
    [ 6/11, ...hexToRgb(c7)],
    [ 7/11, ...hexToRgb(c8)],
    [ 8/11, ...hexToRgb(c9)],
    [ 9/11, ...hexToRgb(c10)],
    [10/11, ...hexToRgb(c11)],
    [11/11, ...hexToRgb(c12)],
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

/** Builds a 256-entry RGB LUT for the Herbig-Haro 110 jet palette (treble end).
 *  HH 110 — protostellar jet (Hubble): deep indigo shock → electric blue → cyan → ice white. */
function buildHH110LUT(): Uint8ClampedArray {
  return buildThemeLUT(
    '#000002', '#030514', '#060e28', '#0a1848',
    '#0e2870', '#060c18', '#1060c0', '#1888d0',  // stop 6: vide interstellaire (~45% amp)
    '#20b0c8', '#30c8b8', '#70e0d0', '#c0f0ec'
  );
}

// ============================================================
// WebGL2 helpers
// ============================================================

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile error');
  return shader;
}

interface WebGLRes {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  uWriteHead: WebGLUniformLocation;
  uTime: WebGLUniformLocation;
  uDataTex: WebGLTexture;
  uLutATex: WebGLTexture;
  uLutBTex: WebGLTexture;
}

const VERT_SRC = `#version 300 es
in vec2 aPos;
out vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// NOTE: FRAMES is embedded at compile time from the module-level constant.
const FRAG_SRC = `#version 300 es
precision mediump float;
uniform sampler2D uData;
uniform sampler2D uLutA;
uniform sampler2D uLutB;
uniform int   uWriteHead;
uniform float uTime;
in vec2 vUV;
out vec4 fragColor;
const float LOG_F_MIN  = 20.0;
const float LOG_F_NYQ  = 22050.0;
const int   FRAMES     = ${BUFFER_FRAMES};
// Precomputed at shader compile time — avoids log() call per fragment.
const float LOG_RANGE  = log(LOG_F_NYQ / LOG_F_MIN);

// ── Procedural noise helpers (value noise + 5-octave FBM) ──────────────
float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  // 4 octaves: 5th contributes only ~3 % of total amplitude — not visible.
  for (int i = 0; i < 4; i++) {
    v   += amp * valueNoise(p);
    p   *= 2.1;
    amp *= 0.48;
  }
  return v;
}

void main() {
  // ── Log-scale frequency axis (x) ──────────────────────────────────
  float u = LOG_F_MIN * exp(vUV.x * LOG_RANGE) / LOG_F_NYQ;

  // ── 2D time axis: vUV.y=1 (top) = newest, vUV.y=0 (bottom) = oldest
  float ageF     = (1.0 - vUV.y) * float(FRAMES - 1);
  float frameIdx = mod(float(uWriteHead) + ageF, float(FRAMES));
  float v        = (frameIdx + 0.5) / float(FRAMES);
  float amp      = texture(uData, vec2(u, v)).r;

  // ── Spectrogram color (dual-LUT + timeFade + vignette) ────────────
  float timeFade = 0.55 + vUV.y * 0.45; // top (newest) = 1.0, bottom (oldest) = 0.55
  float blend    = pow(vUV.x, 1.3);
  float lu       = amp * (255.0 / 256.0) + 0.5 / 256.0;
  vec3  colA     = texture(uLutA, vec2(lu, 0.5)).rgb;
  vec3  colB     = texture(uLutB, vec2(lu, 0.5)).rgb;
  float vignette = 1.0 - pow(abs(vUV.x - 0.5) * 2.0, 2.5) * 0.4;
  vec3  specCol  = mix(colA, colB, blend) * timeFade * vignette;

  // ── Nebula gas-cloud overlay (3 FBM layers, Hubble palette) ───────
  // Signal presence masks the clouds: loud bins → no cloud, silence → full cloud.
  float silence = 1.0 - clamp(amp * 2.2, 0.0, 1.0);
  // Early-exit: skip all FBM work for fully-masked pixels (signal present).
  // Coherent across warps on the lower rows where signal is strongest.
  if (silence < 0.01) {
    fragColor = vec4(specCol, 1.0);
    return;
  }

  // Layer A — Hα crimson (bass region, large slow drift)
  vec2 uvA = vec2(vUV.x * 3.2 + uTime * 0.018, vUV.y * 2.1 + uTime * 0.007);
  float fA = clamp(fbm(uvA) - 0.30, 0.0, 1.0) * 1.6;
  // Frequency weight: peaks in low-freq zone (vUV.x near 0)
  float wA = exp(-vUV.x * 2.8);
  vec3  cA = vec3(0.72, 0.05, 0.10); // Hα crimson

  // Layer B — [OIII] cobalt (mid region, medium drift)
  vec2 uvB = vec2(vUV.x * 4.8 - uTime * 0.012, vUV.y * 3.0 + uTime * 0.015);
  float fB = clamp(fbm(uvB) - 0.28, 0.0, 1.0) * 1.5;
  // Frequency weight: Gaussian centred at mid (vUV.x ~ 0.45)
  float wB = exp(-pow((vUV.x - 0.45) * 3.0, 2.0));
  vec3  cB = vec3(0.06, 0.22, 0.72); // [OIII] cobalt

  // Layer C — [SII] amber (treble region, finer/faster drift)
  vec2 uvC = vec2(vUV.x * 7.0 + uTime * 0.030, vUV.y * 4.5 - uTime * 0.010);
  float fC = clamp(fbm(uvC) - 0.32, 0.0, 1.0) * 1.4;
  // Frequency weight: peaks in high-freq zone (vUV.x near 1)
  float wC = exp(-(1.0 - vUV.x) * 2.8);
  vec3  cC = vec3(0.75, 0.45, 0.04); // [SII] amber

  // Modulate each layer by its frequency weight and signal silence
  const float CLOUD_GAIN = 0.45;
  vec3 cloudCol = (cA * fA * wA + cB * fB * wB + cC * fC * wC) * silence * CLOUD_GAIN;

  // ── Additive composite ─────────────────────────────────────────────
  fragColor = vec4(specCol + cloudCol, 1.0);
}`;

/**
 * Initialises a WebGL2 context on the given canvas, compiles shaders,
 * uploads the initial LUT A palette, and returns all GPU resources.
 * Called once per listening session inside startListening().
 */
function initWebGL(canvas: HTMLCanvasElement, lutAData: Uint8ClampedArray): WebGLRes {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('WebGL2 not supported in this browser');

  const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program link error');
  gl.useProgram(program);

  // Fullscreen quad: BL, BR, TL, TR (TRIANGLE_STRIP)
  const vao = gl.createVertexArray()!;
  const vbo = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPosLoc = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

  gl.uniform1i(gl.getUniformLocation(program, 'uData'),  0);
  gl.uniform1i(gl.getUniformLocation(program, 'uLutA'), 1);
  gl.uniform1i(gl.getUniformLocation(program, 'uLutB'), 2);
  const uWriteHead = gl.getUniformLocation(program, 'uWriteHead')!;
  const uTime      = gl.getUniformLocation(program, 'uTime')!;

  // uData: FREQ_BINS × BUFFER_FRAMES, R8 — ring buffer (initialised to 0)
  const uDataTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, uDataTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, FREQ_BINS, BUFFER_FRAMES, 0,
    gl.RED, gl.UNSIGNED_BYTE, null);

  // uLutA: 256×1, RGB8 — theme-dependent palette (updated on theme change)
  const uLutATex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, uLutATex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 256, 1, 0,
    gl.RGB, gl.UNSIGNED_BYTE, lutAData);

  // uLutB: 256×1, RGB8 — HH110 palette (constant)
  const lutBData = buildHH110LUT();
  const uLutBTex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, uLutBTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 256, 1, 0,
    gl.RGB, gl.UNSIGNED_BYTE, lutBData);

  gl.viewport(0, 0, FREQ_BINS, CANVAS_HEIGHT);
  return { gl, program, vao, vbo, uWriteHead, uTime, uDataTex, uLutATex, uLutBTex };
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
 * Tick marks for the logarithmic frequency axis (used for overlay labels).
 * pct: horizontal position [0–100] computed from the same log formula as the fragment shader.
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
  isolation: isolate;

  canvas {
    display: block;
    /* CSS-scale the 1024-wide pixel buffer to fill the container
       while preserving all frequency bins in the underlying data. */
    width: 100%;
    height: ${CANVAS_HEIGHT}px;
    image-rendering: auto;
  }

  /* Fullscreen: GPU-scale the canvas to fill the screen — zero CPU overhead. */
  &:fullscreen {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: none;
    canvas { height: 100%; }
  }
  &:-webkit-full-screen {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: none;
    canvas { height: 100%; }
  }
  &:-moz-full-screen {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
    border: none;
    canvas { height: 100%; }
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

const FullscreenButton = styled.button`
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
  background: ${({ theme }) => theme.colors.button};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1;

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

// (Frequency axis ticks are defined above in FREQ_AXIS_TICKS)



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
    /** WebGL2 GPU resources — allocated in startListening, freed in stopListening. */
    const glRef = useRef<WebGLRes | null>(null);
    /** Current theme LUT A data — kept current by the theme useEffect so
     *  startListening always gets the latest palette even if called stale. */
    const lutARef = useRef<Uint8ClampedArray>(buildThemeLUT(
      theme.colors.spectro1,  theme.colors.spectro2,  theme.colors.spectro3,  theme.colors.spectro4,
      theme.colors.spectro5,  theme.colors.spectro6,  theme.colors.spectro7,  theme.colors.spectro8,
      theme.colors.spectro9,  theme.colors.spectro10, theme.colors.spectro11, theme.colors.spectro12
    ));
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const splitterRef = useRef<ChannelSplitterNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animFrameRef = useRef<number | null>(null);

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

    // ── Lissajous refs (written imperatively from RAF) ────────────────
    // (removed — audio energies are written to audioBands bridge instead)

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
    const canvasWrapperRef = useRef<HTMLDivElement>(null);
    const starCanvasRef = useRef<HTMLCanvasElement>(null);
    const starRafRef = useRef<number | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const dismissWarning = useCallback(() => {
      sessionStorage.setItem('spectrogram-ch-warning-dismissed', '1');
      setWarningDismissed(true);
      setShowHelp(false);
    }, []);

    const toggleFullscreen = useCallback(() => {
      if (!document.fullscreenElement) {
        canvasWrapperRef.current?.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }, []);

    useEffect(() => {
      const onFullscreenChange = () =>
        setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', onFullscreenChange);
      return () =>
        document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    // ── Starfield background inside fullscreen spectrogram ────
    useEffect(() => {
      const canvas = starCanvasRef.current;
      if (!isFullscreen || !canvas) {
        if (starRafRef.current !== null) {
          cancelAnimationFrame(starRafRef.current);
          starRafRef.current = null;
        }
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const resize = () => {
        canvas.width  = canvas.offsetWidth  || window.innerWidth;
        canvas.height = canvas.offsetHeight || window.innerHeight;
      };
      resize();
      window.addEventListener('resize', resize);

      const SF_R = 900, SF_FOCAL = 500;
      const SF_SHELLS: [number, number][] = [
        [0.70, 1.00], [0.55, 0.85], [0.40, 0.70], [0.25, 0.55],
      ];

      // ── Star population: 400 normal + 120 galactic disc ─────────────────
      const DISC_COUNT = 120;
      const TOTAL_STARS = 400 + DISC_COUNT;
      const stars = Array.from({ length: TOTAL_STARS }, (_, i) => {
        const isDisc = i >= 400;
        const shell  = (i % 4) as 0|1|2|3;
        const [rMin, rMax] = SF_SHELLS[isDisc ? 1 : shell];
        const r = SF_R * (rMin + Math.random() * (rMax - rMin));
        const theta = Math.random() * Math.PI * 2;
        // Disc stars: constrained near the equatorial plane (phi ≈ π/2 ± 0.15)
        const phi = isDisc
          ? Math.PI / 2 + (Math.random() - 0.5) * 0.30
          : Math.acos(2 * Math.random() - 1);
        const brightness = isDisc ? 0.18 + Math.random() * 0.35 : 0.35 + Math.random() * 0.65;
        return {
          ox: r * Math.sin(phi) * Math.cos(theta),
          oy: r * Math.sin(phi) * Math.sin(theta),
          oz: r * Math.cos(phi),
          brightness,
          lfoPhase:    Math.random() * Math.PI * 2,
          lfoFreq:     0.08 + Math.random() * 0.12,
          // Atmospheric scintillation — two independent sine oscillators per star
          scintPhaseX: Math.random() * Math.PI * 2,
          scintPhaseY: Math.random() * Math.PI * 2,
          scintFreq:   20 + Math.random() * 40,    // 3–10 Hz — crisp atmospheric shimmer
          shell,
          reactivity: Math.random() < 0.25 ? 0.1 + Math.random() * 0.9 : Math.random() * 0.25,
          isDisc,
          // ~20 % of bright non-disc stars can produce diffraction-spike flares
          flareable: !isDisc && brightness > 0.55 && Math.random() < 0.20,
        };
      });

      // Pre-computed indices of flareable stars for O(1) random selection
      const flareableIndices = stars.reduce<number[]>((acc, s, i) => {
        if (s.flareable) acc.push(i);
        return acc;
      }, []);

      // ── Nebula blobs: 4 radial clouds, one per audio band ───────────────
      // Positions are slightly off-center; colors are Hubble-inspired.
      const nebulae = [
        { bx: 0.38, by: 0.42, r: 0.28, band: 0, cr: 140, cg: 20,  cb: 60  }, // Hα red (bass)
        { bx: 0.62, by: 0.35, r: 0.22, band: 1, cr: 20,  cg: 55,  cb: 120 }, // O III blue (lo-mid)
        { bx: 0.45, by: 0.65, r: 0.20, band: 2, cr: 20,  cg: 110, cb: 90  }, // S II teal (hi-mid)
        { bx: 0.70, by: 0.60, r: 0.18, band: 3, cr: 150, cg: 95,  cb: 15  }, // stellar amber (high)
      ];

      // ── Stellar flares: brief diffraction-spike flashes ──────────────────
      interface Flare { starIdx: number; life: number; maxLife: number; spikeLen: number; }
      const flares: Flare[] = [];

      let angleY = 0, angleX = 0;
      const env = [0, 0, 0, 0];
      const ATTACK = 0.35, DECAY = 0.96;

      const drawStar = (ms: number) => {
        starRafRef.current = requestAnimationFrame(drawStar);
        const t = ms * 0.001;
        const { width: W, height: H } = canvas;
        angleY += 0.00015;
        angleX += 0.00018;
        const cosY = Math.cos(angleY), sinY = Math.sin(angleY);
        const cosX = Math.cos(angleX), sinX = Math.sin(angleX);

        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(0, 0, W, H);

        const cx = W / 2, cy = H / 2;
        const raw = [audioBands.band0, audioBands.band1, audioBands.band2, audioBands.band3];
        for (let s = 0; s < 4; s++) {
          env[s] = raw[s] > env[s]
            ? raw[s] * ATTACK + env[s] * (1 - ATTACK)
            : env[s] * DECAY;
        }

        // ── Nebula clouds ────────────────────────────────────────────────
        for (const nb of nebulae) {
          const e = env[nb.band];
          const alpha  = 0.015 + e * 0.06;
          const radius = (nb.r * Math.min(W, H)) * (1 + e * 0.3);
          const bx = nb.bx * W, by = nb.by * H;
          const grad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
          grad.addColorStop(0,   `rgba(${nb.cr},${nb.cg},${nb.cb},${alpha})`);
          grad.addColorStop(0.4, `rgba(${nb.cr},${nb.cg},${nb.cb},${alpha * 0.4})`);
          grad.addColorStop(1,   `rgba(${nb.cr},${nb.cg},${nb.cb},0)`);
          ctx.beginPath();
          ctx.arc(bx, by, radius, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // ── Stars (sphere projection + atmospheric scintillation) ────────
        for (const star of stars) {
          const x1 =  star.ox * cosY + star.oz * sinY;
          const z1 = -star.ox * sinY + star.oz * cosY;
          const y2 =  star.oy * cosX - z1 * sinX;
          const z2 =  star.oy * sinX + z1 * cosX;
          if (z2 < 50) continue;
          const depth = Math.min(1, z2 / (SF_R * 1.6));
          // Sub-pixel jitter simulates atmospheric wavefront distortion.
          // Amplitude scales with nearness; disc stars get half amplitude.
          const jAmp   = star.isDisc ? 0.08 : (0.22 - depth * 0.15);
          const scintX = Math.sin(t * star.scintFreq        + star.scintPhaseX) * jAmp;
          const scintY = Math.cos(t * star.scintFreq * 0.73 + star.scintPhaseY) * jAmp;
          // Independent alpha flicker (±15 %) at a slightly different frequency
          const scintA = 0.88 + 0.12 * Math.sin(t * star.scintFreq * 1.4 + star.scintPhaseX + 0.9);
          const sx = (x1 / z2) * SF_FOCAL + cx + scintX;
          const sy = (y2 / z2) * SF_FOCAL + cy + scintY;
          const lfo   = 0.5 + 0.5 * Math.sin(t * star.lfoFreq + star.lfoPhase);
          const e     = Math.min(1, env[star.shell] * 4 * star.reactivity);
          const size  = star.isDisc
            ? Math.max(0.2, (1 - depth) * 1.4)
            : Math.max(0.3, (1 - depth) * 2.4 + e * 3.5);
          const alpha = Math.min(1, (star.brightness * lfo * (0.25 + (1 - depth) * 0.75) + e * 0.7) * scintA);
          const base  = 170 + (1 - depth) * 85;
          let r: number, g: number, b: number;
          if (star.isDisc) {
            // Disc stars: warm yellowish-white, subtly tinted by shell band
            const tint = env[star.shell] * 30;
            r = Math.min(255, Math.floor(base + tint));
            g = Math.min(255, Math.floor(base * 0.9 + tint * 0.5));
            b = Math.floor(base * 0.7);
          } else if (star.shell === 0) {
            r = Math.min(255, Math.floor(base + e * 140));
            g = Math.min(255, Math.floor(base * 0.65 + e * 40));
            b = Math.floor(100 + (1 - e) * 155);
          } else if (star.shell === 1) {
            r = Math.min(255, Math.floor(base + e * 80));
            g = Math.min(255, Math.floor(base + e * 60));
            b = Math.floor(180 + (1 - e) * 75);
          } else if (star.shell === 2) {
            r = Math.floor(base);
            g = Math.min(255, Math.floor(base + 20 + e * 40));
            b = 255;
          } else {
            r = Math.floor(base * (0.6 + (1 - e) * 0.4));
            g = Math.floor(base * (0.7 + (1 - e) * 0.3));
            b = Math.min(255, Math.floor(220 + e * 35));
          }
          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fill();
        }

        // ── Stellar flares (diffraction spikes) ──────────────────────────
        // ~1 flare every 5-6 s at 60 fps (p=0.003/frame); max 3 concurrent
        if (flares.length < 3 && flareableIndices.length > 0 && Math.random() < 0.003) {
          const idx = flareableIndices[Math.floor(Math.random() * flareableIndices.length)];
          if (!flares.some(f => f.starIdx === idx)) {
            flares.push({
              starIdx:  idx,
              life:     0,
              maxLife:  10 + Math.floor(Math.random() * 12),
              spikeLen: 8  + Math.random() * 9,
            });
          }
        }
        for (let i = flares.length - 1; i >= 0; i--) {
          const fl   = flares[i];
          fl.life++;
          if (fl.life > fl.maxLife) { flares.splice(i, 1); continue; }
          const star = stars[fl.starIdx];
          // Re-project the star (at most 3 extra projections per frame)
          const fx1 =  star.ox * cosY + star.oz * sinY;
          const fz1 = -star.ox * sinY + star.oz * cosY;
          const fy2 =  star.oy * cosX - fz1 * sinX;
          const fz2 =  star.oy * sinX + fz1 * cosX;
          if (fz2 < 50) continue;
          const fsx    = (fx1 / fz2) * SF_FOCAL + cx;
          const fsy    = (fy2 / fz2) * SF_FOCAL + cy;
          const fDepth = Math.min(1, fz2 / (SF_R * 1.6));
          const fSize  = Math.max(0.3, (1 - fDepth) * 2.4);
          // Bell-curve envelope: alpha rises then falls symmetrically
          const fAlpha = Math.sin(Math.PI * (fl.life / fl.maxLife));
          const sLen   = fl.spikeLen * fAlpha;
          ctx.save();
          ctx.globalAlpha = fAlpha * 0.88;
          ctx.strokeStyle = 'rgba(215,232,255,1)';
          ctx.lineWidth   = 0.7;
          // 4 diffraction arms at 0 / 45 / 90 / 135°
          for (let a = 0; a < 4; a++) {
            const ang = (a * Math.PI) / 4;
            const dx  = Math.cos(ang) * sLen;
            const dy  = Math.sin(ang) * sLen;
            ctx.beginPath();
            ctx.moveTo(fsx - dx, fsy - dy);
            ctx.lineTo(fsx + dx, fsy + dy);
            ctx.stroke();
          }
          // Bright radial glow at the flare core
          ctx.beginPath();
          ctx.arc(fsx, fsy, fSize * (1 + fAlpha * 2.2), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(230,242,255,${(fAlpha * 0.65).toFixed(3)})`;
          ctx.fill();
          ctx.restore();
        }
      };

      starRafRef.current = requestAnimationFrame(drawStar);
      return () => {
        if (starRafRef.current !== null) {
          cancelAnimationFrame(starRafRef.current);
          starRafRef.current = null;
        }
        window.removeEventListener('resize', resize);
      };
    }, [isFullscreen]);

    // ── Initialise circular buffer once ────────────────────────
    useEffect(() => {
      dataBufferRef.current = Array.from(
        { length: BUFFER_FRAMES },
        () => new Uint8Array(FREQ_BINS)
      );
    }, []);

    // ── Rebuild LUT A: update ref + re-upload GL texture when theme changes ──
    useEffect(() => {
      const lutAData = buildThemeLUT(
        theme.colors.spectro1,  theme.colors.spectro2,  theme.colors.spectro3,  theme.colors.spectro4,
        theme.colors.spectro5,  theme.colors.spectro6,  theme.colors.spectro7,  theme.colors.spectro8,
        theme.colors.spectro9,  theme.colors.spectro10, theme.colors.spectro11, theme.colors.spectro12
      );
      lutARef.current = lutAData;
      const res = glRef.current;
      if (!res) return;
      res.gl.activeTexture(res.gl.TEXTURE1);
      res.gl.bindTexture(res.gl.TEXTURE_2D, res.uLutATex);
      res.gl.texSubImage2D(res.gl.TEXTURE_2D, 0, 0, 0, 256, 1,
        res.gl.RGB, res.gl.UNSIGNED_BYTE, lutAData);
    }, [theme.colors.spectro1, theme.colors.spectro2, theme.colors.spectro3, theme.colors.spectro4, theme.colors.spectro5, theme.colors.spectro6, theme.colors.spectro7, theme.colors.spectro8, theme.colors.spectro9, theme.colors.spectro10, theme.colors.spectro11, theme.colors.spectro12]);

    // ── Update Lissajous colors when theme changes ─────────────
    // (removed with Lissajous)

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
     * CPU work per frame (WebGL path):
     *   1. getByteFrequencyData → freqData[] (Web Audio API, unavoidable)
     *   2. 4 bandAvg loops for audioBands bridge (starfield, unavoidable)
     *   3. dataBuffer[head].set(freqData) (ML ring buffer, unavoidable)
     *   4. texSubImage2D — DMA of 1024 bytes to GPU texture row
     *   5. uniform1i + drawArrays — one draw call
     *
     * All log-scale mapping, LUT lookup, palette blend and scrolling
     * happen entirely on the GPU in the fragment shader.
     */
    const drawFrame = useCallback(() => {
      const analyser = analyserRef.current;
      const res = glRef.current;
      if (!analyser || !res) return;

      const { gl, uWriteHead, uTime, uDataTex } = res;
      const freqData = freqDataRef.current;

      // Step 1 — Read FFT data (byte values 0–255)
      analyser.getByteFrequencyData(freqData);

      // ── Audio bands → StarfieldCanvas bridge (no React re-render) ──
      const bandAvg = (lo: number, hi: number) => {
        let s = 0;
        for (let i = lo; i <= hi; i++) s += freqData[i];
        return s / ((hi - lo + 1) * 255);
      };
      audioBands.band0 = bandAvg(BAND_BINS.band0.lo, BAND_BINS.band0.hi);
      audioBands.band1 = bandAvg(BAND_BINS.band1.lo, BAND_BINS.band1.hi);
      audioBands.band2 = bandAvg(BAND_BINS.band2.lo, BAND_BINS.band2.hi);
      audioBands.band3 = bandAvg(BAND_BINS.band3.lo, BAND_BINS.band3.hi);

      // Step 2 — Write to circular buffer (for getNormalizedBuffer / ML)
      const head = writeHeadRef.current;
      dataBufferRef.current[head].set(freqData);
      writeHeadRef.current = (head + 1) % BUFFER_FRAMES;

      // Step 3 — Upload the new row to GPU texture (DMA: 1024 bytes)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, uDataTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, head, FREQ_BINS, 1,
        gl.RED, gl.UNSIGNED_BYTE, freqData);

      // Step 4 — Update uniforms and render the full spectrogram.
      //   The fragment shader addresses the ring buffer using uWriteHead,
      //   so the "scroll" is free — no drawImage blit needed.
      gl.uniform1i(uWriteHead, writeHeadRef.current);
      // Wrap at 1 h to keep mediump float precision in the FBM hash functions.
      gl.uniform1f(uTime, (performance.now() * 0.001) % 3600.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Step 5 — Schedule next frame
      animFrameRef.current = requestAnimationFrame(drawFrame);
    }, []);

    // ── Start / Stop ───────────────────────────────────────────

    /**
     * Requests microphone / line-in access via getUserMedia,
     * wires up the Web Audio pipeline, and kicks off the render loop.
     */
    // Start FFT listening (spectrogram + monitor)
    const startListening = useCallback(async () => {
      // Resume path: stream already acquired (was paused), just restart the RAF.
      // This preserves PipeWire routing established at first start.
      if (streamRef.current && analyserRef.current) {
        // Resume: restore monitor gain (was muted on pause).
        if (monitorGainRef.current) monitorGainRef.current.gain.value = 1;
        setIsListening(true);
        animFrameRef.current = requestAnimationFrame(drawFrame);
        return;
      }

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
        monitorGain.gain.value = 0; // Muted by default
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
        monitorGain.gain.value = 1; // Unmute once the graph is connected.

        // Initialise WebGL2 renderer (lutARef.current is always up-to-date
        // thanks to the theme useEffect that runs on every theme change)
        glRef.current = initWebGL(canvasRef.current!, lutARef.current);

        setIsListening(true);
        animFrameRef.current = requestAnimationFrame(drawFrame);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(t('spectrogram.errorAccess', { msg }));
      }
    }, [drawFrame]);

    /**
     * Soft stop: cancels the RAF and zeros audio bands but keeps the
     * MediaStream, AudioContext and Web Audio graph alive so PipeWire /
     * qpwgraph routing is not destroyed. startListening() will resume
     * without calling getUserMedia again.
     */
    const pauseListening = useCallback(() => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      audioBands.band0 = 0;
      audioBands.band1 = 0;
      audioBands.band2 = 0;
      audioBands.band3 = 0;
      if (monitorGainRef.current) monitorGainRef.current.gain.value = 0;
      setIsListening(false);
      // Stream, AudioContext and audio graph are intentionally kept alive.
    }, []);

    /** Full teardown: releases stream, all audio resources, and WebGL context. Reserved for unmount. */
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
      // Destroy WebGL resources
      if (glRef.current) {
        const { gl, program, vao, vbo, uDataTex, uLutATex, uLutBTex } = glRef.current;
        gl.deleteTexture(uDataTex);
        gl.deleteTexture(uLutATex);
        gl.deleteTexture(uLutBTex);
        gl.deleteProgram(program);
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(vbo);
        glRef.current = null;
      }
      // Reset band energies so stars return to rest
      audioBands.band0 = 0;
      audioBands.band1 = 0;
      audioBands.band2 = 0;
      audioBands.band3 = 0;
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
    // Sync isListening to the bridge store so App.tsx header can react
    useEffect(() => {
      useSpectrogramBridge.getState().setIsListening(isListening);
    }, [isListening]);

    // React to external start/stop requests (e.g. nav toggle button)
    useEffect(() => {
      const unsub = useSpectrogramBridge.subscribe(state => {
        if (state.requestedListening && !isListening) {
          startListening();
        } else if (!state.requestedListening && isListening) {
          pauseListening();
        }
      });
      return unsub;
    }, [isListening, startListening, pauseListening]);

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

        <CanvasWrapper ref={canvasWrapperRef}>
          {/* Starfield background — active only in fullscreen, screen-blended with spectrogram. */}
          <canvas
            ref={starCanvasRef}
            style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              width: '100%', height: '100%',
              display: isFullscreen ? 'block' : 'none',
            }}
          />
          {/* Pixel buffer: 1024 bins wide × CANVAS_HEIGHT px tall.
              CSS stretches it to fill the container. */}
          <canvas
            ref={canvasRef}
            width={FREQ_BINS}
            height={CANVAS_HEIGHT}
            aria-label={t('spectrogram.canvasAriaLabel')}
            style={{ mixBlendMode: 'screen' }}
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
            <ControlButton $variant="stop" onClick={pauseListening}>
              {t('spectrogram.stop')}
            </ControlButton>
          ) : (
            <ControlButton $variant="start" onClick={startListening}>
              {t('spectrogram.start')}
            </ControlButton>
          )}
          <FullscreenButton
            onClick={toggleFullscreen}
            disabled={!isListening}
            title={isFullscreen ? t('spectrogram.exitFullscreen') : t('spectrogram.fullscreen')}
          >
            {isFullscreen ? t('spectrogram.exitFullscreen') : t('spectrogram.fullscreen')}
          </FullscreenButton>
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
