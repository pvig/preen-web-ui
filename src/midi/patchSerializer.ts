/**
 * PreenFM3 Patch Serializer
 * Converts a Patch object to a 1024-byte FlashSynthParams binary blob (.bnk / .patch format)
 * 
 * This is the reverse operation of preenFM3Parser.toPatch().
 * Based on the official preenfm2Controller's pfmPreset.h struct layout
 * and convert() function from pfmPreset.cpp.
 * 
 * @see PATCH_MANAGEMENT.md for full binary layout, firmware references, and architecture overview.
 * 
 * FlashSynthParams binary layout (1024 bytes):
 *   Offset 0:   engine1       (4 floats: algo, velocity, playMode, glideSpeed)
 *   Offset 16:  flashEngineIm1 (4 floats: im1, im2, im3, im4)
 *   Offset 32:  flashEngineIm2 (4 floats: im5, im6, notUsed, notUsed)
 *   Offset 48:  engineMix1    (4 floats: mixOsc1, panOsc1, mixOsc2, panOsc2)
 *   Offset 64:  engineMix2    (4 floats: mixOsc3, panOsc3, mixOsc4, panOsc4)
 *   Offset 80:  engineMix3    (4 floats: mixOsc5, panOsc5, mixOsc6, panOsc6)
 *   Offset 96:  osc1-6        (6 × 4 floats = 96 bytes)
 *   Offset 192: env1a-6b      (6 × 8 floats = 192 bytes)
 *   Offset 384: matrix1-12    (12 × 4 floats = 192 bytes)
 *   Offset 576: lfoOsc1-3     (3 × 4 floats = 48 bytes)
 *   Offset 624: lfoEnv1       (4 floats)
 *   Offset 640: lfoEnv2       (4 floats)
 *   Offset 656: lfoSeq1       (4 floats)
 *   Offset 672: lfoSeq2       (4 floats)
 *   Offset 688: lfoSteps1     (16 chars)
 *   Offset 704: lfoSteps2     (16 chars)
 *   Offset 720: presetName    (13 chars + 3 padding)
 *   Offset 736: engineArp1    (4 floats)
 *   Offset 752: engineArp2    (4 floats)
 *   Offset 768: flashEngineVeloIm1 (4 floats)
 *   Offset 784: flashEngineVeloIm2 (4 floats)
 *   Offset 800: effect        (4 floats)
 *   Offset 816: arpUserPatterns (4 uint32)
 *   Offset 832: lfoPhases     (4 floats)
 *   Offset 848: midiNote1Curve (4 floats)
 *   Offset 864: midiNote2Curve (4 floats)
 *   Offset 880: engine2       (4 floats)
 *   Offset 896: envCurves1To4 (16 bytes — 4 envelope curves × 4 uint8_t)
 *   Offset 912: envCurves5To6 (8 bytes — 2 envelope curves × 4 uint8_t)
 *   Offset 920: effect2       (4 floats — Filter 2, PreenFM3 only)
 *   Offset 936: padding       (83 bytes)
 *   Offset 1019: version tag  (4 bytes uint32 — 0 = PRESET_VERSION1)
 */

import type { Patch, NoteCurveType } from '../types/patch';
import {
  FILTER1_TYPE_LIST,
  FILTER2_TYPE_LIST,
  DEFAULT_ALGORITHMS,
  NOTE_CURVE_TYPE_TO_NRPN,
} from '../types/patch';
import { ALGO_DIAGRAMS } from '../algo/algorithms.static';
import { getWaveformId } from '../types/waveform';
import {
  lfoFrequencyToNrpn,
  encodeLfoBias,
  encodeLfoKeysync,
  encodeLfoShape,
} from '../types/lfo';
import { PreenFM3Parser } from './preenFM3Parser';
import type {
  ArpClock,
  ArpDirection,
  ArpPattern,
  ArpDivision,
  ArpDuration,
  ArpLatch,
} from '../types/patch';

// ── Binary layout constants ───────────────────────────────────────────────────

const PRESET_SIZE = 1024; // bytes per preset (FlashSynthParams)

// Byte offsets in the FlashSynthParams struct
const OFF_ENGINE1 = 0;            // 4 floats
const OFF_FLASH_IM1 = 16;         // 4 floats: im1-4
const OFF_FLASH_IM2 = 32;         // 4 floats: im5, im6, unused, unused
const OFF_MIX1 = 48;              // 12 floats across mix1-3
const OFF_OSC1 = 96;              // 6 × 4 floats
const OFF_ENV1A = 192;            // 6 × 8 floats (envA + envB interleaved)
const OFF_MATRIX1 = 384;          // 12 × 4 floats
const OFF_LFO_OSC1 = 576;         // 3 × 4 floats
const OFF_LFO_ENV1 = 624;         // 4 floats
const OFF_LFO_ENV2 = 640;         // 4 floats
const OFF_LFO_SEQ1 = 656;         // 4 floats
const OFF_LFO_SEQ2 = 672;         // 4 floats
const OFF_STEPS1 = 688;           // 16 chars
const OFF_STEPS2 = 704;           // 16 chars
const OFF_PRESET_NAME = 720;      // 13 chars + 3 padding
const OFF_ARP1 = 736;             // 4 floats
const OFF_ARP2 = 752;             // 4 floats
const OFF_FLASH_VELO_IM1 = 768;   // 4 floats: imVelo1-4
const OFF_FLASH_VELO_IM2 = 784;   // 4 floats: imVelo5, imVelo6, unused, unused
const OFF_EFFECT = 800;           // 4 floats
// OFF_ARP_PATTERNS = 816 (4 × uint32) — reserved, not used
const OFF_LFO_PHASES = 832;       // 4 floats
const OFF_NOTE_CURVE1 = 848;      // 4 floats
const OFF_NOTE_CURVE2 = 864;      // 4 floats
const OFF_ENGINE2 = 880;          // 4 floats
// OFF_ENV_CURVES = 896           // 24 bytes: envCurves1To4 (16) + envCurves5To6 (8) — left zeroed
const OFF_EFFECT2 = 920;          // 4 floats (Filter 2 / Effect 2, PreenFM3 only)
const OFF_VERSION_TAG = 1019;     // 4 bytes uint32 (PRESET_VERSION1 = 0)

// ── Reverse-lookup tables ─────────────────────────────────────────────────────

const ARP_CLOCKS: ArpClock[] = ['Off', 'Int', 'Ext'];
const ARP_DIRECTIONS: ArpDirection[] = [
  'Up', 'Down', 'UpDown', 'Played', 'Random', 'Chord', 'Rotate U', 'Rotate D', 'Shift U', 'Shift D',
];
const ARP_PATTERNS: ArpPattern[] = [
  '1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','Usr1','Usr2','Usr3','Usr4',
];
const ARP_DIVISIONS: ArpDivision[] = [
  '2/1','3/2','1/1','3/4','2/3','1/2','3/8','1/3','1/4','1/6','1/8','1/12','1/16','1/24','1/32','1/48','1/96',
];
const ARP_DURATIONS: ArpDuration[] = [
  '2/1','3/2','1/1','3/4','2/3','1/2','3/8','1/3','1/4','1/6','1/8','1/12','1/16','1/24','1/32','1/48','1/96',
];
const ARP_LATCH: ArpLatch[] = ['Off', 'On'];

