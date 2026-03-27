/**
 * PreenFM3 Firmware Constants — Single Source of Truth
 *
 * All named values that map directly to PreenFM3 firmware enums/arrays live
 * here. Other modules import (and optionally re-export) from this file so
 * that unchanged consumers do not need to update their import paths.
 *
 * This file has NO imports from the rest of the application.
 */

// ============================================================================
// Standard MIDI CC
// ============================================================================

export const MIDI_CC = {
  BANK_SELECT:     0,
  BANK_SELECT_LSB: 32,
  MODWHEEL:        1,
  BREATH:          2,
  HOLD_PEDAL:      64,
  ALL_NOTES_OFF:   123,
  ALL_SOUND_OFF:   120,
  OMNI_OFF:        124,
  OMNI_ON:         125,
  RESET:           127,
  CURRENT_INSTRUMENT: 119,
} as const;

// ============================================================================
// PreenFM3 Control Changes
// Ground truth from firmware/Src/midi/MidiDecoder.h
// ============================================================================

export const PREENFM3_CC = {
  // Engine
  ALGO: 16,

  // Modulation Indices — CC_IM1-5 = 17-21
  IM1: 17,
  IM_FEEDBACK: 30,

  // Oscillator Mix and Pan (INTERLEAVED) — CC_MIX1/PAN1 = 22/23 …
  MIX1: 22, PAN1: 23,
  MIX2: 24, PAN2: 25,
  MIX3: 26, PAN3: 27,
  MIX4: 28, PAN4: 29,

  // Master FX (Global Channel) — CC_MFX_* = 40-45
  MFX_PRESET:       40,
  MFX_PREDELAYTIME: 41,
  MFX_PREDELAYMIX:  42,
  MFX_INPUTTILT:    43,
  MFX_MOD_SPEED:    44,
  MFX_MOD_DEPTH:    45,

  // Matrix Row Multipliers — CC_MATRIXROW*_MUL = 46-49
  MATRIXROW1_MUL: 46,
  MATRIXROW2_MUL: 47,
  MATRIXROW3_MUL: 48,
  MATRIXROW4_MUL: 49,

  // Oscillator Frequency — CC_OSC*_FREQ = 50-55
  OSC1_FREQ: 50, OSC2_FREQ: 51, OSC3_FREQ: 52,
  OSC4_FREQ: 53, OSC5_FREQ: 54, OSC6_FREQ: 55,

  // LFO Frequency — CC_LFO*_FREQ = 56-58
  LFO1_FREQ: 56, LFO2_FREQ: 57, LFO3_FREQ: 58,

  // LFO Envelope 2 Silence
  LFO_ENV2_SILENCE: 59,

  // Step Sequencer Gate
  STEPSEQ5_GATE: 60,
  STEPSEQ6_GATE: 61,

  // Envelope Attack/Release all modulators
  ENV_ATK_ALL_MODULATOR: 62,
  ENV_REL_ALL_MODULATOR: 63,

  // Envelope Attack per operator
  ENV_ATK_OP1: 65,
  ENV_ATK_OP2: 75, ENV_ATK_OP3: 76, ENV_ATK_OP4: 77,
  ENV_ATK_OP5: 78, ENV_ATK_OP6: 79,
  ENV_ATK_ALL_CARRIER: 80,
  ENV_REL_ALL_CARRIER: 81,

  // Envelope Release per operator — CC_ENV_REL_OP1-6 = 82-87
  ENV_REL_OP1: 82, ENV_REL_OP2: 83, ENV_REL_OP3: 84,
  ENV_REL_OP4: 85, ENV_REL_OP5: 86, ENV_REL_OP6: 87,

  // LFO Phase — CC_LFO*_PHASE = 88-90
  LFO1_PHASE: 88, LFO2_PHASE: 89, LFO3_PHASE: 90,

  // LFO Bias — CC_LFO*_BIAS = 91-93
  LFO1_BIAS: 91, LFO2_BIAS: 92, LFO3_BIAS: 93,

  // LFO Shape — CC_LFO*_SHAPE = 94-96
  LFO1_SHAPE: 94, LFO2_SHAPE: 95, LFO3_SHAPE: 96,

  // Arpeggiator — CC_ARP_* = 100-105
  ARP_CLOCK:     100,
  ARP_DIRECTION: 101,
  ARP_OCTAVE:    102,
  ARP_PATTERN:   103,
  ARP_DIVISION:  104,
  ARP_DURATION:  105,

  // Sequencer Control — CC_SEQ_* = 106-110
  SEQ_START_ALL:    106,
  SEQ_START_INST:   107,
  SEQ_RECORD_INST:  108,
  SEQ_SET_SEQUENCE: 109,
  SEQ_TRANSPOSE:    110,

  // Matrix Sources (Performance params) — CC_MATRIX_SOURCE_CC* = 115-118
  MATRIX_SOURCE_CC1: 115,
  MATRIX_SOURCE_CC2: 116,
  MATRIX_SOURCE_CC3: 117,
  MATRIX_SOURCE_CC4: 118,

  // Filter 1 CC — CC_FILTER_* = 70-73
  FILTER_TYPE:   70,
  FILTER_PARAM1: 71,
  FILTER_PARAM2: 72,
  FILTER_GAIN:   73,

  // Filter 2 CC — CC_FILTER2_* = 66-69
  FILTER2_TYPE:   66,
  FILTER2_PARAM1: 67,
  FILTER2_PARAM2: 68,
  FILTER2_MIX:    69,

  // MPE
  MPE_SLIDE_CC74: 74,

  // Unison — CC_UNISON_DETUNE/SPREAD = 13/14
  UNISON_DETUNE: 13,
  UNISON_SPREAD: 14,

  // Mixer — hardware encoders only, BLOCKED in sendCC()
  MIXER_VOLUME: 7,
  MIXER_PAN:    10,
  MIXER_SEND:   11,
} as const;

