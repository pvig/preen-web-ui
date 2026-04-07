import { create } from 'zustand';

// ── Reactive state (drives header visibility) ──────────────────
interface SpectrogramBridgeState {
  isListening: boolean;
  setIsListening: (v: boolean) => void;
}

export const useSpectrogramBridge = create<SpectrogramBridgeState>(set => ({
  isListening: false,
  setIsListening: v => set({ isListening: v }),
}));

// ── Audio band energies — written by PreenSpectrogram RAF, read by StarfieldCanvas RAF ──
// 4 bands matching the 4 star shells. Values in [0, 1].
// Mutable object avoids any React overhead in hot paths.
export const audioBands = {
  band0: 0,   // shell 0 — sub/bass   ~20–250 Hz
  band1: 0,   // shell 1 — low-mid   ~250–2000 Hz
  band2: 0,   // shell 2 — hi-mid    ~2000–8000 Hz
  band3: 0,   // shell 3 — high      ~8000–20000 Hz
};
