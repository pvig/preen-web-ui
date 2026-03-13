/**
 * Tests for the mutation / interpolation logic.
 *
 * Uses synthetic Patch objects built from the project defaults.
 */

import { describe, it, expect } from 'vitest';
import { lerp, interpolatePatch } from '../../stores/mutationStore';
import type { Patch } from '../../types/patch';
import {
  DEFAULT_ADSR,
  DEFAULT_LFO,
  DEFAULT_LFO_ENVELOPE,
  DEFAULT_STEP_SEQUENCER,
  DEFAULT_FILTER,
  DEFAULT_ARPEGGIATOR,
  DEFAULT_NOTE_CURVE,
  DEFAULT_MIDI_SETTINGS,
  DEFAULT_ALGORITHMS,
} from '../../types/patch';

// ── Test patch factory ───────────────────────────────────────────────────────

function makeTestPatch(overrides: Partial<Patch> = {}): Patch {
  const algo = DEFAULT_ALGORITHMS[0]; // algo 1 (simplest)
  return {
    name: 'TestPatch',
    bank: 0,
    program: 0,
    algorithm: algo,
    operators: algo.ops.map((op, i) => ({
      ...op,
      enabled: i === 0,
      frequency: 440,
      detune: 0,
      keyboardTracking: 1,
      amplitude: 0.8,
      pan: 0,
      feedbackAmount: 0,
      velocitySensitivity: 0.5,
      adsr: {
        attack: { ...DEFAULT_ADSR.attack },
        decay: { ...DEFAULT_ADSR.decay },
        sustain: { ...DEFAULT_ADSR.sustain },
        release: { ...DEFAULT_ADSR.release },
      },
    })),
    modulationMatrix: Array(12)
      .fill(null)
      .map(() => ({
        source: 'None',
        destination1: 'None',
        destination2: 'None',
        amount: 0,
      })),
    lfos: [
      { ...DEFAULT_LFO },
      { ...DEFAULT_LFO },
      { ...DEFAULT_LFO },
    ],
    lfoEnvelopes: [
      { ...DEFAULT_LFO_ENVELOPE },
      { ...DEFAULT_LFO_ENVELOPE },
    ],
    stepSequencers: [
      { ...DEFAULT_STEP_SEQUENCER },
      { ...DEFAULT_STEP_SEQUENCER },
    ],
    global: {
      volume: 0.8,
      transpose: 0,
      fineTune: 0,
      polyphony: 8,
      glideTime: 0,
      bendRange: 2,
      velocitySensitivity: 8,
    },
    effects: {
      reverb: { enabled: false, room: 0.5, damp: 0.5, level: 0.3 },
      delay: { enabled: false, time: 0.25, feedback: 0.4, level: 0.2 },
      chorus: { enabled: false, rate: 0.5, depth: 0.3, level: 0.2 },
    },
    filters: [
      { ...DEFAULT_FILTER },
      { ...DEFAULT_FILTER },
    ],
    arpeggiator: { ...DEFAULT_ARPEGGIATOR },
    noteCurves: [
      { ...DEFAULT_NOTE_CURVE },
      { ...DEFAULT_NOTE_CURVE },
    ],
    midi: { ...DEFAULT_MIDI_SETTINGS },
    ...overrides,
  };
}

// ── lerp ──────────────────────────────────────────────────────────────────────

