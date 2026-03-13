/**
 * Tests for midiService send functions.
 *
 * Covers:
 * - Arpeggiator senders: guard against unknown values (indexOf === -1)
 * - sendLfoEnvelope: correct NRPN LSB addresses for Env1 and Env2
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
  sendLfoEnvelope,
  sendPatchName,
  setMidiOutput,
  clearNRPNQueue,
  drainNRPNQueue,
} from '../midiService';

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
    expect(sentNRPNCount()).toBe(1);
    const sent = allSentNRPNs()[0];
    expect(sent.paramMSB).toBe(0);
    expect(sent.paramLSB).toBe(30);
    expect(sent.valueLSB).toBe(1);
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

// ── sendLfoEnvelope NRPN addresses ───────────────────────────────────────────

describe('sendLfoEnvelope — NRPN LSB addresses', () => {
  it('Env1 (envIndex=0) uses LSBs [52, 53, 54, 55]', async () => {
    sendLfoEnvelope(0, { attack: 1, decay: 0.5, sustain: 0.8, release: 0.3 });
    await flushQueue();
    const nrpns = allSentNRPNs();
    expect(nrpns.length).toBe(4);
    expect(nrpns.map(n => n.paramLSB)).toEqual([52, 53, 54, 55]);
    // All should have MSB=1
    expect(nrpns.every(n => n.paramMSB === 1)).toBe(true);
  });

  it('Env2 (envIndex=1) uses LSBs [56, 57, 58, 59] — no collision with Seq1 BPM (LSB=60)', async () => {
    sendLfoEnvelope(1, { attack: 0.2, decay: 0.4, sustain: 0.6, release: 0.8 });
    await flushQueue();
    const nrpns = allSentNRPNs();
    expect(nrpns.length).toBe(4);
    expect(nrpns.map(n => n.paramLSB)).toEqual([56, 57, 58, 59]);
    // Must NOT contain LSB=60 (Seq1 BPM address)
    expect(nrpns.some(n => n.paramLSB === 60)).toBe(false);
  });

  it('Env1 attack=1.5s encodes as 150 (centiseconds)', async () => {
    sendLfoEnvelope(0, { attack: 1.5, decay: 0, sustain: 0, release: 0 });
    await flushQueue();
    const nrpns = allSentNRPNs();
    // First NRPN is attack: value = 150 → valueMSB=1 (150>>7), valueLSB=22 (150&0x7F)
    expect(nrpns[0].valueMSB).toBe((150 >> 7) & 0x7F); // 1
    expect(nrpns[0].valueLSB).toBe(150 & 0x7F);         // 22
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