// ============================================================================
// NRPN
// ============================================================================

export interface NRPNMessage {
  paramMSB: number;  // CC 99
  paramLSB: number;  // CC 98
  valueMSB: number;  // CC 6
  valueLSB: number;  // CC 38
}

export const NRPN_COMMANDS = {
  REQUEST_PATCH_DUMP: { paramMSB: 127, paramLSB: 127 },
  PRESET_NAME_START:  { paramMSB: 1,   paramLSB: 100 },
  PRESET_NAME_END:    { paramMSB: 1,   paramLSB: 111 },
  STEPSEQ1: { paramMSB: 2 },
  STEPSEQ2: { paramMSB: 3 },
} as const;

export const MidiConfig = {
  RECEIVES_NONE: 0,
  RECEIVES_CC:   1,
  RECEIVES_NRPN: 2,
  RECEIVES_BOTH: 3,
  SENDS_NONE:    0,
  SENDS_CC:      1,
  SENDS_NRPN:    2,
} as const;

export const MatrixSource = {
  AFTERTOUCH:      0,
  PITCHBEND:       1,
  MODWHEEL:        2,
  BREATH:          3,
  USER_CC1:        4,
  USER_CC2:        5,
  USER_CC3:        6,
  USER_CC4:        7,
  AFTERTOUCH_MPE:  8,
  PITCHBEND_MPE:   9,
  MPESLIDE:       10,
} as const;

// ============================================================================
// Modulation Matrix — SourceEnum / DestinationEnum
// ============================================================================

