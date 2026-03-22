import {
  FILTER2_TYPE_LIST
} from '../types/patch';
/**
 * Send Filter2 type to PreenFM3 via NRPN (MSB=1, LSB=116)
 */
export function sendFilter2Type(type: string, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for Filter2 type');
    return;
  }
  let filterValue = FILTER2_TYPE_LIST.indexOf(type as typeof FILTER2_TYPE_LIST[number]);
  if (filterValue === -1) {
    filterValue = 0;
  }
  const nrpn = {
    paramMSB: 1,
    paramLSB: 116,
    valueMSB: (filterValue >> 7) & 0x7F,
    valueLSB: filterValue & 0x7F
  };
  console.log(`📤 Sending Filter2 Type via NRPN: ${type} (${filterValue}) -> [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
  sendNRPN(nrpn, channel);
}

/**
 * Send Filter2 param1 (frequency/cutoff) to PreenFM3 via NRPN (MSB=1, LSB=117)
 */
export function sendFilter2Param1(value: number, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for Filter2 param1');
    return;
  }
  const nrpnValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const nrpn = {
    paramMSB: 1,
    paramLSB: 117,
    valueMSB: (nrpnValue >> 7) & 0x7F,
    valueLSB: nrpnValue & 0x7F
  };
  console.log(`📤 Sending Filter2 Param1 via NRPN: ${value} -> ${nrpnValue} -> [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
  sendNRPN(nrpn, channel);
}

/**
 * Send Filter2 param2 (resonance/Q) to PreenFM3 via NRPN (MSB=1, LSB=118)
 */
export function sendFilter2Param2(value: number, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for Filter2 param2');
    return;
  }
  const nrpnValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const nrpn = {
    paramMSB: 1,
    paramLSB: 118,
    valueMSB: (nrpnValue >> 7) & 0x7F,
    valueLSB: nrpnValue & 0x7F
  };
  console.log(`📤 Sending Filter2 Param2 via NRPN: ${value} -> ${nrpnValue} -> [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
  sendNRPN(nrpn, channel);
}

/**
 * Send Filter2 gain/mix to PreenFM3 via NRPN (MSB=1, LSB=119)
 */
export function sendFilter2Gain(value: number, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for Filter2 gain');
    return;
  }
  const nrpnValue = Math.round(Math.max(0, Math.min(2, value)) * 100);
  const nrpn = {
    paramMSB: 1,
    paramLSB: 119,
    valueMSB: (nrpnValue >> 7) & 0x7F,
    valueLSB: nrpnValue & 0x7F
  };
  console.log(`📤 Sending Filter2 Gain via NRPN: ${value} -> ${nrpnValue} -> [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
  sendNRPN(nrpn, channel);
}
import { encodeLfoBias } from '../types/lfo';
import { NoteCurveUtils } from '../types/patch';
import { ALGO_DIAGRAMS } from '../algo/algorithms.static';
/**
 * Envoie le mode midiClockMode du step sequencer via NRPN
 * @param seqIndex 0 ou 1 (Seq1 ou Seq2)
 * @param midiClockMode string ("Ck/4", "Ck/2", "Ck  ", "Ck*2", "Ck*4")
 * @param channel MIDI channel (défaut: currentChannel)
 * Mapping PreenFM3 :
 *   Seq1: MSB=1, LSB=63
 *   Seq2: MSB=1, LSB=65
 *   Value: 0-4 selon l'index dans lfoSeqMidiClock
 */
export function sendStepSequencerMidiClockMode(seqIndex: 0 | 1, midiClockMode: string, channel: number = currentChannel) {
  const MODES = ["Ck/4", "Ck/2", "Ck  ", "Ck*2", "Ck*4"];
  const idx = MODES.indexOf(midiClockMode);
  const value = idx >= 0 ? idx : 0;
  const paramMSB = 1;
  const paramLSB = seqIndex === 0 ? 63 : 65;
  const nrpn = {
    paramMSB,
    paramLSB,
    valueMSB: (value >> 7) & 0x7F,
    valueLSB: value & 0x7F
  };
  console.log('📤 Sending Step Sequencer midiClockMode via NRPN:', { seqIndex, midiClockMode, value, nrpn, channel });
  sendNRPN(nrpn, channel);
}
/**
 * Envoie le BPM du step sequencer via NRPN
 * @param seqIndex 0 ou 1 (Seq1 ou Seq2)
 * @param bpm valeur BPM (10-240)
 * @param channel MIDI channel (défaut: currentChannel)
 * Mapping PreenFM3 :
 *   Seq1: MSB=1, LSB=60
 *   Seq2: MSB=1, LSB=64
 */
/**
 * Envoie le BPM du step sequencer via NRPN
 * @param seqIndex 0 ou 1 (Seq1 ou Seq2)
 * @param bpm valeur BPM (10-240 pour mode interne, >240 pour mode sync)
 * @param midiClockMode (optionnel) : string ("Ck/4", "Ck/2", "Ck  ", "Ck*2", "Ck*4")
 * @param channel MIDI channel (défaut: currentChannel)
 * Mapping PreenFM3 :
 *   Seq1: MSB=1, LSB=60
 *   Seq2: MSB=1, LSB=64
 *   Si bpm > 240, valeur = 240 + index du mode clock
 */
export function sendStepSequencerBpm(seqIndex: 0 | 1, bpm: number, midiClockMode?: string, channel: number = currentChannel) {
  let valueToSend = Math.round(bpm);
  if (bpm > 240 && midiClockMode) {
    // Mode sync : encoder l'index du mode clock dans la valeur
    const MODES = ["Ck/4", "Ck/2", "Ck  ", "Ck*2", "Ck*4"];
    const idx = MODES.indexOf(midiClockMode);
    valueToSend = 240 + (idx >= 0 ? idx : 0);
  } else {
    valueToSend = Math.max(10, Math.min(240, valueToSend));
  }
  const paramMSB = 1;
  const paramLSB = seqIndex === 0 ? 60 : 64;
  const nrpn = {
    paramMSB,
    paramLSB,
    valueMSB: (valueToSend >> 7) & 0x7F,
    valueLSB: valueToSend & 0x7F
  };
  console.log('📤 Sending Step Sequencer BPM via NRPN:', { seqIndex, bpm: valueToSend, midiClockMode, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Envoie le gate du step sequencer via NRPN
 * @param seqIndex 0 ou 1 (Seq1 ou Seq2)
 * @param gate valeur gate (0-1, UI) → 0-100 (firmware)
 * @param channel MIDI channel (défaut: currentChannel)
 * Mapping PreenFM3 :
 *   Seq1: MSB=1, LSB=61
 *   Seq2: MSB=1, LSB=62
 */
export function sendStepSequencerGate(seqIndex: 0 | 1, gate: number, channel: number = currentChannel) {
  // UI: 0-1, firmware: 0-100
  const clampedGate = Math.max(0, Math.min(1, gate));
  const firmwareGate = Math.round(clampedGate * 100);
  const paramMSB = 1;
  const paramLSB = seqIndex === 0 ? 61 : 62;
  const nrpn = {
    paramMSB,
    paramLSB,
    valueMSB: (firmwareGate >> 7) & 0x7F,
    valueLSB: firmwareGate & 0x7F
  };
  console.log('📤 Sending Step Sequencer Gate via NRPN:', { seqIndex, gate: firmwareGate, nrpn, channel });
  sendNRPN(nrpn, channel);
}
/**
 * Send a step value for the step sequencer via NRPN
 * @param seqIndex 0 or 1 (StepSeq1 or StepSeq2)
 * @param stepIndex 0-15 (step number)
 * @param value 0-100 (step value)
 * @param channel MIDI channel (default: currentChannel)
 *
 * NRPN mapping (empirically verified):
 *   StepSeq1: MSB=1, LSB=16+stepIndex (0-15)
 *   StepSeq2: MSB=1, LSB=32+stepIndex (0-15)
 *   Value: 0-100 (UI) → 0-100 (firmware)
 */
export function sendStepSequencerStep(
  seqIndex: 0 | 1,
  stepIndex: number,
  value: number,
  channel: number = currentChannel
) {
  if (seqIndex !== 0 && seqIndex !== 1) {
    console.error('Invalid step sequencer index:', seqIndex);
    return;
  }
  if (stepIndex < 0 || stepIndex > 15) {
    console.error('Invalid step index:', stepIndex);
    return;
  }
  // Clamp value to 0-100 (UI)
  const uiValue = Math.max(0, Math.min(100, Math.round(value)));
  // Convert UI value (0-100) to firmware value (0-15)
  const firmwareValue = Math.round((uiValue / 100) * 15);
  // NRPN address: MSB=2 (Seq1) ou 3 (Seq2), LSB=0-15
  const paramMSB = seqIndex === 0 ? 2 : 3;
  const paramLSB = stepIndex;
  const nrpn = {
    paramMSB,
    paramLSB,
    valueMSB: (firmwareValue >> 7) & 0x7F, // always 0 for 0-15
    valueLSB: firmwareValue & 0x7F
  };
  console.log('📤 Sending Step Sequencer Step via NRPN:', { seqIndex, stepIndex, uiValue, firmwareValue, nrpn, channel });
  sendNRPN(nrpn, channel);
}
/**
 * Envoie tous les paramètres d'un LFO au PreenFM3 via CC
 * lfoIndex: 0 = LFO1, 1 = LFO2, 2 = LFO3
 * params: { frequency, shape, phase, bias }
 */
/**
 * Envoie un paramètre LFO au PreenFM3 via NRPN (shape, freq, bias, keysync, phase)
 * lfoIndex: 0 = LFO1, 1 = LFO2, 2 = LFO3
 * param: 'shape' | 'frequency' | 'bias' | 'keysync' | 'phase'
 * value: valeur UI (voir mapping ci-dessous)
 */
export function sendLfoParamNRPN(lfoIndex: 0 | 1 | 2, param: 'shape' | 'frequency' | 'bias' | 'keysync' | 'phase', value: number) {
  // Mapping NRPN LSB pour chaque LFO et paramètre
  const NRPN_LSB = {
    shape:   [40, 44, 48],
    frequency: [41, 45, 49],
    bias:    [42, 46, 50],
    keysync: [43, 47, 51],
    phase:   [68, 69, 70],
  };
  const lsb = NRPN_LSB[param][lfoIndex];
  let rawValue = 0;
  switch (param) {
    case 'shape':
      // 0-7 (index)
      rawValue = Math.max(0, Math.min(7, Math.round(value)));
      break;
    case 'frequency':
      // value is already a NRPN (0–9999 for internal, 10000+ for MIDI clock)
      rawValue = Math.max(0, Math.min(16383, Math.round(value)));
      break;
    case 'bias':
      // UI: -1 à +1 → NRPN: 0-200 (center 100)
      rawValue = Math.max(0, Math.min(200, encodeLfoBias(value)));
      break;
    case 'keysync':
      // UI: 0-16 (ou -1 pour Off) → NRPN: 0-16383 (0-16)
      rawValue = value < 0 ? 0 : Math.max(0, Math.min(16383, Math.round(value * 100)));
      break;
    case 'phase':
      // UI: 0-1.27 (float) → NRPN: 0-127 (firmware attend NRPN/100)
      rawValue = Math.max(0, Math.min(127, Math.round(value * 100)));
      console.log(`[LFO PHASE SEND] lfoIndex=${lfoIndex} UI value=${value} → NRPN=${rawValue}`);
      break;
  }
  const nrpn = {
    paramMSB: 1,
    paramLSB: lsb,
    valueMSB: (rawValue >> 7) & 0x7F,
    valueLSB: rawValue & 0x7F
  };
  sendNRPN(nrpn);
}
/**
 * Envoie l'enveloppe libre 2 (Free Env2) au PreenFM3 via NRPN
 * silence: temps de silence (s)
 * attack: temps d'attaque (s)
 * release: temps de release (s)
 * loopMode: 0=Off, 1=Silence, 2=Attack
 */
export function sendLfoEnvelope2(params: { silence: number, attack: number, release: number, loopMode: number }) {
  // NRPN MSB=1, LSB: 56=silence, 57=attack, 58=release, 59=loopMode
  const lsbs = [56, 57, 58, 59];
  const values = [
    Math.round(params.silence * 100),   // Silence time (centièmes de seconde)
    Math.round(params.attack * 100),    // Attack time
    Math.round(params.release * 100),   // Release time
    params.loopMode ?? 0                // Loop mode (0-2)
  ];
  lsbs.forEach((lsb, i) => {
    const value = values[i];
    const nrpn = {
      paramMSB: 1,
      paramLSB: lsb,
      valueMSB: (value >> 7) & 0x7F,
      valueLSB: value & 0x7F
    };
    console.log('📤 Sending LFO Envelope2 NRPN:', { lsb, value, nrpn });
    sendNRPN(nrpn);
  });
}
/**
 * Envoie l'enveloppe libre (Free Env1 ou Env2) au PreenFM3 via NRPN
 * envIndex: 0 = Env1, 1 = Env2
 * envelope: { attack, decay, sustain, release } (temps en secondes, level 0-1)
 */
export function sendLfoEnvelope(envIndex: 0 | 1, envelope: { attack: number, decay: number, sustain: number, release: number }) {
  // NRPN MSB=1, LSB fixes : Env1=52-55, Env2=56-59
  const lsbs = envIndex === 0 ? [52, 53, 54, 55] : [56, 57, 58, 59];
  const values = [
    Math.round(envelope.attack * 100),   // Attack time (centièmes de seconde)
    Math.round(envelope.decay * 100),    // Decay time
    Math.round(envelope.sustain * 100),  // Sustain level (0-100)
    Math.round(envelope.release * 100),  // Release time
  ];
  lsbs.forEach((lsb, i) => {
    const value = values[i];
    const nrpn = {
      paramMSB: 1,
      paramLSB: lsb,
      valueMSB: (value >> 7) & 0x7F,
      valueLSB: value & 0x7F
    };
    console.log('📤 Sending LFO Envelope NRPN:', { envIndex, lsb, value, nrpn });
    sendNRPN(nrpn);
  });
}

/**
 * Send arpeggiator parameters to PreenFM3 via NRPN
 * According to PreenFM3 official documentation: https://ixox.fr/preenfm2/preenfm/midi/
 */

/**
 * Send arpeggiator clock source via NRPN
 * NRPN MSB=0, LSB=28 (0=Off, 1=Internal, 2=External)
 */
export function sendArpeggiatorClock(clockSource: string, channel: number = currentChannel) {
  const clockSources = ['Off', 'Int', 'Ext'];
  const value = clockSources.indexOf(clockSource);
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 28,
    valueMSB: 0,
    valueLSB: Math.max(0, value) & 0x7F
  };
  console.log('📤 Sending Arpeggiator Clock via NRPN:', { clockSource, value, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send arpeggiator BPM via NRPN
 * NRPN MSB=0, LSB=29 (BPM: 10-240)
 */
export function sendArpeggiatorBpm(bpm: number, channel: number = currentChannel) {
  const nrpn = {
    paramMSB: 0,
    paramLSB: 29,
    valueMSB: (bpm >> 7) & 0x7F,
    valueLSB: bpm & 0x7F
  };
  console.log('📤 Sending Arpeggiator BPM via NRPN:', { bpm, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send arpeggiator direction via NRPN
 * NRPN MSB=0, LSB=30 (Direction: 0-9)
 */
export function sendArpeggiatorDirection(direction: string, channel: number = currentChannel) {
  const directions = ['Up', 'Down', 'UpDown', 'Played', 'Random', 'Chord', 'Rotate U', 'Rotate D', 'Shift U', 'Shift D'];
  const value = directions.indexOf(direction);
  if (value === -1) {
    console.warn('⚠️ Unknown arpeggiator direction:', direction);
    return;
  }
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 30,
    valueMSB: (value >> 7) & 0x7F,
    valueLSB: value & 0x7F
  };
  console.log('📤 Sending Arpeggiator Direction via NRPN:', { direction, value, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send arpeggiator octave via NRPN
 * NRPN MSB=0, LSB=31 (Octave: 1-3)
 */
export function sendArpeggiatorOctave(octave: number, channel: number = currentChannel) {
  const nrpn = {
    paramMSB: 0,
    paramLSB: 31,
    valueMSB: (octave >> 7) & 0x7F,
    valueLSB: octave & 0x7F
  };
  console.log('📤 Sending Arpeggiator Octave via NRPN:', { octave, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send arpeggiator pattern via NRPN
 * NRPN MSB=0, LSB=32 (Pattern: 0-25)
 */
export function sendArpeggiatorPattern(pattern: string, channel: number = currentChannel) {
  const patterns = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
    '21', '22', 'Usr1', 'Usr2', 'Usr3', 'Usr4'
  ];
  const value = patterns.indexOf(pattern);
  if (value === -1) {
    console.warn('⚠️ Unknown arpeggiator pattern:', pattern);
    return;
  }
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 32,
    valueMSB: (value >> 7) & 0x7F,
    valueLSB: value & 0x7F
  };
  console.log('📤 Sending Arpeggiator Pattern via NRPN:', { pattern, value, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send arpeggiator division via NRPN
 * NRPN MSB=0, LSB=33 (Division: 0-16)
 */
export function sendArpeggiatorDivision(division: string, channel: number = currentChannel) {
  const divisions = [
    '2/1', '3/2', '1/1', '3/4', '2/3', '1/2', '3/8', '1/3', '1/4',
    '1/6', '1/8', '1/12', '1/16', '1/24', '1/32', '1/48', '1/96'
  ];
  const value = divisions.indexOf(division);
  if (value === -1) {
    console.warn('⚠️ Unknown arpeggiator division:', division);
    return;
  }
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 33,
    valueMSB: (value >> 7) & 0x7F,
    valueLSB: value & 0x7F
  };
  console.log('📤 Sending Arpeggiator Division via NRPN:', { division, value, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send arpeggiator duration via NRPN
 * NRPN MSB=0, LSB=34 (Duration: 0-16)
 */
export function sendArpeggiatorDuration(duration: string, channel: number = currentChannel) {
  const durations = [
    '2/1', '3/2', '1/1', '3/4', '2/3', '1/2', '3/8', '1/3', '1/4',
    '1/6', '1/8', '1/12', '1/16', '1/24', '1/32', '1/48', '1/96'
  ];
  const value = durations.indexOf(duration);
  if (value === -1) {
    console.warn('⚠️ Unknown arpeggiator duration:', duration);
    return;
  }
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 34,
    valueMSB: (value >> 7) & 0x7F,
    valueLSB: value & 0x7F
  };
  console.log('📤 Sending Arpeggiator Duration via NRPN:', { duration, value, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send arpeggiator latch via NRPN
 * NRPN MSB=0, LSB=35 (Latch: 0-1)
 */
export function sendArpeggiatorLatch(latch: string, channel: number = currentChannel) {
  const latches = ['Off', 'On'];
  const value = latches.indexOf(latch);
  if (value === -1) {
    console.warn('⚠️ Unknown arpeggiator latch:', latch);
    return;
  }
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 35,
    valueMSB: (value >> 7) & 0x7F,
    valueLSB: value & 0x7F
  };
  console.log('📤 Sending Arpeggiator Latch via NRPN:', { latch, value, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * MIDI Service for PreenFM3 Communication
 * Handles Web MIDI API for sending/receiving CC, NRPN, and SysEx messages
 */

import { WebMidi, Input, Output } from 'webmidi';
import { MIDI_CC, PREENFM3_CC, NRPNMessage, NRPN_COMMANDS } from './preenFM3MidiMap';

let midiInput: Input | null = null;
let midiOutput: Output | null = null;
let currentChannel = 1; // MIDI channel 1-16

/**
 * Initialize Web MIDI and get available devices
 */
export async function initializeMidi(): Promise<{ inputs: Input[]; outputs: Output[] }> {
  try {
    await WebMidi.enable();
    console.log('Web MIDI enabled');
    console.log('Inputs:', WebMidi.inputs.map(i => i.name));
    console.log('Outputs:', WebMidi.outputs.map(o => o.name));
    
    return {
      inputs: WebMidi.inputs,
      outputs: WebMidi.outputs,
    };
  } catch (err) {
    console.error('Failed to enable Web MIDI:', err);
    throw err;
  }
}

/**
 * Get the current MIDI input (for scoped listeners).
 */
export function getMidiInput(): Input | null {
  return midiInput;
}

/**
 * Set the active MIDI input device
 */
export function setMidiInput(input: Input | null) {
  if (midiInput) {
    midiInput.removeListener();
  }
  midiInput = input;
}

/**
 * Set the active MIDI output device
 */
export function setMidiOutput(output: Output | null) {
  midiOutput = output;
}

/**
 * Set the MIDI channel (1-16)
 */
export function setMidiChannel(channel: number) {
  if (channel >= 1 && channel <= 16) {
    currentChannel = channel;
  }
}

/**
 * Send a Control Change message
 */
export function sendCC(controller: number, value: number, channel: number = currentChannel) {
  // Block mixer CCs managed exclusively by PreenFM3 hardware encoders (firmware MidiDecoder.h)
  // MIXER_VOLUME=7, MIXER_PAN=10, MIXER_SEND=11
  // Sending these from the web UI would overwrite timbre dry/wet, volume or pan unexpectedly.
  if (controller === PREENFM3_CC.MIXER_VOLUME || controller === PREENFM3_CC.MIXER_PAN || controller === PREENFM3_CC.MIXER_SEND) {
    console.warn(`🚫 Blocked CC ${controller} — mixer CC reserved for PreenFM3 hardware (VOLUME=${PREENFM3_CC.MIXER_VOLUME}, PAN=${PREENFM3_CC.MIXER_PAN}, SEND=${PREENFM3_CC.MIXER_SEND})`);
    return;
  }

  // Block sustain pedal (CC 64 = hold pedal).  This app never needs to send
  // it; an accidental CC 64 would lock notes in sustain on the PreenFM3.
  if (controller === MIDI_CC.HOLD_PEDAL) {
    console.warn('🚫 Blocked CC 64 (hold pedal) — never sent from the editor');
    return;
  }

  console.log('📨 sendCC called:', { controller, value, channel, hasOutput: !!midiOutput, outputName: midiOutput?.name });
  
  if (!midiOutput) {
    console.warn('❌ No MIDI output selected - cannot send CC');
    return;
  }
  
  try {
    // Build MIDI CC message manually: [status, controller, value]
    // Status byte: 0xB0 (CC on channel 1) + (channel - 1)
    // Controller: 0-127
    // Value: 0-127
    const statusByte = 0xB0 + (channel - 1);
    const midiMessage = [statusByte, controller & 0x7F, value & 0x7F];
    
    console.log('🎵 MIDI bytes:', midiMessage.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    console.log('🔌 Output object:', { id: midiOutput.id, name: midiOutput.name, manufacturer: midiOutput.manufacturer });
    console.log('🔌 Output state:', { state: midiOutput.state, connection: midiOutput.connection, type: midiOutput.type });
    
    // Send raw MIDI message WITHOUT timestamp (send immediately)
    try {
      const result = midiOutput.send(midiMessage);
      console.log('📬 send() returned:', result);
    } catch (sendError) {
      console.error('💥 send() threw error:', sendError);
      throw sendError;
    }
    
    console.log(`✅ Sent CC ${controller} = ${value} on channel ${channel} to ${midiOutput.name}`);
  } catch (err) {
    console.error('❌ Failed to send CC:', err);
  }
}

/**
 * ── NRPN Send Queue ─────────────────────────────────────────────────────────
 *
 * All NRPN messages go through a centralized FIFO queue so the PreenFM3
 * firmware has enough time to process each one before the next arrives.
 *
 * - Minimum inter-NRPN gap: NRPN_SEND_INTERVAL_MS (default 10 ms).
 * - Deduplication: if a message with the same NRPN address (paramMSB:paramLSB)
 *   is already pending, its value is updated in-place (latest-value-wins).
 *   This is ideal for live knob/slider changes — only the most recent value
 *   actually gets sent.
 * - drainNRPNQueue() returns a Promise that resolves once the queue is empty.
 */

/** Minimum delay between consecutive NRPN sends (ms). */
const NRPN_SEND_INTERVAL_MS = 10;

interface QueuedNRPN {
  nrpn: NRPNMessage;
  channel: number;
  /** Dedup key: "paramMSB:paramLSB" */
  key: string;
}

const nrpnQueue: QueuedNRPN[] = [];
let queueTimer: ReturnType<typeof setTimeout> | null = null;
let lastNrpnSendTime = 0;
/** Pending drain-resolve callbacks. */
let drainResolvers: (() => void)[] = [];

function nrpnKey(nrpn: NRPNMessage): string {
  return `${nrpn.paramMSB}:${nrpn.paramLSB}`;
}

/**
 * Send 4 CCs for one NRPN as a **single** send() call so that the
 * 12 bytes travel in one USB transfer (same approach as the official
 * PreenFM controller's sendBlockOfMessagesNow).
 * This prevents USB-level interleaving that could corrupt the NRPN
 * state machine on the synth — which was causing a phantom CC 64
 * (sustain / hold pedal) to be perceived by the firmware.
 */
function sendNRPNImmediate(nrpn: NRPNMessage, channel: number) {
  if (!midiOutput) return;
  const s = 0xB0 + (channel - 1);
  midiOutput.send([
    s, 99, nrpn.paramMSB & 0x7F,   // CC 99 = NRPN param MSB
    s, 98, nrpn.paramLSB & 0x7F,   // CC 98 = NRPN param LSB
    s,  6, nrpn.valueMSB  & 0x7F,   // CC 6  = Data Entry MSB
    s, 38, nrpn.valueLSB  & 0x7F,   // CC 38 = Data Entry LSB
  ]);
}

function processNrpnQueue() {
  queueTimer = null;

  if (nrpnQueue.length === 0) {
    // Queue drained — resolve all waiters
    const resolvers = drainResolvers;
    drainResolvers = [];
    resolvers.forEach((r) => r());
    return;
  }

  const item = nrpnQueue.shift()!;
  try {
    sendNRPNImmediate(item.nrpn, item.channel);
  } catch (err) {
    console.error('Failed to send NRPN:', err);
  }
  lastNrpnSendTime = performance.now();

  if (nrpnQueue.length > 0) {
    queueTimer = setTimeout(processNrpnQueue, NRPN_SEND_INTERVAL_MS);
  } else {
    // Queue just became empty — resolve all waiters
    const resolvers = drainResolvers;
    drainResolvers = [];
    resolvers.forEach((r) => r());
  }
}

/**
 * Send an NRPN message (4 CC messages) via the rate-limited queue.
 *
 * If a message with the same NRPN address is already pending, its value is
 * updated in place (latest-value-wins deduplication).
 */
export function sendNRPN(nrpn: NRPNMessage, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected');
    return;
  }

  const key = nrpnKey(nrpn);

  // Dedup: update in place if same address is already queued
  const existing = nrpnQueue.findIndex((q) => q.key === key);
  if (existing >= 0) {
    nrpnQueue[existing].nrpn = nrpn;
    nrpnQueue[existing].channel = channel;
    return;
  }

  nrpnQueue.push({ nrpn, channel, key });

  // Kick the queue processor if not already running
  if (!queueTimer) {
    const elapsed = performance.now() - lastNrpnSendTime;
    const wait = Math.max(0, NRPN_SEND_INTERVAL_MS - elapsed);
    queueTimer = setTimeout(processNrpnQueue, wait);
  }
}

/**
 * Returns a Promise that resolves once all currently-queued NRPN messages
 * have been sent.  Useful after a batch push (sendPatch) to know when the
 * hardware has received everything.
 */
export function drainNRPNQueue(): Promise<void> {
  if (nrpnQueue.length === 0 && !queueTimer) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    drainResolvers.push(resolve);
  });
}

/**
 * Clear any pending NRPN messages (e.g. when switching patches while a push
 * is still in progress).
 */
export function clearNRPNQueue() {
  nrpnQueue.length = 0;
  if (queueTimer) {
    clearTimeout(queueTimer);
    queueTimer = null;
  }
  const resolvers = drainResolvers;
  drainResolvers = [];
  resolvers.forEach((r) => r());
}

/**
 * Request full patch dump via NRPN
 */
export function requestPatchDump(timbre: number = 0, channel: number = currentChannel) {
  console.log('📥 requestPatchDump called:', { timbre, channel, hasOutput: !!midiOutput, outputName: midiOutput?.name });
  console.log('🔌 Output object:', { id: midiOutput?.id, name: midiOutput?.name, manufacturer: midiOutput?.manufacturer });
  
  const nrpn = {
    ...NRPN_COMMANDS.REQUEST_PATCH_DUMP,
    valueMSB: 0,
    valueLSB: timbre,
  };
  sendNRPN(nrpn, channel);
}

/**
 * Send global velocity sensitivity via NRPN
 */
export function sendGlobalVelocitySensitivity(velocity: number, channel: number = currentChannel) {
  // Global velocity sensitivity uses NRPN [0,1] with value 0-16
  const clampedVelocity = Math.max(0, Math.min(16, Math.round(velocity)));
  const nrpn = {
    paramMSB: 0,
    paramLSB: 1,
    valueMSB: (clampedVelocity >> 7) & 0x7F,
    valueLSB: clampedVelocity & 0x7F
  };
  console.log('📤 Sending Global Velocity Sensitivity via NRPN:', { velocity: clampedVelocity, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send patch name to PreenFM3 via NRPN
 * Each character is sent individually with NRPN [1, 100+n] where n is the character position
 * and the value is the ASCII code of the character
 */
export function sendPatchName(name: string, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for patch name');
    return;
  }

  // Limit name length to reasonable size (PreenFM3 typically supports 12 characters)
  const maxLength = 12;
  const truncatedName = name.slice(0, maxLength);
  
  console.log('📤 Sending Patch Name via NRPN:', { name: truncatedName, length: truncatedName.length, channel });
  
  // Send each character as NRPN
  for (let i = 0; i < truncatedName.length; i++) {
    const charCode = truncatedName.charCodeAt(i);
    const nrpn = {
      paramMSB: 1,
      paramLSB: 100 + i,
      valueMSB: (charCode >> 7) & 0x7F,
      valueLSB: charCode & 0x7F
    };
    
    console.log(`📤 Char ${i}: '${truncatedName[i]}' (${charCode}) -> NRPN [1,${100 + i}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
    sendNRPN(nrpn, channel);
    
    // Small delay between characters to avoid overwhelming the PreenFM3
    // Note: In a real implementation, you might want to queue these instead
  }
  
  // Send empty characters for remaining positions to clear the name
  for (let i = truncatedName.length; i < maxLength; i++) {
    const nrpn = {
      paramMSB: 1,
      paramLSB: 100 + i,
      valueMSB: 0,
      valueLSB: 0x20  // ASCII space to clear position
    };
    sendNRPN(nrpn, channel);
  }
}

/**
 * Send filter type to PreenFM3 via NRPN
 * Uses the index in FILTER1_TYPE_LIST/FILTER2_TYPE_LIST arrays which correspond to firmware values
 */
export function sendFilterType(type: string, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for filter type');
    return;
  }

  // Import filter type lists at the top of the function
  const FILTER1_TYPE_LIST = [
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
    'KRMG', 'TEEBEE', 'SVFLH', 'CRUSH2'
  ];
  
  const FILTER2_TYPE_LIST = [
    'OFF', 'FLANGE', 'DIMENSION', 'CHORUS', 'WIDE',
    'DOUBLER', 'TRIPLER', 'BODE', 'DELAYCRUNCH',
    'PINGPONG', 'DIFFUSER', 'GRAIN1', 'GRAIN2',
    'STEREO_BP', 'PLUCK', 'PLUCK2', 'RESONATORS'
  ];
  
  // Try to find in Filter1 list first, then Filter2
  let filterValue = FILTER1_TYPE_LIST.indexOf(type);
  const idx1 = filterValue;
  const idx2 = FILTER2_TYPE_LIST.indexOf(type);
  if (filterValue === -1) {
    filterValue = idx2;
  }

  console.log("================================= Filtre type idx:", { type, idx1, idx2, filterValue });
  if (filterValue === -1) {
    console.warn(`Filter type '${type}' not found, using OFF`);
    filterValue = 0;
  }
  console.log(`[sendFilterType] Recherche type='${type}' | idx1=${idx1} | idx2=${idx2} | filterValue=${filterValue}`);
  const nrpn = {
    paramMSB: 0,
    paramLSB: 40,  // Filter Type
    valueMSB: (filterValue >> 7) & 0x7F,
    valueLSB: filterValue & 0x7F
  };
  console.log(`📤 Sending Filter Type via NRPN: ${type} (${filterValue}) -> [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
  sendNRPN(nrpn, channel);
}

/**
 * Send filter param1 (frequency/cutoff) to PreenFM3 via NRPN
 * @param value - Value 0-1 (converted to 0-100 for NRPN)
 */
export function sendFilterParam1(value: number, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for filter param1');
    return;
  }

  // Convert 0-1 to 0-100 for NRPN
  const nrpnValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 41,  // Filter Param1
    valueMSB: (nrpnValue >> 7) & 0x7F,
    valueLSB: nrpnValue & 0x7F
  };
  
  console.log(`📤 Sending Filter Param1 via NRPN: ${value} -> ${nrpnValue} -> [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
  sendNRPN(nrpn, channel);
}

/**
 * Send filter param2 (resonance/Q) to PreenFM3 via NRPN
 * @param value - Value 0-1 (converted to 0-100 for NRPN)
 */
export function sendFilterParam2(value: number, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for filter param2');
    return;
  }

  // Convert 0-1 to 0-100 for NRPN
  const nrpnValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 42,  // Filter Param2
    valueMSB: (nrpnValue >> 7) & 0x7F,
    valueLSB: nrpnValue & 0x7F
  };
  
  console.log(`📤 Sending Filter Param2 via NRPN: ${value} -> ${nrpnValue} -> [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
  sendNRPN(nrpn, channel);
}

/**
 * Send filter gain to PreenFM3 via NRPN
 * @param value - Value 0-2 (converted to 0-200 for NRPN)
 */
export function sendFilterGain(value: number, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected for filter gain');
    return;
  }

  // Convert 0-2 range to 0-200 for NRPN (PreenFM3 expects 0-200)
  const nrpnValue = Math.round(Math.max(0, Math.min(2, value)) * 100);
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 43,  // Filter Gain
    valueMSB: (nrpnValue >> 7) & 0x7F,
    valueLSB: nrpnValue & 0x7F
  };
  
  console.log(`📤 Sending Filter Gain via NRPN: ${value} -> ${nrpnValue} -> [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}]`);
  sendNRPN(nrpn, channel);
}

/**
 * Send play mode (Voices) via NRPN
 * Note: PreenFM3 uses NRPN [0,2] for Play Mode (not voice count like PreenFM2)
 * - 1 voice = Mono (0)
 * - 2-16 voices = Poly (1) 
 * - Unison (2) not supported in current interface
 */
export function sendPlayMode(polyphony: number, channel: number = currentChannel) {
  // Convert polyphony count to play mode
  let playMode: number;
  if (polyphony === 1) {
    playMode = 0; // Mono
  } else {
    playMode = 1; // Poly (2-16 voices) 
  }
  
  const nrpn = {
    paramMSB: 0,
    paramLSB: 2,
    valueMSB: (playMode >> 7) & 0x7F,
    valueLSB: playMode & 0x7F
  };
  console.log('📤 Sending Play Mode via NRPN:', { polyphony, playMode: playMode === 0 ? 'Mono' : 'Poly', nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send glide time via NRPN
 */
export function sendGlideTime(glideTime: number, channel: number = currentChannel) {
  // Glide uses NRPN [0,3] with value 0-10 (clamp from UI's 0-12 range)
  const clampedGlide = Math.max(0, Math.min(10, Math.round(glideTime)));
  const nrpn = {
    paramMSB: 0,
    paramLSB: 3,
    valueMSB: (clampedGlide >> 7) & 0x7F,
    valueLSB: clampedGlide & 0x7F
  };
  console.log('📤 Sending Glide Time via NRPN:', { glideTime: clampedGlide, nrpn, channel });
  sendNRPN(nrpn, channel);
}

/**
 * Send Note Curve parameters via NRPN
 */
export function sendNoteCurve(curveIndex: 0 | 1, noteCurve: import('../types/patch').NoteCurve, channel: number = currentChannel) {
  console.log(`🚀 === DÉBUT ENVOI Note Curve ${curveIndex + 1} ===`);
  console.log(`📋 Input: before="${noteCurve.before}", breakNote=${noteCurve.breakNote}, after="${noteCurve.after}"`);
  
  // Vérifier si MIDI output est disponible
  if (!midiOutput) {
    console.error('❌ Pas de sortie MIDI connectée !');
    return;
  }
  console.log(`✅ MIDI Output connecté: ${midiOutput.name}`);
  
  // ✅ VRAIS MAPPINGS NRPN d'après le code source officiel PreenFM :
  // Note1: MSB=0, LSB=200 (before), LSB=201 (breakNote), LSB=202 (after)
  // Note2: MSB=0, LSB=204 (before), LSB=205 (breakNote), LSB=206 (after) 
  // 🧪 TEST: Essayer MSB=1 pour l'envoi (comme Step Sequencers qui fonctionnent)
  
  const baseLSB = 200 + (curveIndex * 4);
  console.log(`📍 Base LSB calculé: ${baseLSB} (pour Note Curve ${curveIndex + 1})`);
  console.log(`🧪 TEST MSB: Essai avec MSB=1 au lieu de MSB=0 (comme Step Sequencers)`);
  
  // ✅ Utiliser le système centralisé NoteCurveUtils au lieu du mapping manuel
  const beforeIndex = NoteCurveUtils.toNrpnIndex(noteCurve.before);
  const afterIndex = NoteCurveUtils.toNrpnIndex(noteCurve.after);
  
  // 🎯 SOLUTION TROUVÉE: MSB=1 avec indices 0-6 (pas de +1 nécessaire)
  // Les Step Sequencers utilisent MSB=1 et ça fonctionne
  
  // 🐛 DEBUG: Afficher les indices utilisés pour l'envoi
  console.log(`🔍 DEBUG sendNoteCurve: before="${noteCurve.before}" → ${beforeIndex}, after="${noteCurve.after}" → ${afterIndex}`);
  
  // ✅ Validation corrigée (0 est maintenant un index valide)
  if (typeof beforeIndex !== 'number' || typeof afterIndex !== 'number') {
    console.error(`❌ Note Curve ${curveIndex + 1}: Type de courbe non supporté - before: ${noteCurve.before}(${beforeIndex}), after: ${noteCurve.after}(${afterIndex})`);
    return;
  }
  
console.log(`📤 Note Curve ${curveIndex + 1} - Envoi NRPN [MSB=1, LSB=${baseLSB}]:`);
  console.log(`  Before: ${noteCurve.before} → ${beforeIndex} (MSB=1)`);
  console.log(`  Break: ${noteCurve.breakNote}`);
  console.log(`  After: ${noteCurve.after} → ${afterIndex} (MSB=1)`);
  
  // ✅ SOLUTION CONFIRMÉE: MSB=1 avec indices 0-6 (correction du décalage)
  // Send before curve type
  const beforeNRPN = {
    paramMSB: 1,  // MSB=1 pour l'envoi (fonctionnel)
    paramLSB: baseLSB + 0,
    valueMSB: (beforeIndex >> 7) & 0x7F,  // indices 0-6 directement
    valueLSB: beforeIndex & 0x7F
  };
  sendNRPN(beforeNRPN, channel);

  // Send break note (direct, pas de scaling)
  const breakNote = Math.max(0, Math.min(127, noteCurve.breakNote));
  const breakNRPN = {
    paramMSB: 1,  // MSB=1 pour l'envoi
    paramLSB: baseLSB + 1,
    valueMSB: (breakNote >> 7) & 0x7F,
    valueLSB: breakNote & 0x7F
  };
  sendNRPN(breakNRPN, channel);

  // Send after curve type  
  const afterNRPN = {
    paramMSB: 1,  // MSB=1 pour l'envoi
    paramLSB: baseLSB + 2,
    valueMSB: (afterIndex >> 7) & 0x7F,  // indices 0-6 directement
    valueLSB: afterIndex & 0x7F
  };
  sendNRPN(afterNRPN, channel);
  
  console.log(`✅ Note Curve ${curveIndex + 1} envoyée avec succès !`);
  console.log(`🏁 === FIN ENVOI Note Curve ${curveIndex + 1} ===`);
}

/**
 * Send algorithm change (CC 16)
 */
export function sendAlgorithmChange(algoId: number | string, channel: number = currentChannel) {
  // Algorithm IDs are 0-31 for 32 algorithms
  const algoIndex = typeof algoId === 'string' ? parseInt(algoId.replace('alg', '')) - 1 : algoId;
  sendCC(PREENFM3_CC.ALGO, algoIndex, channel);
}

/**
 * Send modulation index change (IM1-IM5, IM_FEEDBACK)
 */
export function sendIMChange(imNumber: number, value: number, channel: number = currentChannel) {
  // IM values are 0-100 in UI, sent as 0-100 in CC
  // PreenFM3 scales: value * 0.1
  // Only IM1-5 are mapped to CCs; IM6 (feedback) is not mapped (overlaps with MIX3)
  let ccNumber: number | undefined;
  if (imNumber >= 1 && imNumber <= 5) {
    ccNumber = PREENFM3_CC.IM1 + (imNumber - 1);
  } else if (imNumber === 6) {
    // Feedback (IM6) is not mapped to a CC, skip
    console.warn('IM6 (feedback) is not mapped to a CC, skipping sendCC');
    return;
  } else {
    console.error('Invalid IM number:', imNumber);
    return;
  }
  const scaledValue = Math.min(127, Math.round(value));
  if (ccNumber !== undefined) {
    sendCC(ccNumber, scaledValue, channel);
  }
}



/**
 * Send operator mix/volume (amplitude) for operators 1-4
 * REAL MAPPING (tested empirically): Mix and Pan are INTERLEAVED
 * Mix: CC 22, 24, 26, 28 (even numbers starting at 22)
 * Pan: CC 23, 25, 27, 29 (odd numbers starting at 23)
 * Formula: CC = 22 + (opNumber-1) * 2
 */
export function sendOperatorMix(opNumber: number, value: number, channel: number = currentChannel) {
  console.log('🎹 sendOperatorMix called:', { opNumber, value, channel, hasOutput: !!midiOutput });
  
  if (opNumber < 1 || opNumber > 4) {
    console.warn('⚠️ Mix CC only available for operators 1-4, got:', opNumber);
    return;
  }
  // OP1-4: Interleaved mapping - Mix on even CCs: 22, 24, 26, 28
  const ccNumber = 22 + (opNumber - 1) * 2; // CC22, CC24, CC26, CC28
  // Convertir float 0..1 en CC 0..127, 1.00 doit donner 127
  let scaledValue = value * 127;
  if (Math.abs(scaledValue - 127) < 0.01) scaledValue = 127;
  scaledValue = Math.max(0, Math.min(127, Math.round(scaledValue)));
  console.log('📤 Sending MIX via CC:', {
    opNumber,
    ccNumber,
    expectedParam: `Mix${opNumber}`,
    scaledValue,
    hex: `0x${(0xB0 + channel - 1).toString(16)} 0x${ccNumber.toString(16)} 0x${scaledValue.toString(16)}`
  });
  sendCC(ccNumber, scaledValue, channel);
}

/**
 * Send operator pan (panoramique) for operators 1-4
 * REAL MAPPING (tested empirically): Mix and Pan are INTERLEAVED
 * Mix: CC 22, 24, 26, 28 (even numbers starting at 22)
 * Pan: CC 23, 25, 27, 29 (odd numbers starting at 23)
 * Formula: CC = 23 + (opNumber-1) * 2
 */
export function sendOperatorPan(opNumber: number, value: number, channel: number = currentChannel) {
  console.log('🎹 sendOperatorPan called:', { opNumber, value, channel, hasOutput: !!midiOutput });
  
  if (opNumber < 1 || opNumber > 4) {
    console.warn('⚠️ Pan CC only available for operators 1-4, got:', opNumber);
    return;
  }
  
  // Pour PreenFM3 NRPN: pan -1..1 → 0..200
  const nrpnPanValue = Math.round((value + 1) * 100);
  // Clamp to [0,200]
  const clampedPan = Math.max(0, Math.min(200, nrpnPanValue));
  // Envoyer via NRPN (pas CC)
  // Pan1: LSB 17, Pan2: 19, Pan3: 21, Pan4: 23
  const panLsb = 17 + (opNumber - 1) * 2;
  const nrpn = {
    paramMSB: 0,
    paramLSB: panLsb,
    valueMSB: (clampedPan >> 7) & 0x7F,
    valueLSB: clampedPan & 0x7F
  };
  console.log('📤 Sending PAN via NRPN:', {
    opNumber,
    panLsb,
    expectedParam: `Pan${opNumber}`,
    originalValue: value,
    clampedPan,
    nrpn
  });
  sendNRPN(nrpn, channel);
}

/**
 * Send operator frequency for operators 1-6
 * NRPN [0, 44+(opNumber-1)*4+2] for frequency multiplier
 * Frequency is stored as freq * 100 in PreenFM3
 */
export function sendOperatorFrequency(opNumber: number, value: number, channel: number = currentChannel) {
  console.log('🎹 sendOperatorFrequency called:', { opNumber, value, channel, hasOutput: !!midiOutput });
  
  if (opNumber < 1 || opNumber > 6) {
    console.warn('⚠️ Operator frequency only available for operators 1-6, got:', opNumber);
    return;
  }
  
  // value is the frequency multiplier (e.g., 0-16)
  // PreenFM3 stores freq * 100 (e.g., 1.00 -> 100, 16.00 -> 1600)
  const scaledValue = Math.round(value * 100);
  
  const oscRowBase = 44 + (opNumber - 1) * 4;
  const nrpn: NRPNMessage = {
    paramMSB: 0,
    paramLSB: oscRowBase + 2, // frequencyMul offset
    valueMSB: (scaledValue >> 7) & 0x7F,
    valueLSB: scaledValue & 0x7F
  };
  
  console.log('📤 Sending FREQUENCY via NRPN:', { opNumber, nrpn, scaledValue, originalValue: value });
  sendNRPN(nrpn, channel);
}

/**
 * Send operator detune for operators 1-6
 * NRPN [0, 44+(opNumber-1)*4+3] for detune
 * Detune is centered at 1600 (0 detune = 1600, -16.00 = 0, +16.00 = 3200)
 */
export function sendOperatorDetune(opNumber: number, value: number, channel: number = currentChannel) {
  console.log('🎹 sendOperatorDetune called:', { opNumber, value, channel, hasOutput: !!midiOutput });
  
  if (opNumber < 1 || opNumber > 6) {
    console.warn('⚠️ Operator detune only available for operators 1-6, got:', opNumber);
    return;
  }
  
  // value is the detune (-9 to +9 typically)
  // PreenFM3 stores as (detune * 100) + 1600 (centered at 1600 for 0 detune)
  const scaledValue = Math.round((value * 100) + 1600);
  
  const oscRowBase = 44 + (opNumber - 1) * 4;
  const nrpn: NRPNMessage = {
    paramMSB: 0,
    paramLSB: oscRowBase + 3, // detune offset
    valueMSB: (scaledValue >> 7) & 0x7F,
    valueLSB: scaledValue & 0x7F
  };
  
  console.log('📤 Sending DETUNE via NRPN:', { opNumber, nrpn, scaledValue, originalValue: value });
  sendNRPN(nrpn, channel);
}

/**
 * Send operator keyboard tracking (frequency type) for operators 1-6
 * NRPN [0, 44+(opNumber-1)*4+1] for keyboard tracking
 * UI: 0=Fixed, 1=Keyboard, 2=Finetune | PreenFM3: 0=Keyboard, 1=Fixed, 2=Finetune
 */
export function sendOperatorKeyboardTracking(opNumber: number, value: number, channel: number = currentChannel) {
  console.log('🎹 sendOperatorKeyboardTracking called:', { opNumber, value, channel, hasOutput: !!midiOutput });
  
  if (opNumber < 1 || opNumber > 6) {
    console.warn('⚠️ Operator keyboard tracking only available for operators 1-6, got:', opNumber);
    return;
  }
  
  // UI values: 0=Fixed, 1=Keyboard, 2=Finetune
  // PreenFM3 firmware values: 0=Keyboard, 1=Fixed, 2=Finetune
  // Need to swap 0 and 1
  let frequencyType: number;
  if (value === 0) {
    frequencyType = 1; // Fixed in UI -> 1 in firmware
  } else if (value === 1) {
    frequencyType = 0; // Keyboard in UI -> 0 in firmware
  } else {
    frequencyType = 2; // Finetune stays 2
  }
  
  const oscRowBase = 44 + (opNumber - 1) * 4;
  const nrpn: NRPNMessage = {
    paramMSB: 0,
    paramLSB: oscRowBase + 1, // frequency type offset
    valueMSB: (frequencyType >> 7) & 0x7F,
    valueLSB: frequencyType & 0x7F
  };
  
  console.log('📤 Sending FREQUENCY TYPE via NRPN:', { opNumber, nrpn, frequencyType, originalValue: value });
  sendNRPN(nrpn, channel);
}

/**
 * Send operator waveform for operators 1-6
 * NRPN [0, 44+(opNumber-1)*4] for waveform shape
 * Waveform ID: 0-13 (OFF, SINE, SAW, SQUARE, SIN_SQUARED, SIN_ZERO, SIN_POS, RAND, USER1-6)
 */
export function sendOperatorWaveform(opNumber: number, waveformId: number, channel: number = currentChannel) {
  console.log('🎹 sendOperatorWaveform called:', { opNumber, waveformId, channel, hasOutput: !!midiOutput });
  
  if (opNumber < 1 || opNumber > 6) {
    console.warn('⚠️ Operator waveform only available for operators 1-6, got:', opNumber);
    return;
  }
  
  const oscRowBase = 44 + (opNumber - 1) * 4;
  const nrpn: NRPNMessage = {
    paramMSB: 0,
    paramLSB: oscRowBase, // shape offset (0)
    valueMSB: (waveformId >> 7) & 0x7F,
    valueLSB: waveformId & 0x7F
  };
  
  console.log('📤 Sending WAVEFORM via NRPN:', { opNumber, nrpn, waveformId });
  sendNRPN(nrpn, channel);
}

/**
 * Send operator ADSR envelope for operators 1-6
 * NRPN [0, 68+(opNumber-1)*8 + offset] for envelope parameters
 * Offsets: 0=AttackTime, 1=AttackLevel, 2=DecayTime, 3=DecayLevel,
 *          4=SustainTime, 5=SustainLevel, 6=ReleaseTime, 7=ReleaseLevel
 * UI uses ABSOLUTE times, firmware uses RELATIVE times (must convert)
 * Times are in centiseconds (multiply by 100)
 */
export function sendOperatorADSR(opNumber: number, adsr: import('../types/adsr').AdsrState, channel: number = currentChannel) {
  console.log('🎹 sendOperatorADSR called:', { opNumber, adsr, channel, hasOutput: !!midiOutput });
  
  if (opNumber < 1 || opNumber > 6) {
    console.warn('⚠️ Operator ADSR only available for operators 1-6, got:', opNumber);
    return;
  }
  
  // Convert from absolute times (UI) to relative times (firmware)
  const attackTimeRel = adsr.attack.time;
  const decayTimeRel = Math.max(0, adsr.decay.time - adsr.attack.time);
  const sustainTimeRel = Math.max(0, adsr.sustain.time - adsr.decay.time);
  const releaseTimeRel = Math.max(0, adsr.release.time - adsr.sustain.time);
  
  // Convert to centiseconds (multiply by 100) and clamp to 0-16000
  const attackTimeValue = Math.round(Math.max(0, Math.min(16000, attackTimeRel * 100)));
  const decayTimeValue = Math.round(Math.max(0, Math.min(16000, decayTimeRel * 100)));
  const sustainTimeValue = Math.round(Math.max(0, Math.min(16000, sustainTimeRel * 100)));
  const releaseTimeValue = Math.round(Math.max(0, Math.min(16000, releaseTimeRel * 100)));
  
  // Levels are already 0-100
  const attackLevel = Math.round(Math.max(0, Math.min(100, adsr.attack.level)));
  const decayLevel = Math.round(Math.max(0, Math.min(100, adsr.decay.level)));
  const sustainLevel = Math.round(Math.max(0, Math.min(100, adsr.sustain.level)));
  const releaseLevel = Math.round(Math.max(0, Math.min(100, adsr.release.level)));
  
  const envRowBase = 68 + (opNumber - 1) * 8;
  
  console.log('📤 Sending ADSR via NRPN:', { 
    opNumber, 
    envRowBase,
    times: { attackTimeValue, decayTimeValue, sustainTimeValue, releaseTimeValue },
    levels: { attackLevel, decayLevel, sustainLevel, releaseLevel }
  });
  
  // Send all 8 NRPN messages (interleaved Time/Level)
  const params = [
    { offset: 0, value: attackTimeValue },  // Attack Time
    { offset: 1, value: attackLevel },      // Attack Level
    { offset: 2, value: decayTimeValue },   // Decay Time
    { offset: 3, value: decayLevel },       // Decay Level
    { offset: 4, value: sustainTimeValue }, // Sustain Time
    { offset: 5, value: sustainLevel },     // Sustain Level
    { offset: 6, value: releaseTimeValue }, // Release Time
    { offset: 7, value: releaseLevel }      // Release Level
  ];
  
  params.forEach(({ offset, value }) => {
    const nrpn: NRPNMessage = {
      paramMSB: 0,
      paramLSB: envRowBase + offset,
      valueMSB: (value >> 7) & 0x7F,
      valueLSB: value & 0x7F
    };
    sendNRPN(nrpn, channel);
  });
}

/**
 * Send modulation index (IM1-IM6) via NRPN
 * NRPN [0, 4 + imIndex*2] for IM value
 * NRPN [0, 5 + imIndex*2] for IM velocity sensitivity
 * UI uses 0-100, firmware uses 0-1000 (multiply by 10)
 * NOTE: isFeedback parameter - if true, always sends to IM6 (index 5) regardless of imIndex
 */
export function sendModulationIM(imIndex: number, value: number, isFeedback: boolean = false, channel: number = currentChannel) {
  console.log('🎹 sendModulationIM called:', { imIndex, value, isFeedback, channel, hasOutput: !!midiOutput });
  
  // Feedback always goes to IM6 (index 5), regardless of sequential position
  const actualIndex = isFeedback ? 5 : imIndex;
  
  if (actualIndex < 0 || actualIndex > 5) {
    console.warn('⚠️ IM index must be 0-5, got:', actualIndex);
    return;
  }
  
  // UI value: 0-16, firmware expects 0-1600 (value * 100), feedback IM expects 0-1 (0-100)
  let firmwareValue;
  if (isFeedback) {
    firmwareValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  } else {
    firmwareValue = Math.round(Math.max(0, Math.min(16, value)) * 100);
  }
  
  const nrpn: NRPNMessage = {
    paramMSB: 0,
    paramLSB: 4 + actualIndex * 2, // IM1=4, IM2=6, IM3=8, IM4=10, IM5=12, IM6=14
    valueMSB: (firmwareValue >> 7) & 0x7F,
    valueLSB: firmwareValue & 0x7F
  };
  
  console.log('📤 Sending IM via NRPN:', { 
    displayIndex: actualIndex + 1, 
    isFeedback,
    nrpn, 
    firmwareValue, 
    uiValue: value 
  });
  sendNRPN(nrpn, channel);
}

/**
 * Send modulation velocity sensitivity (IMVelo1-6) via NRPN
 * NRPN [0, 5 + imIndex*2] for velocity
 * NOTE: isFeedback parameter - if true, always sends to IMVelo6 (index 5) regardless of imIndex
 */
export function sendModulationVelo(imIndex: number, value: number, isFeedback: boolean = false, channel: number = currentChannel) {
  console.log('🎹 sendModulationVelo called:', { imIndex, value, isFeedback, channel, hasOutput: !!midiOutput });
  
  // Feedback always goes to IMVelo6 (index 5), regardless of sequential position
  const actualIndex = isFeedback ? 5 : imIndex;
  
  if (actualIndex < 0 || actualIndex > 5) {
    console.warn('⚠️ IM velo index must be 0-5, got:', actualIndex);
    return;
  }
  
  // UI value: 0-16, firmware expects 0-1600 (value * 100), feedback IMVelo expects 0-1 (0-100)
  let firmwareValue;
  if (isFeedback) {
    firmwareValue = Math.round(Math.max(0, Math.min(1, value)) * 100);
  } else {
    firmwareValue = Math.round(Math.max(0, Math.min(16, value)) * 100);
  }
  
  const nrpn: NRPNMessage = {
    paramMSB: 0,
    paramLSB: 5 + actualIndex * 2, // IMVelo1=5, IMVelo2=7, etc.
    valueMSB: (firmwareValue >> 7) & 0x7F,
    valueLSB: firmwareValue & 0x7F
  };
  
  console.log('📤 Sending IM Velo via NRPN:', { 
    displayIndex: actualIndex + 1, 
    isFeedback,
    nrpn, 
    firmwareValue, 
    uiValue: value 
  });
  sendNRPN(nrpn, channel);
}

/**
 * Calculate the global IM index for a modulation link, using the algorithm's edge ordering.
 * The PreenFM3 firmware assigns IM1-IM5 in the order edges appear in the algorithm definition,
 * not by iterating operators sorted by ID.
 * Returns -1 if link not found, 5 if it's a feedback link.
 */
export function calculateIMIndex(patch: import('../types/patch').Patch, sourceId: number, targetId: number): number {
  const diagram = ALGO_DIAGRAMS.find((d) => d.id === patch.algorithm.id);
  
  if (!diagram) {
    console.warn('⚠️ calculateIMIndex: diagram not found for algorithm', patch.algorithm.id);
    return -1;
  }
  
  console.log('🔍 calculateIMIndex (edge-order):', { sourceId, targetId, algoId: patch.algorithm.id });
  
  let imIndex = 0;
  for (const edge of diagram.edges) {
    const edgeSrc = parseInt(edge.from.replace(/\D/g, ''));
    const edgeTgt = parseInt(edge.to.replace(/\D/g, ''));
    const isFeedback = edgeSrc === edgeTgt;
    
    if (edgeSrc === sourceId && edgeTgt === targetId) {
      const result = isFeedback ? 5 : imIndex;
      console.log(`  ✅ Found${isFeedback ? ' FEEDBACK' : ''} link OP${sourceId}→OP${targetId} at IM index ${result}`);
      return result;
    }
    if (!isFeedback) {
      imIndex++;
    }
  }
  
  console.warn(`❌ Link OP${sourceId}→OP${targetId} not found in diagram edges!`);
  return -1;
}

/**
 * Listen to incoming CC messages
 */
export function onControlChange(callback: (controller: number, value: number, channel: number) => void) {
  if (!midiInput) {
    console.warn('No MIDI input selected');
    return;
  }
  
  midiInput.addListener('controlchange', (e) => {
    const controller = e.controller.number;
    const value = typeof e.value === 'number' ? e.value : 0;
    const channel = e.message.channel || 1;
    callback(controller, value, channel);
  });
}

/**
 * Listen to incoming NRPN messages
 */
export function onNRPN(callback: (nrpn: NRPNMessage, channel: number) => void) {
  if (!midiInput) {
    console.warn('No MIDI input selected');
    return;
  }
  
  const nrpnBuffer: Map<number, Partial<NRPNMessage>> = new Map();
  
  midiInput.addListener('controlchange', (e) => {
    const channel = e.message.channel || 1;
    const controller = e.controller.number;
    // Utiliser rawValue pour avoir 0-127 au lieu de 0-1
    const value = typeof e.rawValue === 'number' ? e.rawValue : (typeof e.value === 'number' ? Math.round(e.value * 127) : 0);
    
    if (!nrpnBuffer.has(channel)) {
      nrpnBuffer.set(channel, {});
    }
    
    const buffer = nrpnBuffer.get(channel)!;
    
    switch (controller) {
      case 99: // NRPN MSB
        buffer.paramMSB = value;
        break;
      case 98: // NRPN LSB
        buffer.paramLSB = value;
        break;
      case 6: // Data Entry MSB
        buffer.valueMSB = value;
        break;
      case 38: // Data Entry LSB
        buffer.valueLSB = value;
        
        // Complete NRPN message
        if (buffer.paramMSB !== undefined && buffer.paramLSB !== undefined &&
            buffer.valueMSB !== undefined && buffer.valueLSB !== undefined) {
          callback(buffer as NRPNMessage, channel);
          nrpnBuffer.set(channel, {}); // Reset buffer
        }
        break;
    }
  });
}

/**
 * Listen to incoming NRPN messages — scoped version.
 * Returns an unsubscribe function that removes ONLY this listener.
 * Use this when multiple independent consumers need to pull concurrently
 * (e.g. mutation slots) without interfering with each other.
 */
export function onNRPNScoped(
  callback: (nrpn: NRPNMessage, channel: number) => void,
): (() => void) | null {
  if (!midiInput) {
    console.warn('No MIDI input selected');
    return null;
  }

  const input = midiInput; // capture ref
  const nrpnBuffer: Map<number, Partial<NRPNMessage>> = new Map();

  const handler = (e: any) => {
    const channel = e.message.channel || 1;
    const controller = e.controller.number;
    const value =
      typeof e.rawValue === 'number'
        ? e.rawValue
        : typeof e.value === 'number'
        ? Math.round(e.value * 127)
        : 0;

    if (!nrpnBuffer.has(channel)) {
      nrpnBuffer.set(channel, {});
    }

    const buffer = nrpnBuffer.get(channel)!;

    switch (controller) {
      case 99:
        buffer.paramMSB = value;
        break;
      case 98:
        buffer.paramLSB = value;
        break;
      case 6:
        buffer.valueMSB = value;
        break;
      case 38:
        buffer.valueLSB = value;
        if (
          buffer.paramMSB !== undefined &&
          buffer.paramLSB !== undefined &&
          buffer.valueMSB !== undefined &&
          buffer.valueLSB !== undefined
        ) {
          callback(buffer as NRPNMessage, channel);
          nrpnBuffer.set(channel, {});
        }
        break;
    }
  };

  input.addListener('controlchange', handler);

  return () => {
    input.removeListener('controlchange', handler);
  };
}

/**
 * Listen to SysEx messages
 */
export function onSysEx(callback: (data: Uint8Array) => void) {
  if (!midiInput) {
    console.warn('No MIDI input selected');
    return;
  }
  
  midiInput.addListener('sysex', (e) => {
    callback(e.data);
  });
}

/**
 * Legacy function for compatibility
 */
export const startMidiListener = (onPatchUpdate: (patchData: any) => void) => {
  onSysEx((data) => {
    const patchData = parseIncomingSysex(data);
    onPatchUpdate(patchData);
  });
};

/**
 * Parse incoming SysEx data (placeholder - to be implemented)
 */
function parseIncomingSysex(data: Uint8Array): any {
  console.log('Received SysEx:', data);
  // TODO: Implement SysEx parsing based on PreenFM3 format
  return null;
}

/**
 * Get MIDI status
 */
export function getMidiStatus() {
  return {
    enabled: WebMidi.enabled,
    input: midiInput?.name || null,
    output: midiOutput?.name || null,
    channel: currentChannel,
    hasOutput: !!midiOutput,
    hasInput: !!midiInput,
  };
}

/**
 * Debug function to log current MIDI state
 */
export function logMidiStatus() {
  const status = getMidiStatus();
  console.log('🔍 MIDI Status:', status);
  console.log('  WebMIDI enabled:', status.enabled);
  console.log('  Input:', status.input);
  console.log('  Output:', status.output);
  console.log('  Channel:', status.channel);
  return status;
}

/**
 * Send modulation matrix parameter
 * @param rowIndex Row number (0-11)
 * @param paramType Parameter type: 'source', 'amount', 'destination1', 'destination2'
 * @param value Value to send (numeric or string depending on paramType)
 * @param channel MIDI channel
 */
export function sendModulationMatrixParam(
  rowIndex: number,
  paramType: 'source' | 'amount' | 'destination1' | 'destination2',
  value: number | string,
  channel: number = currentChannel
) {
  if (rowIndex < 0 || rowIndex >= 12) {
    console.error('Invalid matrix row index:', rowIndex);
    return;
  }

  // Calculate NRPN MSB and LSB base for this row
  let msb: number, lsbBase: number;
  if (rowIndex < 3) {
    // Rows 0-2: MSB=0, LSB=116 + row*4
    msb = 0;
    lsbBase = 116 + rowIndex * 4;
  } else {
    // Rows 3-11: MSB=1, LSB=(row-3)*4
    msb = 1;
    lsbBase = (rowIndex - 3) * 4;
  }

  // Calculate LSB offset based on parameter type
  let lsbOffset = 0;
  let numericValue = 0;

  switch (paramType) {
    case 'source':
      lsbOffset = 0;
      numericValue = typeof value === 'string' ? getSourceIndex(value) : value;
      break;
    case 'amount':
      lsbOffset = 1;
      // Convert UI range (-1 to +1) to NRPN range (900 to 1100)
      // Formula: multiplierValue = (amount * 100) + 1000
      numericValue = Math.round((value as number) * 100 + 1000);
      break;
    case 'destination1':
      lsbOffset = 2;
      numericValue = typeof value === 'string' ? getDestinationIndex(value) : value;
      break;
    case 'destination2':
      lsbOffset = 3;
      numericValue = typeof value === 'string' ? getDestinationIndex(value) : value;
      break;
  }

  const lsb = lsbBase + lsbOffset;

  // Encode 14-bit value (0-16383)
  const clampedValue = Math.max(0, Math.min(16383, numericValue));
  const valueMSB = (clampedValue >> 7) & 0x7F;
  const valueLSB = clampedValue & 0x7F;

  const nrpn: NRPNMessage = {
    paramMSB: msb,
    paramLSB: lsb,
    valueMSB,
    valueLSB,
  };

  console.log(
    `📤 Sending Matrix Row ${rowIndex + 1} ${paramType}:`,
    typeof value === 'string' ? `"${value}" (${numericValue})` : value,
    `NRPN [${msb},${lsb}] = [${valueMSB},${valueLSB}]`
  );

  sendNRPN(nrpn, channel);
}

/**
 * Get source index from source name
 */
function getSourceIndex(sourceName: string): number {
  const sourceNames = [
    'None', 'LFO 1', 'LFO 2', 'LFO 3', 'LFOEnv1', 'LFOEnv2', 'LFOSeq1', 'LFOSeq2',
    'Modwheel', 'Pitchbend', 'Aftertouch', 'Velocity', 'Note1', 'CC1', 'CC2', 'CC3', 'CC4',
    'Note2', 'Breath', 'MPE Slide', 'Random', 'Poly AT',
    'User CC1', 'User CC2', 'User CC3', 'User CC4', 'PB MPE', 'AT MPE',
  ];
  const index = sourceNames.indexOf(sourceName);
  return index >= 0 ? index : 0;
}

/**
 * Get destination index from destination name
 */
function getDestinationIndex(destName: string): number {
  const destNames = [
    'None', 'Gate', 'IM1', 'IM2', 'IM3', 'IM4', 'IM*',
    'Mix1', 'Pan1', 'Mix2', 'Pan2', 'Mix3', 'Pan3', 'Mix4', 'Pan4', 'Mix*', 'Pan*',
    'o1 Fq', 'o2 Fq', 'o3 Fq', 'o4 Fq', 'o5 Fq', 'o6 Fq', 'o* Fq',
    'Env1 A', 'Env2 A', 'Env3 A', 'Env4 A', 'Env5 A', 'Env6 A', 'Env* A', 'Env* R',
    'Mtx1 x', 'Mtx2 x', 'Mtx3 x', 'Mtx4 x',
    'Lfo1 F', 'Lfo2 F', 'Lfo3 F', 'Env2 S', 'Seq1 G', 'Seq2 G',
    'Flt1 P1', 'o* FqH', 'Env* D', 'EnvM A', 'EnvM D', 'EnvM R',
    'Mtx FB', 'Flt1 P2', 'Flt1 G', 'Flt2 P1', 'Flt2 P2', 'Flt2 G',
  ];
  const index = destNames.indexOf(destName);
  return index >= 0 ? index : 0;
}
