/**
 * Types pour les sources de modulation du PreenFM3
 * - LFO Envelopes (2): Enveloppes ADSR qui modulent les LFOs
 * - Step Sequencers (2): Séquenceurs de pas pour modulation rythmique
 */

import { AdsrState } from './adsr';
import { type StepSeqMidiClockMode, STEP_SEQ_MIDI_CLOCK_MODES } from '../midi/preenFmConstants';
export { type StepSeqMidiClockMode, STEP_SEQ_MIDI_CLOCK_MODES };

/**
 * Mode de boucle pour LFO Envelope
 */
export type LfoEnvLoopMode = 'Off' | 'Silence' | 'Attack';

/**
 * LFO Envelope
 * Enveloppe ADSR qui peut moduler les LFOs et autres paramètres
 */
export interface LFOEnvelope {
  adsr: AdsrState;           // Enveloppe ADSR classique
  loopMode: LfoEnvLoopMode;  // Mode de boucle
  silence: number;           // Paramètre silence (pour Env2) (0-100)
}

/**
 * Mode de synchronisation pour Step Sequencer
 */
export type StepSeqSyncMode = 'Int' | 'Ext';

/**
 * Step Sequencer
 * Séquenceur de pas avec 16 étapes (PreenFM3 firmware structure)
 */
export interface StepSequencer {
  steps: number[];              // 16 valeurs (0-100)
  gate: number;                 // Gate global (0-1, 0-100%)
  syncMode: StepSeqSyncMode;    // Synchronisation interne ou externe (MIDI Clock)
  bpm: number;                  // Tempo (10-240) - utilisé si syncMode = 'Int'
  midiClockMode: StepSeqMidiClockMode;  // Mode MIDI Clock - utilisé si syncMode = 'Ext'
}

/**
 * Valeurs par défaut pour LFO Envelope
 */
export const DEFAULT_LFO_ENVELOPE: LFOEnvelope = {
  adsr: {
    attack: { time: 0, level: 0 },
    decay: { time: 1, level: 100 },
    sustain: { time: 5, level: 30 },
    release: { time: 10, level: 0 }
  },
  loopMode: 'Off',
  silence: 0
};

/**
 * Valeurs par défaut pour Step Sequencer
 */
export const DEFAULT_STEP_SEQUENCER: StepSequencer = {
  steps: Array(16).fill(50),      // Toutes les valeurs à 50
  gate: 0.5,                      // Gate à 50%
  syncMode: 'Int',                // Synchronisation interne par défaut
  bpm: 120,                       // 120 BPM par défaut
  midiClockMode: 'Ck/4',          // MIDI Clock / 4 par défaut (noires)
};