const MATRIX_SOURCE_NAMES = [
  'None', 'LFO 1', 'LFO 2', 'LFO 3', 'LFOEnv1', 'LFOEnv2', 'LFOSeq1', 'LFOSeq2',
  'Modwheel', 'Pitchbend', 'Aftertouch', 'Velocity', 'Note1', 'CC1', 'CC2', 'CC3', 'CC4',
  'Note2', 'Breath', 'MPE Slide', 'Random', 'Poly AT', 'User CC1', 'User CC2', 'User CC3',
  'User CC4', 'PB MPE', 'AT MPE',
];

const MATRIX_DEST_NAMES = [
  'None', 'Gate', 'IM1', 'IM2', 'IM3', 'IM4', 'IM*', 'Mix1', 'Pan1', 'Mix2', 'Pan2',
  'Mix3', 'Pan3', 'Mix4', 'Pan4', 'Mix*', 'Pan*', 'o1 Fq', 'o2 Fq', 'o3 Fq', 'o4 Fq',
  'o5 Fq', 'o6 Fq', 'o* Fq', 'Env1 A', 'Env2 A', 'Env3 A', 'Env4 A', 'Env5 A', 'Env6 A',
  'Env* A', 'Env* R', 'Mtx1 x', 'Mtx2 x', 'Mtx3 x', 'Mtx4 x', 'Lfo1 F', 'Lfo2 F',
  'Lfo3 F', 'Env2 S', 'Seq1 G', 'Seq2 G', 'Flt1 P1', 'o* FqH', 'Env* D', 'EnvM A',
  'EnvM D', 'EnvM R', 'Mtx FB', 'Flt1 P2', 'Flt1 G', 'Flt2 P1', 'Flt2 P2', 'Flt2 G',
];

// ── Helper functions ──────────────────────────────────────────────────────────

function indexOf<T>(arr: readonly T[] | T[], value: T, fallback = 0): number {
  const idx = arr.indexOf(value);
  return idx >= 0 ? idx : fallback;
}

/**
 * Write a 32-bit float (little-endian) at byte offset in a DataView.
 */
function writeFloat(view: DataView, offset: number, value: number): void {
  view.setFloat32(offset, value, true); // little-endian (ARM)
}

/**
 * Write an array of floats starting at a byte offset.
 */
function writeFloats(view: DataView, offset: number, values: number[]): void {
  values.forEach((v, i) => writeFloat(view, offset + i * 4, v));
}

/**
 * Get the algorithm index (0-31) from a Patch.
 */
function getAlgorithmIndex(patch: Patch): number {
  const patchAlgoId = patch.algorithm.id;
  // Search in ALGO_DIAGRAMS by ID
  const idx = ALGO_DIAGRAMS.findIndex(d => d.id === patchAlgoId);
  if (idx >= 0) return idx;
  // Fallback: search DEFAULT_ALGORITHMS
  const idx2 = DEFAULT_ALGORITHMS.findIndex(a => a.id === patchAlgoId);
  return idx2 >= 0 ? idx2 : 0;
}

/**
 * Extract IM values from the patch's operator targets following the edge order
 * in the algorithm diagram (same logic as toPatch() but reversed).
 * 
 * Returns [im1-5 in edge order, im6 (feedback)] and their velocities.
 */
function extractIMValues(patch: Patch): { ims: number[]; imVelos: number[] } {
  const ims: number[] = [0, 0, 0, 0, 0, 0];        // IM1-6 as NRPN values (× 100)
  const imVelos: number[] = [0, 0, 0, 0, 0, 0];

  const algoIndex = getAlgorithmIndex(patch);
  const algoDiagram = ALGO_DIAGRAMS[algoIndex];

  if (algoDiagram) {
    let imIdx = 0;
    for (const edge of algoDiagram.edges) {
      const srcId = parseInt(edge.from.replace(/\D/g, ''));
      const tgtId = parseInt(edge.to.replace(/\D/g, ''));
      const isFeedback = srcId === tgtId;
      const op = patch.operators.find(o => o.id === srcId);
      if (op) {
        const target = op.target.find(t => t.id === tgtId);
        if (target) {
          if (isFeedback) {
            ims[5] = target.im * 100;
            imVelos[5] = (target.modulationIndexVelo ?? 0) * 100;
          } else if (imIdx < 5) {
            ims[imIdx] = target.im * 100;
            imVelos[imIdx] = (target.modulationIndexVelo ?? 0) * 100;
            imIdx++;
          }
        }
      }
    }
  } else {
    // Fallback: iterate operators by id
    let imIndex = 0;
    patch.operators.forEach(op => {
      op.target.forEach(target => {
        const isFeedback = target.id === op.id;
        if (isFeedback) {
          ims[5] = target.im * 100;
          imVelos[5] = (target.modulationIndexVelo ?? 0) * 100;
        } else if (imIndex < 5) {
          ims[imIndex] = target.im * 100;
          imVelos[imIndex] = (target.modulationIndexVelo ?? 0) * 100;
          imIndex++;
        }
      });
    });
  }

  return { ims, imVelos };
}

/**
 * Build the Mix/Pan arrays for the 6 operator slots.
 * The parser assigns carriers first (in carrier order), then remaining modulators.
 * Pan: NRPN format → (pan + 1) * 100 → 0=-1, 100=0, 200=+1
 * Mix: NRPN format → amplitude * 100 → 0=0.0, 100=1.0
 */
function buildMixPanSlots(patch: Patch): { mixes: number[]; pans: number[] } {
  const mixes = new Array(6).fill(0);
  const pans = new Array(6).fill(100); // center

  const carriers = patch.algorithm.ops.filter(op => op.type === 'CARRIER');

  for (let i = 0; i < 6; i++) {
    if (i < carriers.length) {
      const carrierOp = patch.operators.find(o => o.id === carriers[i].id);
      if (carrierOp) {
        mixes[i] = Math.round(carrierOp.amplitude * 100);
        pans[i] = Math.round((carrierOp.pan + 1) * 100);
      }
    } else {
      // Modulator slots: op.id = i+1 where it's not a carrier
      const op = patch.operators.find(
        o => o.id === i + 1 && o.type !== 'CARRIER'
      );
      if (op) {
        mixes[i] = Math.round(op.amplitude * 100);
        pans[i] = Math.round((op.pan + 1) * 100);
      }
    }
  }

  return { mixes, pans };
}

