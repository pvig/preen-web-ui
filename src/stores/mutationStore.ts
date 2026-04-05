/**
 * Mutation Store — Zustand store for the Patch Mutation feature.
 *
 * Holds two source patches (A and B) and an interpolation factor (0–1).
 * When mutation is enabled, the "current patch" becomes an interpolation
 * between A and B.
 *
 * Only numeric parameters are interpolated; discrete values (waveform,
 * algorithm, filter type, etc.) are taken from whichever source is closer
 * to the current mix value (≤ 0.5 → A, > 0.5 → B).
 */

import { create } from 'zustand';
import type {
  Patch,
  Operator,
  ModulationMatrixRow,
  LFO,
  Filter,
  NoteCurve,
  ArpeggiatorSettings,
  GlobalEffects,
} from '../types/patch';
import type { AdsrState } from '../types/adsr';
import type { LFOEnvelope, StepSequencer } from '../types/modulation';
import { sanitizePatchName } from '../utils/patchNameUtils';

// ── Interpolation helpers ─────────────────────────────────────────────────────

/** Linear interpolation between two numbers. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Harmonic quantisation ─────────────────────────────────────────────────────

/**
 * Standard FM harmonic ratios.  Operator frequencies that lie on this grid
 * (or within ±HARMONIC_SNAP_TOLERANCE of a grid value) are considered
 * "harmonic" and receive stepped interpolation instead of linear lerp.
 */
export const HARMONIC_GRID: readonly number[] = [
  0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 16.0,
];

const HARMONIC_SNAP_TOLERANCE = 0.05;