export const MATRIX_SOURCE_NAMES = [
  'None',       // 0  - MATRIX_SOURCE_NONE
  'LFO 1',      // 1  - MATRIX_SOURCE_LFO1
  'LFO 2',      // 2  - MATRIX_SOURCE_LFO2
  'LFO 3',      // 3  - MATRIX_SOURCE_LFO3
  'LFOEnv1',    // 4  - MATRIX_SOURCE_LFOENV1
  'LFOEnv2',    // 5  - MATRIX_SOURCE_LFOENV2
  'LFOSeq1',    // 6  - MATRIX_SOURCE_LFOSEQ1
  'LFOSeq2',    // 7  - MATRIX_SOURCE_LFOSEQ2
  'Modwheel',   // 8  - MATRIX_SOURCE_MODWHEEL
  'Pitchbend',  // 9  - MATRIX_SOURCE_PITCHBEND
  'Aftertouch', // 10 - MATRIX_SOURCE_AFTERTOUCH
  'Velocity',   // 11 - MATRIX_SOURCE_VELOCITY
  'Note1',      // 12 - MATRIX_SOURCE_NOTE1
  'CC1',        // 13 - MATRIX_SOURCE_CC1
  'CC2',        // 14 - MATRIX_SOURCE_CC2
  'CC3',        // 15 - MATRIX_SOURCE_CC3
  'CC4',        // 16 - MATRIX_SOURCE_CC4
  'Note2',      // 17 - MATRIX_SOURCE_NOTE2
  'Breath',     // 18 - MATRIX_SOURCE_BREATH
  'MPE Slide',  // 19 - MATRIX_SOURCE_MPESLIDE
  'Random',     // 20 - MATRIX_SOURCE_RANDOM
  'Poly AT',    // 21 - MATRIX_SOURCE_POLYPHONIC_AFTERTOUCH
  'User CC1',   // 22 - MATRIX_SOURCE_USER_CC1
  'User CC2',   // 23 - MATRIX_SOURCE_USER_CC2
  'User CC3',   // 24 - MATRIX_SOURCE_USER_CC3
  'User CC4',   // 25 - MATRIX_SOURCE_USER_CC4
  'PB MPE',     // 26 - MATRIX_SOURCE_PITCHBEND_MPE
  'AT MPE',     // 27 - MATRIX_SOURCE_AFTERTOUCH_MPE
] as const;

export const MATRIX_DEST_NAMES = [
  'None',     // 0  - DESTINATION_NONE
  'Gate',     // 1  - MAIN_GATE
  'IM1',      // 2  - INDEX_MODULATION1
  'IM2',      // 3  - INDEX_MODULATION2
  'IM3',      // 4  - INDEX_MODULATION3
  'IM4',      // 5  - INDEX_MODULATION4
  'IM*',      // 6  - INDEX_ALL_MODULATION
  'Mix1',     // 7  - MIX_OSC1
  'Pan1',     // 8  - PAN_OSC1
  'Mix2',     // 9  - MIX_OSC2
  'Pan2',     // 10 - PAN_OSC2
  'Mix3',     // 11 - MIX_OSC3
  'Pan3',     // 12 - PAN_OSC3
  'Mix4',     // 13 - MIX_OSC4
  'Pan4',     // 14 - PAN_OSC4
  'Mix*',     // 15 - ALL_MIX
  'Pan*',     // 16 - ALL_PAN
  'o1 Fq',   // 17 - OSC1_FREQ
  'o2 Fq',   // 18 - OSC2_FREQ
  'o3 Fq',   // 19 - OSC3_FREQ
  'o4 Fq',   // 20 - OSC4_FREQ
  'o5 Fq',   // 21 - OSC5_FREQ
  'o6 Fq',   // 22 - OSC6_FREQ
  'o* Fq',   // 23 - ALL_OSC_FREQ
  'Env1 A',  // 24 - ENV1_ATTACK
  'Env2 A',  // 25 - ENV2_ATTACK
  'Env3 A',  // 26 - ENV3_ATTACK
  'Env4 A',  // 27 - ENV4_ATTACK
  'Env5 A',  // 28 - ENV5_ATTACK
  'Env6 A',  // 29 - ENV6_ATTACK
  'Env* A',  // 30 - ALL_ENV_ATTACK
  'Env* R',  // 31 - ALL_ENV_RELEASE
  'Mtx1 x',  // 32 - MTX1_MUL
  'Mtx2 x',  // 33 - MTX2_MUL
  'Mtx3 x',  // 34 - MTX3_MUL
  'Mtx4 x',  // 35 - MTX4_MUL
  'Lfo1 F',  // 36 - LFO1_FREQ
  'Lfo2 F',  // 37 - LFO2_FREQ
  'Lfo3 F',  // 38 - LFO3_FREQ
  'Env2 S',  // 39 - LFOENV2_SILENCE
  'Seq1 G',  // 40 - LFOSEQ1_GATE
  'Seq2 G',  // 41 - LFOSEQ2_GATE
  'Flt1 P1', // 42 - FILTER1_PARAM1
  'o* FqH',  // 43 - ALL_OSC_FREQ_HARM
  'Env* D',  // 44 - ALL_ENV_DECAY
  'EnvM A',  // 45 - ALL_ENV_ATTACK_MODULATOR
  'EnvM D',  // 46 - ALL_ENV_DECAY_MODULATOR
  'EnvM R',  // 47 - ALL_ENV_RELEASE_MODULATOR
  'Mtx FB',  // 48 - MTX_DEST_FEEDBACK
  'Flt1 P2', // 49 - FILTER1_PARAM2
  'Flt1 G',  // 50 - FILTER1_AMP
  'Flt2 P1', // 51 - FILTER2_PARAM1
  'Flt2 P2', // 52 - FILTER2_PARAM2
  'Flt2 G',  // 53 - FILTER2_AMP
] as const;

