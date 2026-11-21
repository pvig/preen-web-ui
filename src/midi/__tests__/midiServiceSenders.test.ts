/**
 * Tests for midiService send functions.
 *
 * Covers:
 * - Arpeggiator senders: guard against unknown values (indexOf === -1)
 * - sendLfoEnvelopeParam: correct NRPN LSB addresses for Env1 and Env2
 * - sendPatchName: uses 0x20 (space) to clear remaining positions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock webmidi before importing midiService ────────────────────────────────

const mockSend = vi.hoisted(() => vi.fn());

vi.mock('webmidi', () => ({
  WebMidi: {
    enable: vi.fn().mockResolvedValue(undefined),
    inputs: [],
    outputs: [],
  },
  Input: class {},
  Output: class {},
}));

const mockOutput = {
  id: 'test-out',
  name: 'Test Output',
  manufacturer: 'Test',
  state: 'connected',
  connection: 'open',
  type: 'output',
  send: mockSend,
};

import {
  sendArpeggiatorDirection,
  sendArpeggiatorPattern,
  sendArpeggiatorDivision,
  sendArpeggiatorDuration,
  sendArpeggiatorLatch,
  sendArpeggiatorEuclideanSeed,
  sendArpeggiatorUserPatternLength,
  sendArpeggiatorUserStepState,
  sendArpeggiatorUserStepAction,
  sendLfoEnvelopeParam,
  sendLfoEnvelopeCurve,
  sendPatchName,
  sendOperatorMix,
  sendOperatorPan,
  sendOperatorWarp,
  sendIMChange,
  sendNoteCurve,
  sendTimbreDryWet,
  sendTimbreDynamics,
  sendEngineDecimation,
  sendVoicePriority,
  sendPlayModeCC,
  sendMfxReturnLevel,
  sendMfxPreset,
  sendMixerVolume,
  sendMixerPan,
  sendMixerSend,
  sendStepSequencerBpm,
  sendStepSequencerMode,
  sendStepSequencerLoopLength,
  sendModulationMatrixParam,
  setMidiOutput,
  clearNRPNQueue,
  drainNRPNQueue,
} from '../midiService';
import {
  PREENFM3_CC,
  NoteCurveType,
  LFO_TYPES,
  LFO_SHAPE_MAX,
  nrpnToStepSeqSync,
  stepSeqSyncToNrpnBpm,
  MATRIX_DEST_NAMES,
  MATRIX_DEST_ORDER,
  MATRIX_DEST_ORDERED_NAMES,
  ARP_FACTORY_PATTERN_MASKS,
  computeArpPresetMasks,
  getArpFactoryPatternData,
  arpStepValueToState,
} from '../preenFmConstants';
import { parseLfoShape, encodeLfoShape } from '../../types/lfo';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract all queued NRPN batches (each 12 bytes) from mockSend calls. */
function allSentNRPNs(): Array<{ paramMSB: number; paramLSB: number; valueMSB: number; valueLSB: number }> {
  return mockSend.mock.calls
    .filter((call: unknown[]) => (call[0] as number[]).length === 12)
    .map((call: unknown[]) => {
      const b = call[0] as number[];
      return { paramMSB: b[2], paramLSB: b[5], valueMSB: b[8], valueLSB: b[11] };
    });
}

function sentNRPNCount(): number {
  return mockSend.mock.calls.filter((call: unknown[]) => (call[0] as number[]).length === 12).length;
}

/** Extract all sent standard CC messages (each 3 bytes: status, controller, value). */
function allSentCCs(): Array<{ channel: number; controller: number; value: number }> {
  // CCs go through the coalescing queue; advance fake timers so they flush.
  vi.advanceTimersByTime(600);
  return mockSend.mock.calls
    .filter((call: unknown[]) => (call[0] as number[]).length === 3)
    .map((call: unknown[]) => {
      const b = call[0] as number[];
      return { channel: (b[0] & 0x0F) + 1, controller: b[1], value: b[2] };
    });
}

/** Drain & advance so all queued NRPNs are actually sent. */
async function flushQueue() {
  const p = drainNRPNQueue();
  // Advance enough for ~50 messages (50 * 10ms)
  vi.advanceTimersByTime(600);
  await vi.advanceTimersByTimeAsync(0);
  await p;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockSend.mockClear();
  clearNRPNQueue();
  setMidiOutput(mockOutput as any);
});