/** Returns the index of the nearest HARMONIC_GRID value, or -1 if none is within tolerance. */
function snapIndex(v: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < HARMONIC_GRID.length; i++) {
    const d = Math.abs(v - HARMONIC_GRID[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return bestDist <= HARMONIC_SNAP_TOLERANCE ? best : -1;
}

/**
 * Harmonic-quantised interpolation for FM operator ratios.
 *
 * - Both values on the grid  → step through grid indices at equal t intervals.
 *   e.g. 1.0 → 2.0 at t=0.5 yields 1.5, never an inharmonic 1.537.
 * - At least one value off-grid → fall back to `lerp` (preserves fine-tuning).
 */
export function lerpHarmonic(a: number, b: number, t: number): number {
  const ia = snapIndex(a);
  const ib = snapIndex(b);
  if (ia === -1 || ib === -1) return lerp(a, b, t);
  if (ia === ib) return HARMONIC_GRID[ia];
  const steps = Math.abs(ib - ia);
  const dir   = ib > ia ? 1 : -1;
  const step  = Math.min(Math.floor(t * steps), steps);
  return HARMONIC_GRID[ia + dir * step];
}

/** Pick value from A or B depending on mix (threshold 0.5). */
function pick<T>(a: T, b: T, t: number): T {
  return t <= 0.5 ? a : b;
}

/** Round to a reasonable precision to avoid floating-point noise. */
function round(v: number, decimals = 4): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

// ── Per-field interpolation ───────────────────────────────────────────────────

function interpolateADSR(a: AdsrState, b: AdsrState, t: number): AdsrState {
  return {
    attack: { time: round(lerp(a.attack.time, b.attack.time, t)), level: round(lerp(a.attack.level, b.attack.level, t)) },
    decay: { time: round(lerp(a.decay.time, b.decay.time, t)), level: round(lerp(a.decay.level, b.decay.level, t)) },
    sustain: { time: round(lerp(a.sustain.time, b.sustain.time, t)), level: round(lerp(a.sustain.level, b.sustain.level, t)) },
    release: { time: round(lerp(a.release.time, b.release.time, t)), level: round(lerp(a.release.level, b.release.level, t)) },
  };
}

function interpolateOperator(a: Operator, b: Operator, t: number): Operator {
  return {
    ...pick(a, b, t), // discrete fields (id, enabled, waveform, type, frequencyType)
    id: a.id,
    // Use harmonic-quantised interpolation for ratio-mode operators so the
    // dataset never contains inharmonious detuned intermediate values.
    frequency: (a.frequencyType === 'KEYBOARD' && b.frequencyType === 'KEYBOARD')
      ? round(lerpHarmonic(a.frequency, b.frequency, t))
      : round(lerp(a.frequency, b.frequency, t)),
    detune: round(lerp(a.detune, b.detune, t)),
    keyboardTracking: round(lerp(a.keyboardTracking, b.keyboardTracking, t)),
    amplitude: round(lerp(a.amplitude, b.amplitude, t)),
    pan: round(lerp(a.pan, b.pan, t)),
    feedbackAmount: round(lerp(a.feedbackAmount, b.feedbackAmount, t)),
    velocitySensitivity: round(lerp(a.velocitySensitivity, b.velocitySensitivity, t)),
    adsr: interpolateADSR(a.adsr, b.adsr, t),
    target: a.target.map((link, i) => {
      const bLink = b.target[i];
      if (!bLink) return link;
      return {
        id: link.id,
        im: round(lerp(link.im, bLink.im, t)),
        modulationIndexVelo: round(lerp(link.modulationIndexVelo, bLink.modulationIndexVelo, t)),
      };
    }),
  };
}

function interpolateMatrix(a: ModulationMatrixRow[], b: ModulationMatrixRow[], t: number): ModulationMatrixRow[] {
  return a.map((rowA, i) => {
    const rowB = b[i];
    if (!rowB) return rowA;
    return {
      source: pick(rowA.source, rowB.source, t),
      destination1: pick(rowA.destination1, rowB.destination1, t),
      destination2: pick(rowA.destination2, rowB.destination2, t),
      amount: round(lerp(rowA.amount, rowB.amount, t)),
    };
  });
}

function interpolateLFO(a: LFO, b: LFO, t: number): LFO {
  return {
    shape: pick(a.shape, b.shape, t),
    syncMode: pick(a.syncMode, b.syncMode, t),
    frequency: round(lerp(a.frequency, b.frequency, t)),
    midiClockMode: pick(a.midiClockMode, b.midiClockMode, t),
    phase: round(lerp(a.phase, b.phase, t)),
    bias: round(lerp(a.bias, b.bias, t)),
    keysync: (a.keysync === 'Off' || b.keysync === 'Off')
      ? pick(a.keysync, b.keysync, t)
      : round(lerp(a.keysync as number, b.keysync as number, t)),
  };
}

function interpolateFilter(a: Filter, b: Filter, t: number): Filter {
  return {
    type: pick(a.type, b.type, t),
    param1: round(lerp(a.param1, b.param1, t)),
    param2: round(lerp(a.param2, b.param2, t)),
    gain: round(lerp(a.gain, b.gain, t)),
  };
}

function interpolateEffects(a: GlobalEffects, b: GlobalEffects, t: number): GlobalEffects {
  return {
    reverb: {
      enabled: pick(a.reverb.enabled, b.reverb.enabled, t),
      room: round(lerp(a.reverb.room, b.reverb.room, t)),
      damp: round(lerp(a.reverb.damp, b.reverb.damp, t)),
      level: round(lerp(a.reverb.level, b.reverb.level, t)),
    },
    delay: {
      enabled: pick(a.delay.enabled, b.delay.enabled, t),
      time: round(lerp(a.delay.time, b.delay.time, t)),
      feedback: round(lerp(a.delay.feedback, b.delay.feedback, t)),
      level: round(lerp(a.delay.level, b.delay.level, t)),
    },
    chorus: {
      enabled: pick(a.chorus.enabled, b.chorus.enabled, t),
      rate: round(lerp(a.chorus.rate, b.chorus.rate, t)),
      depth: round(lerp(a.chorus.depth, b.chorus.depth, t)),
      level: round(lerp(a.chorus.level, b.chorus.level, t)),
    },
  };
}

// ── Main interpolation function ───────────────────────────────────────────────

/**
 * Interpolate between two Patch objects.
 * @param a  Source patch A (mix=0)
 * @param b  Source patch B (mix=1)
 * @param t  Mix factor [0, 1]
 */
export function interpolatePatch(a: Patch, b: Patch, t: number): Patch {
  // Max 12 ASCII chars for PreenFM3 display
  const rawName = `${a.name.slice(0, 5)}x${b.name.slice(0, 5)}`;
  const safeName = sanitizePatchName(rawName);
  const clamped = Math.max(0, Math.min(1, t));

  // Use the algorithm from whichever side is dominant
  const algorithm = pick(a.algorithm, b.algorithm, clamped);

  // Interpolate operators — use the count from the dominant algorithm
  const opCount = Math.min(a.operators.length, b.operators.length);
  const operators = Array.from({ length: opCount }, (_, i) =>
    interpolateOperator(a.operators[i], b.operators[i], clamped),
  );

  // Modulation matrix
  const modulationMatrix = interpolateMatrix(a.modulationMatrix, b.modulationMatrix, clamped);

  // LFOs
  const lfos: [LFO, LFO, LFO] | undefined =
    a.lfos && b.lfos
      ? [
          interpolateLFO(a.lfos[0], b.lfos[0], clamped),
          interpolateLFO(a.lfos[1], b.lfos[1], clamped),
          interpolateLFO(a.lfos[2], b.lfos[2], clamped),
        ]
      : pick(a.lfos, b.lfos, clamped);

  // LFO Envelopes — pick (complex nested structures)
  const lfoEnvelopes: [LFOEnvelope, LFOEnvelope] | undefined = pick(a.lfoEnvelopes, b.lfoEnvelopes, clamped);

  // Step sequencers — pick
  const stepSequencers: [StepSequencer, StepSequencer] | undefined = pick(a.stepSequencers, b.stepSequencers, clamped);

  // Global numeric parameters
  const global: Patch['global'] = {
    volume: round(lerp(a.global.volume, b.global.volume, clamped)),
    transpose: Math.round(lerp(a.global.transpose, b.global.transpose, clamped)),
    fineTune: round(lerp(a.global.fineTune, b.global.fineTune, clamped)),
    polyphony: a.global.polyphony, // excluded — changing voices mid-play causes glitches
    glideTime: round(lerp(a.global.glideTime, b.global.glideTime, clamped)),
    bendRange: Math.round(lerp(a.global.bendRange, b.global.bendRange, clamped)),
    velocitySensitivity: Math.round(lerp(a.global.velocitySensitivity, b.global.velocitySensitivity, clamped)),
  };

  // Filters
  const filters: [Filter, Filter] = [
    interpolateFilter(a.filters[0], b.filters[0], clamped),
    interpolateFilter(a.filters[1], b.filters[1], clamped),
  ];

  // Effects
  const effects = interpolateEffects(a.effects, b.effects, clamped);

  // Arpeggiator — excluded from interpolation.
  // Interpolating discrete clock sources (Off / Int / Ext) can send
  // unexpected values (e.g. Ext) that cut the sound.  Always keep A's settings.
  const arpeggiator: ArpeggiatorSettings = { ...a.arpeggiator };

  // Note curves — pick
  const noteCurves: [NoteCurve, NoteCurve] = [
    {
      before: pick(a.noteCurves[0].before, b.noteCurves[0].before, clamped),
      breakNote: Math.round(lerp(a.noteCurves[0].breakNote, b.noteCurves[0].breakNote, clamped)),
      after: pick(a.noteCurves[0].after, b.noteCurves[0].after, clamped),
    },
    {
      before: pick(a.noteCurves[1].before, b.noteCurves[1].before, clamped),
      breakNote: Math.round(lerp(a.noteCurves[1].breakNote, b.noteCurves[1].breakNote, clamped)),
      after: pick(a.noteCurves[1].after, b.noteCurves[1].after, clamped),
    },
  ];

  return {
    name: safeName,
    bank: a.bank,
    program: a.program,
    algorithm,
    operators,
    modulationMatrix,
    lfos,
    lfoEnvelopes,
    stepSequencers,
    global,
    effects,
    filters,
    arpeggiator,
    noteCurves,
    midi: pick(a.midi, b.midi, clamped),
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface MutationState {
  /** Source patch A (left slot) */
  sourceA: Patch | null;
  /** Source patch B (right slot) */
  sourceB: Patch | null;
  /** Mix factor: 0 = 100% A, 1 = 100% B */
  mix: number;
  /** Whether mutation mode is active (derived: both sources loaded) */
  enabled: boolean;
  /** User-defined name override (set when the user edits the patch name manually while mutation is active) */
  customName: string | null;
}

interface MutationActions {
  setSourceA: (patch: Patch | null) => void;
  setSourceB: (patch: Patch | null) => void;
  setMix: (value: number) => void;
  setEnabled: (enabled: boolean) => void;
  setCustomName: (name: string | null) => void;
  reset: () => void;
}

const initialState: MutationState = {
  sourceA: null,
  sourceB: null,
  mix: 0.5,
  enabled: false,
  customName: null,
};

export const useMutationStore = create<MutationState & MutationActions>()((set) => ({
  ...initialState,

  setSourceA: (patch) => set((state) => ({ sourceA: patch, customName: null, enabled: patch !== null && state.sourceB !== null })),
  setSourceB: (patch) => set((state) => ({ sourceB: patch, customName: null, enabled: state.sourceA !== null && patch !== null })),
  setMix: (value) => set({ mix: Math.max(0, Math.min(1, value)) }),
  setEnabled: (enabled) => set({ enabled, customName: null }),
  setCustomName: (name) => set({ customName: name }),
  reset: () => set(initialState),
}));

// ── Selectors ─────────────────────────────────────────────────────────────────

export const useMutationEnabled = () => useMutationStore((s) => s.enabled);
export const useMutationMix = () => useMutationStore((s) => s.mix);
export const useMutationSourceA = () => useMutationStore((s) => s.sourceA);
export const useMutationSourceB = () => useMutationStore((s) => s.sourceB);
export const useMutationCustomName = () => useMutationStore((s) => s.customName);