// ============================================================================
// Waveforms — oscShapeNames / oscShapeNamesOrder (FMDisplayEditor.cpp)
// ============================================================================

export type WaveformType =
  | 'SINE'        // id 0
  | 'SAW'         // id 1
  | 'SQUARE'      // id 2
  | 'SIN_SQUARED' // id 3
  | 'SIN_ZERO'    // id 4
  | 'SIN_POS'     // id 5
  | 'RAND'        // id 6
  | 'OFF'         // id 7
  | 'USER1'       // id 8
  | 'USER2'       // id 9
  | 'USER3'       // id 10
  | 'USER4'       // id 11
  | 'USER5'       // id 12
  | 'USER6';      // id 13

export interface WaveformItem {
  id:   number;
  name: WaveformType;
}

export const WAVEFORMS: WaveformItem[] = [
  { id: 7,  name: 'OFF'         },
  { id: 0,  name: 'SINE'        },
  { id: 1,  name: 'SAW'         },
  { id: 2,  name: 'SQUARE'      },
  { id: 3,  name: 'SIN_SQUARED' },
  { id: 4,  name: 'SIN_ZERO'    },
  { id: 5,  name: 'SIN_POS'     },
  { id: 6,  name: 'RAND'        },
  { id: 8,  name: 'USER1'       },
  { id: 9,  name: 'USER2'       },
  { id: 10, name: 'USER3'       },
  { id: 11, name: 'USER4'       },
  { id: 12, name: 'USER5'       },
  { id: 13, name: 'USER6'       },
];

// ============================================================================
// Envelope / ADSR curve types
// ============================================================================

export type CurveType = 'linear' | 'exponential' | 'logarithmic' | 'user1' | 'user2' | 'user3' | 'user4';
export const ADSR_CURVE_TYPES: CurveType[] = ['linear', 'exponential', 'logarithmic', 'user1', 'user2', 'user3', 'user4'];
export const ENV_CURVE_NAMES = ['Exp', 'Lin', 'Log', 'Usr1', 'Usr2', 'Usr3', 'Usr4'];

// ============================================================================
// Filter types — in firmware order
// ============================================================================

export const FILTER1_TYPE_LIST = [
  'OFF', 'MIXER', 'LP', 'HP', 'BASS', 'BP', 'CRUSHER',
  'LP2', 'HP2', 'BP2', 'LP3', 'HP3', 'BP3',
  'PEAK', 'NOTCH', 'BELL', 'LOWSHELF', 'HIGHSHELF',
  'LPHP', 'BPds', 'LPWS', 'TILT', 'STEREO',
  'SAT', 'SIGMOID', 'FOLD', 'WRAP', 'XOR',
  'TEXTURE1', 'TEXTURE2', 'LPXOR', 'LPXOR2',
  'LPSIN', 'HPSIN', 'QUADNOTCH',
  'AP4', 'AP4B', 'AP4D',
  'ORYX', 'ORYX2', 'ORYX3',
  '18DB', 'LADDER', 'LADDER2', 'DIOD',
  'KRMG', 'TEEBEE', 'SVFLH', 'CRUSH2',
] as const;

export type Filter1Type = typeof FILTER1_TYPE_LIST[number];

export const FILTER2_TYPE_LIST = [
  'OFF', 'FLANGE', 'DIMENSION', 'CHORUS', 'WIDE',
  'DOUBLER', 'TRIPLER', 'BODE', 'DELAYCRUNCH',
  'PINGPONG', 'DIFFUSER', 'GRAIN1', 'GRAIN2',
  'STEREO_BP'
] as const;

