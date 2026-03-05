/**
 * React hook for PreenFM3 MIDI communication
 */

import { useEffect, useState, useCallback } from 'react';
import { Input, Output } from 'webmidi';
import {
  initializeMidi,
  setMidiInput,
  setMidiOutput,
  setMidiChannel,
  sendAlgorithmChange,
  sendIMChange,
  sendEnvelopeAttack,
  sendEnvelopeRelease,
  sendCC,
  sendNRPN,
  onControlChange,
  onNRPN,
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

/**
 * Hook to manage MIDI connection and communication with PreenFM3
 */
export function usePreenFM3Midi() {
  const [state, setState] = useState<MidiState>({
    enabled: false,
    devices: null,
    selectedInput: null,
    selectedOutput: null,
    channel: 1,
    isLoading: false,
    error: null,
  });

  // Initialize MIDI on mount
  useEffect(() => {
    const init = async () => {
      setState(prev => ({ ...prev, isLoading: true }));
      
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
        
        setState(prev => ({
          ...prev,
          enabled: true,
          devices,
          isLoading: false,
          selectedInput,
          selectedOutput,
          channel: selectedChannel,
        }));

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
        setState(prev => ({
          ...prev,
          enabled: false,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to initialize MIDI',
        }));
      }
    };

    init();
  }, []);

  // Select MIDI input device
  const selectInput = useCallback((input: Input | null) => {
    console.log('🎹 Sélection MIDI Input:', input?.name || 'None', input?.id || null);
    setMidiInput(input);
    setState(prev => {
      const newState = { ...prev, selectedInput: input };
      // Save to localStorage
      saveMidiPreferences(input?.id || null, prev.selectedOutput?.id || null, prev.channel);
      return newState;
    });
  }, []);

  // Select MIDI output device
  const selectOutput = useCallback((output: Output | null) => {
    console.log('🎹 Sélection MIDI Output:', output?.name || 'None', output?.id || null);
    setMidiOutput(output);
    setState(prev => {
      const newState = { ...prev, selectedOutput: output };
      // Save to localStorage
      saveMidiPreferences(prev.selectedInput?.id || null, output?.id || null, prev.channel);
      return newState;
    });
  }, []);

  // Change MIDI channel
  const changeChannel = useCallback((channel: number) => {
    setMidiChannel(channel);
    setState(prev => {
      const newState = { ...prev, channel };
      // Save to localStorage
      saveMidiPreferences(prev.selectedInput?.id || null, prev.selectedOutput?.id || null, channel);
      return newState;
    });
  }, []);

  // Listen to CC changes from PreenFM3
  const listenToCC = useCallback((callback: (controller: number, value: number, channel: number) => void) => {
    onControlChange(callback);
  }, []);

  // Listen to NRPN changes from PreenFM3
  const listenToNRPN = useCallback((callback: (nrpn: NRPNMessage, channel: number) => void) => {
    onNRPN(callback);
  }, []);

  // Listen to SysEx messages
  const listenToSysEx = useCallback((callback: (data: Uint8Array) => void) => {
    onSysEx(callback);
  }, []);

  return {
    // State
    ...state,
    
    // Device selection
    selectInput,
    selectOutput,
    changeChannel,
    
    // Send functions
    sendAlgorithmChange: useCallback((algoId: number | string) => 
      sendAlgorithmChange(algoId, state.channel), [state.channel]),
    sendIMChange: useCallback((imNumber: number, value: number) => 
      sendIMChange(imNumber, value, state.channel), [state.channel]),
    sendEnvelopeAttack: useCallback((opNumber: number, value: number) => 
      sendEnvelopeAttack(opNumber, value, state.channel), [state.channel]),
    sendEnvelopeRelease: useCallback((opNumber: number, value: number) => 
      sendEnvelopeRelease(opNumber, value, state.channel), [state.channel]),
    sendCC: useCallback((controller: number, value: number) => 
      sendCC(controller, value, state.channel), [state.channel]),
    sendNRPN: useCallback((nrpn: NRPNMessage) => 
      sendNRPN(nrpn, state.channel), [state.channel]),
    
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

  // Sync envelope changes
  const syncEnvelope = useCallback((opNumber: number, attack: number, release: number) => {
    if (enabled && midi.enabled && midi.selectedOutput) {
      midi.sendEnvelopeAttack(opNumber, attack);
      midi.sendEnvelopeRelease(opNumber, release);
    }
  }, [enabled, midi]);

  return {
    midi,
    syncAlgorithm,
    syncModulationIndex,
    syncEnvelope,
  };
}
