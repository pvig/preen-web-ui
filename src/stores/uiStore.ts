import { create } from 'zustand';

const LS_KEY = 'preenFM3_starfield_enabled';

function loadStarfield(): boolean {
  try {
    const v = localStorage.getItem(LS_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

interface UIStore {
  starfieldEnabled: boolean;
  toggleStarfield: () => void;
}

export const useUIStore = create<UIStore>((set, get) => ({
  starfieldEnabled: loadStarfield(),
  toggleStarfield: () => {
    const next = !get().starfieldEnabled;
    try { localStorage.setItem(LS_KEY, String(next)); } catch { /* ignore */ }
    set({ starfieldEnabled: next });
  },
}));