export type Filter2Type = typeof FILTER2_TYPE_LIST[number];

// ============================================================================
// Arpeggiator — firmware enum values in order
// ============================================================================

export type ArpClock     = 'Off' | 'Int' | 'Ext';
export type ArpDirection = 'Up' | 'Down' | 'UpDown' | 'Played' | 'Random' | 'Chord' | 'Rotate U' | 'Rotate D' | 'Shift U' | 'Shift D';
export type ArpPattern   = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | 'Usr1' | 'Usr2' | 'Usr3' | 'Usr4';
export type ArpDivision  = '2/1' | '3/2' | '1/1' | '3/4' | '2/3' | '1/2' | '3/8' | '1/3' | '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32' | '1/48' | '1/96';
export type ArpDuration  = '2/1' | '3/2' | '1/1' | '3/4' | '2/3' | '1/2' | '3/8' | '1/3' | '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32' | '1/48' | '1/96';
export type ArpLatch     = 'Off' | 'On';

export const ARP_CLOCKS: ArpClock[] = ['Off', 'Int', 'Ext'];
export const ARP_DIRECTIONS: ArpDirection[] = [
  'Up', 'Down', 'UpDown', 'Played', 'Random', 'Chord', 'Rotate U', 'Rotate D', 'Shift U', 'Shift D',
];
export const ARP_PATTERNS: ArpPattern[] = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
  '21', '22', 'Usr1', 'Usr2', 'Usr3', 'Usr4',
];
export const ARP_DIVISIONS: ArpDivision[] = [
  '2/1', '3/2', '1/1', '3/4', '2/3', '1/2', '3/8', '1/3', '1/4',
  '1/6', '1/8', '1/12', '1/16', '1/24', '1/32', '1/48', '1/96',
];
export const ARP_DURATIONS: ArpDuration[] = [
  '2/1', '3/2', '1/1', '3/4', '2/3', '1/2', '3/8', '1/3', '1/4',
  '1/6', '1/8', '1/12', '1/16', '1/24', '1/32', '1/48', '1/96',
];
export const ARP_LATCH: ArpLatch[] = ['Off', 'On'];

// ============================================================================
// Note Curves — PreenFM2Controller official mapping (indices 0-6)
// ============================================================================

export const NoteCurveType = {
  Flat:          'Flat',
  PlusLinear:    '+Linear',
  PlusLinearx8:  '+Linear*8',
  PlusExp:       '+Exp',
  MinusLinear:   '-Linear',
  MinusLinearx8: '-Linear*8',
  MinusExp:      '-Exp',
} as const;

export type NoteCurveType = typeof NoteCurveType[keyof typeof NoteCurveType];

export const NOTE_CURVE_NRPN_MAPPING: Record<number, NoteCurveType> = {
  0: NoteCurveType.Flat,
  1: NoteCurveType.PlusLinear,
  2: NoteCurveType.PlusLinearx8,
  3: NoteCurveType.PlusExp,
  4: NoteCurveType.MinusLinear,
  5: NoteCurveType.MinusLinearx8,
  6: NoteCurveType.MinusExp,
};

export const NOTE_CURVE_TYPE_TO_NRPN: Record<NoteCurveType, number> = {
  [NoteCurveType.Flat]:          0,
  [NoteCurveType.PlusLinear]:    1,
  [NoteCurveType.PlusLinearx8]:  2,
  [NoteCurveType.PlusExp]:       3,
  [NoteCurveType.MinusLinear]:   4,
  [NoteCurveType.MinusLinearx8]: 5,
  [NoteCurveType.MinusExp]:      6,
};

export const NOTE_CURVE_TYPES_LIST: NoteCurveType[] = [
  NoteCurveType.Flat,
  NoteCurveType.PlusLinear,
  NoteCurveType.PlusLinearx8,
  NoteCurveType.PlusExp,
  NoteCurveType.MinusLinear,
  NoteCurveType.MinusLinearx8,
  NoteCurveType.MinusExp,
];

// ============================================================================
// LFO — SynthState.h
// ============================================================================

