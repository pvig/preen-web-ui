/**
 * PatchVariator — Neural FM Patch Variation Engine
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Generates musically interesting patch variations from a source patch using
 * a Conditional VAE (CVAE) architecture for TensorFlow.js.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  ARCHITECTURE                                                           │
 * │                                                                         │
 * │  ENCODER                                                                │
 * │  ─────────────────────────────────────────────────────────────────────  │
 * │  Content branch:  params(37) → Dense(64,relu) → Dense(32,relu)         │
 * │  Style branch:    spectrogram(32×128) →                                 │
 * │                     Conv2D(8,3×3) → MaxPool2D →                         │
 * │                     Conv2D(16,3×3) → MaxPool2D →                        │
 * │                     Conv2D(32,3×3) → GlobalAvgPool →                    │
 * │                     Dense(32,relu)                                       │
 * │  Combined:        concat(content_32, style_32) →                        │
 * │                     Dense(48,relu) → [μ(16), log_σ(16)]                 │
 * │                                                                         │
 * │  DECODER                                                                │
 * │  ─────────────────────────────────────────────────────────────────────  │
 * │  [z(16) ‖ src_params(37)] → Dense(64,relu) → Dense(64,relu)            │
 * │                           → Dense(37,sigmoid) → clamped variation       │
 * │                                                                         │
 * │  TRAINING SIGNAL                                                        │
 * │  ─────────────────────────────────────────────────────────────────────  │
 * │  Input:  (patch_A_params + spectrogram_B) → latent z → decoded patchB  │
 * │  Loss:   MSE(decoded, patch_B) + β·KL(q(z|x)||N(0,I)) + validity_pen  │
 * │                                                                         │
 * │  LATENT SPACE STRUCTURE (musical hierarchy)                             │
 * │  ─────────────────────────────────────────────────────────────────────  │
 * │  dims  0..3  "Texture"     — amplitudes & sustain levels                │
 * │  dims  4..7  "Articulation"— attack / decay / release times             │
 * │  dims  8..11 "Harmony"     — frequency ratios & modulation depths       │
 * │  dims 12..15 "Structure"   — algorithm & waveform topology              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Without trained weights, `generateVariations` uses principled Gaussian
 * perturbation in the same structured latent space — musically valid
 * immediately after import, and upgradable to neural inference by calling
 *   `await variator.loadWeights(url)`
 */

import * as tf from '@tensorflow/tfjs';
import { ALGO_DIAGRAMS } from '../algo/algorithms.static';
import type { Patch, Operator, ModulationMatrixRow } from '../types/patch';
import { MATRIX_SOURCE_NAMES, MATRIX_DEST_NAMES } from '../midi/preenFmConstants';

// ── Constants ─────────────────────────────────────────────────────────────────

const PARAM_DIM_FM      = 37;   // FM operator parameters (algo + 6×freq + 6×amp + 6×ADSR)
const NUM_MATRIX_SLOTS  = 12;   // PreenFM3 modulation matrix rows
const MATRIX_SLOT_DIM   =  4;   // [source, dest1, dest2, amount] per slot
const MATRIX_PARAM_DIM  = NUM_MATRIX_SLOTS * MATRIX_SLOT_DIM;      // 48
const N_MATRIX_SOURCES  = MATRIX_SOURCE_NAMES.length;               // 28 (0 = None)
const N_MATRIX_DESTS    = MATRIX_DEST_NAMES.length;                 // 54 (0 = None)
const PARAM_DIM      = PARAM_DIM_FM + MATRIX_PARAM_DIM;  // 85 total dimensions
// ── Structured latent-space dimensions (3-head CVAE) ────────────────────────
/** z_osc: 6 dims encoding Timbre (algo + freq×6 + amp×6) */
export const Z_OSC_DIM    = 6;   // dims 0-5
/** z_env: 4 dims encoding Dynamics (ADSR × 6 operators) */
export const Z_ENV_DIM    = 4;   // dims 6-9
/** z_matrix: 2 dims encoding Modulation routing (12-slot matrix) */
export const Z_MATRIX_DIM = 2;   // dims 10-11
const LATENT_DIM  = Z_OSC_DIM + Z_ENV_DIM + Z_MATRIX_DIM;  // 12
const SPEC_H         = 32;   // downsampled spectrogram height (from 128)
const SPEC_W         = 128;  // downsampled spectrogram width  (from 1024)
const ALGO_COUNT     = ALGO_DIAGRAMS.length;   // 32 algorithms

// ── Dimension lock types ───────────────────────────────────────────────────────

/** One of the four musical variation dimensions. */
export type VariatorDimension = 'texture' | 'articulation' | 'harmony' | 'structure';

/**
 * Freeze individual dimensions during variation generation.
 * Set a dimension to `true` to keep it unchanged; omit or `false` to vary it.
 */
export type DimensionLocks = Partial<Record<VariatorDimension, boolean>>;

/**
 * Grouped latent dimensions → musical parameter groups.
 * The `chaosExp` exponent controls how steeply each group reacts to chaos:
 *   effective_σ = sigma * chaos^chaosExp
 *
 *   dim 0-2  → Texture      (z_osc low)  chaosExp=0.6  (always active, soft)
 *   dim 3-5  → Harmony      (z_osc high) chaosExp=1.8  (harmonic shifts)
 *   dim 6-9  → Articulation (z_env)      chaosExp=1.0  (envelope dynamics)
 *   dim 10-11→ Structure    (z_mat)      chaosExp=3.0  (modulation routing)
 */