afterEach(() => {
  clearNRPNQueue();
  vi.useRealTimers();
});

// ── Arpeggiator guards ───────────────────────────────────────────────────────

describe('Arpeggiator senders — guard against unknown values', () => {
  it('sendArpeggiatorDirection does not send for unknown direction', async () => {
    sendArpeggiatorDirection('InvalidDirection', 1);
    await flushQueue();
    expect(sentNRPNCount()).toBe(0);
  });

  it('sendArpeggiatorDirection sends correct value for known direction', async () => {
    sendArpeggiatorDirection('Down', 1); // index 1
    await flushQueue();
    sendArpeggiatorDirection('Rotate UD', 1); // index 8
    await flushQueue();
    sendArpeggiatorDirection('Shift UD', 1); // index 11
    await flushQueue();
    expect(allSentNRPNs()).toEqual([
      { paramMSB: 0, paramLSB: 30, valueMSB: 0, valueLSB: 1 },
      { paramMSB: 0, paramLSB: 30, valueMSB: 0, valueLSB: 8 },
      { paramMSB: 0, paramLSB: 30, valueMSB: 0, valueLSB: 11 },
    ]);
  });

  it('sendArpeggiatorPattern does not send for unknown pattern', async () => {
    sendArpeggiatorPattern('999', 1);
    await flushQueue();
    expect(sentNRPNCount()).toBe(0);
  });

  it('sendArpeggiatorPattern sends correct value for "Usr2"', async () => {
    sendArpeggiatorPattern('Usr2', 1); // index 23
    await flushQueue();
    expect(sentNRPNCount()).toBe(1);
    const sent = allSentNRPNs()[0];
    expect(sent.paramLSB).toBe(32);
    expect(sent.valueLSB).toBe(23);
  });

  it('sendArpeggiatorDivision does not send for unknown division', async () => {
    sendArpeggiatorDivision('5/7', 1);
    await flushQueue();
    expect(sentNRPNCount()).toBe(0);
  });

  it('sendArpeggiatorDivision sends correct value for "1/4"', async () => {
    sendArpeggiatorDivision('1/4', 1); // index 8
    await flushQueue();
    expect(sentNRPNCount()).toBe(1);
    const sent = allSentNRPNs()[0];
    expect(sent.paramLSB).toBe(33);
    expect(sent.valueLSB).toBe(8);
  });

  it('sendArpeggiatorDuration does not send for unknown duration', async () => {
    sendArpeggiatorDuration('nope', 1);
    await flushQueue();
    expect(sentNRPNCount()).toBe(0);
  });

  it('sendArpeggiatorDuration sends correct value for "1/16"', async () => {
    sendArpeggiatorDuration('1/16', 1); // index 12
    await flushQueue();
    expect(sentNRPNCount()).toBe(1);
    const sent = allSentNRPNs()[0];
    expect(sent.paramLSB).toBe(34);
    expect(sent.valueLSB).toBe(12);
  });

  it('sendArpeggiatorLatch does not send for unknown latch', async () => {
    sendArpeggiatorLatch('Maybe', 1);
    await flushQueue();
    expect(sentNRPNCount()).toBe(0);
  });

  it('sendArpeggiatorLatch sends correctly for "On"', async () => {
    sendArpeggiatorLatch('On', 1); // index 1
    await flushQueue();
    expect(sentNRPNCount()).toBe(1);
    const sent = allSentNRPNs()[0];
    expect(sent.paramLSB).toBe(35);
    expect(sent.valueLSB).toBe(1);
  });
});

// ── sendLfoEnvelopeParam NRPN addresses ─────────────────────────────────────