// ── Main serialization function ───────────────────────────────────────────────

/**
 * Serialize a Patch object into a 1024-byte FlashSynthParams binary blob.
 * This binary format is compatible with .bnk files used by PreenFM3 firmware.
 */
export function patchToFlashSynthParams(patch: Patch): Uint8Array {
  const buffer = new ArrayBuffer(PRESET_SIZE);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const algoIndex = getAlgorithmIndex(patch);

  // ── Engine1 (offset 0) ─────────────────────────────────────────────────────
  // {algo, velocity, playMode/voices, glideSpeed}
  writeFloats(view, OFF_ENGINE1, [
    algoIndex,
    patch.global.velocitySensitivity,
    patch.global.polyphony,  // pfm3 playMode (0=Mono, 1=Poly, 2=Unison)
    patch.global.glideTime,
  ]);

  // ── IM values (offsets 16, 32, 768, 784) ────────────────────────────────────
  const { ims, imVelos } = extractIMValues(patch);

  // FlashEngineIm1: {im1, im2, im3, im4}
  writeFloats(view, OFF_FLASH_IM1, [ims[0], ims[1], ims[2], ims[3]]);
  // FlashEngineIm2: {im5, im6, notUsed, notUsed}
  writeFloats(view, OFF_FLASH_IM2, [ims[4], ims[5], 0, 0]);
  // FlashEngineVeloIm1: {imVelo1, imVelo2, imVelo3, imVelo4}
  writeFloats(view, OFF_FLASH_VELO_IM1, [imVelos[0], imVelos[1], imVelos[2], imVelos[3]]);
  // FlashEngineVeloIm2: {imVelo5, imVelo6, notUsed, notUsed}
  writeFloats(view, OFF_FLASH_VELO_IM2, [imVelos[4], imVelos[5], 0, 0]);

  // ── Mix/Pan (offsets 48-80) ─────────────────────────────────────────────────
  const { mixes, pans } = buildMixPanSlots(patch);
  // EngineMix1: {mix1, pan1, mix2, pan2}
  writeFloats(view, OFF_MIX1, [mixes[0], pans[0], mixes[1], pans[1]]);
  writeFloats(view, OFF_MIX1 + 16, [mixes[2], pans[2], mixes[3], pans[3]]);
  writeFloats(view, OFF_MIX1 + 32, [mixes[4], pans[4], mixes[5], pans[5]]);

  // ── Oscillators (offset 96, 6 × 16 bytes) ──────────────────────────────────
  for (let i = 0; i < 6; i++) {
    const op = patch.operators.find(o => o.id === i + 1);
    if (!op) continue;
    const oscOffset = OFF_OSC1 + i * 16;

    // shape: firmware waveform index
    const shape = getWaveformId(op.waveform);
    // frequencyType: UI 0=Fixed→firmware 1, UI 1=Keyboard→firmware 0, UI 2→firmware 2
    let freqType: number;
    if (op.keyboardTracking === 0) freqType = 1;       // Fixed
    else if (op.keyboardTracking === 1) freqType = 0;   // Keyboard
    else freqType = 2;                                   // Finetune
    // frequencyMul: frequency × 100
    const freqMul = Math.round(op.frequency * 100);
    // detune: (detune × 100) + 1600 (centered on 1600)
    const detune = Math.round(op.detune * 100) + 1600;

    writeFloats(view, oscOffset, [shape, freqType, freqMul, detune]);
  }

  // ── Envelopes (offset 192, 6 × 32 bytes) ───────────────────────────────────
  // Each operator has envA (4 floats) + envB (4 floats)
  // Times are RELATIVE (not cumulative) and in centièmes (× 100)
  // The parser accumulates them; here we reverse: absolute → relative
  for (let i = 0; i < 6; i++) {
    const op = patch.operators.find(o => o.id === i + 1);
    if (!op) continue;
    const envOffset = OFF_ENV1A + i * 32; // envA starts here
    const { adsr } = op;

    // Absolute times from UI
    const atkTime = adsr.attack.time;
    const decTime = adsr.decay.time;
    const susTime = adsr.sustain.time;
    const relTime = adsr.release.time;

    // Convert to relative times in centièmes
    const attackTimeRel = Math.round(atkTime * 100);
    const decayTimeRel = Math.round((decTime - atkTime) * 100);
    const sustainTimeRel = Math.round((susTime - decTime) * 100);
    const releaseTimeRel = Math.round((relTime - susTime) * 100);

    // EnvelopeParamsA: {attackTime, attackLevel, decayTime, decayLevel}
    writeFloats(view, envOffset, [
      attackTimeRel,
      adsr.attack.level,
      decayTimeRel,
      adsr.decay.level,
    ]);
    // EnvelopeParamsB: {sustainTime, sustainLevel, releaseTime, releaseLevel}
    writeFloats(view, envOffset + 16, [
      sustainTimeRel,
      adsr.sustain.level,
      releaseTimeRel,
      adsr.release.level,
    ]);
  }

  // ── Modulation Matrix (offset 384, 12 × 16 bytes) ──────────────────────────
  const matrix = patch.modulationMatrix ?? [];
  for (let row = 0; row < 12; row++) {
    const matOffset = OFF_MATRIX1 + row * 16;
    const entry = matrix[row];
    if (!entry) {
      writeFloats(view, matOffset, [0, 1000, 0, 0]); // None, mult=0.0, None, None
      continue;
    }
    const source = indexOf(MATRIX_SOURCE_NAMES, entry.source);
    const dest1 = indexOf(MATRIX_DEST_NAMES, entry.destination1);
    const dest2 = indexOf(MATRIX_DEST_NAMES, entry.destination2);
    // Multiplier: NRPN = (amount × 100) + 1000
    const mul = Math.round(entry.amount * 100) + 1000;
    writeFloats(view, matOffset, [source, mul, dest1, dest2]);
  }

  // ── LFOs (offset 576, 3 × 16 bytes) ────────────────────────────────────────
  const lfos = patch.lfos ?? [
    { shape: 'LFO_SIN' as const, syncMode: 'Int' as const, frequency: 5, midiClockMode: 'MC' as const, phase: 0, bias: 0, keysync: 'Off' as const },
    { shape: 'LFO_SIN' as const, syncMode: 'Int' as const, frequency: 5, midiClockMode: 'MC' as const, phase: 0, bias: 0, keysync: 'Off' as const },
    { shape: 'LFO_SIN' as const, syncMode: 'Int' as const, frequency: 5, midiClockMode: 'MC' as const, phase: 0, bias: 0, keysync: 'Off' as const },
  ];
  for (let i = 0; i < 3; i++) {
    const lfo = lfos[i];
    const lfoOffset = OFF_LFO_OSC1 + i * 16;
    const shape = encodeLfoShape(lfo.shape);
    const freq = lfo.syncMode === 'Ext'
      ? lfoFrequencyToNrpn(lfo.midiClockMode)
      : lfoFrequencyToNrpn(lfo.frequency);
    const bias = encodeLfoBias(lfo.bias);
    const keysync = encodeLfoKeysync(lfo.keysync);
    writeFloats(view, lfoOffset, [shape, freq, bias, keysync]);
  }

  // ── LFO Envelope 1 (offset 624) ────────────────────────────────────────────
  // EnvelopeParams: {attack, decay, sustain, release} — times in centièmes
  const lfoEnv1 = patch.lfoEnvelopes?.[0];
  if (lfoEnv1) {
    writeFloats(view, OFF_LFO_ENV1, [
      Math.round(lfoEnv1.adsr.attack.time * 100),
      Math.round(lfoEnv1.adsr.decay.time * 100),
      Math.round(lfoEnv1.adsr.sustain.time * 100),
      Math.round(lfoEnv1.adsr.release.time * 100),
    ]);
  }

  // ── LFO Envelope 2 (offset 640) ────────────────────────────────────────────
  // Envelope2Params: {silence, attack, decay, loop}
  const lfoEnv2 = patch.lfoEnvelopes?.[1];
  if (lfoEnv2) {
    const loopModes = ['Off', 'Silence', 'Attack'] as const;
    const loopValue = loopModes.indexOf(lfoEnv2.loopMode);
    writeFloats(view, OFF_LFO_ENV2, [
      Math.round(lfoEnv2.silence * 100),
      Math.round(lfoEnv2.adsr.attack.time * 100),
      Math.round(lfoEnv2.adsr.decay.time * 100),
      loopValue >= 0 ? loopValue : 0,
    ]);
  }

  // ── Step Sequencer Params (offsets 656, 672) ────────────────────────────────
  const seqs = patch.stepSequencers;
  if (seqs) {
    // StepSequencerParams: {bpm, gate, unused, unused}
    writeFloats(view, OFF_LFO_SEQ1, [seqs[0].bpm, Math.round(seqs[0].gate * 100), 0, 0]);
    writeFloats(view, OFF_LFO_SEQ2, [seqs[1].bpm, Math.round(seqs[1].gate * 100), 0, 0]);
  }

  // ── Step Sequencer Steps (offsets 688, 704) as chars (not floats!) ──────────
  if (seqs) {
    for (let s = 0; s < 2; s++) {
      const stepsOffset = s === 0 ? OFF_STEPS1 : OFF_STEPS2;
      const steps = seqs[s].steps;
      for (let i = 0; i < 16; i++) {
        // Steps 0-100 in UI → 0-15 as char in firmware
        const val = Math.round(((steps[i] ?? 50) * 15) / 100);
        bytes[stepsOffset + i] = Math.max(0, Math.min(15, val));
      }
    }
  }

  // ── Preset Name (offset 720, 13 chars) ─────────────────────────────────────
  const name = (patch.name || 'Init').substring(0, 12);
  for (let i = 0; i < 13; i++) {
    bytes[OFF_PRESET_NAME + i] = i < name.length ? name.charCodeAt(i) : 0;
  }

  // ── Arpeggiator (offsets 736, 752) ──────────────────────────────────────────
  const arp = patch.arpeggiator;
  // EngineArp1: {clockSource, BPM, direction, octave}
  writeFloats(view, OFF_ARP1, [
    indexOf(ARP_CLOCKS, arp.clockSource),
    arp.clock,
    indexOf(ARP_DIRECTIONS, arp.direction),
    arp.octave,
  ]);
  // EngineArp2: {pattern, division, duration, latch}
  writeFloats(view, OFF_ARP2, [
    indexOf(ARP_PATTERNS, arp.pattern),
    indexOf(ARP_DIVISIONS, arp.division, 12),
    indexOf(ARP_DURATIONS, arp.duration, 12),
    indexOf(ARP_LATCH, arp.latch),
  ]);

  // ── Filter / Effect (offset 800) ───────────────────────────────────────────
  // EffectRowParams: {type, param1, param2, param3}
  const filter1 = patch.filters?.[0];
  if (filter1) {
    // Filter type index from FILTER1_TYPE_LIST
    let typeIdx = FILTER1_TYPE_LIST.indexOf(filter1.type as typeof FILTER1_TYPE_LIST[number]);
    if (typeIdx < 0) {
      typeIdx = FILTER2_TYPE_LIST.indexOf(filter1.type as typeof FILTER2_TYPE_LIST[number]);
      if (typeIdx < 0) typeIdx = 0;
    }
    writeFloats(view, OFF_EFFECT, [
      typeIdx,
      Math.round(filter1.param1 * 100),
      Math.round(filter1.param2 * 100),
      Math.round(filter1.gain * 100),
    ]);
  }

  // ── Arp User Patterns (offset 816) — not used, leave zeroed ────────────────

  // ── LFO Phases (offset 832) ────────────────────────────────────────────────
  // LfoPhaseRowParams: {phase1, phase2, phase3, unused}
  // Parser reads: phase = raw / 100 → so NRPN = phase × 100
  writeFloats(view, OFF_LFO_PHASES, [
    Math.round((lfos[0]?.phase ?? 0) * 100),
    Math.round((lfos[1]?.phase ?? 0) * 100),
    Math.round((lfos[2]?.phase ?? 0) * 100),
    0,
  ]);

  // ── Note Curves (offsets 848, 864) ──────────────────────────────────────────
  // MidiNoteCurveRowParams: {curveBefore, breakNote, curveAfter, unused}
  const noteCurves = patch.noteCurves ?? [
    { before: 'Flat' as NoteCurveType, breakNote: 60, after: 'Flat' as NoteCurveType },
    { before: 'Flat' as NoteCurveType, breakNote: 60, after: 'Flat' as NoteCurveType },
  ];
  for (let i = 0; i < 2; i++) {
    const nc = noteCurves[i];
    const ncOffset = i === 0 ? OFF_NOTE_CURVE1 : OFF_NOTE_CURVE2;
    writeFloats(view, ncOffset, [
      NOTE_CURVE_TYPE_TO_NRPN[nc.before] ?? 0,
      nc.breakNote,
      NOTE_CURVE_TYPE_TO_NRPN[nc.after] ?? 0,
      0,
    ]);
  }

  // ── Engine2 (offset 880) ───────────────────────────────────────────────────
  // Engine2Params: {glideType, unisonSpread, unisonDetune, pfm3Version}
  // pfm3Version = 1.0 marks this as a PreenFM3 patch (vs pfm2 compat when 0)
  writeFloats(view, OFF_ENGINE2, [0, 0, 0, 1]);

  // ── Envelope Curves (offset 896, 24 bytes) ─────────────────────────────────
  // 6 envelopes × 4 uint8_t (attackCurve, decayCurve, sustainCurve, releaseCurve)
  // Left zeroed → firmware applies defaults (attack=1, decay=0, sustain=1, release=0)

  // ── Filter 2 / Effect 2 (offset 920) ──────────────────────────────────────
  // EffectRowParams: {type, param1, param2, param3(gain)}
  // This is a PreenFM3-only field (not present in preenfm2Controller flash layout)
  const filter2 = patch.filters?.[1];
  if (filter2) {
    let typeIdx2 = FILTER2_TYPE_LIST.indexOf(filter2.type as typeof FILTER2_TYPE_LIST[number]);
    if (typeIdx2 < 0) {
      typeIdx2 = FILTER1_TYPE_LIST.indexOf(filter2.type as typeof FILTER1_TYPE_LIST[number]);
      if (typeIdx2 < 0) typeIdx2 = 0;
    }
    writeFloats(view, OFF_EFFECT2, [
      typeIdx2,
      Math.round(filter2.param1 * 100),
      Math.round(filter2.param2 * 100),
      Math.round(filter2.gain * 100),
    ]);
  }
  // If filter2 is absent, offset 920 stays zeroed → firmware applies defaults:
  // type=OFF, param1=0.5, param2=0.5, gain=1.0

  // ── Version tag (offset 1019) ──────────────────────────────────────────────
  // PRESET_VERSION1 = 0 (already zero from buffer init, but explicit for clarity)
  // Written as uint32 little-endian at ALIGNED_PATCH_SIZE - 5
  view.setUint32(OFF_VERSION_TAG, 0, true);

  return bytes;
}

