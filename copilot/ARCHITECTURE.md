# Architecture & Key Files

## Frontend Stack

| Layer | Technology |
|---|---|
| UI framework | React 18 + TypeScript |
| Styling | styled-components |
| State | Zustand (stores/) |
| Build | Vite |
| MIDI | Web MIDI API (`navigator.requestMIDIAccess`) |

## Zustand Stores

| Store | File | Owns |
|---|---|---|
| `usePatchStore` | `stores/patchStore.ts` | Current patch (editor state), revision history, `loadPatch()` |
| `useMidiStore` | `midi/usePreenFM3Midi.ts` | Selected MIDI output, channel |
| `useWorkspaceStore` | `stores/workspaceStore.ts` | Shared cross-tab slots: `breedParentA`, `breedParentB` |

## Main Screen: PatchLibrary

`src/screens/PatchLibrary.tsx` — renders `PatchSavePanel`, `BankOrganizerPanel`,
`PatchSlotRack`, and `BreederEditor` directly (no tab switching).

| Component | Purpose |
|---|---|
| `BreederEditor` | Genetic crossover of two parent patches |

## Data Flow (workspaceStore)

```
BreederEditor
  reads parentA  ←  workspaceStore.breedParentA
  reads parentB  ←  workspaceStore.breedParentB
  child "Load"   →  usePatchStore.loadPatch()  (currentPatch becomes new base)

PatchSlotRack
  save/recall    ↔  workspaceStore.slots
```

## Patch Type (`src/types/patch.ts`)

The `Patch` object is the central domain type.  Key fields:

- `algorithm: { id: number }` — FM algorithm (0–31)
- `operators: Operator[]` — 6 operators, each with `frequency`, `amplitude`, ADSR
- `modulationMatrix: ModulationMatrixRow[]` — 12 rows of IM routing
- `filters: Filter[]` — 2 filters
- `name: string`

## Genetic Algorithm (`src/utils/geneticAlgorithm.ts`)

5 DNA blocks: `ALGO`, `OSC`, `ENV`, `MATRIX`, `FILTER`.  
Each block is inherited wholesale from one parent.  
`generateChildren(parentA, parentB, count, mutationRate)` returns `BreedResult[]`.