describe('sendLfoEnvelopeParam — NRPN LSB addresses', () => {
  it('Env1 attack uses LSB 52 and encodes 1.5s as 150', async () => {
    sendLfoEnvelopeParam(0, 'attack', 1.5);
    await flushQueue();
    const nrpns = allSentNRPNs();
    expect(nrpns.length).toBe(1);
    expect(nrpns[0].paramMSB).toBe(1);
    expect(nrpns[0].paramLSB).toBe(52);
    expect(nrpns[0].valueMSB).toBe((150 >> 7) & 0x7F);
    expect(nrpns[0].valueLSB).toBe(150 & 0x7F);
  });

  it('Env1 sustain uses LSB 54 and encodes 0.8 as 80', async () => {
    sendLfoEnvelopeParam(0, 'sustain', 0.8);
    await flushQueue();
    const nrpns = allSentNRPNs();
    expect(nrpns.length).toBe(1);
    expect(nrpns[0].paramLSB).toBe(54);
    expect((nrpns[0].valueMSB << 7) | nrpns[0].valueLSB).toBe(80);
  });

  it('Env2 params use LSB 56/57/58/59 and loopMode is raw', async () => {
    sendLfoEnvelopeParam(1, 'silence', 0.2);
    sendLfoEnvelopeParam(1, 'attack', 0.4);
    sendLfoEnvelopeParam(1, 'release', 0.6);
    sendLfoEnvelopeParam(1, 'loopMode', 2);
    await flushQueue();
    const nrpns = allSentNRPNs();
    expect(nrpns.length).toBe(4);
    expect(nrpns.map(n => n.paramLSB)).toEqual([56, 57, 58, 59]);
    expect(nrpns.every(n => n.paramMSB === 1)).toBe(true);
    expect((nrpns[3].valueMSB << 7) | nrpns[3].valueLSB).toBe(2);
  });
});

// ── sendPatchName ────────────────────────────────────────────────────────────

describe('sendPatchName — character encoding and clearing', () => {
  it('sends each character as ASCII at NRPN [1, 100+i]', async () => {
    sendPatchName('AB', 1);
    await flushQueue();
    const nrpns = allSentNRPNs();
    // 2 chars + 10 clearing NRPNs = 12 total
    expect(nrpns.length).toBe(12);

    // 'A' = 65 at [1, 100]
    expect(nrpns[0]).toEqual({ paramMSB: 1, paramLSB: 100, valueMSB: 0, valueLSB: 65 });
    // 'B' = 66 at [1, 101]
    expect(nrpns[1]).toEqual({ paramMSB: 1, paramLSB: 101, valueMSB: 0, valueLSB: 66 });
  });

  it('clears remaining positions with 0x20 (space), not 0x00 (null)', async () => {
    sendPatchName('Hi', 1);
    await flushQueue();
    const nrpns = allSentNRPNs();

    // Positions 2-11 should be cleared with space (0x20 = 32)
    for (let i = 2; i < 12; i++) {
      expect(nrpns[i].paramMSB).toBe(1);
      expect(nrpns[i].paramLSB).toBe(100 + i);
      expect(nrpns[i].valueLSB).toBe(0x20);
      expect(nrpns[i].valueMSB).toBe(0);
    }
  });

  it('truncates names longer than 12 characters', async () => {
    sendPatchName('LongPatchName!!!', 1);
    await flushQueue();
    const nrpns = allSentNRPNs();
    // 12 character NRPNs + 0 clearing = 12 total
    expect(nrpns.length).toBe(12);
    // Last char at position 11 should be 'm' (index 11 of 'LongPatchNam')
    expect(nrpns[11].paramLSB).toBe(111);
    expect(nrpns[11].valueLSB).toBe('m'.charCodeAt(0));
  });

  it('sends 12 space-clearing NRPNs for empty name', async () => {
    sendPatchName('', 1);
    await flushQueue();
    const nrpns = allSentNRPNs();
    expect(nrpns.length).toBe(12);
    // All should be spaces
    nrpns.forEach((n, i) => {
      expect(n.paramLSB).toBe(100 + i);
      expect(n.valueLSB).toBe(0x20);
    });
  });
});

// ── Control Changes: Operator Mix & Pan (TECHREADME.md reference) ────────────