/**
 * Parse a 1024-byte FlashSynthParams binary blob into NRPN messages,
 * then use PreenFM3Parser to build a Patch.
 * This enables loading individual .syx preset files.
 */
export function flashSynthParamsToPatch(data: Uint8Array): Patch {
  const parser = new PreenFM3Parser();

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Helper to read a float32 at byte offset
  const readFloat = (offset: number): number => view.getFloat32(offset, true);

  // ── Feed NRPN values to the parser ──────────────────────────────────────────

  // Helper: adds a single NRPN value to the parser
  const addNrpn = (paramMSB: number, paramLSB: number, value: number) => {
    const intValue = Math.round(value);
    parser.addNRPN({
      paramMSB,
      paramLSB,
      valueMSB: (intValue >> 7) & 0x7F,
      valueLSB: intValue & 0x7F,
    });
  };

  // Engine1 → NRPN 0-3 (MSB=0, LSB=0-3)
  for (let i = 0; i < 4; i++) {
    addNrpn(0, i, readFloat(OFF_ENGINE1 + i * 4));
  }

  // FlashEngineIm1 → NRPN IM1(4), IM2(6), IM3(8), IM4(10)
  addNrpn(0, 4, readFloat(OFF_FLASH_IM1));
  addNrpn(0, 6, readFloat(OFF_FLASH_IM1 + 4));
  addNrpn(0, 8, readFloat(OFF_FLASH_IM1 + 8));
  addNrpn(0, 10, readFloat(OFF_FLASH_IM1 + 12));

  // FlashEngineIm2 → NRPN IM5(12), IM6(14)
  addNrpn(0, 12, readFloat(OFF_FLASH_IM2));
  addNrpn(0, 14, readFloat(OFF_FLASH_IM2 + 4));

  // FlashEngineVeloIm1 → NRPN IMVelo1(5), IMVelo2(7), IMVelo3(9), IMVelo4(11)
  addNrpn(0, 5, readFloat(OFF_FLASH_VELO_IM1));
  addNrpn(0, 7, readFloat(OFF_FLASH_VELO_IM1 + 4));
  addNrpn(0, 9, readFloat(OFF_FLASH_VELO_IM1 + 8));
  addNrpn(0, 11, readFloat(OFF_FLASH_VELO_IM1 + 12));

  // FlashEngineVeloIm2 → NRPN IMVelo5(13), IMVelo6(15)
  addNrpn(0, 13, readFloat(OFF_FLASH_VELO_IM2));
  addNrpn(0, 15, readFloat(OFF_FLASH_VELO_IM2 + 4));

  // Mix/Pan → NRPN 16-27 (MSB=0, LSB=16-27)
  for (let i = 0; i < 12; i++) {
    addNrpn(0, 16 + i, readFloat(OFF_MIX1 + i * 4));
  }

  // Arpeggiator → NRPN 28-35 (MSB=0, LSB=28-35)
  for (let i = 0; i < 4; i++) {
    addNrpn(0, 28 + i, readFloat(OFF_ARP1 + i * 4));
  }
  for (let i = 0; i < 4; i++) {
    addNrpn(0, 32 + i, readFloat(OFF_ARP2 + i * 4));
  }

  // Filter/Effect → NRPN 40-43 (MSB=0, LSB=40-43)
  for (let i = 0; i < 4; i++) {
    addNrpn(0, 40 + i, readFloat(OFF_EFFECT + i * 4));
  }

  // Oscillators + Envelopes → NRPN 44-115 (MSB=0, LSB=44-115)
  // Osc1-6: 24 values (44-67)
  for (let i = 0; i < 24; i++) {
    addNrpn(0, 44 + i, readFloat(OFF_OSC1 + i * 4));
  }
  // Env1-6: 48 values (68-115)
  for (let i = 0; i < 48; i++) {
    addNrpn(0, 68 + i, readFloat(OFF_ENV1A + i * 4));
  }

  // Matrix → NRPN 116-163
  // Rows 1-3: MSB=0, LSB=116-127
  for (let i = 0; i < 12; i++) {
    addNrpn(0, 116 + i, readFloat(OFF_MATRIX1 + i * 4));
  }
  // Rows 4-12: MSB=1, LSB=0-35
  for (let i = 0; i < 36; i++) {
    addNrpn(1, i, readFloat(OFF_MATRIX1 + (12 + i) * 4));
  }

  // LFOs → MSB=1, LSB=40-51
  for (let i = 0; i < 12; i++) {
    addNrpn(1, 40 + i, readFloat(OFF_LFO_OSC1 + i * 4));
  }

  // LFO Env1 → MSB=1, LSB=52-55
  for (let i = 0; i < 4; i++) {
    addNrpn(1, 52 + i, readFloat(OFF_LFO_ENV1 + i * 4));
  }

  // LFO Env2 → MSB=1, LSB=56-59
  for (let i = 0; i < 4; i++) {
    addNrpn(1, 56 + i, readFloat(OFF_LFO_ENV2 + i * 4));
  }

  // StepSeq1 params → MSB=1, LSB=60-63
  for (let i = 0; i < 4; i++) {
    addNrpn(1, 60 + i, readFloat(OFF_LFO_SEQ1 + i * 4));
  }

  // StepSeq2 params → MSB=1, LSB=64-67
  for (let i = 0; i < 4; i++) {
    addNrpn(1, 64 + i, readFloat(OFF_LFO_SEQ2 + i * 4));
  }

  // LFO Phases → MSB=1, LSB=68-70
  for (let i = 0; i < 3; i++) {
    addNrpn(1, 68 + i, readFloat(OFF_LFO_PHASES + i * 4));
  }

  // Note Curves → MSB=0, LSB=200-207
  for (let i = 0; i < 4; i++) {
    addNrpn(0, 200 + i, readFloat(OFF_NOTE_CURVE1 + i * 4));
  }
  for (let i = 0; i < 4; i++) {
    addNrpn(0, 204 + i, readFloat(OFF_NOTE_CURVE2 + i * 4));
  }

  // Step Seq Steps: MSB=2 (seq1) and MSB=3 (seq2), LSB=0-15
  for (let i = 0; i < 16; i++) {
    const step1 = data[OFF_STEPS1 + i]; // char value 0-15
    addNrpn(2, i, step1);
  }
  for (let i = 0; i < 16; i++) {
    const step2 = data[OFF_STEPS2 + i]; // char value 0-15
    addNrpn(3, i, step2);
  }

  // Preset name → MSB=1, LSB=100-111
  for (let i = 0; i < 12; i++) {
    const charCode = data[OFF_PRESET_NAME + i];
    if (charCode === 0) break;
    parser.addNRPN({
      paramMSB: 1,
      paramLSB: 100 + i,
      valueMSB: (charCode >> 7) & 0x7F,
      valueLSB: charCode & 0x7F,
    });
  }

  const patch = parser.toPatch();

  // ── Fix Filter 2 (effect2) ──────────────────────────────────────────────────
  // The parser reads filter2 at MSB=0 LSB=44-47 which conflicts with osc1.
  // Read filter2 directly from its dedicated flash offset (920) instead.
  const f2TypeRaw = readFloat(OFF_EFFECT2);
  const f2Param1Raw = readFloat(OFF_EFFECT2 + 4);
  const f2Param2Raw = readFloat(OFF_EFFECT2 + 8);
  const f2GainRaw = readFloat(OFF_EFFECT2 + 12);
  const isFilter2Present = !(f2TypeRaw === 0 && f2Param1Raw === 0 && f2Param2Raw === 0 && f2GainRaw === 0);
  if (patch.filters && patch.filters.length >= 2) {
    if (isFilter2Present) {
      const typeIdx2 = Math.max(0, Math.min(FILTER2_TYPE_LIST.length - 1, Math.round(f2TypeRaw)));
      patch.filters[1] = {
        type: FILTER2_TYPE_LIST[typeIdx2] || 'OFF',
        param1: Math.max(0, Math.min(1, f2Param1Raw * 0.01)),
        param2: Math.max(0, Math.min(1, f2Param2Raw * 0.01)),
        gain: Math.max(0, Math.min(1, f2GainRaw * 0.01)),
      };
    } else {
      // Zeroed effect2 → firmware defaults: OFF, 0.5, 0.5, 1.0
      patch.filters[1] = { type: 'OFF', param1: 0.5, param2: 0.5, gain: 1.0 };
    }
  }

  return patch;
}

