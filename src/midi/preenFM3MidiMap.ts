/**
 * PreenFM3 MIDI Control Change and NRPN Mapping
 * Based on firmware/Src/midi/MidiDecoder.cpp
 * https://github.com/Ixox/preenfm3/blob/master/firmware/Src/midi/MidiDecoder.cpp
 */

// Standard MIDI CC
export const MIDI_CC = {
  BANK_SELECT: 0,
  BANK_SELECT_LSB: 32,
  MODWHEEL: 1,
  BREATH: 2,
  HOLD_PEDAL: 64,
  ALL_NOTES_OFF: 123,
  ALL_SOUND_OFF: 120,
  OMNI_OFF: 124,
  OMNI_ON: 125,
  RESET: 127,
  
  // PreenFM3 specific (values to be confirmed from firmware headers)
  CURRENT_INSTRUMENT: 119,
} as const;

// PreenFM3 Control Changes — ground truth from firmware/Src/midi/MidiDecoder.h
export const PREENFM3_CC = {
  // Engine
  ALGO: 16,              // CC_ALGO

  // Modulation Indices — CC_IM1-5 = 17-21
  IM1: 17,
  // IM2-IM5 computed as IM1 + (n-1) in sendIMChange
  IM_FEEDBACK: 30,       // CC_IM_FEEDBACK (not sent via CC)

  // Oscillator Mix and Pan (INTERLEAVED) — CC_MIX1/PAN1 = 22/23 …
  MIX1: 22,
  PAN1: 23,
  MIX2: 24,
  PAN2: 25,
  MIX3: 26,
  PAN3: 27,
  MIX4: 28,
  PAN4: 29,

  // Master FX (Global Channel) — CC_MFX_* = 40-45
  MFX_PRESET: 40,
  MFX_PREDELAYTIME: 41,
  MFX_PREDELAYMIX: 42,
  MFX_INPUTTILT: 43,
  MFX_MOD_SPEED: 44,
  MFX_MOD_DEPTH: 45,

  // Matrix Row Multipliers — CC_MATRIXROW*_MUL = 46-49
  MATRIXROW1_MUL: 46,
  MATRIXROW2_MUL: 47,
  MATRIXROW3_MUL: 48,
  MATRIXROW4_MUL: 49,

  // Oscillator Frequency — CC_OSC*_FREQ = 50-55
  OSC1_FREQ: 50,
  OSC2_FREQ: 51,
  OSC3_FREQ: 52,
  OSC4_FREQ: 53,
  OSC5_FREQ: 54,
  OSC6_FREQ: 55,

  // LFO Frequency — CC_LFO*_FREQ = 56-58
  LFO1_FREQ: 56,
  LFO2_FREQ: 57,
  LFO3_FREQ: 58,

  // LFO Envelope 2 Silence — CC_LFO_ENV2_SILENCE = 59
  LFO_ENV2_SILENCE: 59,

  // Step Sequencer Gate — CC_STEPSEQ5/6_GATE = 60-61
  STEPSEQ5_GATE: 60,
  STEPSEQ6_GATE: 61,

  // Envelope Attack/Release all — CC_ENV_ATK/REL_ALL_MODULATOR = 62/63
  ENV_ATK_ALL_MODULATOR: 62,
  ENV_REL_ALL_MODULATOR: 63,

  // Envelope Attack per operator — NOTE: OP1 is NOT contiguous with OP2-6!
  // CC_ENV_ATK_OP1 = 65, CC_ENV_ATK_OP2-6 = 75-79
  ENV_ATK_OP1: 65,
  ENV_ATK_OP2: 75,
  ENV_ATK_OP3: 76,
  ENV_ATK_OP4: 77,
  ENV_ATK_OP5: 78,
  ENV_ATK_OP6: 79,
  ENV_ATK_ALL_CARRIER: 80,  // CC_ENV_ATK_ALL_CARRIER
  ENV_REL_ALL_CARRIER: 81,  // CC_ENV_REL_ALL_CARRIER

  // Envelope Release per operator — CC_ENV_REL_OP1-6 = 82-87 (contiguous)
  ENV_REL_OP1: 82,
  ENV_REL_OP2: 83,
  ENV_REL_OP3: 84,
  ENV_REL_OP4: 85,
  ENV_REL_OP5: 86,
  ENV_REL_OP6: 87,

  // LFO Phase — CC_LFO*_PHASE = 88-90
  LFO1_PHASE: 88,
  LFO2_PHASE: 89,
  LFO3_PHASE: 90,

  // LFO Bias — CC_LFO*_BIAS = 91-93
  LFO1_BIAS: 91,
  LFO2_BIAS: 92,
  LFO3_BIAS: 93,

  // LFO Shape — CC_LFO*_SHAPE = 94-96
  LFO1_SHAPE: 94,
  LFO2_SHAPE: 95,
  LFO3_SHAPE: 96,

  // Arpeggiator — CC_ARP_* = 100-105 (no CC_ARP_LATCH in firmware; latch is NRPN only)
  ARP_CLOCK: 100,
  ARP_DIRECTION: 101,
  ARP_OCTAVE: 102,
  ARP_PATTERN: 103,
  ARP_DIVISION: 104,
  ARP_DURATION: 105,

  // Sequencer Control — CC_SEQ_* = 106-110
  SEQ_START_ALL: 106,
  SEQ_START_INST: 107,
  SEQ_RECORD_INST: 108,
  SEQ_SET_SEQUENCE: 109,
  SEQ_TRANSPOSE: 110,

  // Matrix Sources (Performance params) — CC_MATRIX_SOURCE_CC* = 115-118
  MATRIX_SOURCE_CC1: 115,
  MATRIX_SOURCE_CC2: 116,
  MATRIX_SOURCE_CC3: 117,
  MATRIX_SOURCE_CC4: 118,

  // Filter 1 CC (Note: filter sends use NRPN in this codebase) — CC_FILTER_* = 70-73
  FILTER_TYPE: 70,
  FILTER_PARAM1: 71,
  FILTER_PARAM2: 72,
  FILTER_GAIN: 73,

  // Filter 2 CC — CC_FILTER2_* = 66-69
  FILTER2_TYPE: 66,
  FILTER2_PARAM1: 67,
  FILTER2_PARAM2: 68,
  FILTER2_MIX: 69,

  // MPE
  MPE_SLIDE_CC74: 74,

  // Unison — CC_UNISON_DETUNE/SPREAD = 13/14
  UNISON_DETUNE: 13,
  UNISON_SPREAD: 14,

  // Mixer — CC_MIXER_* = 7/10/11 — hardware encoders only, BLOCKED in sendCC()
  MIXER_VOLUME: 7,
  MIXER_PAN: 10,
  MIXER_SEND: 11,
} as const;

