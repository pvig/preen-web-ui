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
      // UI: 0-99.9 Hz → NRPN: 0-16383 (0-100)
      rawValue = Math.max(0, Math.min(16383, Math.round((value / 100) * 16383)));
      break;
    case 'bias':
      // UI: -1 à +1 → NRPN: 0-16383 (-100 à +100)
      rawValue = Math.max(0, Math.min(16383, Math.round(((value + 1) / 2) * 16383)));
      break;
    case 'keysync':
      // UI: 0-16 (ou -1 pour Off) → NRPN: 0-16383 (0-16)
      rawValue = value < 0 ? 0 : Math.max(0, Math.min(16383, Math.round((value / 16) * 16383)));
      break;
    case 'phase':
      // UI: 0-360° → NRPN: 0-16383
      rawValue = Math.max(0, Math.min(16383, Math.round((value / 360) * 16383)));
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
  // NRPN MSB=1, LSB fixes : Env1=52-55, Env2=57-60
  const lsbs = envIndex === 0 ? [52, 53, 54, 55] : [57, 58, 59, 60];
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
 * MIDI Service for PreenFM3 Communication
 * Handles Web MIDI API for sending/receiving CC, NRPN, and SysEx messages
 */

import { WebMidi, Input, Output } from 'webmidi';
import { PREENFM3_CC, NRPNMessage, NRPN_COMMANDS } from './preenFM3MidiMap';

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
 * Send an NRPN message (4 CC messages)
 */
export function sendNRPN(nrpn: NRPNMessage, channel: number = currentChannel) {
  if (!midiOutput) {
    console.warn('No MIDI output selected');
    return;
  }
  
  try {
    // Build status byte for Control Change
    const statusByte = 0xB0 + (channel - 1);
    
    console.log('📤 Sending NRPN via Output:', { id: midiOutput.id, name: midiOutput.name });
    
    // Send 4 CC messages using raw MIDI WITHOUT timestamp
    // CC 99 = NRPN MSB
    midiOutput.send([statusByte, 99, nrpn.paramMSB & 0x7F]);
    // CC 98 = NRPN LSB
    midiOutput.send([statusByte, 98, nrpn.paramLSB & 0x7F]);
    // CC 6 = Data Entry MSB
    midiOutput.send([statusByte, 6, nrpn.valueMSB & 0x7F]);
    // CC 38 = Data Entry LSB
    midiOutput.send([statusByte, 38, nrpn.valueLSB & 0x7F]);
    
    console.log(`Sent NRPN [${nrpn.paramMSB},${nrpn.paramLSB}] = [${nrpn.valueMSB},${nrpn.valueLSB}] on channel ${channel}`);
  } catch (err) {
    console.error('Failed to send NRPN:', err);
  }
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
 * Send algorithm change (CC 20)
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
 * Send envelope attack for an operator (1-6)
 */
export function sendEnvelopeAttack(opNumber: number, value: number, channel: number = currentChannel) {
  if (opNumber < 1 || opNumber > 6) {
    console.error('Invalid operator number:', opNumber);
    return;
  }
  
  // Scale 0-16 (seconds) to 0-127
  const ccValue = Math.round(value * 8); // value * 64 / 8 for 0-16 range
  
  if (opNumber === 1) {
    sendCC(PREENFM3_CC.ENV_ATK_OP1, ccValue, channel);
  } else {
    sendCC(PREENFM3_CC.ENV_ATK_OP2 + (opNumber - 2), ccValue, channel);
  }
}

/**
 * Send envelope release for an operator (1-6)
 */
export function sendEnvelopeRelease(opNumber: number, value: number, channel: number = currentChannel) {
  if (opNumber < 1 || opNumber > 6) {
    console.error('Invalid operator number:', opNumber);
    return;
  }
  
  // Scale 0-32 (seconds) to 0-127
  const ccValue = Math.round(value * 4); // value * 127 / 32
  sendCC(PREENFM3_CC.ENV_REL_OP1 + (opNumber - 1), ccValue, channel);
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
  
  // OP1-4: Interleaved mapping - Pan on odd CCs: 23, 25, 27, 29
  // value is -100 (left) to 100 (right) in UI
  // CC range: 0-127 (0=full left, 64=center, 127=full right)
  const scaledValue = Math.max(0, Math.min(127, Math.round((value + 100) * 127 / 200)));
  const ccNumber = 23 + (opNumber - 1) * 2; // CC23, CC25, CC27, CC29
  
  console.log('📤 Sending PAN via CC:', {
    opNumber,
    ccNumber,
    expectedParam: `Pan${opNumber}`,
    originalValue: value,
    scaledValue,
    hex: `0x${(0xB0 + channel - 1).toString(16)} 0x${ccNumber.toString(16)} 0x${scaledValue.toString(16)}`
  });
  
  sendCC(ccNumber, scaledValue, channel);
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
  
  // UI value: 0-100
  // Feedback: firmware 0-100 (represents 0.0-1.0)
  // Regular IMs: firmware 0-1000 (represents 0.0-10.0, multiply by 10)
  const firmwareValue = isFeedback 
    ? Math.round(Math.max(0, Math.min(100, value)))
    : Math.round(Math.max(0, Math.min(100, value)) * 10);
  
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
  
  // UI value: 0-100
  // Feedback: firmware 0-100 (represents 0.0-1.0 scale)
  // Regular IMVelo: firmware 0-1000 (represents 0.0-10.0 scale, multiply by 10)
  const firmwareValue = isFeedback 
    ? Math.round(Math.max(0, Math.min(100, value)))
    : Math.round(Math.max(0, Math.min(100, value)) * 10);
  
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
 * Calculate the global IM index for a modulation link
 * Traverses operators in order to find the position of the source->target link
 * Returns -1 if link not found
 */
export function calculateIMIndex(patch: import('../types/patch').Patch, sourceId: number, targetId: number): number {
  let imIndex = 0;
  
  console.log('🔍 calculateIMIndex:', { sourceId, targetId, totalOperators: patch.operators.length });
  
  for (const op of patch.operators) {
    console.log(`  Checking OP${op.id}, targets:`, op.target.map(t => `OP${t.id}`));
    
    for (const target of op.target) {
      // Check if this is the link we're looking for
      if (op.id === sourceId && target.id === targetId) {
        const isFeedback = sourceId === targetId;
        console.log(`  ✅ Found${isFeedback ? ' FEEDBACK' : ''} link OP${sourceId}→OP${targetId} at index ${imIndex}`);
        return imIndex;
      }
      // Only count valid links (where target exists in operators)
      if (patch.operators.some(o => o.id === target.id)) {
        imIndex++;
      }
    }
  }
  
  console.warn(`❌ Link OP${sourceId}→OP${targetId} not found!`);
  return -1; // Link not found
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
