/**
 * Tests for the NRPN send queue in midiService.ts
 *
 * Verifies rate limiting, deduplication, drain/clear behaviour.
 * We mock the MIDI output at module level to capture raw sent bytes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock webmidi before importing midiService ────────────────────────────────

// vi.hoisted runs before vi.mock hoisting, so the variable exists
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

// Build mock output (defined after hoisted fns are available)
const mockOutput = {
  id: 'test-out',
  name: 'Test Output',
  manufacturer: 'Test',
  state: 'connected',
  connection: 'open',
  type: 'output',
  send: mockSend,
};

// Import AFTER mocks are set up
import {
  sendNRPN,
  drainNRPNQueue,
  clearNRPNQueue,
  setMidiOutput,
} from '../midiService';
import type { NRPNMessage } from '../preenFM3MidiMap';

// ── Helpers ──────────────────────────────────────────────────────────────────

function nrpn(msb: number, lsb: number, valMsb: number, valLsb: number): NRPNMessage {
  return { paramMSB: msb, paramLSB: lsb, valueMSB: valMsb, valueLSB: valLsb };
}

/** Extract the [CC, value] pairs from a single batched NRPN send call. */
function ccPairsFrom(callIndex: number): Array<[number, number]> {
  const bytes: number[] = mockSend.mock.calls[callIndex][0];
  // 12-byte batch: [s,99,msb, s,98,lsb, s,6,vMsb, s,38,vLsb]
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < bytes.length; i += 3) {
    pairs.push([bytes[i + 1], bytes[i + 2]]);
  }
  return pairs;
}

/**
 * Count how many full NRPNs were sent.
 * Each NRPN = 1 send() with 12 bytes.
 */
function sentNRPNCount(): number {
  return mockSend.mock.calls.filter((call: unknown[]) => (call[0] as number[]).length === 12).length;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockSend.mockClear();
  clearNRPNQueue();
  // Set the mock output so sendNRPN doesn't bail out
  setMidiOutput(mockOutput as any);
});

