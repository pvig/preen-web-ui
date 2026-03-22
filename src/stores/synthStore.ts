import { create } from 'zustand';

interface SynthState {
  pfm3Version: number | null;
  midiConnectionType: 'none' | 'usb' | 'din' | 'webmidi' | 'unknown';
  setPfm3Version: (version: number | null) => void;
  setMidiConnectionType: (type: SynthState['midiConnectionType']) => void;
}

export const useSynthStore = create<SynthState>((set) => ({
  pfm3Version: null,
  midiConnectionType: 'none',
  setPfm3Version: (version) => set({ pfm3Version: version }),
  setMidiConnectionType: (type) => set({ midiConnectionType: type }),
}));
