/**
 * React hook for PreenFM3 MIDI communication
 * Uses a Zustand store so MIDI state is shared across all components.
 */

import { useEffect, useCallback } from 'react';
import { create } from 'zustand';
import { Input, Output } from 'webmidi';
import {
  initializeMidi,
  setMidiInput,
  setMidiOutput,
  setMidiChannel,
  sendAlgorithmChange,
  sendIMChange,
  sendCC,
  sendNRPN,
  onControlChange,
  onNRPNScoped,
  onSysEx,
  getMidiStatus,
  logMidiStatus,
} from './midiService';

import type { NRPNMessage } from './preenFM3MidiMap';

// LocalStorage keys for MIDI preferences
const STORAGE_KEYS = {
  INPUT_ID: 'preenFM3_midi_input_id',
  OUTPUT_ID: 'preenFM3_midi_output_id',
  CHANNEL: 'preenFM3_midi_channel',
} as const;

/**
 * Save MIDI preferences to localStorage
 */
function saveMidiPreferences(inputId: string | null, outputId: string | null, channel: number) {
  try {
    console.log('💾 Sauvegarde préférences MIDI:', { inputId, outputId, channel });
    
    // Sauvegarder ou supprimer l'input ID
    if (inputId) {
      localStorage.setItem(STORAGE_KEYS.INPUT_ID, inputId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.INPUT_ID);
    }
    
    // Sauvegarder ou supprimer l'output ID
    if (outputId) {
      localStorage.setItem(STORAGE_KEYS.OUTPUT_ID, outputId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.OUTPUT_ID);
    }
    
    // Le canal est toujours sauvegardé
    localStorage.setItem(STORAGE_KEYS.CHANNEL, channel.toString());
  } catch (error) {
    console.warn('Failed to save MIDI preferences:', error);
  }
}

/**
 * Load MIDI preferences from localStorage
 */
function loadMidiPreferences(): { inputId: string | null; outputId: string | null; channel: number } {
  try {
    return {
      inputId: localStorage.getItem(STORAGE_KEYS.INPUT_ID),
      outputId: localStorage.getItem(STORAGE_KEYS.OUTPUT_ID),
      channel: parseInt(localStorage.getItem(STORAGE_KEYS.CHANNEL) || '1', 10),
    };
  } catch (error) {
    console.warn('Failed to load MIDI preferences:', error);
    return { inputId: null, outputId: null, channel: 1 };
  }
}

export interface MidiDevices {
  inputs: Input[];
  outputs: Output[];
}

export interface MidiState {
  enabled: boolean;
  devices: MidiDevices | null;
  selectedInput: Input | null;
  selectedOutput: Output | null;
  channel: number;
  isLoading: boolean;
  error: string | null;
}

interface MidiStoreActions {
  _setLoading: (isLoading: boolean) => void;
  _setInitialized: (devices: MidiDevices, selectedInput: Input | null, selectedOutput: Output | null, channel: number) => void;
  _setError: (error: string) => void;
  selectInput: (input: Input | null) => void;
  selectOutput: (output: Output | null) => void;
  changeChannel: (channel: number) => void;
}

type MidiStore = MidiState & MidiStoreActions;

/**
 * Global Zustand store for MIDI state — shared across all components
 */
export const useMidiStore = create<MidiStore>((set, get) => ({
  // Initial state
  enabled: false,
  devices: null,
  selectedInput: null,
  selectedOutput: null,
  channel: 1,
  isLoading: false,
  error: null,

  // Internal actions (used by the init effect)
  _setLoading: (isLoading) => set({ isLoading }),
  _setInitialized: (devices, selectedInput, selectedOutput, channel) =>
    set({ enabled: true, devices, selectedInput, selectedOutput, channel, isLoading: false }),
  _setError: (error) => set({ enabled: false, isLoading: false, error }),

  // Public actions

  selectInput: (input) => {
    console.log('🎹 Sélection MIDI Input:', input?.name || 'None', input?.id || null);
    setMidiInput(input);
    let { selectedOutput, channel, devices } = get();
    // Si aucune sortie n'est sélectionnée, essayer d'en trouver une avec le même nom ou id
    if (!selectedOutput && input && devices) {
      const match = devices.outputs.find(
        o => o.id === input.id || o.name === input.name
      );
      if (match) {
        setMidiOutput(match);
        selectedOutput = match;
      }
    }
    saveMidiPreferences(input?.id || null, selectedOutput?.id || null, channel);
    set({ selectedInput: input, selectedOutput });
  },

  selectOutput: (output) => {
    console.log('🎹 Sélection MIDI Output:', output?.name || 'None', output?.id || null);
    setMidiOutput(output);
    let { selectedInput, channel, devices } = get();
    // Si aucune entrée n'est sélectionnée, essayer d'en trouver une avec le même nom ou id
    if (!selectedInput && output && devices) {
      const match = devices.inputs.find(
        i => i.id === output.id || i.name === output.name
      );
      if (match) {
        setMidiInput(match);
        selectedInput = match;
      }
    }
    saveMidiPreferences(selectedInput?.id || null, output?.id || null, channel);
    set({ selectedOutput: output, selectedInput });
  },

  changeChannel: (channel) => {
    setMidiChannel(channel);
    const { selectedInput, selectedOutput } = get();
    saveMidiPreferences(selectedInput?.id || null, selectedOutput?.id || null, channel);
    set({ channel });
  },
}));

/** Flag to ensure the async init runs only once across all hook instances */
let _midiInitStarted = false;