/**
 * NRPN Structure for PreenFM3
 * NRPN uses 4 CC messages:
 * - CC 99: Parameter MSB
 * - CC 98: Parameter LSB
 * - CC 6: Value MSB
 * - CC 38: Value LSB
 * 
 * Global parameters (MSB=0):
 * - LSB 0: Algorithm (0-31 for 32 algorithms)
 * - LSB 1: Velocity (0-16)
 * - LSB 2: Voice (0-16, number of voices for current instrument)
 * - LSB 3: Glide (0-10)
 * - LSB 4-15: IM1-IM6 and velocities (see preenFM3Parser.ts)
 * 
 * Source: https://ixox.fr/preenfm2/preenfm/midi/
 */
export interface NRPNMessage {
  paramMSB: number;  // CC 99
  paramLSB: number;  // CC 98
  valueMSB: number;  // CC 6
  valueLSB: number;  // CC 38
}

/**
 * Special NRPN commands
 */
export const NRPN_COMMANDS = {
  // Request full patch as NRPN (MSB=127, LSB=127)
  REQUEST_PATCH_DUMP: { paramMSB: 127, paramLSB: 127 },
  
  // Preset name characters (MSB=1, LSB=100-111 for 12 characters)
  PRESET_NAME_START: { paramMSB: 1, paramLSB: 100 },
  PRESET_NAME_END: { paramMSB: 1, paramLSB: 111 },
  
  // Step sequencer (MSB=2-3, LSB=step number)
  STEPSEQ1: { paramMSB: 2 },
  STEPSEQ2: { paramMSB: 3 },
} as const;

/**
 * Configuration values for MIDI receive/send
 */
export const MidiConfig = {
  RECEIVES_NONE: 0,
  RECEIVES_CC: 1,      // Bit 0: Receive CC
  RECEIVES_NRPN: 2,    // Bit 1: Receive NRPN
  RECEIVES_BOTH: 3,    // Both CC and NRPN
  
  SENDS_NONE: 0,
  SENDS_CC: 1,
  SENDS_NRPN: 2,
} as const;

/**
 * Matrix Sources (for modulation destinations)
 */
export const MatrixSource = {
  AFTERTOUCH: 0,
  PITCHBEND: 1,
  MODWHEEL: 2,
  BREATH: 3,
  USER_CC1: 4,
  USER_CC2: 5,
  USER_CC3: 6,
  USER_CC4: 7,
  AFTERTOUCH_MPE: 8,
  PITCHBEND_MPE: 9,
  MPESLIDE: 10,
} as const;

/**
 * Helper to convert float value to 14-bit NRPN value
 */
export function floatToNRPN(value: number, min: number, max: number): { msb: number; lsb: number } {
  const scaled = Math.round(((value - min) / (max - min)) * 16383);
  const clamped = Math.max(0, Math.min(16383, scaled));
  return {
    msb: (clamped >> 7) & 0x7F,
    lsb: clamped & 0x7F
  };
}

/**
 * Helper to convert 14-bit NRPN value to float
 */
export function nrpnToFloat(msb: number, lsb: number, min: number, max: number): number {
  const value = (msb << 7) | lsb;
  return (value / 16383) * (max - min) + min;
}

/**
 * Helper to convert 0-127 CC value to float range
 */
export function ccToFloat(value: number, min: number, max: number): number {
  return (value / 127) * (max - min) + min;
}

/**
 * Helper to convert float to 0-127 CC value
 */
export function floatToCC(value: number, min: number, max: number): number {
  const scaled = Math.round(((value - min) / (max - min)) * 127);
  return Math.max(0, Math.min(127, scaled));
}

/**
 * Parameter scaling for IM values
 * PreenFM3 uses: value * 0.1 for IM1-IM5
 */
export function imToCC(im: number): number {
  return Math.round(im * 10); // IM 0-10 -> CC 0-100
}

export function ccToIM(cc: number): number {
  return cc * 0.1; // CC 0-100 -> IM 0-10
}