describe('Control Changes — Operator Mix & Pan (CC 22-29, 31, 36, 37, 39)', () => {
  it('sendOperatorMix sends correct CCs for OP1 to OP6', () => {
    // OP1 -> CC 22, OP2 -> CC 24, OP3 -> CC 26, OP4 -> CC 28, OP5 -> CC 31, OP6 -> CC 37
    const expectedCCs = [22, 24, 26, 28, 31, 37];
    for (let op = 1; op <= 6; op++) {
      sendOperatorMix(op, 1.0, 1);
    }
    const ccs = allSentCCs();
    expect(ccs.length).toBe(6);
    expect(ccs.map(c => c.controller)).toEqual(expectedCCs);
    expect(ccs.every(c => c.value === 127)).toBe(true);
  });

  it('sendOperatorMix ignores invalid operator numbers (< 1 or > 6)', () => {
    sendOperatorMix(0, 1.0, 1);
    sendOperatorMix(7, 1.0, 1);
    expect(allSentCCs().length).toBe(0);
  });

  it('sendOperatorPan sends correct CCs for OP1 to OP6', () => {
    // OP1 -> CC 23, OP2 -> CC 25, OP3 -> CC 27, OP4 -> CC 29, OP5 -> CC 36, OP6 -> CC 39
    const expectedCCs = [23, 25, 27, 29, 36, 39];
    for (let op = 1; op <= 6; op++) {
      sendOperatorPan(op, 0.0, 1); // Center pan -> 64
    }
    const ccs = allSentCCs();
    expect(ccs.length).toBe(6);
    expect(ccs.map(c => c.controller)).toEqual(expectedCCs);
    expect(ccs.every(c => c.value === 64)).toBe(true);
  });

  it('sendOperatorPan scales -1.0 to 0 and +1.0 to 127', () => {
    sendOperatorPan(1, -1.0, 1);
    sendOperatorPan(2, 1.0, 1);
    const ccs = allSentCCs();
    expect(ccs[0].controller).toBe(23);
    expect(ccs[0].value).toBe(0);
    expect(ccs[1].controller).toBe(25);
    expect(ccs[1].value).toBe(127);
  });
});

// ── Control Changes: IM & Feedback (TECHREADME.md reference) ────────────────

describe('Control Changes — IM & Feedback (CC 17-21, CC 30)', () => {
  it('sendIMChange sends CC 17-21 for IM1-IM5', () => {
    for (let im = 1; im <= 5; im++) {
      sendIMChange(im, 50, 1);
    }
    const ccs = allSentCCs();
    expect(ccs.length).toBe(5);
    expect(ccs.map(c => c.controller)).toEqual([17, 18, 19, 20, 21]);
    expect(ccs.every(c => c.value === 50)).toBe(true);
  });

  it('sendIMChange sends CC 30 for Feedback (IM6)', () => {
    sendIMChange(6, 80, 1);
    const ccs = allSentCCs();
    expect(ccs.length).toBe(1);
    expect(ccs[0].controller).toBe(PREENFM3_CC.IM_FEEDBACK); // 30
    expect(ccs[0].value).toBe(80);
  });
});

// ── Control Changes: Operator Warp (TECHREADME.md reference) ────────────────

describe('Control Changes — Operator Warp (CC 33-35, CC 111-113)', () => {
  it('sendOperatorWarp sends CC 33-35 for OP1-3 and CC 111-113 for OP4-6', () => {
    const expectedCCs = [33, 34, 35, 111, 112, 113];
    for (let op = 1; op <= 6; op++) {
      sendOperatorWarp(op, 0.0, 1); // Warp 0.0 -> CC 64
    }
    const ccs = allSentCCs();
    expect(ccs.length).toBe(6);
    expect(ccs.map(c => c.controller)).toEqual(expectedCCs);
    expect(ccs.every(c => c.value === 64)).toBe(true);
  });
});

// ── Timbre, Mixer & Master FX CCs ───────────────────────────────────────────