const LATENT_GROUPS: { name: VariatorDimension; dims: [number, number]; chaosExp: number; sigma: number }[] = [
  { name: 'texture',      dims: [0,  2],  chaosExp: 0.6, sigma: 0.40 },
  { name: 'harmony',      dims: [3,  5],  chaosExp: 1.8, sigma: 0.50 },
  { name: 'articulation', dims: [6,  9],  chaosExp: 1.0, sigma: 0.45 },
  { name: 'structure',    dims: [10, 11], chaosExp: 3.0, sigma: 0.60 },
];

/**
 * Mapping of param vector indices to musical groups (for direct perturbation
 * when the CVAE decoder is not yet available).
 *
 * Each group has:
 *   indices  : range [start, end] inclusive within the 37-dim vector
 *   chaosExp : same exponents as the latent space groups above
 *   sigma    : maximum noise std dev at chaos = 1.0
 */
const PARAM_GROUPS: { indices: [number, number]; chaosExp: number; sigma: number; dimension: VariatorDimension }[] = [
  // p[0]     algorithm (structural — discrete after rounding)
  { indices: [0,  0],  chaosExp: 3.0, sigma: 0.30, dimension: 'structure'    },
  // p[1..6]  operator frequencies / ratios (harmonic)
  { indices: [1,  6],  chaosExp: 1.8, sigma: 0.25, dimension: 'harmony'      },
  // p[7..12] operator amplitudes (textural)
  { indices: [7,  12], chaosExp: 0.6, sigma: 0.20, dimension: 'texture'      },
  // p[13..18] attack times (articulation)
  { indices: [13, 18], chaosExp: 1.0, sigma: 0.25, dimension: 'articulation' },
  // p[19..24] decay times (articulation)
  { indices: [19, 24], chaosExp: 1.0, sigma: 0.25, dimension: 'articulation' },
  // p[25..30] sustain levels (textural)
  { indices: [25, 30], chaosExp: 0.6, sigma: 0.20, dimension: 'texture'      },
  // p[31..36] release times (articulation)
  { indices: [31, 36], chaosExp: 1.0, sigma: 0.25, dimension: 'articulation' },
];
// ── Timbral descriptors ─────────────────────────────────────────────────────

/** Names of the 6 timbral descriptors (same order as Python train_cvae.py). */
export const DESCRIPTOR_NAMES = [
  'Luminosité', 'Rugosité', 'Métal', 'Épaisseur', 'Mouvement', 'Poids',
] as const;

/**
 * Six normalised [0, 1] timbral characteristics derived from the FM parameter
 * vector.  Used both for display and as soft targets for variation biasing.
 *
 *  luminosite — spectral brightness (amplitude-weighted mean freq ratio)
 *  rugosite   — amplitude unevenness across operators
 *  metal      — proportion of operators in the high-freq range (> 8×)
 *  epaisseur  — fraction of operators that are audibly active
 *  mouvement  — inverse of amplitude-weighted attack time (fast = animated)
 *  poids      — amplitude-weighted mean sustain level (high = heavy/sustained)
 */
export interface TimbralDescriptors {
  luminosite: number;
  rugosite:   number;
  metal:      number;
  epaisseur:  number;
  mouvement:  number;
  poids:      number;
}
// ── Box-Muller Gaussian sampler (no TF.js required) ──────────────────────────

/** Returns a sample from N(0,1) using Box-Muller transform. */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}


// ── Param vector ↔ Patch conversion ──────────────────────────────────────────

/**
 * Converts a Patch to a 37-dim normalized [0, 1] parameter vector.
 * Matches the encoding used in PresetBankHarvester.patchToParamVector().
 */
export function patchToParamVector(patch: Patch): Float32Array {
  const p = new Float32Array(PARAM_DIM);  // zeros — unused matrix slots stay 0

  // ── FM operator parameters (p[0..36]) ──────────────────────────────────
  const algId  = patch.algorithm?.id ?? 'alg1';
  const algNum = parseInt(String(algId).replace(/\D/g, ''), 10) - 1;
  p[0] = Math.max(0, Math.min(isNaN(algNum) ? 0 : algNum, ALGO_COUNT - 1)) / (ALGO_COUNT - 1);

  const ops = patch.operators ?? [];
  for (let i = 0; i < 6; i++) {
    const op = ops[i];
    if (!op) continue;
    p[1  + i] = Math.max(0, Math.min(op.frequency             ?? 1,  16)) / 16;
    p[7  + i] = Math.max(0, Math.min(op.amplitude             ?? 0,   1));
    p[13 + i] = Math.max(0, Math.min(op.adsr?.attack?.time    ?? 0, 100)) / 100;
    p[19 + i] = Math.max(0, Math.min(op.adsr?.decay?.time     ?? 0, 100)) / 100;
    p[25 + i] = Math.max(0, Math.min(op.adsr?.sustain?.level  ?? 0, 100)) / 100;
    p[31 + i] = Math.max(0, Math.min(op.adsr?.release?.time   ?? 0, 100)) / 100;
  }

  // ── Modulation matrix (p[37..84]) — Digital Silence for unused slots ──────
  const matrix = patch.modulationMatrix ?? [];
  for (let i = 0; i < NUM_MATRIX_SLOTS; i++) {
    const slot = matrix[i] as ModulationMatrixRow | undefined;
    if (!slot || slot.source === 'None' || slot.amount === 0) continue;
    const srcIdx = (MATRIX_SOURCE_NAMES as readonly string[]).indexOf(slot.source);
    if (srcIdx <= 0) continue;   // unknown or None source → treat as unused
    const d1Idx = Math.max(0, (MATRIX_DEST_NAMES as readonly string[]).indexOf(slot.destination1));
    const d2Idx = Math.max(0, (MATRIX_DEST_NAMES as readonly string[]).indexOf(slot.destination2));
    const base  = PARAM_DIM_FM + i * MATRIX_SLOT_DIM;
    p[base + 0] = srcIdx / (N_MATRIX_SOURCES - 1);
    p[base + 1] = d1Idx  / (N_MATRIX_DESTS   - 1);
    p[base + 2] = d2Idx  / (N_MATRIX_DESTS   - 1);
    p[base + 3] = Math.max(0, Math.min((slot.amount + 10) / 20, 1));
  }
  return p;
}

