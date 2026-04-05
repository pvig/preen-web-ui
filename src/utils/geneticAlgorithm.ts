/**
 * Genetic Algorithm for PreenFM3 patch evolution.
 *
 * DNA is partitioned into 5 independent blocks:
 *   ALGO   — Algorithm routing + FM Modulation Indices + Feedback amounts
 *   OSC    — Operator frequencies, detunes, amplitudes, waveforms, panning
 *   ENV    — All 6 operator ADSR envelopes
 *   MATRIX — All Modulation Matrix rows (source → destination × amount)
 *   FILTER — Filter 1 & Filter 2 (type, param1, param2, gain)
 *
 * Crossover picks each block wholesale from one parent (coin flip per block),
 * preserving the internal consistency of each group.
 *
 * Mutation applies a per-parameter Gaussian offset with probability `mutationRate`
 * to every continuous numerical parameter, clamped to its firmware limits.
 */

import type { Patch } from '../types/patch';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DNABlock = 'ALGO' | 'OSC' | 'ENV' | 'MATRIX' | 'FILTER1' | 'FILTER2';
export type BlockSource = 'A' | 'B';
export type BlockSelection = Record<DNABlock, BlockSource>;

export interface BreedResult {
  patch: Patch;
  /** Which parent contributed each block */
  blocks: BlockSelection;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

/** Box-Muller normal sample (μ=0, σ=1). */
function randNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Possibly offset `value` by a Gaussian amount.
 * @param value  Current value
 * @param range  Total parameter range (used to scale the Gaussian σ)
 * @param rate   Probability [0,1] that mutation fires
 * @param sigma  Gaussian σ as a fraction of `range` (default 10%)
 */
function maybeMutate(value: number, range: number, rate: number, sigma = 0.10): number {
  if (Math.random() >= rate) return value;
  return value + randNormal() * sigma * range;
}

// ─── Crossover ────────────────────────────────────────────────────────────────

/**
 * Breed one child from two parents.
 *
 * For each DNA block a fair coin determines which parent is the donor.
 * The child starts as a deep-clone of parentA; blocks from parentB are
 * surgically transplanted.
 */
export function crossover(parentA: Patch, parentB: Patch): BreedResult {
  // Deep-clone A as the base
  const child: Patch = JSON.parse(JSON.stringify(parentA));

  const blocks: BlockSelection = {
    ALGO:    Math.random() < 0.5 ? 'A' : 'B',
    OSC:     Math.random() < 0.5 ? 'A' : 'B',
    ENV:     Math.random() < 0.5 ? 'A' : 'B',
    MATRIX:  Math.random() < 0.5 ? 'A' : 'B',
    FILTER1: Math.random() < 0.5 ? 'A' : 'B',
    FILTER2: Math.random() < 0.5 ? 'A' : 'B',
  };

  // ── ALGO block ─────────────────────────────────────────────────────────────
  // Transplants: algorithm descriptor, operator routing (type + target/IMs), feedbacks.
  if (blocks.ALGO === 'B') {
    child.algorithm = JSON.parse(JSON.stringify(parentB.algorithm));
    for (const op of child.operators) {
      const donor = parentB.operators.find(o => o.id === op.id);
      if (donor) {
        op.type           = donor.type;
        op.target         = JSON.parse(JSON.stringify(donor.target));
        op.feedbackAmount = donor.feedbackAmount;
      }
    }
  }

  // ── OSC block ──────────────────────────────────────────────────────────────
  // Transplants: frequency, detune, amplitude, pan, waveform, keyboardTracking,
  // frequencyType, enabled, velocitySensitivity.
  if (blocks.OSC === 'B') {
    for (const op of child.operators) {
      const donor = parentB.operators.find(o => o.id === op.id);
      if (donor) {
        op.frequency          = donor.frequency;
        op.detune             = donor.detune;
        op.amplitude          = donor.amplitude;
        op.pan                = donor.pan;
        op.waveform           = donor.waveform;
        op.keyboardTracking   = donor.keyboardTracking;
        op.frequencyType      = donor.frequencyType;
        op.enabled            = donor.enabled;
        op.velocitySensitivity = donor.velocitySensitivity;
      }
    }
  }

  // ── ENV block ──────────────────────────────────────────────────────────────
  // Transplants: full ADSR (times + levels + curve types) for all 6 operators.
  if (blocks.ENV === 'B') {
    for (const op of child.operators) {
      const donor = parentB.operators.find(o => o.id === op.id);
      if (donor) {
        op.adsr = JSON.parse(JSON.stringify(donor.adsr));
      }
    }
  }

  // ── MATRIX block ───────────────────────────────────────────────────────────
  // Transplants the entire modulation matrix (all rows).
  if (blocks.MATRIX === 'B') {
    child.modulationMatrix = JSON.parse(JSON.stringify(parentB.modulationMatrix));
  }

  // ── FILTER1 block ──────────────────────────────────────────────────────────
  // Transplants Filter 1 (index 0) independently from Filter 2.
  if (blocks.FILTER1 === 'B' && parentB.filters) {
    child.filters[0] = JSON.parse(JSON.stringify(parentB.filters[0]));
  }

  // ── FILTER2 block ──────────────────────────────────────────────────────────
  // Filter 2 strongly shapes the final timbre; treated as its own independent block.
  if (blocks.FILTER2 === 'B' && parentB.filters) {
    child.filters[1] = JSON.parse(JSON.stringify(parentB.filters[1]));
  }

  return { patch: child, blocks };
}

// ─── Mutation ─────────────────────────────────────────────────────────────────

/**
 * Stochastically offset every continuous numerical parameter in the patch.
 *
 * Discrete / enum values (waveform type, filter type, algorithm id, etc.) are
 * intentionally left untouched — they are varied by the crossover step only.
 *
 * @param patch        Source patch (will be deep-cloned internally).
 * @param mutationRate Probability [0,1] that each individual parameter mutates.
 */
export function mutate(patch: Patch, mutationRate: number): Patch {
  const child: Patch = JSON.parse(JSON.stringify(patch));

  for (const op of child.operators) {
    // OSC continuous params
    op.frequency    = clamp(maybeMutate(op.frequency,    16.0,  mutationRate),  0,    16   );
    op.detune       = clamp(maybeMutate(op.detune,        32.0,  mutationRate), -16,   16   );
    op.amplitude    = clamp(maybeMutate(op.amplitude,      1.0,  mutationRate),  0,     1   );
    op.pan          = clamp(maybeMutate(op.pan,            2.0,  mutationRate), -1,     1   );
    op.feedbackAmount      = clamp(maybeMutate(op.feedbackAmount      ?? 0,  16.0, mutationRate),  0, 16);
    op.velocitySensitivity = clamp(maybeMutate(op.velocitySensitivity ?? 8,  16.0, mutationRate),  0, 16);
    op.keyboardTracking    = clamp(maybeMutate(op.keyboardTracking    ?? 1,   2.0, mutationRate),  0,  2);

    // ENV continuous params (ADSR times 0-100, levels 0-100)
    const adsr = op.adsr;
    adsr.attack.time   = clamp(maybeMutate(adsr.attack.time,   100, mutationRate), 0, 100);
    adsr.attack.level  = clamp(maybeMutate(adsr.attack.level,  100, mutationRate), 0, 100);
    adsr.decay.time    = clamp(maybeMutate(adsr.decay.time,    100, mutationRate), 0, 100);
    adsr.decay.level   = clamp(maybeMutate(adsr.decay.level,   100, mutationRate), 0, 100);
    adsr.sustain.time  = clamp(maybeMutate(adsr.sustain.time,  100, mutationRate), 0, 100);
    adsr.sustain.level = clamp(maybeMutate(adsr.sustain.level, 100, mutationRate), 0, 100);
    adsr.release.time  = clamp(maybeMutate(adsr.release.time,  100, mutationRate), 0, 100);
    adsr.release.level = clamp(maybeMutate(adsr.release.level, 100, mutationRate), 0, 100);

    // IM values per operator target link (0-16)
    for (const link of op.target) {
      link.im                 = clamp(maybeMutate(link.im                ?? 0, 16, mutationRate), 0, 16);
      link.modulationIndexVelo = clamp(maybeMutate(link.modulationIndexVelo ?? 0, 16, mutationRate), 0, 16);
    }
  }

  // MATRIX continuous param (amount -10..+10, range 20)
  for (const row of child.modulationMatrix) {
    row.amount = clamp(maybeMutate(row.amount, 20.0, mutationRate), -10, 10);
  }

  // FILTER continuous params
  if (child.filters) {
    for (const filter of child.filters) {
      filter.param1 = clamp(maybeMutate(filter.param1, 1.0, mutationRate), 0, 1);
      filter.param2 = clamp(maybeMutate(filter.param2, 1.0, mutationRate), 0, 1);
      filter.gain   = clamp(maybeMutate(filter.gain,   2.0, mutationRate), 0, 2);
    }
  }

  return child;
}

// ─── High-level API ───────────────────────────────────────────────────────────

/**
 * Single breed cycle: crossover then mutate.
 */
export function breed(
  parentA: Patch,
  parentB: Patch,
  mutationRate: number,
): BreedResult {
  const { patch, blocks } = crossover(parentA, parentB);
  return { patch: mutate(patch, mutationRate), blocks };
}

/**
 * Generate `count` children from two parents.
 * Names are auto-generated as "{pA slice}x{pB slice}_{index+1}".
 */
export function generateChildren(
  parentA: Patch,
  parentB: Patch,
  count: number,
  mutationRate: number,
): BreedResult[] {
  const nameA = parentA.name.replace(/[^A-Z0-9]/gi, '').substring(0, 5) || 'A';
  const nameB = parentB.name.replace(/[^A-Z0-9]/gi, '').substring(0, 5) || 'B';

  return Array.from({ length: count }, (_, i) => {
    const result = breed(parentA, parentB, mutationRate);
    result.patch.name = `${nameA}x${nameB}_${i + 1}`;
    return result;
  });
}
