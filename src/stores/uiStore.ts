import { create } from 'zustand';

const LS_KEY = 'preenFM3_starfield_enabled';
const KNOB_MODE_LS_KEY = 'preenFM3_knob_drag_mode';

export type KnobDragMode = 'circular' | 'vertical';

function loadStarfield(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

function loadKnobDragMode(): KnobDragMode {
  try {
    return localStorage.getItem(KNOB_MODE_LS_KEY) === 'vertical' ? 'vertical' : 'circular';
  } catch {
    return 'circular';
  }
}

interface UIStore {
  starfieldEnabled: boolean;
  toggleStarfield: () => void;
  knobDragMode: KnobDragMode;
  setKnobDragMode: (mode: KnobDragMode) => void;
  slowApiRequestCount: number;
  incrementSlowRequest: () => void;
  decrementSlowRequest: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  starfieldEnabled: loadStarfield(),
  toggleStarfield: () => {
    const next = !get().starfieldEnabled;
    try { localStorage.setItem(LS_KEY, String(next)); } catch { /* ignore */ }
    set({ starfieldEnabled: next });
  },
  knobDragMode: loadKnobDragMode(),
  setKnobDragMode: (mode) => {
    try { localStorage.setItem(KNOB_MODE_LS_KEY, mode); } catch { /* ignore */ }
    set({ knobDragMode: mode });
  },
  slowApiRequestCount: 0,
  incrementSlowRequest: () => set(s => ({ slowApiRequestCount: s.slowApiRequestCount + 1 })),
  decrementSlowRequest: () => set(s => ({ slowApiRequestCount: Math.max(0, s.slowApiRequestCount - 1) })),
}));