describe('Control Changes — Timbre, Mixer & MFX', () => {
  it('sendTimbreDryWet sends CC 40', () => {
    sendTimbreDryWet(0.5, 1);
    const ccs = allSentCCs();
    expect(ccs.length).toBe(1);
    expect(ccs[0].controller).toBe(40);
    expect(ccs[0].value).toBe(64);
  });

  it('sendTimbreDynamics coalesces CC 41 to the latest value in 0..6 range', () => {
    sendTimbreDynamics(2, 1); // Punch
    sendTimbreDynamics(5, 1); // Drive
    sendTimbreDynamics(6, 1); // Fuzz
    sendTimbreDynamics(9, 1); // Clamped to 6
    const ccs = allSentCCs();
    expect(ccs.length).toBe(1);
    expect(ccs[0].controller).toBe(41);
    expect(ccs[0].value).toBe(6);
  });

  it('sendEngineDecimation coalesces CC 42 to the latest value in 0..20 range', () => {
    sendEngineDecimation(19, 1); // Full (FM_DECIMATION_CURRENT)
    sendEngineDecimation(20, 1); // HQ
    sendEngineDecimation(99, 1); // Clamped to 20 (HQ)
    const ccs = allSentCCs();
    expect(ccs.length).toBe(1);
    expect(ccs[0].controller).toBe(42);
    expect(ccs[0].value).toBe(20);
  });

  it('sendPlayModeCC sends CC 43 (0: Mono, 1: Poly, 2: Unison)', () => {
    sendPlayModeCC(0, 1); // Mono
    sendPlayModeCC(1, 1); // Poly
    sendPlayModeCC(2, 1); // Unison
    const ccs = allSentCCs();
    expect(ccs.length).toBe(3);
    expect(ccs.map(c => c.controller)).toEqual([43, 43, 43]);
    expect(ccs.map(c => c.value)).toEqual([0, 1, 2]);
  });

  it('sendMfxReturnLevel sends CC 44', () => {
    sendMfxReturnLevel(0.75, 1);
    const ccs = allSentCCs();
    expect(ccs.length).toBe(1);
    expect(ccs[0].controller).toBe(44);
    expect(ccs[0].value).toBe(95);
  });

  it('sendMfxPreset sends CC 45 in 0..18 range', () => {
    sendMfxPreset(5, 1);
    sendMfxPreset(18, 1);
    sendMfxPreset(25, 1); // Clamped to 18
    const ccs = allSentCCs();
    expect(ccs.length).toBe(3);
    expect(ccs.map(c => c.controller)).toEqual([45, 45, 45]);
    expect(ccs.map(c => c.value)).toEqual([5, 18, 18]);
  });

  it('sendMixerVolume sends CC 7 and is not blocked', () => {
    sendMixerVolume(0.8, 1);
    const ccs = allSentCCs();
    expect(ccs.length).toBe(1);
    expect(ccs[0].controller).toBe(7);
  });

  it('sendMixerPan sends CC 10 and is not blocked', () => {
    sendMixerPan(0.0, 1);
    const ccs = allSentCCs();
    expect(ccs.length).toBe(1);
    expect(ccs[0].controller).toBe(10);
    expect(ccs[0].value).toBe(64);
  });

  it('sendMixerSend sends CC 11 and is not blocked', () => {
    sendMixerSend(0.5, 1);
    const ccs = allSentCCs();
    expect(ccs.length).toBe(1);
    expect(ccs[0].controller).toBe(11);
  });
});

// ── NRPN: Note Curves (TECHREADME.md reference) ─────────────────────────────

describe('NRPN — Note Curves (TECHREADME.md reference)', () => {
  it('sendNoteCurve for curveIndex=0 uses MSB=1 and LSBs 72, 73, 74', async () => {
    sendNoteCurve(0, { before: NoteCurveType.PlusLinear, breakNote: 60, after: NoteCurveType.PlusExp }, 1);
    await flushQueue();
    const nrpns = allSentNRPNs();
    expect(nrpns.length).toBe(3);
    expect(nrpns.map(n => n.paramMSB)).toEqual([1, 1, 1]);
    expect(nrpns.map(n => n.paramLSB)).toEqual([72, 73, 74]);
    expect(nrpns[1].valueLSB).toBe(60); // Break note
  });

  it('sendNoteCurve for curveIndex=1 uses MSB=1 and LSBs 76, 77, 78', async () => {
    sendNoteCurve(1, { before: NoteCurveType.PlusExp, breakNote: 48, after: NoteCurveType.PlusLinear }, 1);
    await flushQueue();
    const nrpns = allSentNRPNs();
    expect(nrpns.length).toBe(3);
    expect(nrpns.map(n => n.paramMSB)).toEqual([1, 1, 1]);
    expect(nrpns.map(n => n.paramLSB)).toEqual([76, 77, 78]);
    expect(nrpns[1].valueLSB).toBe(48);
  });
});

// ── NRPN: Free Envelope Curves (280-283 / MSB=2, LSB=24-27) ─────────────────