/**
 * Reconstructs a Patch from a param vector by deep-cloning `basePatch`
 * and applying the denormalized values.
 *
 * Fields not represented in the vector (LFOs, filters, arpeggiation,
 * effects, waveforms) are inherited unchanged from `basePatch`.
 */
export function paramVectorToPatch(vec: Float32Array | number[], basePatch: Patch, name?: string): Patch {
  // Deep clone via JSON (safe for PlainObject patches)
  const patch: Patch = JSON.parse(JSON.stringify(basePatch));

  patch.name = (name ?? `${basePatch.name}~`).slice(0, 12);

  // Algorithm — round to nearest valid index
  const algIdx = Math.round(Math.max(0, Math.min(vec[0] * (ALGO_COUNT - 1), ALGO_COUNT - 1)));
  const algDiagram = ALGO_DIAGRAMS[algIdx];
  if (algDiagram) {
    patch.algorithm = {
      ...(patch.algorithm ?? {}),
      id:   algDiagram.id,
      name: algDiagram.name,
    } as Patch['algorithm'];
  }

  // Operators
  const ops = patch.operators ?? [];
  for (let i = 0; i < 6; i++) {
    const op = ops[i] as Operator | undefined;
    if (!op) continue;

    op.frequency = clamp(vec[1  + i] * 16,  0.25, 16);
    op.amplitude = clamp(vec[7  + i],        0,    1);

    op.adsr ??= { attack: { time: 0, level: 0 }, decay: { time: 0, level: 0 }, sustain: { time: 0, level: 100 }, release: { time: 0, level: 0 } };
    op.adsr.attack  ??= { time: 0, level: 0 };
    op.adsr.decay   ??= { time: 0, level: 0 };
    op.adsr.sustain ??= { time: 0, level: 100 };
    op.adsr.release ??= { time: 0, level: 0 };

    op.adsr.attack.time  = clamp(vec[13 + i] * 100, 0, 100);
    op.adsr.decay.time   = clamp(vec[19 + i] * 100, 0, 100);
    op.adsr.sustain.level = clamp(vec[25 + i] * 100, 0, 100);
    op.adsr.release.time = clamp(vec[31 + i] * 100, 0, 100);
  }

  // ── Modulation matrix (p[37..84]) — only decode when vector is full-length ──
  // Old 37-dim models output 37 values → keep basePatch matrix unchanged.
  if (vec.length >= PARAM_DIM) {
    const newMatrix: ModulationMatrixRow[] = [];
    for (let i = 0; i < NUM_MATRIX_SLOTS; i++) {
      const base    = PARAM_DIM_FM + i * MATRIX_SLOT_DIM;
      const srcNorm = vec[base + 0];
      if (srcNorm < 0.01) {   // source ≈ 0 → unused (Digital Silence)
        newMatrix.push({ source: 'None', destination1: 'None', destination2: 'None', amount: 0 });
        continue;
      }
      const srcIdx = Math.round(srcNorm * (N_MATRIX_SOURCES - 1));
      const d1Idx  = Math.round(vec[base + 1] * (N_MATRIX_DESTS - 1));
      const d2Idx  = Math.round(vec[base + 2] * (N_MATRIX_DESTS - 1));
      const amount = clamp(vec[base + 3] * 20 - 10, -10, 10);
      newMatrix.push({
        source:       ((MATRIX_SOURCE_NAMES as readonly string[])[srcIdx] ?? 'None') as string,
        destination1: ((MATRIX_DEST_NAMES   as readonly string[])[d1Idx]  ?? 'None') as string,
        destination2: ((MATRIX_DEST_NAMES   as readonly string[])[d2Idx]  ?? 'None') as string,
        amount,
      });
    }
    patch.modulationMatrix = newMatrix;
  }

  return patch;
}

// ── Validity enforcement ──────────────────────────────────────────────────────

/**
 * Ensures a param vector represents a "valid" (audible) patch.
 *
 * Rules:
 *  1. At least one amplitude (p[7..12]) must be > MIN_CARRIER_AMP.
 *  2. At least one sustain level (p[25..30]) must be > MIN_SUSTAIN.
 *  3. Frequency ratios (p[1..6]) must be in [MIN_FREQ, 1.0].
 *  4. Attack times (p[13..18]) must be in [0, MAX_ATTACK].
 *
 * If constraints are violated, values are rescaled/clamped to restore validity
 * without discarding the variation.
 */
const MIN_CARRIER_AMP = 0.05;
const MIN_SUSTAIN     = 0.05;
const MIN_FREQ        = 0.016;   // ≈ 0.25 Hz ratio
const MAX_ATTACK      = 0.95;    // 95% of 100 ms range

