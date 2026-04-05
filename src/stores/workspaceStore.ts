/**
 * workspaceStore
 * ──────────────────────────────────────────────────────────────────────────────
 * Shared patch workspace state across all tool-tabs (Variator, Breeder, …).
 *
 * Why this exists
 * ───────────────
 * The different tool-tabs (Variator, Breeder, Matcher, …) are "facets" of the
 * same iterative sound-design workflow.  A user should be able to:
 *   • Generate variations in the Variator → send one as Parent A or B to the
 *     Breeder without losing the variation list.
 *   • Load a Breeder child as the current patch → come back to the Variator and
 *     start a new variation pass from that child.
 *
 * This store holds the data that must survive tab switches and be readable by
 * sibling components:
 *   breedParentA / breedParentB — the two parent slots owned by the Breeder,
 *     but writable from the Variator via the "→ A / → B" card buttons.
 */

import { create } from 'zustand';
import type { Patch } from '../types/patch';

export const SLOT_COUNT = 4;

interface WorkspaceState {
  /** Parent A for the Genetic Breeder (survives tab switches). */
  breedParentA: Patch | null;
  /** Parent B for the Genetic Breeder (survives tab switches). */
  breedParentB: Patch | null;

  setBreedParentA: (patch: Patch | null) => void;
  setBreedParentB: (patch: Patch | null) => void;

  /**
   * Temporary patch memory slots shared across all tool-tabs.
   * Any tool can save a patch here; any tool can recall it.
   * Length is always SLOT_COUNT (4); unused slots are null.
   */
  slots: (Patch | null)[];

  /** Store a deep copy of `patch` at `index` (0-based). */
  saveToSlot: (index: number, patch: Patch) => void;
  /** Clear slot at `index`. */
  clearSlot: (index: number) => void;
  /** Load the patch from `index` into the main patch editor. No-op if slot is empty. */
  loadFromSlot: (index: number) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  breedParentA: null,
  breedParentB: null,
  setBreedParentA: (breedParentA) => set({ breedParentA }),
  setBreedParentB: (breedParentB) => set({ breedParentB }),

  slots: Array(SLOT_COUNT).fill(null) as (Patch | null)[],

  saveToSlot: (index, patch) =>
    set((state) => {
      const next = [...state.slots];
      next[index] = JSON.parse(JSON.stringify(patch));
      return { slots: next };
    }),

  clearSlot: (index) =>
    set((state) => {
      const next = [...state.slots];
      next[index] = null;
      return { slots: next };
    }),

  loadFromSlot: (index) => {
    const patch = get().slots[index];
    if (!patch) return;
    // Import lazily to avoid a circular module dependency
    import('../stores/patchStore').then(({ usePatchStore }) => {
      usePatchStore.getState().loadPatch(JSON.parse(JSON.stringify(patch)));
    });
  },
}));