describe('sendLfoEnvelopeCurve — NRPN 280..283 (MSB=2, LSB=24..27)', () => {
  it('sends Free Env 1 AtkCrv [2,24] and RelCrv [2,25]', async () => {
    sendLfoEnvelopeCurve(0, 'attack', 'exponential', 1);
    sendLfoEnvelopeCurve(0, 'release', 'logarithmic', 1);
    await flushQueue();

    const nrpns = allSentNRPNs();
    expect(nrpns).toEqual([
      { paramMSB: 2, paramLSB: 24, valueMSB: 0, valueLSB: 0 },
      { paramMSB: 2, paramLSB: 25, valueMSB: 0, valueLSB: 2 },
    ]);
  });

  it('sends Free Env 2 AtkCrv [2,26] and RelCrv [2,27]', async () => {
    sendLfoEnvelopeCurve(1, 'attack', 'user1', 1);
    sendLfoEnvelopeCurve(1, 'release', 'user4', 1);
    await flushQueue();

    const nrpns = allSentNRPNs();
    expect(nrpns).toEqual([
      { paramMSB: 2, paramLSB: 26, valueMSB: 0, valueLSB: 3 },
      { paramMSB: 2, paramLSB: 27, valueMSB: 0, valueLSB: 6 },
    ]);
  });

  it('ignores unknown curve names', async () => {
    sendLfoEnvelopeCurve(0, 'attack', 'invalid-curve', 1);
    await flushQueue();
    expect(allSentNRPNs()).toEqual([]);
  });
});

describe('LFO shapes (0..26) — parseLfoShape / encodeLfoShape', () => {
  it('supports all 27 firmware LFO shapes in order', () => {
    expect(LFO_TYPES).toHaveLength(27);
    expect(LFO_SHAPE_MAX).toBe(26);

    LFO_TYPES.forEach((shape, index) => {
      expect(parseLfoShape(index)).toBe(shape);
      expect(encodeLfoShape(shape)).toBe(index);
    });
  });

  it('maps key new shapes and clamps out-of-range NRPN values', () => {
    expect(parseLfoShape(8)).toBe('LFO_SAW_DOWN');
    expect(parseLfoShape(16)).toBe('LFO_BUCHLA_PLONG');
    expect(parseLfoShape(20)).toBe('LFO_SIN_POS');
    expect(parseLfoShape(26)).toBe('LFO_USER6');
    expect(parseLfoShape(-1)).toBe('LFO_SIN');
    expect(parseLfoShape(99)).toBe('LFO_USER6');
  });
});

describe('Step Sequencer Modes & Loop Length (MSB=5/6) — senders', () => {
  it('sends step modes on MSB=5 for Seq1 and MSB=6 for Seq2', async () => {
    sendStepSequencerMode(0, 0, 'Norm', 1);
    sendStepSequencerMode(0, 4, 'Mute', 1);
    sendStepSequencerMode(0, 5, 'Lfo1', 1);
    sendStepSequencerMode(0, 6, 'Lfo3', 1);
    sendStepSequencerMode(1, 7, 'Pass', 1);
    sendStepSequencerMode(1, 8, '1/32', 1);
    sendStepSequencerMode(1, 9, '1/64', 1);
    sendStepSequencerMode(1, 14, 'Alt2', 1);
    sendStepSequencerMode(1, 15, 'Alt3', 1);
    await flushQueue();

    const nrpns = allSentNRPNs();
    expect(nrpns).toEqual([
      { paramMSB: 5, paramLSB: 0, valueMSB: 0, valueLSB: 0 },
      { paramMSB: 5, paramLSB: 4, valueMSB: 0, valueLSB: 4 },
      { paramMSB: 5, paramLSB: 5, valueMSB: 0, valueLSB: 6 },
      { paramMSB: 5, paramLSB: 6, valueMSB: 0, valueLSB: 8 },
      { paramMSB: 6, paramLSB: 7, valueMSB: 0, valueLSB: 5 },
      { paramMSB: 6, paramLSB: 8, valueMSB: 0, valueLSB: 9 },
      { paramMSB: 6, paramLSB: 9, valueMSB: 0, valueLSB: 11 },
      { paramMSB: 6, paramLSB: 14, valueMSB: 0, valueLSB: 12 },
      { paramMSB: 6, paramLSB: 15, valueMSB: 0, valueLSB: 13 },
    ]);
  });

  it('sends loop length on LSB=16 for Seq1 and Seq2', async () => {
    sendStepSequencerLoopLength(0, 8, 1);
    sendStepSequencerLoopLength(1, 12, 1);
    await flushQueue();

    const nrpns = allSentNRPNs();
    expect(nrpns).toEqual([
      { paramMSB: 5, paramLSB: 16, valueMSB: 0, valueLSB: 8 },
      { paramMSB: 6, paramLSB: 16, valueMSB: 0, valueLSB: 12 },
    ]);
  });

  it('encodes Int (10..240), Ext (241..245), and Note (246) sync modes for Seq1 & Seq2', async () => {
    sendStepSequencerBpm(0, 120, undefined, 1);
    sendStepSequencerBpm(1, 245, 'Ck*4', 1);
    await flushQueue();

    sendStepSequencerBpm(0, 241, 'Ck/4', 1);
    sendStepSequencerBpm(1, 246, undefined, 1);
    await flushQueue();

    const nrpns = allSentNRPNs();
    expect(nrpns).toEqual([
      { paramMSB: 1, paramLSB: 60, valueMSB: 0, valueLSB: 120 },
      { paramMSB: 1, paramLSB: 64, valueMSB: 1, valueLSB: 117 }, // 245 = (1 << 7) | 117
      { paramMSB: 1, paramLSB: 60, valueMSB: 1, valueLSB: 113 }, // 241 = (1 << 7) | 113
      { paramMSB: 1, paramLSB: 64, valueMSB: 1, valueLSB: 118 }, // 246 = (1 << 7) | 118
    ]);

    expect(nrpnToStepSeqSync(241)).toEqual({ syncMode: 'Ext', bpm: 241, midiClockMode: 'Ck/4' });
    expect(nrpnToStepSeqSync(245)).toEqual({ syncMode: 'Ext', bpm: 245, midiClockMode: 'Ck*4' });
    expect(nrpnToStepSeqSync(246)).toEqual({ syncMode: 'Note', bpm: 246, midiClockMode: 'Ck/4' });
    expect(stepSeqSyncToNrpnBpm({ syncMode: 'Note', bpm: 120, midiClockMode: 'Ck/4' })).toBe(246);
  });
});