export function enforceValidity(vec: Float32Array | number[]): Float32Array {
  const v = Float32Array.from(vec);

  // 1. Clamp frequencies
  for (let i = 1; i <= 6; i++) v[i] = clamp(v[i], MIN_FREQ, 1.0);

  // 2. Clamp attack times
  for (let i = 13; i <= 18; i++) v[i] = clamp(v[i], 0, MAX_ATTACK);

  // 3. Ensure at least one sustain > threshold
  const maxSustain = Math.max(...Array.from(v.slice(25, 31)));
  if (maxSustain < MIN_SUSTAIN) {
    // Bring the loudest sustain up to minimum
    let maxIdx = 25;
    for (let i = 26; i <= 30; i++) if (v[i] > v[maxIdx]) maxIdx = i;
    v[maxIdx] = MIN_SUSTAIN;
  }

  // 4. Ensure at least one carrier amplitude is audible.
  //    Carrier identification: carriers typically have amplitude > 0 (set by algorithm).
  //    As a heuristic, treat op indices with higher amplitude in source as carriers.
  const maxAmp = Math.max(...Array.from(v.slice(7, 13)));
  if (maxAmp < MIN_CARRIER_AMP) {
    let maxAmpIdx = 7;
    for (let i = 8; i <= 12; i++) if (v[i] > v[maxAmpIdx]) maxAmpIdx = i;
    v[maxAmpIdx] = MIN_CARRIER_AMP;
  }

  // 5. General clamp [0, 1]
  for (let i = 0; i < v.length; i++) v[i] = clamp(v[i], 0, 1);

  return v;
}
// ── Analytical descriptor computation ───────────────────────────────────────────

/**
 * Computes {@link TimbralDescriptors} analytically from a 37-dim param vector.
 * No spectrogram or model weights are required.
 */
export function computeDescriptors(params: Float32Array): TimbralDescriptors {
  const freqs    = Array.from(params.slice(1, 7));   // normalized [0,1]
  const amps     = Array.from(params.slice(7, 13));
  const attacks  = Array.from(params.slice(13, 19));
  const sustains = Array.from(params.slice(25, 31));

  const totalAmp = amps.reduce((s, a) => s + a, 0) || 1;
  const meanAmp  = totalAmp / 6;

  // Luminosité: amplitude-weighted mean frequency ratio
  const luminosite = clamp(
    amps.reduce((s, a, i) => s + a * freqs[i], 0) / totalAmp,
    0, 1,
  );

  // Rugosité: coefficient of variation of amplitudes
  const ampVar  = amps.reduce((s, a) => s + (a - meanAmp) ** 2, 0) / 6;
  const rugosite = clamp(Math.sqrt(ampVar) / (meanAmp + 0.001), 0, 1);

  // Métal: fraction of operators with freq > 0.5 (> 8× ratio) that are audible
  const highFreqActive = freqs.filter((f, i) => f > 0.5 && amps[i] > 0.05).length;
  const metal = clamp(highFreqActive / 4, 0, 1);

  // Épaisseur: fraction of operators that are audibly active
  const epaisseur = clamp(amps.filter(a => a > 0.05).length / 6, 0, 1);

  // Mouvement: amplitude-weighted inverse of attack time (fast attack = animated)
  const mouvement = clamp(
    1 - amps.reduce((s, a, i) => s + a * attacks[i], 0) / totalAmp,
    0, 1,
  );

  // Poids: amplitude-weighted mean sustain level
  const poids = clamp(
    amps.reduce((s, a, i) => s + a * sustains[i], 0) / totalAmp,
    0, 1,
  );

  return { luminosite, rugosite, metal, epaisseur, mouvement, poids };
}

/**
 * Nudges a param vector toward the given timbral descriptor targets.
 *
 * Each target in [0, 1] represents the desired descriptor value.  The
 * adjustment is proportional to the error between current and target,
 * scaled by `strength` (default 0.4).  `enforceValidity` is applied
 * at the end so the result is always a valid patch.
 */
function applyDescriptorBias(
  vec:     Float32Array,
  targets: Partial<TimbralDescriptors>,
  strength = 0.4,
): Float32Array {
  const v = Float32Array.from(vec);
  const s = clamp(strength, 0, 1);
  if (s <= 0) return enforceValidity(v);

  const cur = computeDescriptors(v);

  // Luminosité → push all operator frequencies [p1..p6]
  if (targets.luminosite !== undefined) {
    const adj = (targets.luminosite - cur.luminosite) * s * 0.25;
    for (let i = 1; i <= 6; i++) v[i] = clamp(v[i] + adj, 0, 1);
  }

  // Rugosité → spread or equalise amplitudes [p7..p12]
  if (targets.rugosite !== undefined) {
    const err  = targets.rugosite - cur.rugosite;
    const amps = Array.from(v.slice(7, 13));
    const mean = amps.reduce((s, a) => s + a, 0) / 6;
    for (let i = 0; i < 6; i++) {
      const dev = amps[i] - mean;
      v[7 + i] = clamp(mean + dev * (1 + err * s * 0.8), 0, 1);
    }
  }

  // Métal → push upper operator frequencies [p3..p6]
  if (targets.metal !== undefined) {
    const adj = (targets.metal - cur.metal) * s * 0.2;
    for (let i = 3; i <= 6; i++) v[i] = clamp(v[i] + adj, 0, 1);
  }

  // Épaisseur → scale amplitudes [p7..p12] up or down
  if (targets.epaisseur !== undefined) {
    const adj = (targets.epaisseur - cur.epaisseur) * s * 0.2;
    for (let i = 7; i <= 12; i++) v[i] = clamp(v[i] + adj, 0, 1);
  }

  // Mouvement → shorten or lengthen attack/decay [p13..p24]
  if (targets.mouvement !== undefined) {
    const adj = -(targets.mouvement - cur.mouvement) * s * 0.3;
    for (let i = 13; i <= 18; i++) v[i] = clamp(v[i] + adj, 0, 1);
    for (let i = 19; i <= 24; i++) v[i] = clamp(v[i] + adj * 0.5, 0, 1);
  }

  // Poids → adjust sustain levels [p25..p30]
  if (targets.poids !== undefined) {
    const adj = (targets.poids - cur.poids) * s * 0.4;
    for (let i = 25; i <= 30; i++) v[i] = clamp(v[i] + adj, 0, 1);
  }

  return enforceValidity(v);
}
// ── Principled perturbation (no model required) ───────────────────────────────