afterEach(() => {
  clearNRPNQueue();
  vi.useRealTimers();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NRPN send queue', () => {
  it('sends a single NRPN after the interval delay', async () => {
    sendNRPN(nrpn(0, 0, 0, 42), 1);
    expect(sentNRPNCount()).toBe(0); // not yet

    vi.advanceTimersByTime(15);
    expect(sentNRPNCount()).toBe(1);

    // Verify the 4 CCs inside the single batched send: CC99=0, CC98=0, CC6=0, CC38=42
    const pairs = ccPairsFrom(0);
    expect(pairs[0]).toEqual([99, 0]);
    expect(pairs[1]).toEqual([98, 0]);
    expect(pairs[2]).toEqual([6, 0]);
    expect(pairs[3]).toEqual([38, 42]);
  });

  it('spaces multiple NRPNs by at least 10 ms', () => {
    sendNRPN(nrpn(0, 0, 0, 1), 1);
    sendNRPN(nrpn(0, 1, 0, 2), 1);
    sendNRPN(nrpn(0, 2, 0, 3), 1);

    // After 10 ms → first NRPN sent
    vi.advanceTimersByTime(10);
    expect(sentNRPNCount()).toBe(1);

    // After 10 more ms → second
    vi.advanceTimersByTime(10);
    expect(sentNRPNCount()).toBe(2);

    // After 10 more ms → third
    vi.advanceTimersByTime(10);
    expect(sentNRPNCount()).toBe(3);
  });

  it('deduplicates NRPNs with the same address (latest-value-wins)', () => {
    // Queue 3 values for the same address [0, 5]
    sendNRPN(nrpn(0, 5, 0, 10), 1);
    sendNRPN(nrpn(0, 5, 0, 20), 1);
    sendNRPN(nrpn(0, 5, 0, 30), 1);

    // Only 1 entry should be in the queue
    vi.advanceTimersByTime(15);
    expect(sentNRPNCount()).toBe(1);

    // The sent value should be the last one: 30
    const pairs = ccPairsFrom(0);
    expect(pairs[3]).toEqual([38, 30]); // CC38 = valueLSB
  });

  it('drainNRPNQueue() resolves when the queue empties', async () => {
    sendNRPN(nrpn(0, 0, 0, 1), 1);
    sendNRPN(nrpn(0, 1, 0, 2), 1);

    const drained = drainNRPNQueue();
    let resolved = false;
    drained.then(() => { resolved = true; });

    vi.advanceTimersByTime(10);
    // Run any microtasks (promise resolutions)
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false); // still one left

    vi.advanceTimersByTime(10);
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    expect(sentNRPNCount()).toBe(2);
  });

  it('drainNRPNQueue() resolves immediately when queue is empty', async () => {
    const drained = drainNRPNQueue();
    let resolved = false;
    drained.then(() => { resolved = true; });
    // Microtasks
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });

  it('clearNRPNQueue() discards pending messages', () => {
    sendNRPN(nrpn(0, 0, 0, 1), 1);
    sendNRPN(nrpn(0, 1, 0, 2), 1);
    sendNRPN(nrpn(0, 2, 0, 3), 1);

    clearNRPNQueue();

    vi.advanceTimersByTime(100);
    expect(sentNRPNCount()).toBe(0);
  });

  it('clearNRPNQueue() resolves pending drain promises', async () => {
    sendNRPN(nrpn(0, 0, 0, 1), 1);

    const drained = drainNRPNQueue();
    let resolved = false;
    drained.then(() => { resolved = true; });

    clearNRPNQueue();
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
    expect(sentNRPNCount()).toBe(0);
  });

  it('uses correct MIDI channel in status byte', () => {
    sendNRPN(nrpn(1, 50, 0, 99), 5); // channel 5
    vi.advanceTimersByTime(15);

    // Status byte = 0xB0 + (channel - 1) = 0xB4 = 180
    const firstCall = mockSend.mock.calls[0][0];
    expect(firstCall[0]).toBe(0xB4); // first byte in the 12-byte batch
  });

  it('does not send if midiOutput is null', () => {
    setMidiOutput(null as any);
    sendNRPN(nrpn(0, 0, 0, 1), 1);
    vi.advanceTimersByTime(100);
    expect(sentNRPNCount()).toBe(0);
  });

  it('handles a large batch (simulating sendPatch ~240 NRPNs)', () => {
    const count = 240;
    for (let i = 0; i < count; i++) {
      sendNRPN(nrpn(0, i % 128, 0, i % 128), 1);
    }

    // Advance enough time for all messages (240 * 10ms = 2400ms)
    vi.advanceTimersByTime(count * 10 + 100);

    // Each NRPN address is unique (0:0 through 0:127, then dedup for repeats)
    // With 240 messages and 128 unique addresses, 128 will be sent + 112
    // Actually: i%128 goes 0..127, 0..127 → second set deduplicates
    // So we should end up with 128 unique NRPNs
    expect(sentNRPNCount()).toBe(128);
  });

  it('preserves order for different addresses', () => {
    sendNRPN(nrpn(0, 10, 0, 10), 1);
    sendNRPN(nrpn(0, 20, 0, 20), 1);
    sendNRPN(nrpn(0, 30, 0, 30), 1);

    vi.advanceTimersByTime(50);
    expect(sentNRPNCount()).toBe(3);

    // Each send() call is a 12-byte batch: [s,99,msb, s,98,lsb, ...]
    // First NRPN: address [0, 10]
    const p0 = ccPairsFrom(0);
    expect(p0[0]).toEqual([99, 0]);
    expect(p0[1]).toEqual([98, 10]);
    // Second: address [0, 20]
    const p1 = ccPairsFrom(1);
    expect(p1[0]).toEqual([99, 0]);
    expect(p1[1]).toEqual([98, 20]);
    // Third: address [0, 30]
    const p2 = ccPairsFrom(2);
    expect(p2[0]).toEqual([99, 0]);
    expect(p2[1]).toEqual([98, 30]);
  });

  it('does not send extra bytes after queue drains (no NRPN null)', () => {
    sendNRPN(nrpn(0, 0, 0, 1), 1);
    vi.advanceTimersByTime(15);

    // Only 1 send() call: the 12-byte NRPN batch. No trailing null.
    expect(mockSend.mock.calls.length).toBe(1);
    expect(mockSend.mock.calls[0][0].length).toBe(12);
  });
});