describe('Modulation Matrix destinations (matrixTargetOrder & Note+)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSend.mockClear();
    clearNRPNQueue();
    setMidiOutput(mockOutput as unknown as Parameters<typeof setMidiOutput>[0]);
  });

  afterEach(() => {
    clearNRPNQueue();
    setMidiOutput(null);
    vi.useRealTimers();
  });

  it('includes Note+ (66), stp1L/stp2L (67/68), and Arp destinations (69..73) in a 74-item bijection in MATRIX_DEST_ORDER', () => {
    expect(MATRIX_DEST_NAMES).toHaveLength(74);
    expect(MATRIX_DEST_NAMES[66]).toBe('Note+');
    expect(MATRIX_DEST_NAMES[67]).toBe('stp1L');
    expect(MATRIX_DEST_NAMES[68]).toBe('stp2L');
    expect(MATRIX_DEST_NAMES[69]).toBe('Arp+');
    expect(MATRIX_DEST_NAMES[70]).toBe('ArpVl');
    expect(MATRIX_DEST_NAMES[71]).toBe('ArpGt');
    expect(MATRIX_DEST_NAMES[72]).toBe('ArpDv');
    expect(MATRIX_DEST_NAMES[73]).toBe('ArpRt');
    expect(MATRIX_DEST_ORDER).toHaveLength(74);
    expect(new Set(MATRIX_DEST_ORDER).size).toBe(74);
    expect([...MATRIX_DEST_ORDER].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 74 }, (_, i) => i)
    );
    expect(MATRIX_DEST_ORDERED_NAMES[26]).toBe('Note+');
    expect(MATRIX_DEST_ORDERED_NAMES[61]).toBe('stp1L');
    expect(MATRIX_DEST_ORDERED_NAMES[62]).toBe('stp2L');
    expect(MATRIX_DEST_ORDERED_NAMES[63]).toBe('Arp+');
    expect(MATRIX_DEST_ORDERED_NAMES[67]).toBe('ArpRt');
    expect(MATRIX_DEST_ORDERED_NAMES[6]).toBe('Mtx FB');
  });

  it('sends Note+ (ID 66) and ArpRt (ID 73) via sendModulationMatrixParam', async () => {
    sendModulationMatrixParam(0, 'destination1', 'Note+', 1);
    sendModulationMatrixParam(0, 'destination2', 'ArpRt', 1);
    await flushQueue();

    expect(allSentNRPNs()).toEqual([
      { paramMSB: 0, paramLSB: 118, valueMSB: 0, valueLSB: 66 },
      { paramMSB: 0, paramLSB: 119, valueMSB: 0, valueLSB: 73 },
    ]);
  });

  it('sends Engine Voice Priority via NRPN [2, 20] clamped to 0..4', async () => {
    sendVoicePriority(3, 1); // BassP
    await flushQueue();

    expect(allSentNRPNs()).toEqual([
      { paramMSB: 2, paramLSB: 20, valueMSB: 0, valueLSB: 3 },
    ]);
  });

  it('sends Arpeggiator Euclidean Seed via NRPN [4, 4] clamped to 0..15', async () => {
    sendArpeggiatorEuclideanSeed(11, 1);
    await flushQueue();
    sendArpeggiatorEuclideanSeed(99, 1);
    await flushQueue();

    expect(allSentNRPNs()).toEqual([
      { paramMSB: 4, paramLSB: 4, valueMSB: 0, valueLSB: 11 },
      { paramMSB: 4, paramLSB: 4, valueMSB: 0, valueLSB: 15 },
    ]);
  });

  it('sends Arpeggiator User Pattern Length via NRPN [4, 5..8] clamped to 1..16', async () => {
    sendArpeggiatorUserPatternLength(0, 8, 1);  // Usr1 -> LSB 5
    sendArpeggiatorUserPatternLength(3, 20, 1); // Usr4 -> LSB 8, clamped to 16
    await flushQueue();

    expect(allSentNRPNs()).toEqual([
      { paramMSB: 4, paramLSB: 5, valueMSB: 0, valueLSB: 8 },
      { paramMSB: 4, paramLSB: 8, valueMSB: 0, valueLSB: 16 },
    ]);
  });

  it('sends Arpeggiator User Pattern Step State (LSB 0..15) and Action (LSB 16..31) on MSB 7..10', async () => {
    sendArpeggiatorUserStepState(0, 2, 2, 1);      // Usr1 step 2 -> Accent (2)
    sendArpeggiatorUserStepAction(0, 2, 'Chrd', 1); // Usr1 step 2 -> Chrd (4) at LSB 18
    sendArpeggiatorUserStepState(3, 15, 0, 1);     // Usr4 step 15 -> Off (0)
    sendArpeggiatorUserStepAction(3, 15, 'Slap', 1);// Usr4 step 15 -> Slap (5) at LSB 31
    await flushQueue();

    expect(allSentNRPNs()).toEqual([
      { paramMSB: 7, paramLSB: 2, valueMSB: 0, valueLSB: 2 },
      { paramMSB: 7, paramLSB: 18, valueMSB: 0, valueLSB: 4 },
      { paramMSB: 10, paramLSB: 15, valueMSB: 0, valueLSB: 0 },
      { paramMSB: 10, paramLSB: 31, valueMSB: 0, valueLSB: 5 },
    ]);

    expect(arpStepValueToState(0, 'Norm')).toBe(1);
    expect(arpStepValueToState(75, 'Norm')).toBe(1);
    expect(arpStepValueToState(100, 'Norm')).toBe(2);
    expect(arpStepValueToState(100, 'Off')).toBe(0);
  });

  it('computes Euclidean arp factory pattern masks (seed 0, 1, 8, 12, 15)', () => {
    const p0 = ARP_FACTORY_PATTERN_MASKS[0]; // 0x5555, 0x1041, 0x0041
    expect(ARP_FACTORY_PATTERN_MASKS).toHaveLength(22);

    const seed0 = computeArpPresetMasks(p0.stepMask, p0.baseAccent, p0.baseTie, 0);
    expect(seed0).toEqual({
      stepMask: 21845,
      accentMask: 0,
      tieMask: 0,
      octUpMask: 0,
      ratchet2Mask: 0,
      length: 16,
    });

    const seed1 = computeArpPresetMasks(p0.stepMask, p0.baseAccent, p0.baseTie, 1);
    expect(seed1.accentMask).toBe(p0.baseAccent);
    expect(seed1.tieMask).toBe(p0.baseTie);
    expect(seed1.octUpMask).toBe(0);
    expect(seed1.ratchet2Mask).toBe(0);

    const seed8 = computeArpPresetMasks(p0.stepMask, p0.baseAccent, p0.baseTie, 8);
    expect(seed8.octUpMask).not.toBe(0);
    expect(seed8.ratchet2Mask).toBe(0);

    const seed12 = computeArpPresetMasks(p0.stepMask, p0.baseAccent, p0.baseTie, 12);
    expect(seed12.octUpMask).not.toBe(0);
    expect(seed12.ratchet2Mask).not.toBe(0);

    const data15 = getArpFactoryPatternData(0, 15);
    expect(data15.length).toBe(7);
    expect(data15.steps).toHaveLength(16);
    expect(data15.modes).toHaveLength(16);
  });
});