describe('lerp', () => {
  it('returns a at t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('returns b at t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('returns midpoint at t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it('handles negative values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
});

// ── interpolatePatch ──────────────────────────────────────────────────────────

describe('interpolatePatch', () => {
  it('at mix=0 returns values from patch A', () => {
    const a = makeTestPatch({ name: 'A' });
    a.global.volume = 0.2;
    const b = makeTestPatch({ name: 'B' });
    b.global.volume = 1.0;

    const result = interpolatePatch(a, b, 0);
    expect(result.global.volume).toBeCloseTo(0.2, 3);
    expect(result.name).toContain('A');
  });

  it('at mix=1 returns values from patch B', () => {
    const a = makeTestPatch({ name: 'A' });
    a.global.volume = 0.2;
    const b = makeTestPatch({ name: 'B' });
    b.global.volume = 1.0;

    const result = interpolatePatch(a, b, 1);
    expect(result.global.volume).toBeCloseTo(1.0, 3);
    expect(result.name).toContain('B');
  });

  it('at mix=0.5 returns midpoint for numeric values', () => {
    const a = makeTestPatch({ name: 'A' });
    a.global.volume = 0.0;
    a.global.bendRange = 2;
    const b = makeTestPatch({ name: 'B' });
    b.global.volume = 1.0;
    b.global.bendRange = 12;

    const result = interpolatePatch(a, b, 0.5);
    expect(result.global.volume).toBeCloseTo(0.5, 3);
    expect(result.global.bendRange).toBe(7);
  });

  it('interpolates operator frequency', () => {
    const a = makeTestPatch();
    a.operators[0].frequency = 100;
    const b = makeTestPatch();
    b.operators[0].frequency = 200;

    const result = interpolatePatch(a, b, 0.25);
    expect(result.operators[0].frequency).toBeCloseTo(125, 1);
  });

  it('interpolates ADSR envelopes', () => {
    const a = makeTestPatch();
    a.operators[0].adsr.attack.time = 0;
    a.operators[0].adsr.release.time = 10;
    const b = makeTestPatch();
    b.operators[0].adsr.attack.time = 100;
    b.operators[0].adsr.release.time = 50;

    const result = interpolatePatch(a, b, 0.5);
    expect(result.operators[0].adsr.attack.time).toBeCloseTo(50, 1);
    expect(result.operators[0].adsr.release.time).toBeCloseTo(30, 1);
  });

  it('interpolates LFO frequency', () => {
    const a = makeTestPatch();
    a.lfos![0].frequency = 1.0;
    const b = makeTestPatch();
    b.lfos![0].frequency = 10.0;

    const result = interpolatePatch(a, b, 0.5);
    expect(result.lfos![0].frequency).toBeCloseTo(5.5, 1);
  });

  it('picks discrete values (waveform) from A at mix < 0.5', () => {
    const a = makeTestPatch();
    a.lfos![0].shape = 'LFO_SIN';
    const b = makeTestPatch();
    b.lfos![0].shape = 'LFO_SAW';

    const result = interpolatePatch(a, b, 0.3);
    expect(result.lfos![0].shape).toBe('LFO_SIN');
  });

  it('picks discrete values (waveform) from B at mix > 0.5', () => {
    const a = makeTestPatch();
    a.lfos![0].shape = 'LFO_SIN';
    const b = makeTestPatch();
    b.lfos![0].shape = 'LFO_SAW';

    const result = interpolatePatch(a, b, 0.7);
    expect(result.lfos![0].shape).toBe('LFO_SAW');
  });

  it('interpolates filter parameters', () => {
    const a = makeTestPatch();
    a.filters[0].param1 = 0.0;
    a.filters[0].param2 = 0.0;
    const b = makeTestPatch();
    b.filters[0].param1 = 1.0;
    b.filters[0].param2 = 1.0;

    const result = interpolatePatch(a, b, 0.5);
    expect(result.filters[0].param1).toBeCloseTo(0.5, 3);
    expect(result.filters[0].param2).toBeCloseTo(0.5, 3);
  });

  it('interpolates effects', () => {
    const a = makeTestPatch();
    a.effects.reverb.room = 0.0;
    a.effects.delay.feedback = 0.0;
    const b = makeTestPatch();
    b.effects.reverb.room = 1.0;
    b.effects.delay.feedback = 1.0;

    const result = interpolatePatch(a, b, 0.75);
    expect(result.effects.reverb.room).toBeCloseTo(0.75, 3);
    expect(result.effects.delay.feedback).toBeCloseTo(0.75, 3);
  });

  it('clamps mix outside [0,1]', () => {
    const a = makeTestPatch();
    a.global.volume = 0.0;
    const b = makeTestPatch();
    b.global.volume = 1.0;

    expect(interpolatePatch(a, b, -0.5).global.volume).toBeCloseTo(0.0, 3);
    expect(interpolatePatch(a, b, 1.5).global.volume).toBeCloseTo(1.0, 3);
  });

  it('generates a combined name (ASCII, max 12 chars)', () => {
    const a = makeTestPatch({ name: 'Bass' });
    const b = makeTestPatch({ name: 'Pad' });
    const result = interpolatePatch(a, b, 0.5);
    expect(result.name).toBe('BassxPad');
  });

  it('truncates combined name to 12 characters', () => {
    const a = makeTestPatch({ name: 'LongPatchNameA' });
    const b = makeTestPatch({ name: 'LongPatchNameB' });
    const result = interpolatePatch(a, b, 0.5);
    expect(result.name.length).toBeLessThanOrEqual(12);
    // Only printable ASCII
    expect(result.name).toMatch(/^[\x20-\x7E]+$/);
  });

  it('preserves operator count as minimum of both patches', () => {
    const a = makeTestPatch();
    const b = makeTestPatch();
    const result = interpolatePatch(a, b, 0.5);
    expect(result.operators.length).toBe(
      Math.min(a.operators.length, b.operators.length),
    );
  });

  it('interpolates modulation matrix amounts', () => {
    const a = makeTestPatch();
    a.modulationMatrix[0].amount = 0;
    const b = makeTestPatch();
    b.modulationMatrix[0].amount = 10;

    const result = interpolatePatch(a, b, 0.5);
    expect(result.modulationMatrix[0].amount).toBeCloseTo(5, 1);
  });

  it('always keeps arpeggiator from source A (not interpolated)', () => {
    const a = makeTestPatch();
    a.arpeggiator.clockSource = 'Off';
    a.arpeggiator.clock = 120;
    a.arpeggiator.octave = 1;
    const b = makeTestPatch();
    b.arpeggiator.clockSource = 'Ext';
    b.arpeggiator.clock = 200;
    b.arpeggiator.octave = 4;

    const mid = interpolatePatch(a, b, 0.5);
    expect(mid.arpeggiator.clockSource).toBe('Off');
    expect(mid.arpeggiator.clock).toBe(120);
    expect(mid.arpeggiator.octave).toBe(1);

    const full = interpolatePatch(a, b, 1.0);
    expect(full.arpeggiator.clockSource).toBe('Off');
    expect(full.arpeggiator.clock).toBe(120);
  });

  it('always keeps polyphony from source A (not interpolated)', () => {
    const a = makeTestPatch();
    a.global.polyphony = 4;
    const b = makeTestPatch();
    b.global.polyphony = 1;

    expect(interpolatePatch(a, b, 0.5).global.polyphony).toBe(4);
    expect(interpolatePatch(a, b, 1.0).global.polyphony).toBe(4);
  });
});