/**
 * Generates one perturbed param vector from `src` using chaos-scaled
 * Gaussian noise in the structured parameter space.
 *
 * @param src     Normalized 37-dim source vector.
 * @param chaos   Variation intensity [0, 1].
 *                0 = silent no-op, 1 = maximum musical chaos.
 */
function perturbVector(src: Float32Array, chaos: number, locks: DimensionLocks = {}): Float32Array {
  const v = Float32Array.from(src);
  const c = clamp(chaos, 0, 1);

  for (const group of PARAM_GROUPS) {
    if (locks[group.dimension]) continue;
    const effectiveSigma = group.sigma * Math.pow(c, group.chaosExp);
    const [start, end] = group.indices;
    for (let i = start; i <= end; i++) {
      v[i] = clamp(v[i] + randn() * effectiveSigma, 0, 1);
    }
  }

  return enforceValidity(v);
}

// ── Spectrogram downsampling ──────────────────────────────────────────────────

/**
 * Downsample a 128×1024 Float32Array to SPEC_H × SPEC_W = 32×128
 * using 2D average pooling (4× height, 8× width reduction).
 * Returns a new Float32Array of length SPEC_H * SPEC_W.
 */
export function downsampleSpectrogram(buf: Float32Array, srcH = 128, srcW = 1024): Float32Array {
  const strideH = Math.floor(srcH / SPEC_H);
  const strideW = Math.floor(srcW / SPEC_W);
  const out = new Float32Array(SPEC_H * SPEC_W);
  for (let r = 0; r < SPEC_H; r++) {
    for (let c = 0; c < SPEC_W; c++) {
      let sum = 0, count = 0;
      for (let dr = 0; dr < strideH; dr++) {
        for (let dc = 0; dc < strideW; dc++) {
          const srcR = r * strideH + dr;
          const srcC = c * strideW + dc;
          if (srcR < srcH && srcC < srcW) {
            sum += buf[srcR * srcW + srcC];
            count++;
          }
        }
      }
      out[r * SPEC_W + c] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

// ── CVAE model builder ────────────────────────────────────────────────────────

/**
 * Builds the CVAE architecture using TensorFlow.js.
 *
 * Returns { encoder, decoder, cvae } as separate tf.LayersModel objects.
 * Train with the dataset produced by PresetBankHarvester:
 *
 *   encoder input  : [patchA_params(37), spectrogram_B_downsampled(32×128)]
 *   decoder output : patchB_params(37)
 *   loss           : MSE + β·KL
 *
 * Export for browser use:
 *   await cvae.save('downloads://preenfm3-variator')
 */
export function buildCVAEModel(): {
  encoder: tf.LayersModel;
  decoder: tf.LayersModel;
} {
  // ── Encoder ────────────────────────────────────────────────────────────────

  // Content branch
  const paramsInput  = tf.input({ shape: [PARAM_DIM],          name: 'params_input'  });
  const spectInput   = tf.input({ shape: [SPEC_H, SPEC_W, 1],  name: 'spect_input'   });

  let contentFeat: tf.SymbolicTensor = paramsInput;
  contentFeat = tf.layers.dense({ units: 128, activation: 'relu', name: 'c_dense0' }).apply(contentFeat) as tf.SymbolicTensor;
  contentFeat = tf.layers.dense({ units: 256, activation: 'relu', name: 'c_dense1' }).apply(contentFeat) as tf.SymbolicTensor;
  contentFeat = tf.layers.dense({ units: 128, activation: 'relu', name: 'c_dense2' }).apply(contentFeat) as tf.SymbolicTensor;

  // Style branch (CNN)
  let styleFeat: tf.SymbolicTensor = spectInput;
  styleFeat = tf.layers.conv2d({ filters: 8,  kernelSize: 3, padding: 'same', activation: 'relu', name: 's_conv0' }).apply(styleFeat) as tf.SymbolicTensor;
  styleFeat = tf.layers.maxPooling2d({ poolSize: [2, 2], name: 's_pool0' }).apply(styleFeat) as tf.SymbolicTensor;
  styleFeat = tf.layers.conv2d({ filters: 16, kernelSize: 3, padding: 'same', activation: 'relu', name: 's_conv1' }).apply(styleFeat) as tf.SymbolicTensor;
  styleFeat = tf.layers.maxPooling2d({ poolSize: [2, 2], name: 's_pool1' }).apply(styleFeat) as tf.SymbolicTensor;
  styleFeat = tf.layers.conv2d({ filters: 32, kernelSize: 3, padding: 'same', activation: 'relu', name: 's_conv2' }).apply(styleFeat) as tf.SymbolicTensor;
  styleFeat = tf.layers.globalAveragePooling2d({ name: 's_gap' }).apply(styleFeat) as tf.SymbolicTensor;
  styleFeat = tf.layers.dense({ units: 32, activation: 'relu', name: 's_dense' }).apply(styleFeat) as tf.SymbolicTensor;

  const combined = tf.layers.concatenate({ name: 'concat' }).apply([contentFeat, styleFeat]) as tf.SymbolicTensor;
  let hidden: tf.SymbolicTensor = combined;
  hidden = tf.layers.dense({ units: 128, activation: 'relu', name: 'enc_hidden0' }).apply(hidden) as tf.SymbolicTensor;
  hidden = tf.layers.dense({ units: 64,  activation: 'relu', name: 'enc_hidden1' }).apply(hidden) as tf.SymbolicTensor;

  const zMean   = tf.layers.dense({ units: LATENT_DIM, name: 'z_mean'    }).apply(hidden) as tf.SymbolicTensor;
  const zLogVar = tf.layers.dense({ units: LATENT_DIM, name: 'z_log_var' }).apply(hidden) as tf.SymbolicTensor;

  const encoder = tf.model({
    inputs:  [paramsInput, spectInput],
    outputs: [zMean, zLogVar],
    name:    'encoder',
  });

  // ── Decoder ────────────────────────────────────────────────────────────────

  const zInput   = tf.input({ shape: [LATENT_DIM], name: 'z_input'   });
  const srcInput = tf.input({ shape: [PARAM_DIM],  name: 'src_input' });

  const decConcat = tf.layers.concatenate({ name: 'dec_concat' }).apply([zInput, srcInput]) as tf.SymbolicTensor;
  let decOut: tf.SymbolicTensor = decConcat;
  decOut = tf.layers.dense({ units: 128, activation: 'relu',    name: 'dec_dense0' }).apply(decOut) as tf.SymbolicTensor;
  decOut = tf.layers.dense({ units: 256, activation: 'relu',    name: 'dec_dense1' }).apply(decOut) as tf.SymbolicTensor;
  decOut = tf.layers.dense({ units: 128, activation: 'relu',    name: 'dec_dense2' }).apply(decOut) as tf.SymbolicTensor;
  decOut = tf.layers.dense({ units: PARAM_DIM, activation: 'sigmoid', name: 'dec_out' }).apply(decOut) as tf.SymbolicTensor;

  const decoder = tf.model({
    inputs:  [zInput, srcInput],
    outputs: decOut,
    name:    'decoder',
  });

  return { encoder, decoder };
}

// ── KL divergence loss ────────────────────────────────────────────────────────

/**
 * Reparameterisation trick: z = μ + σ * ε,  ε ~ N(0,I).
 * Returns a tf.Tensor of shape [batch, LATENT_DIM].
 */
export function reparameterise(zMean: tf.Tensor, zLogVar: tf.Tensor): tf.Tensor {
  return tf.tidy(() => {
    const eps = tf.randomNormal(zMean.shape as [number, number]);
    return zMean.add(eps.mul(tf.exp(zLogVar.mul(0.5))));
  });
}

/**
 * KL divergence: KL(N(μ,σ²) || N(0,1)) = -0.5 * Σ(1 + log_σ² - μ² - σ²).
 * Returns scalar tensor (mean over batch and dimensions).
 */
export function klDivergence(zMean: tf.Tensor, zLogVar: tf.Tensor): tf.Tensor {
  return tf.tidy(() =>
    tf.scalar(-0.5).mul(
      tf.scalar(1).add(zLogVar).sub(zMean.square()).sub(tf.exp(zLogVar)).mean()
    )
  );
}

// ── PatchVariator class ───────────────────────────────────────────────────────

export class PatchVariator {
  private encoder: tf.LayersModel | null = null;
  private decoder: tf.LayersModel | null = null;
  private _weightsLoaded = false;
  private _loadingPromise: Promise<void> | null = null;

  get weightsLoaded(): boolean { return this._weightsLoaded; }

  /**
   * Load trained CVAE weights from a TF.js SavedModel URL.
   * After loading, `generateVariations` will use neural inference
   * instead of principled perturbation.
   *
   * Multiple concurrent callers share the same in-flight promise so the
   * models are only fetched and parsed once.
   *
   * @param encoderUrl URL to encoder model.json (e.g. '/models/encoder/model.json')
   * @param decoderUrl URL to decoder model.json (e.g. '/models/decoder/model.json')
   */
  async loadWeights(encoderUrl: string, decoderUrl: string): Promise<void> {
    if (this._weightsLoaded) return;
    if (this._loadingPromise) return this._loadingPromise;
    this._loadingPromise = Promise.all([
      tf.loadLayersModel(encoderUrl),
      tf.loadLayersModel(decoderUrl),
    ]).then(([encoder, decoder]) => {
      this.encoder = encoder;
      this.decoder = decoder;
      this._weightsLoaded = true;
      this._loadingPromise = null;
    }).catch(err => {
      this._loadingPromise = null;
      // Swallow shape-mismatch errors (e.g. old 37-dim models while new 85-dim
      // architecture is not yet trained). Neural inference will be unavailable;
      // the principled-perturbation fallback stays active.
      console.warn('[PatchVariator] Could not load CVAE weights — running in fallback mode.', err);
    });
    return this._loadingPromise;
  }

  /**
   * Unload model weights and free GPU memory.
   */
  dispose(): void {
    this.encoder?.dispose();
    this.decoder?.dispose();
    this.encoder = null;
    this.decoder = null;
    this._weightsLoaded = false;
  }

  /**
   * Match a target spectrogram to a Patch via deterministic CVAE inference.
   *
   * Uses `basePatch` as the source conditioning for the decoder — the result is
   * a patch that sounds like the target audio while being anchored to the
   * parameter space of `basePatch`.
   *
   * @param spect      128×1024 Float32Array spectrogram of the target sound
   *                   (same format as PreenSpectrogram.getNormalizedBuffer())
   * @param basePatch  Source conditioning patch (the "starting point")
   * @param algoLocked If true, the algorithm index from basePatch is preserved
   * @returns          Predicted Patch, or null if weights are not loaded
   */
  matchSpectrogram(spect: Float32Array, basePatch: Patch, algoLocked = false): Patch | null {
    if (!this._weightsLoaded || !this.encoder || !this.decoder) return null;

    const src = patchToParamVector(basePatch);
    const ds  = downsampleSpectrogram(spect);
    let result: Patch | null = null;

    tf.tidy(() => {
      const srcTensor   = tf.tensor2d([Array.from(src)], [1, PARAM_DIM]);
      const spectTensor = tf.tensor4d(Array.from(ds),    [1, SPEC_H, SPEC_W, 1]);

      // Encode → get latent mean (no sampling = deterministic match)
      const [zMeanT] = this.encoder!.predict([srcTensor, spectTensor]) as tf.Tensor[];

      // Decode → param prediction
      const outTensor = this.decoder!.predict([zMeanT, srcTensor]) as tf.Tensor;
      const rawVec = Float32Array.from(outTensor.dataSync());

      if (algoLocked) rawVec[0] = src[0];

      const validVec = enforceValidity(rawVec);
      result = paramVectorToPatch(validVec, basePatch, 'matched');
    });

    return result;
  }

  /**
   * Generate `count` patch variations from `basePatch`.
   *
   * @param basePatch  Source patch to vary.
   * @param chaos      Variation intensity [0.0, 1.0].
   *                   0.0 → subtle textural changes (amplitudes, envelopes).
   *                   0.5 → noticeable harmonic shifts (frequency ratios).
   *                   1.0 → radical mutation (algorithm, waveform topology).
   * @param count      Number of variations to generate (default 5).
   * @param styleSpect Optional 128×1024 Float32Array spectrogram for style
   *                   conditioning. Provides a "target timbral character".
   *                   Only used when CVAE weights are loaded.
   * @returns          Array of `count` valid Patch objects.
   */
  generateVariations(
    basePatch:  Patch,
    chaos:      number,
    count       = 5,
    styleSpect?: Float32Array,
    locks:       DimensionLocks = {},
    descriptorTargets?: Partial<TimbralDescriptors>,
  ): Patch[] {
    const src = patchToParamVector(basePatch);

    if (this._weightsLoaded && this.encoder && this.decoder) {
      return this._inferVariations(src, basePatch, chaos, count, styleSpect, locks, descriptorTargets);
    }
    return this._perturbVariations(src, basePatch, chaos, count, locks, descriptorTargets);
  }

  // ── Neural inference path (weights loaded) ──────────────────────────────────

  private _inferVariations(
    src:        Float32Array,
    basePatch:  Patch,
    chaos:      number,
    count:      number,
    styleSpect?: Float32Array,
    locks:       DimensionLocks = {},
    descriptorTargets?: Partial<TimbralDescriptors>,
  ): Patch[] {
    const c = clamp(chaos, 0, 1);
    const results: Patch[] = [];

    tf.tidy(() => {
      const srcTensor  = tf.tensor2d([Array.from(src)], [1, PARAM_DIM]);
      const downspect  = styleSpect
        ? downsampleSpectrogram(styleSpect)
        : new Float32Array(SPEC_H * SPEC_W);
      const spectTensor = tf.tensor4d(Array.from(downspect), [1, SPEC_H, SPEC_W, 1]);

      const [zMeanT, zLogVarT] = this.encoder!.predict([srcTensor, spectTensor]) as tf.Tensor[];

      const zMean   = Array.from(zMeanT.dataSync());
      const zLogStd = Array.from(zLogVarT.dataSync()).map(v => Math.sqrt(Math.exp(v)));

      for (let n = 0; n < count; n++) {
        // Sample z with chaos-weighted σ per latent group
        const z = new Float32Array(LATENT_DIM);
        for (const grp of LATENT_GROUPS) {
          const effSigma = locks[grp.name]
            ? 0
            : zLogStd[grp.dims[0]] * Math.pow(c, grp.chaosExp);
          for (let d = grp.dims[0]; d <= grp.dims[1]; d++) {
            z[d] = zMean[d] + effSigma * randn();
          }
        }

        const zTensor  = tf.tensor2d([Array.from(z)], [1, LATENT_DIM]);
        const outTensor = this.decoder!.predict([zTensor, srcTensor]) as tf.Tensor;
        const rawVec   = Float32Array.from(outTensor.dataSync());

        // Algorithm freedom is cubic in chaos: nearly zero below 0.7, full at 1.0.
        // This keeps p[0] locked to the source algorithm at low/medium chaos and
        // only allows genuine algo changes when the user intentionally pushes chaos high.
        const algoFreedom = Math.pow(c, 3.0);
        rawVec[0] = src[0] * (1 - algoFreedom) + rawVec[0] * algoFreedom;

        let validVec = enforceValidity(rawVec);
        if (descriptorTargets) validVec = applyDescriptorBias(validVec, descriptorTargets);
        results.push(paramVectorToPatch(validVec, basePatch, variationName(basePatch.name, n)));
      }
    });

    return results;
  }

  /**
   * Decode a pre-computed 12-dim latent vector into a Patch.
   *
   * This is the inverse of the CVAE encoder and is used by the LatentSpaceMap
   * component to map 2D positions back to synthesizer parameters.  The decoder
   * is conditioned on `basePatch` (its 85-dim param vector is supplied as the
   * `src_input`), so the result blends the latent-space target `z` with the
   * harmonic character of the current patch.
   *
   * @param z         12-dim latent vector (Float32Array of length LATENT_DIM)
   * @param basePatch Source conditioning patch
   * @returns         Decoded Patch, or null if weights are not loaded
   */
  decodeLatent(z: Float32Array, basePatch: Patch): Patch | null {
    if (!this._weightsLoaded || !this.decoder) return null;
    const src = patchToParamVector(basePatch);
    let result: Patch | null = null;
    tf.tidy(() => {
      const zTensor   = tf.tensor2d([Array.from(z)],   [1, LATENT_DIM]);
      const srcTensor = tf.tensor2d([Array.from(src)], [1, PARAM_DIM]);
      const outTensor = this.decoder!.predict([zTensor, srcTensor]) as tf.Tensor;
      const rawVec    = Float32Array.from(outTensor.dataSync());
      const validVec  = enforceValidity(rawVec);
      result = paramVectorToPatch(validVec, basePatch, 'latent');
    });
    return result;
  }

  // ── Principled perturbation path (no weights) ───────────────────────────────

  private _perturbVariations(
    src:       Float32Array,
    basePatch: Patch,
    chaos:     number,
    count:     number,
    locks:     DimensionLocks = {},
    descriptorTargets?: Partial<TimbralDescriptors>,
  ): Patch[] {
    return Array.from({ length: count }, (_, n) => {
      let perturbed = perturbVector(src, chaos, locks);
      if (descriptorTargets) perturbed = applyDescriptorBias(perturbed, descriptorTargets);
      return paramVectorToPatch(perturbed, basePatch, variationName(basePatch.name, n));
    });
  }

  // ── Structured (3-head) encode / decode ─────────────────────────────────────

  /**
   * Encode a patch into 3 structured head vectors.
   *
   * @param patch     Source patch to encode.
   * @param spectData Optional 128×1024 Float32Array style spectrogram.
   * @returns         `{ zOsc, zEnv, zMatrix }` or null if weights are not loaded.
   */
  encodeStructured(
    patch: Patch,
    spectData?: Float32Array,
  ): { zOsc: Float32Array; zEnv: Float32Array; zMatrix: Float32Array } | null {
    if (!this._weightsLoaded || !this.encoder) return null;
    const src = patchToParamVector(patch);
    let result: { zOsc: Float32Array; zEnv: Float32Array; zMatrix: Float32Array } | null = null;
    tf.tidy(() => {
      const srcTensor   = tf.tensor2d([Array.from(src)],   [1, PARAM_DIM]);
      const ds          = spectData ? downsampleSpectrogram(spectData) : new Float32Array(SPEC_H * SPEC_W);
      const spectTensor = tf.tensor4d(Array.from(ds), [1, SPEC_H, SPEC_W, 1]);
      const [zMeanT]    = this.encoder!.predict([srcTensor, spectTensor]) as tf.Tensor[];
      const fullZ       = Float32Array.from(zMeanT.dataSync());
      result = {
        zOsc:    fullZ.slice(0, Z_OSC_DIM),
        zEnv:    fullZ.slice(Z_OSC_DIM, Z_OSC_DIM + Z_ENV_DIM),
        zMatrix: fullZ.slice(Z_OSC_DIM + Z_ENV_DIM),
      };
    });
    return result;
  }

  /**
   * Decode 3 structured head vectors into a Patch.
   *
   * Concatenates `zOsc || zEnv || zMatrix` into the full 12-dim z and
   * delegates to `decodeLatent`.
   *
   * @param zOsc    6-dim Timbre head vector.
   * @param zEnv    4-dim Dynamics head vector.
   * @param zMatrix 2-dim Modulation head vector.
   * @param basePatch Conditioning patch.
   */
  decodeStructured(
    zOsc:     Float32Array,
    zEnv:     Float32Array,
    zMatrix:  Float32Array,
    basePatch: Patch,
  ): Patch | null {
    const z = new Float32Array(LATENT_DIM);
    z.set(zOsc,    0);
    z.set(zEnv,    Z_OSC_DIM);
    z.set(zMatrix, Z_OSC_DIM + Z_ENV_DIM);
    return this.decodeLatent(z, basePatch);
  }
}

// ── Module-level default instance ─────────────────────────────────────────────

/** Shared singleton – import and use directly, or construct your own. */
export const variator = new PatchVariator();

/**
 * Convenience wrapper matching the interface requested in the spec.
 *
 * @param basePatch  Source patch.
 * @param intensity  Chaos [0, 1].
 * @param count      Number of results (default 5).
 * @param styleSpect Optional style spectrogram (Float32Array, 128×1024).
 */
export function generateVariations(
  basePatch:  Patch,
  intensity:  number,
  count       = 5,
  styleSpect?: Float32Array,
  locks?:      DimensionLocks,
  descriptorTargets?: Partial<TimbralDescriptors>,
): Patch[] {
  return variator.generateVariations(basePatch, intensity, count, styleSpect, locks ?? {}, descriptorTargets);
}

/**
 * Module-level convenience wrapper for {@link PatchVariator.decodeLatent}.
 *
 * @param z         12-dim latent vector produced by the CVAE encoder
 * @param basePatch Conditioning patch (source params for the decoder)
 */
export function decodeLatent(
  z:         Float32Array,
  basePatch: Patch,
): Patch | null {
  return variator.decodeLatent(z, basePatch);
}

/** Module-level wrapper for {@link PatchVariator.encodeStructured}. */
export function encodeStructured(
  patch: Patch,
  spectData?: Float32Array,
): { zOsc: Float32Array; zEnv: Float32Array; zMatrix: Float32Array } | null {
  return variator.encodeStructured(patch, spectData);
}

/** Module-level wrapper for {@link PatchVariator.decodeStructured}. */
export function decodeStructured(
  zOsc:     Float32Array,
  zEnv:     Float32Array,
  zMatrix:  Float32Array,
  basePatch: Patch,
): Patch | null {
  return variator.decodeStructured(zOsc, zEnv, zMatrix, basePatch);
}

/** Module-level convenience wrapper for {@link PatchVariator.matchSpectrogram}. */
export function matchSpectrogram(
  spect:      Float32Array,
  basePatch:  Patch,
  algoLocked = false,
): Patch | null {
  return variator.matchSpectrogram(spect, basePatch, algoLocked);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function variationName(base: string, index: number): string {
  const suffix = String(index + 1);
  return `${base.slice(0, 11 - suffix.length)}~${suffix}`;
}