export type LfoType =
  | 'LFO_SIN'
  | 'LFO_SAW'
  | 'LFO_TRIANGLE'
  | 'LFO_SQUARE'
  | 'LFO_RANDOM'
  | 'LFO_BROWNIAN'
  | 'LFO_WANDERING'
  | 'LFO_FLOW';

export const LFO_TYPES: LfoType[] = [
  'LFO_SIN', 'LFO_SAW', 'LFO_TRIANGLE', 'LFO_SQUARE',
  'LFO_RANDOM', 'LFO_BROWNIAN', 'LFO_WANDERING', 'LFO_FLOW',
];

export const LFO_TYPE_LABELS: Record<LfoType, string> = {
  LFO_SIN:       'Sine',
  LFO_SAW:       'Saw',
  LFO_TRIANGLE:  'Triangle',
  LFO_SQUARE:    'Square',
  LFO_RANDOM:    'Random',
  LFO_BROWNIAN:  'Brownian',
  LFO_WANDERING: 'Wandering',
  LFO_FLOW:      'Flow',
};

// LFO NRPN encoding constants
export const LFO_FREQ_MAX_INTERNAL   = 9990;   // Max NRPN for internal freq (99.9 Hz)
export const LFO_FREQ_MIDI_CLOCK_BASE = 10000; // NRPN threshold for MIDI Clock modes
export const LFO_FREQ_SCALE_FACTOR   = 100;    // Freq stored as (Hz × 100)

export const LFO_BIAS_CENTER = 100; // NRPN value for 0.0 bias
export const LFO_BIAS_MIN    = 0;   // NRPN value for -1.0 bias
export const LFO_BIAS_MAX    = 200; // NRPN value for +1.0 bias
export const LFO_BIAS_RANGE  = 100; // Division factor

export const LFO_KEYSYNC_OFF_VALUE     = 0;
export const LFO_KEYSYNC_MIN_NRPN      = 1;
export const LFO_KEYSYNC_MAX_NRPN      = 1601;
export const LFO_KEYSYNC_SCALE_FACTOR  = 0.01;
export const LFO_KEYSYNC_OFFSET        = 0.01;

export const LFO_PHASE_MAX_NRPN    = 16383;
export const LFO_PHASE_MAX_DEGREES = 360;

export const LFO_SHAPE_MIN = 0;
export const LFO_SHAPE_MAX = 7;

// MIDI Clock sync modes (frequency > 99.9 Hz)
export type MidiClockMode =
  | 'MC/16' | 'MC/8' | 'MC/4' | 'MC/2'
  | 'MC'
  | 'MC*2'  | 'MC*3' | 'MC*4' | 'MC*8';

export const MIDI_CLOCK_MODES: MidiClockMode[] = [
  'MC/16', 'MC/8', 'MC/4', 'MC/2', 'MC', 'MC*2', 'MC*3', 'MC*4', 'MC*8',
];

export const MIDI_CLOCK_LABELS: Record<MidiClockMode, string> = {
  'MC/16': 'Clock ÷ 16',
  'MC/8':  'Clock ÷ 8',
  'MC/4':  'Clock ÷ 4',
  'MC/2':  'Clock ÷ 2',
  'MC':    'Clock',
  'MC*2':  'Clock × 2',
  'MC*3':  'Clock × 3',
  'MC*4':  'Clock × 4',
  'MC*8':  'Clock × 8',
};

export const MIDI_CLOCK_NRPN: Record<MidiClockMode, number> = {
  'MC/16': 10000,
  'MC/8':  10010,
  'MC/4':  10020,
  'MC/2':  10030,
  'MC':    10040,
  'MC*2':  10050,
  'MC*3':  10060,
  'MC*4':  10070,
  'MC*8':  10080,
};

// ============================================================================
// Step Sequencer MIDI Clock modes
// ============================================================================

export type StepSeqMidiClockMode =
  | 'C/16' | 'Ck/8' | 'Ck/4' | 'Ck/2'
  | 'Ck'
  | 'Ck*2' | 'Ck*3' | 'Ck*4' | 'Ck*8';

export const STEP_SEQ_MIDI_CLOCK_MODES: StepSeqMidiClockMode[] = [
  'C/16', 'Ck/8', 'Ck/4', 'Ck/2', 'Ck', 'Ck*2', 'Ck*3', 'Ck*4', 'Ck*8',
];
