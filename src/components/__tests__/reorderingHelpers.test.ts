/// <reference types="node" />
/**
 * Tests for ReorderingComponent helper functions (binary bank/patch management).
 *
 * These tests use synthetic data (programmatically-created 1024-byte blocks).
 * To add tests with real hardware data, drop a .patch file (1024 bytes) into
 * the fixtures/ directory next to this file. See fixtures/README.md.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRESET_SIZE,
  PRESET_COUNT,
  NAME_MAX_LEN,
  NAME_OFFSET,
  readName,
  writeName,
  parseBankData,
  buildBankData,
  suggestFileName,
  swapAt,
  isEmptySlot,
} from '../ReorderingComponent';
import type { PresetSlot } from '../ReorderingComponent';

// ---------------------------------------------------------------------------
// Helpers to build synthetic binary data
// ---------------------------------------------------------------------------

const __filename_ = fileURLToPath(import.meta.url);
const __dirname_ = dirname(__filename_);
const FIXTURES_DIR = join(__dirname_, 'fixtures');

/** Create a 1024-byte preset block with a given name written at NAME_OFFSET. */
function makeBlock(name: string): Uint8Array {
  const block = new Uint8Array(PRESET_SIZE);
  for (let i = 0; i < Math.min(name.length, NAME_MAX_LEN); i++) {
    block[NAME_OFFSET + i] = name.charCodeAt(i) & 0xff;
  }
  return block;
}