/**
 * Hook to manage MIDI connection and communication with PreenFM3.
 * The underlying state lives in a Zustand store so every consumer sees the same values.
 */
export function usePreenFM3Midi() {
  const state = useMidiStore();

  // Initialize MIDI once (first mount of any consumer)
  useEffect(() => {
    if (_midiInitStarted) return;
    _midiInitStarted = true;

    const init = async () => {
      useMidiStore.getState()._setLoading(true);
      
      try {
        const devices = await initializeMidi();
        
        // Load saved preferences
        const prefs = loadMidiPreferences();
        console.log('🎹 Restauration des préférences MIDI:', prefs);
        
        // Try to restore previously selected devices
        const savedInput = prefs.inputId 
          ? devices.inputs.find(input => input.id === prefs.inputId)
          : null;
        const savedOutput = prefs.outputId 
          ? devices.outputs.find(output => output.id === prefs.outputId)
          : null;
        
        // Vérifier si les périphériques sauvés sont encore disponibles
        const inputStillExists = prefs.inputId && savedInput;
        const outputStillExists = prefs.outputId && savedOutput;
        
        // Nettoyer localStorage si les périphériques ne sont plus disponibles
        if (prefs.inputId && !inputStillExists) {
          console.log('Périphérique MIDI input sauvé non trouvé, nettoyage...', prefs.inputId);
          localStorage.removeItem(STORAGE_KEYS.INPUT_ID);
        }
        
        if (prefs.outputId && !outputStillExists) {
          console.log('Périphérique MIDI output sauvé non trouvé, nettoyage...', prefs.outputId);
          localStorage.removeItem(STORAGE_KEYS.OUTPUT_ID);
        }
        
        // Utiliser uniquement les périphériques explicitement sauvés et encore disponibles
        const selectedInput = savedInput || null;
        const selectedOutput = savedOutput || null;
        const selectedChannel = prefs.channel || 1;
        
        useMidiStore.getState()._setInitialized(devices, selectedInput, selectedOutput, selectedChannel);

        // Auto-connect uniquement si des périphériques étaient explicitement sauvés
        if (selectedInput) {
          console.log('🎹 Restauration MIDI Input:', selectedInput.name, selectedInput.id);
          setMidiInput(selectedInput);
        }
        if (selectedOutput) {
          console.log('🎹 Restauration MIDI Output:', selectedOutput.name, selectedOutput.id);
          setMidiOutput(selectedOutput);
        }
        setMidiChannel(selectedChannel);
        
        // Ne sauvegarder que si on a des périphériques sélectionnés
        // Évite de sauvegarder null de manière non intentionnelle
        if (selectedInput || selectedOutput) {
          saveMidiPreferences(
            selectedInput?.id || null, 
            selectedOutput?.id || null, 
            selectedChannel
          );
        }
        
      } catch (err) {
        useMidiStore.getState()._setError(
          err instanceof Error ? err.message : 'Failed to initialize MIDI'
        );
      }
    };

    init();
  }, []);

  // Listen to CC changes from PreenFM3
  const listenToCC = useCallback((callback: (controller: number, value: number, channel: number) => void) => {
    onControlChange(callback);
  }, []);


  // Listen to NRPN changes from PreenFM3
  const listenToNRPN = useCallback((callback: (nrpn: NRPNMessage, channel: number) => void) => {
    return onNRPNScoped(callback);
  }, []);

  // Listen to SysEx messages
  const listenToSysEx = useCallback((callback: (data: Uint8Array) => void) => {
    onSysEx(callback);
  }, []);

  return {
    // State
    ...state,

    // Send functions (use current channel from store)
    sendAlgorithmChange: useCallback((algoId: number | string) => 
      sendAlgorithmChange(algoId, useMidiStore.getState().channel), []),
    sendIMChange: useCallback((imNumber: number, value: number) => 
      sendIMChange(imNumber, value, useMidiStore.getState().channel), []),
    sendCC: useCallback((controller: number, value: number) => 
      sendCC(controller, value, useMidiStore.getState().channel), []),
    sendNRPN: useCallback((nrpn: NRPNMessage) => 
      sendNRPN(nrpn, useMidiStore.getState().channel), []),

    // Listen functions
    listenToCC,
    listenToNRPN,
    listenToSysEx,

    // Utility
    getStatus: getMidiStatus,
    logStatus: logMidiStatus,
  };
}

/**
 * Hook to sync patch parameter changes to PreenFM3 via MIDI
 */
export function usePatchMidiSync(enabled: boolean = false) {
  const midi = usePreenFM3Midi();

  // Sync algorithm changes
  const syncAlgorithm = useCallback((algoId: string | number) => {
    if (enabled && midi.enabled && midi.selectedOutput) {
      midi.sendAlgorithmChange(typeof algoId === 'string' ? parseInt(algoId.replace('alg', '')) - 1 : algoId);
    }
  }, [enabled, midi]);

  // Sync modulation index changes
  const syncModulationIndex = useCallback((sourceId: number, targetId: number, value: number) => {
    if (enabled && midi.enabled && midi.selectedOutput) {
      // Calculate IM number based on source and target
      // This is a simplified mapping - actual mapping depends on algorithm
      const imNumber = (sourceId - 1) * 4 + targetId; // Placeholder logic
      midi.sendIMChange(imNumber, value);
    }
  }, [enabled, midi]);

  return {
    midi,
    syncAlgorithm,
    syncModulationIndex,
  };
}
