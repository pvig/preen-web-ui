// src/components/fmEngine/FMSynthContext.tsx
import React, { createContext, useContext, useMemo, useState } from 'react';
//import { usePatchStore, useSelectedOperatorId, usePatchActions } from '../../stores/patchStore';
import { Patch } from "../../types/patch";
//import { type Algorithm, type Envelope, type Patch } from '../../types/patch';

export interface HighlightedLink {
  sourceId: number;
  targetId: number;
}

interface FMSynthContextType {
  patch: Patch;
  getOperator: (id: number) => Patch["operators"][number] | undefined;
  updateOperator: (id: number, changes: Partial<Patch["operators"][number]>) => void;
  highlightedLink: HighlightedLink | null;
  setHighlightedLink: (link: HighlightedLink | null) => void;
  highlightedNode: number | null;
  setHighlightedNode: (nodeId: number | null) => void;
}

const FMSynthContext = createContext<FMSynthContextType | null>(null);

export const FMSynthProvider = ({ patch, children }: { patch: Patch, children: React.ReactNode }) => {
  //const store = useCurrentPatch();
  const [highlightedLink, setHighlightedLink] = useState<HighlightedLink | null>(null);
  const [highlightedNode, setHighlightedNode] = useState<number | null>(null);
  
  const value = useMemo<FMSynthContextType>(
    () => ({
      patch,
      getOperator: (id) => patch.operators.find((op) => op.id === id),
      updateOperator: () => {
        // ⚠️ Ici : soit tu relies directement à usePatchStore.updateOscillator/updateOperator
        //console.log("Update operator", id, changes);
      },
      highlightedLink,
      setHighlightedLink,
      highlightedNode,
      setHighlightedNode,
    }),
    [patch, highlightedLink, highlightedNode]
  );
  return (
    <FMSynthContext.Provider value={value}>{children}</FMSynthContext.Provider>
  );
}

export const useFMSynthContext = () => {
  const context = useContext(FMSynthContext);
  if (!context) {
    throw new Error('useFMSynthContext must be used within FMSynthProvider');
  }
  return context;
};