/** Create a full 128-preset bank ArrayBuffer where preset i has name `PREFIX_i`. */
function makeBankBuffer(prefix = 'Preset'): ArrayBuffer {
  const buf = new ArrayBuffer(PRESET_COUNT * PRESET_SIZE);
  const view = new Uint8Array(buf);
  for (let i = 0; i < PRESET_COUNT; i++) {
    const block = makeBlock(`${prefix}_${String(i).padStart(3, '0')}`);
    view.set(block, i * PRESET_SIZE);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// readName
// ---------------------------------------------------------------------------

describe('readName', () => {
  it('reads a normal ASCII name from a block', () => {
    const block = makeBlock('BassLead');
    expect(readName(block)).toBe('BassLead');
  });

  it('reads up to NAME_MAX_LEN characters', () => {
    const block = makeBlock('123456789012'); // exactly 12 chars
    expect(readName(block)).toBe('123456789012');
  });

  it('stops at null byte', () => {
    const block = makeBlock('Hi');
    // bytes after 'Hi' are already 0
    expect(readName(block)).toBe('Hi');
  });

  it('returns "(empty)" for an all-zero name region', () => {
    const block = new Uint8Array(PRESET_SIZE); // all zeros
    expect(readName(block)).toBe('(empty)');
  });
});

// ---------------------------------------------------------------------------
// writeName
// ---------------------------------------------------------------------------

describe('writeName', () => {
  it('writes a name and pads the rest with zeros', () => {
    const block = makeBlock('OldName');
    writeName(block, 'New');
    expect(readName(block)).toBe('New');
    // Verify padding bytes are zero
    for (let i = 3; i < NAME_MAX_LEN; i++) {
      expect(block[NAME_OFFSET + i]).toBe(0);
    }
  });

  it('truncates names longer than NAME_MAX_LEN', () => {
    const block = new Uint8Array(PRESET_SIZE);
    writeName(block, 'ThisNameIsTooLong');
    expect(readName(block)).toBe('ThisNameIsTo'); // 12 chars
  });

  it('clears the name when writing an empty string', () => {
    const block = makeBlock('SomeName');
    writeName(block, '');
    expect(readName(block)).toBe('(empty)');
  });

  it('round-trips correctly with readName', () => {
    const names = ['Init', 'Pad_Layer', '!@#$%^&*()', '123456789012'];
    for (const name of names) {
      const block = new Uint8Array(PRESET_SIZE);
      writeName(block, name);
      expect(readName(block)).toBe(name.slice(0, NAME_MAX_LEN));
    }
  });
});

// ---------------------------------------------------------------------------
// parseBankData / buildBankData
// ---------------------------------------------------------------------------

describe('parseBankData', () => {
  it('parses 128 preset slots from a bank buffer', () => {
    const buf = makeBankBuffer('P');
    const slots = parseBankData(buf);
    expect(slots).toHaveLength(PRESET_COUNT);
    expect(slots[0].name).toBe('P_000');
    expect(slots[127].name).toBe('P_127');
  });

  it('each slot has a 1024-byte data block', () => {
    const buf = makeBankBuffer();
    const slots = parseBankData(buf);
    for (const slot of slots) {
      expect(slot.data.byteLength).toBe(PRESET_SIZE);
    }
  });

  it('slots are independent copies (no shared buffer)', () => {
    const buf = makeBankBuffer();
    const slots = parseBankData(buf);
    // Mutate slot 0 data
    slots[0].data[0] = 0xff;
    // Slot 1 must not be affected
    expect(slots[1].data[0]).toBe(0);
  });
});

describe('buildBankData', () => {
  it('round-trips: parse → build → parse gives identical names', () => {
    const original = makeBankBuffer('Test');
    const slots = parseBankData(original);
    const rebuilt = buildBankData(slots);
    const reParsed = parseBankData(rebuilt);

    for (let i = 0; i < PRESET_COUNT; i++) {
      expect(reParsed[i].name).toBe(slots[i].name);
    }
  });

  it('produces a buffer of exactly PRESET_COUNT × PRESET_SIZE bytes', () => {
    const slots = parseBankData(makeBankBuffer());
    const buf = buildBankData(slots);
    expect(buf.byteLength).toBe(PRESET_COUNT * PRESET_SIZE);
  });

  it('byte-for-byte identical after round-trip', () => {
    const original = makeBankBuffer('RT');
    const slots = parseBankData(original);
    const rebuilt = buildBankData(slots);

    const a = new Uint8Array(original);
    const b = new Uint8Array(rebuilt);
    expect(b).toEqual(a);
  });
});

// ---------------------------------------------------------------------------
// suggestFileName
// ---------------------------------------------------------------------------

describe('suggestFileName', () => {
  it('appends _reordered.bnk to a plain name', () => {
    expect(suggestFileName('MyBank.bnk')).toBe('MyBank_reordered.bnk');
  });

  it('does not double the _reordered suffix', () => {
    expect(suggestFileName('MyBank_reordered.bnk')).toBe('MyBank_reordered.bnk');
  });

  it('handles names without .bnk extension', () => {
    expect(suggestFileName('SomeBank')).toBe('SomeBank_reordered.bnk');
  });

  it('handles case-insensitive .BNK extension', () => {
    expect(suggestFileName('Bank.BNK')).toBe('Bank_reordered.bnk');
  });

  it('strips multiple _reordered suffixes', () => {
    expect(suggestFileName('Bank_reordered_reordered.bnk')).toBe('Bank_reordered.bnk');
  });
});

// ---------------------------------------------------------------------------
// swapAt
// ---------------------------------------------------------------------------

describe('swapAt', () => {
  it('swaps two elements immutably', () => {
    const arr = ['a', 'b', 'c', 'd'];
    const result = swapAt(arr, 1, 3);
    expect(result).toEqual(['a', 'd', 'c', 'b']);
    // Original is unchanged
    expect(arr).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns an identical array when swapping same index', () => {
    const arr = [1, 2, 3];
    const result = swapAt(arr, 0, 0);
    expect(result).toEqual([1, 2, 3]);
    expect(result).not.toBe(arr); // still a new array
  });
});

// ---------------------------------------------------------------------------
// isEmptySlot
// ---------------------------------------------------------------------------

describe('isEmptySlot', () => {
  it('returns true for an all-zero block', () => {
    const block = new Uint8Array(PRESET_SIZE);
    expect(isEmptySlot(block)).toBe(true);
  });

  it('returns false when the name region contains data', () => {
    const block = makeBlock('Test');
    expect(isEmptySlot(block)).toBe(false);
  });

  it('returns true when data exists outside name region but name is empty', () => {
    const block = new Uint8Array(PRESET_SIZE);
    block[0] = 0xff; // data before name offset
    block[NAME_OFFSET + NAME_MAX_LEN + 1] = 0xff; // data after name region
    expect(isEmptySlot(block)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: bank manipulation scenarios
// ---------------------------------------------------------------------------

describe('bank manipulation scenarios', () => {
  let bankBuf: ArrayBuffer;

  beforeAll(() => {
    bankBuf = makeBankBuffer('Patch');
  });

  it('swap two presets and verify positions', () => {
    const slots = parseBankData(bankBuf);
    const swapped = swapAt(slots, 0, 5);

    expect(swapped[0].name).toBe('Patch_005');
    expect(swapped[5].name).toBe('Patch_000');
    // Other slots untouched
    expect(swapped[1].name).toBe('Patch_001');
  });

  it('rename a preset, rebuild bank, and verify the new name persists', () => {
    const slots = parseBankData(bankBuf);
    const target = { ...slots[10], data: slots[10].data.slice() };
    writeName(target.data, 'NewName');
    target.name = 'NewName';
    slots[10] = target;

    const rebuilt = buildBankData(slots);
    const reParsed = parseBankData(rebuilt);
    expect(reParsed[10].name).toBe('NewName');
    // Others unchanged
    expect(reParsed[0].name).toBe('Patch_000');
    expect(reParsed[11].name).toBe('Patch_011');
  });

  it('import a patch into an empty slot', () => {
    const slots = parseBankData(bankBuf);
    // Clear slot 50 to make it empty
    slots[50] = { name: '(empty)', data: new Uint8Array(PRESET_SIZE) };

    // Simulate importing a patch
    const patchBlock = makeBlock('Imported');
    const emptyIdx = slots.findIndex((s) => isEmptySlot(s.data));
    expect(emptyIdx).toBe(50);

    slots[emptyIdx] = { name: readName(patchBlock), data: patchBlock };
    expect(slots[50].name).toBe('Imported');

    // Round-trip
    const rebuilt = buildBankData(slots);
    const reParsed = parseBankData(rebuilt);
    expect(reParsed[50].name).toBe('Imported');
  });

  it('replacing a slot preserves other slots', () => {
    const slots = parseBankData(bankBuf);
    const replacement = makeBlock('Replaced');
    slots[42] = { name: readName(replacement), data: replacement };

    const rebuilt = buildBankData(slots);
    const reParsed = parseBankData(rebuilt);
    expect(reParsed[42].name).toBe('Replaced');

    // Neighbours unchanged
    expect(reParsed[41].name).toBe('Patch_041');
    expect(reParsed[43].name).toBe('Patch_043');
  });
});

// ---------------------------------------------------------------------------
// Real .patch fixture tests (when available)
// ---------------------------------------------------------------------------

describe('real .patch fixture', () => {
  const patchFiles: string[] = [];

  beforeAll(() => {
    if (existsSync(FIXTURES_DIR)) {
      const all = readdirSync(FIXTURES_DIR);
      patchFiles.push(...all.filter((f) => f.endsWith('.patch')));
    }
  });

  it.skipIf(true)('placeholder: add a .patch file to fixtures/ to enable', () => {
    // This test serves as documentation. See fixtures/README.md.
  });

  it('each .patch fixture is exactly PRESET_SIZE bytes', () => {
    if (patchFiles.length === 0) return; // skip silently if no fixtures
    for (const file of patchFiles) {
      const buf = readFileSync(join(FIXTURES_DIR, file));
      expect(buf.byteLength, `${file} should be ${PRESET_SIZE} bytes`).toBe(PRESET_SIZE);
    }
  });

  it('readName extracts a non-empty name from each .patch fixture', () => {
    if (patchFiles.length === 0) return;
    for (const file of patchFiles) {
      const buf = readFileSync(join(FIXTURES_DIR, file));
      const block = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const name = readName(block);
      expect(name, `${file} name should not be empty`).not.toBe('(empty)');
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(NAME_MAX_LEN);
    }
  });

  it('writeName + readName round-trips on each .patch fixture', () => {
    if (patchFiles.length === 0) return;
    for (const file of patchFiles) {
      const buf = readFileSync(join(FIXTURES_DIR, file));
      const block = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
      const originalName = readName(block);
      writeName(block, originalName);
      expect(readName(block)).toBe(originalName);
    }
  });

  it('inserting a .patch fixture into a bank and extracting it gives identical bytes', () => {
    if (patchFiles.length === 0) return;
    for (const file of patchFiles) {
      const buf = readFileSync(join(FIXTURES_DIR, file));
      const patchData = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();

      // Build a bank, insert the patch at slot 0
      const bankBuf = makeBankBuffer('Empty');
      const slots = parseBankData(bankBuf);
      slots[0] = { name: readName(patchData), data: patchData };

      const rebuilt = buildBankData(slots);
      const reParsed = parseBankData(rebuilt);

      expect(reParsed[0].data).toEqual(patchData);
      expect(reParsed[0].name).toBe(readName(patchData));
    }
  });
});
