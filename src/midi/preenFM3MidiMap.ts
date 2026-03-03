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

// PreenFM3 Control Changes (corrected through extensive empirical testing)
// Note: Mix and Pan are INTERLEAVED (not sequential)
export const PREENFM3_CC = {
  // Engine
  ALGO: 16,  // Algorithm selection (0-31 for 32 algorithms) - Confirmed from firmware CC_ALGO
  
  // Modulation Indices
  IM1: 21,
  // Note: IM2-IM6 mapping is uncertain and may overlap with Mix/Pan
  
  // Oscillator Mix and Pan (INTERLEAVED pattern!)
  // Mix uses EVEN CCs, Pan uses ODD CCs
  MIX1: 22,  // Mix Operator 1
  PAN1: 23,  // Pan Operator 1
  MIX2: 24,  // Mix Operator 2
  PAN2: 25,  // Pan Operator 2
  MIX3: 26,  // Mix Operator 3
  PAN3: 27,  // Pan Operator 3
  MIX4: 28,  // Mix Operator 4
  PAN4: 29,  // Pan Operator 4,
  
  // Oscillator Frequency
  OSC1_FREQ: 35,
  OSC2_FREQ: 36,
  OSC3_FREQ: 37,
  OSC4_FREQ: 38,
  OSC5_FREQ: 39,
  OSC6_FREQ: 40,
  
  // Matrix Rows
  MATRIXROW1_MUL: 41,
  MATRIXROW2_MUL: 42,
  MATRIXROW3_MUL: 43,
  MATRIXROW4_MUL: 44,
  
  // LFO Frequency
  LFO1_FREQ: 45,
  LFO2_FREQ: 46,
  LFO3_FREQ: 47,
  LFO_ENV2_SILENCE: 48,
  
  // Step Sequencer
  STEPSEQ5_GATE: 49,
  STEPSEQ6_GATE: 50,
  
  // Matrix Sources
  MATRIX_SOURCE_CC1: 51,
  MATRIX_SOURCE_CC2: 52,
  MATRIX_SOURCE_CC3: 53,
  MATRIX_SOURCE_CC4: 54,
  
  // Filter 1
  FILTER_TYPE: 55,
  FILTER_PARAM1: 56,
  FILTER_PARAM2: 57,
  FILTER_GAIN: 58,
  
  // Filter 2
  FILTER2_TYPE: 59,
  FILTER2_PARAM1: 60,
  FILTER2_PARAM2: 61,
  FILTER2_MIX: 62,
  
  // Envelopes Attack
  ENV_ATK_OP1: 70,
  ENV_ATK_OP2: 71,
  ENV_ATK_OP3: 72,
  ENV_ATK_OP4: 73,
  ENV_ATK_OP5: 74,
  ENV_ATK_OP6: 75,
  ENV_ATK_ALL_CARRIER: 76,
  ENV_ATK_ALL_MODULATOR: 77,
  
  // Envelopes Release
  ENV_REL_OP1: 80,
  ENV_REL_OP2: 81,
  ENV_REL_OP3: 82,
  ENV_REL_OP4: 83,
  ENV_REL_OP5: 84,
  ENV_REL_OP6: 85,
  ENV_REL_ALL_CARRIER: 86,
  ENV_REL_ALL_MODULATOR: 87,
  
  // LFO Phase
  LFO1_PHASE: 90,
  LFO2_PHASE: 91,
  LFO3_PHASE: 92,
  
  // LFO Bias
  LFO1_BIAS: 93,
  LFO2_BIAS: 94,
  LFO3_BIAS: 95,
  
  // LFO Shape
  LFO1_SHAPE: 96,
  LFO2_SHAPE: 97,
  LFO3_SHAPE: 98,
  
  // Arpeggiator
  ARP_CLOCK: 100,
  ARP_DIRECTION: 101,
  ARP_OCTAVE: 102,
  ARP_PATTERN: 103,
  ARP_DIVISION: 104,
  ARP_DURATION: 105,
  
  // Mixer
  MIXER_VOLUME: 106,
  MIXER_PAN: 107,
  MIXER_SEND: 108,
  
  // MPE
  MPE_SLIDE_CC74: 74,
  
  // Unison
  UNISON_DETUNE: 110,
  UNISON_SPREAD: 111,
  
  // Sequencer Control
  SEQ_START_ALL: 112,
  SEQ_START_INST: 113,
  SEQ_RECORD_INST: 114,
  SEQ_TRANSPOSE: 115,
  SEQ_SET_SEQUENCE: 116,
  
  // Master FX (Global Channel)
  MFX_PRESET: 63,
  MFX_PREDELAYTIME: 64,
  MFX_PREDELAYMIX: 65,
  MFX_INPUTTILT: 66,
  MFX_MOD_SPEED: 67,
  MFX_MOD_DEPTH: 68,
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