/**
 * Download a Patch as a single-preset .patch file (1024 bytes FlashSynthParams).
 * Uses File System Access API if available, otherwise falls back to <a download>.
 */
export async function downloadPatchFile(patch: Patch): Promise<void> {
  const binary = patchToFlashSynthParams(patch);
  const fileName = `${(patch.name || 'patch').trim().replace(/[^a-zA-Z0-9_-]/g, '_')}.patch`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{
          description: 'PreenFM3 Preset',
          accept: { 'application/octet-stream': ['.patch'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(binary);
      await writable.close();
      return;
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // user cancelled
      // fallthrough to download
    }
  }

  // Fallback: <a download>
  const blob = new Blob([binary], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Load a .patch file (1024-byte FlashSynthParams binary) and parse it into a Patch.
 */
export function loadPatchFile(data: ArrayBuffer): Patch {
  if (data.byteLength < PRESET_SIZE) {
    throw new Error(`Fichier .patch trop petit : ${data.byteLength} octets (attendu ${PRESET_SIZE})`);
  }
  const bytes = new Uint8Array(data, 0, PRESET_SIZE);
  return flashSynthParamsToPatch(bytes);
}

// ── NRPN message generation for MIDI push ─────────────────────────────────────

interface NRPNMsg {
  paramMSB: number;
  paramLSB: number;
  valueMSB: number;
  valueLSB: number;
}

function nrpnMsg(paramMSB: number, paramLSB: number, value: number): NRPNMsg {
  const v = Math.max(0, Math.round(value));
  return {
    paramMSB,
    paramLSB,
    valueMSB: (v >> 7) & 0x7F,
    valueLSB: v & 0x7F,
  };
}

/**
 * Convert a Patch into an ordered array of NRPN messages ready to be sent
 * to the PreenFM3 via MIDI.
 *
 * The NRPN address space mirrors the parser's toPatch() mapping:
 *   MSB=0, LSB 0-3:     Engine1 (algo, velocity, playMode, glide)
 *   MSB=0, LSB 4-15:    IM/Velo (im1, velo1, im2, velo2, …, im6, velo6)
 *   MSB=0, LSB 16-27:   Mix/Pan (mix1, pan1, …, mix6, pan6)
 *   MSB=0, LSB 28-35:   Arp (clock, BPM, direction, octave, pattern, division, duration, latch)
 *   MSB=0, LSB 40-43:   Filter (type, param1, param2, gain)
 *   MSB=0, LSB 44-67:   Osc1-6 (shape, freqType, freq, detune × 6)
 *   MSB=0, LSB 68-115:  Env1-6 (8 values × 6: atkT, atkL, decT, decL, susT, susL, relT, relL)
 *   MSB=0, LSB 116-127: Matrix rows 1-3 (source, mul, dest1, dest2 × 3)
 *   MSB=1, LSB 0-35:    Matrix rows 4-12 (source, mul, dest1, dest2 × 9)
 *   MSB=1, LSB 40-51:   LFO1-3 (shape, freq, bias, keysync × 3)
 *   MSB=1, LSB 52-55:   LFO Env1 (attack, decay, sustain, release)
 *   MSB=1, LSB 56-59:   LFO Env2 (silence, attack, decay, loop)
 *   MSB=1, LSB 60-63:   StepSeq1 params (bpm, gate, unused, unused)
 *   MSB=1, LSB 64-67:   StepSeq2 params (bpm, gate, unused, unused)
 *   MSB=1, LSB 68-70:   LFO Phases
 *   MSB=1, LSB 100-111: Preset Name (12 chars)
 *   MSB=0, LSB 200-207: Note Curves 1 & 2
 *   MSB=2, LSB 0-15:    StepSeq1 steps
 *   MSB=3, LSB 0-15:    StepSeq2 steps
 */
export function patchToNRPNMessages(patch: Patch): NRPNMsg[] {
  const msgs: NRPNMsg[] = [];
  const algoIndex = getAlgorithmIndex(patch);

  // ── Engine1 ─────────────────────────────────────────────────────────────────
  msgs.push(nrpnMsg(0, 0, algoIndex));
  msgs.push(nrpnMsg(0, 1, patch.global.velocitySensitivity));
  msgs.push(nrpnMsg(0, 2, patch.global.polyphony));
  msgs.push(nrpnMsg(0, 3, patch.global.glideTime));

  // ── IM / Velo (interleaved) ─────────────────────────────────────────────────
  const { ims, imVelos } = extractIMValues(patch);
  // LSB 4-15: im1, velo1, im2, velo2, im3, velo3, im4, velo4, im5, velo5, im6, velo6
  for (let i = 0; i < 6; i++) {
    msgs.push(nrpnMsg(0, 4 + i * 2, ims[i]));
    msgs.push(nrpnMsg(0, 5 + i * 2, imVelos[i]));
  }

  // ── Mix / Pan ───────────────────────────────────────────────────────────────
  const { mixes, pans } = buildMixPanSlots(patch);
  for (let i = 0; i < 6; i++) {
    msgs.push(nrpnMsg(0, 16 + i * 2, mixes[i]));
    msgs.push(nrpnMsg(0, 17 + i * 2, pans[i]));
  }

  // ── Arpeggiator ─────────────────────────────────────────────────────────────
  const arp = patch.arpeggiator;
  msgs.push(nrpnMsg(0, 28, indexOf(ARP_CLOCKS, arp.clockSource)));  // clock source (Off/Int/Ext)
  msgs.push(nrpnMsg(0, 29, arp.clock));    // BPM
  msgs.push(nrpnMsg(0, 30, indexOf(ARP_DIRECTIONS, arp.direction)));
  msgs.push(nrpnMsg(0, 31, arp.octave));
  msgs.push(nrpnMsg(0, 32, indexOf(ARP_PATTERNS, arp.pattern)));
  msgs.push(nrpnMsg(0, 33, indexOf(ARP_DIVISIONS, arp.division, 12)));
  msgs.push(nrpnMsg(0, 34, indexOf(ARP_DURATIONS, arp.duration, 12)));
  msgs.push(nrpnMsg(0, 35, indexOf(ARP_LATCH, arp.latch)));

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filter1 = patch.filters?.[0];
  if (filter1) {
    let typeIdx = FILTER1_TYPE_LIST.indexOf(filter1.type as typeof FILTER1_TYPE_LIST[number]);
    if (typeIdx < 0) {
      typeIdx = FILTER2_TYPE_LIST.indexOf(filter1.type as typeof FILTER2_TYPE_LIST[number]);
      if (typeIdx < 0) typeIdx = 0;
    }
    msgs.push(nrpnMsg(0, 40, typeIdx));
    msgs.push(nrpnMsg(0, 41, filter1.param1 * 100));
    msgs.push(nrpnMsg(0, 42, filter1.param2 * 100));
    msgs.push(nrpnMsg(0, 43, filter1.gain * 100));
  }

  // ── Filter 2 (LSB 44-47 — wait, 44 starts Osc!) ────────────────────────────
  // NOTE: Filter2 is on LSB 44-47 in the NRPN send space?
  // Actually no — the parser reads filter2 at baseLsb = 40 + i*4 where i=1 → LSB 44.
  // But LSB 44 is also OPERATOR1_SHAPE... The firmware must use a different address
  // for filter2 in NRPN vs flash. Let's check the parser:
  // filter1: baseLsb=40 → OK
  // filter2: baseLsb=44 → conflicts with osc1!
  // This is actually correct per the parser code which reads filters at [0,40-47]
  // and osc at [0,44-67]. There IS an overlap at 44-47 between filter2 and osc1.
  // Looking more carefully at the parser, filter2 uses baseLsb = 40 + 1*4 = 44,
  // but osc1 also uses oscRowBase = 44 + 0*4 = 44. This appears to be a parser bug
  // or the firmware shares those addresses. For safety, let's only send filter1
  // and osc1-6 (the oscillator params will overwrite filter2 if they share the space).

  // ── Oscillators ─────────────────────────────────────────────────────────────
  for (let i = 0; i < 6; i++) {
    const op = patch.operators.find(o => o.id === i + 1);
    if (!op) continue;
    const baseLsb = 44 + i * 4;
    const shape = getWaveformId(op.waveform);
    let freqType: number;
    if (op.keyboardTracking === 0) freqType = 1;
    else if (op.keyboardTracking === 1) freqType = 0;
    else freqType = 2;
    const freqMul = Math.round(op.frequency * 100);
    const detune = Math.round(op.detune * 100) + 1600;
    msgs.push(nrpnMsg(0, baseLsb, shape));
    msgs.push(nrpnMsg(0, baseLsb + 1, freqType));
    msgs.push(nrpnMsg(0, baseLsb + 2, freqMul));
    msgs.push(nrpnMsg(0, baseLsb + 3, detune));
  }

  // ── Envelopes ───────────────────────────────────────────────────────────────
  for (let i = 0; i < 6; i++) {
    const op = patch.operators.find(o => o.id === i + 1);
    if (!op) continue;
    const baseLsb = 68 + i * 8;
    const { adsr } = op;
    const atkTimeRel = Math.round(adsr.attack.time * 100);
    const decTimeRel = Math.round((adsr.decay.time - adsr.attack.time) * 100);
    const susTimeRel = Math.round((adsr.sustain.time - adsr.decay.time) * 100);
    const relTimeRel = Math.round((adsr.release.time - adsr.sustain.time) * 100);
    msgs.push(nrpnMsg(0, baseLsb, atkTimeRel));
    msgs.push(nrpnMsg(0, baseLsb + 1, adsr.attack.level));
    msgs.push(nrpnMsg(0, baseLsb + 2, decTimeRel));
    msgs.push(nrpnMsg(0, baseLsb + 3, adsr.decay.level));
    msgs.push(nrpnMsg(0, baseLsb + 4, susTimeRel));
    msgs.push(nrpnMsg(0, baseLsb + 5, adsr.sustain.level));
    msgs.push(nrpnMsg(0, baseLsb + 6, relTimeRel));
    msgs.push(nrpnMsg(0, baseLsb + 7, adsr.release.level));
  }

  // ── Modulation Matrix ───────────────────────────────────────────────────────
  const matrix = patch.modulationMatrix ?? [];
  for (let row = 0; row < 12; row++) {
    const entry = matrix[row];
    const source = entry ? indexOf(MATRIX_SOURCE_NAMES, entry.source) : 0;
    const mul = entry ? Math.round(entry.amount * 100) + 1000 : 1000;
    const dest1 = entry ? indexOf(MATRIX_DEST_NAMES, entry.destination1) : 0;
    const dest2 = entry ? indexOf(MATRIX_DEST_NAMES, entry.destination2) : 0;
    if (row < 3) {
      // Rows 1-3: MSB=0, LSB=116+row*4
      const baseLsb = 116 + row * 4;
      msgs.push(nrpnMsg(0, baseLsb, source));
      msgs.push(nrpnMsg(0, baseLsb + 1, mul));
      msgs.push(nrpnMsg(0, baseLsb + 2, dest1));
      msgs.push(nrpnMsg(0, baseLsb + 3, dest2));
    } else {
      // Rows 4-12: MSB=1, LSB=(row-3)*4
      const baseLsb = (row - 3) * 4;
      msgs.push(nrpnMsg(1, baseLsb, source));
      msgs.push(nrpnMsg(1, baseLsb + 1, mul));
      msgs.push(nrpnMsg(1, baseLsb + 2, dest1));
      msgs.push(nrpnMsg(1, baseLsb + 3, dest2));
    }
  }

  // ── LFOs ────────────────────────────────────────────────────────────────────
  const lfos = patch.lfos ?? [
    { shape: 'LFO_SIN' as const, syncMode: 'Int' as const, frequency: 5, midiClockMode: 'MC' as const, phase: 0, bias: 0, keysync: 'Off' as const },
    { shape: 'LFO_SIN' as const, syncMode: 'Int' as const, frequency: 5, midiClockMode: 'MC' as const, phase: 0, bias: 0, keysync: 'Off' as const },
    { shape: 'LFO_SIN' as const, syncMode: 'Int' as const, frequency: 5, midiClockMode: 'MC' as const, phase: 0, bias: 0, keysync: 'Off' as const },
  ];
  for (let i = 0; i < 3; i++) {
    const lfo = lfos[i];
    const baseLsb = 40 + i * 4;
    msgs.push(nrpnMsg(1, baseLsb, encodeLfoShape(lfo.shape)));
    msgs.push(nrpnMsg(1, baseLsb + 1, lfo.syncMode === 'Ext'
      ? lfoFrequencyToNrpn(lfo.midiClockMode)
      : lfoFrequencyToNrpn(lfo.frequency)));
    msgs.push(nrpnMsg(1, baseLsb + 2, encodeLfoBias(lfo.bias)));
    msgs.push(nrpnMsg(1, baseLsb + 3, encodeLfoKeysync(lfo.keysync)));
  }

  // ── LFO Env1 (MSB=1, LSB=52-55) ────────────────────────────────────────────
  const lfoEnv1 = patch.lfoEnvelopes?.[0];
  if (lfoEnv1) {
    msgs.push(nrpnMsg(1, 52, lfoEnv1.adsr.attack.time * 100));
    msgs.push(nrpnMsg(1, 53, lfoEnv1.adsr.decay.time * 100));
    msgs.push(nrpnMsg(1, 54, lfoEnv1.adsr.sustain.time * 100));
    msgs.push(nrpnMsg(1, 55, lfoEnv1.adsr.release.time * 100));
  }

  // ── LFO Env2 (MSB=1, LSB=56-59) ────────────────────────────────────────────
  const lfoEnv2 = patch.lfoEnvelopes?.[1];
  if (lfoEnv2) {
    const loopModes = ['Off', 'Silence', 'Attack'] as const;
    const loopVal = loopModes.indexOf(lfoEnv2.loopMode);
    msgs.push(nrpnMsg(1, 56, lfoEnv2.silence * 100));
    msgs.push(nrpnMsg(1, 57, lfoEnv2.adsr.attack.time * 100));
    msgs.push(nrpnMsg(1, 58, lfoEnv2.adsr.decay.time * 100));
    msgs.push(nrpnMsg(1, 59, loopVal >= 0 ? loopVal : 0));
  }

  // ── StepSeq params ──────────────────────────────────────────────────────────
  const seqs = patch.stepSequencers;
  if (seqs) {
    msgs.push(nrpnMsg(1, 60, seqs[0].bpm));
    msgs.push(nrpnMsg(1, 61, seqs[0].gate * 100));
    msgs.push(nrpnMsg(1, 62, seqs[1].gate * 100));
    msgs.push(nrpnMsg(1, 63, 0));  // unused
    msgs.push(nrpnMsg(1, 64, seqs[1].bpm));
    msgs.push(nrpnMsg(1, 65, 0));  // unused
    msgs.push(nrpnMsg(1, 66, 0));  // unused
    msgs.push(nrpnMsg(1, 67, 0));  // unused
  }

  // ── LFO Phases (MSB=1, LSB=68-70) ──────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    msgs.push(nrpnMsg(1, 68 + i, (lfos[i]?.phase ?? 0) * 100));
  }

  // ── Preset Name (MSB=1, LSB=100-111) ───────────────────────────────────────
  const name = (patch.name || 'Init').substring(0, 12);
  for (let i = 0; i < 12; i++) {
    const charCode = i < name.length ? name.charCodeAt(i) : 0;
    msgs.push(nrpnMsg(1, 100 + i, charCode));
  }

  // ── Note Curves (MSB=0, LSB=200-207) ───────────────────────────────────────
  const noteCurves = patch.noteCurves ?? [
    { before: 'Flat' as NoteCurveType, breakNote: 60, after: 'Flat' as NoteCurveType },
    { before: 'Flat' as NoteCurveType, breakNote: 60, after: 'Flat' as NoteCurveType },
  ];
  for (let i = 0; i < 2; i++) {
    const nc = noteCurves[i];
    const baseLsb = 200 + i * 4;
    msgs.push(nrpnMsg(0, baseLsb, NOTE_CURVE_TYPE_TO_NRPN[nc.before] ?? 0));
    msgs.push(nrpnMsg(0, baseLsb + 1, nc.breakNote));
    msgs.push(nrpnMsg(0, baseLsb + 2, NOTE_CURVE_TYPE_TO_NRPN[nc.after] ?? 0));
    msgs.push(nrpnMsg(0, baseLsb + 3, 0)); // unused
  }

  // ── StepSeq Steps (MSB=2/3, LSB=0-15) ──────────────────────────────────────
  if (seqs) {
    for (let s = 0; s < 2; s++) {
      const msbSeq = s + 2; // MSB=2 for seq1, MSB=3 for seq2
      for (let i = 0; i < 16; i++) {
        const uiValue = seqs[s].steps[i] ?? 50;
        const firmwareValue = Math.round((uiValue * 15) / 100);
        msgs.push(nrpnMsg(msbSeq, i, firmwareValue));
      }
    }
  }

  return msgs;
}
