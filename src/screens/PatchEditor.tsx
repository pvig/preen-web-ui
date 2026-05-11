import { useState } from 'react';
import React from 'react';
import styled from 'styled-components';
import OperatorPanel from '../components/fmEngine/OperatorPanel';
import { FMSynthProvider } from '../components/fmEngine/FMSynthContext';
import { FMAlgorithmSelector } from '../components/fmEngine/FMAlgorithmSelector';
import CarrierControls from '../components/fmEngine/CarrierControls';
import { useCurrentPatch, updateGlobal, usePatchStore } from '../stores/patchStore';
import { useMutationStore } from '../stores/mutationStore';
import ModulationIndexesEditor from '../components/fmEngine/ModulationIndexesEditor';
import KnobBase from '../components/knobs/KnobBase';
import { useThemeStore } from '../theme/themeStore';
import { useSynthStore } from '../stores/synthStore';
import { FilterEditor } from '../components/modulations/FilterEditor';

interface RowProps {
  width?: string | number;
}

const Row = styled.div<RowProps>`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin: 0 auto;
  height: auto;
  width: ${(props) => (props.width ? props.width : '100%')};

  @media (max-width: 768px) {
    flex-direction: column;
    width: 100%;
  }
`;

const BaseFMGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  width: 100%;
  max-width: 900px;

  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;


const OperatorGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-around;
  margin: 10px auto;
  max-width: 900px;
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  
  h3{
    margin:0;
  }
`;

const GlobalKnobWrapper = styled.div`
  @media (max-width: 768px) {
    transform: scale(0.85);
  }
`;

const PatchNameBar = styled.div`
  display: flex;
  align-items: center;
  max-width: 900px;
  margin: 0 auto 0.75rem;
  padding: 0 0.5rem;

  input {
    background: transparent;
    border: none;
    color: ${props => props.theme.colors.text};
    font-size: 1.1rem;
    font-weight: 700;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    min-width: 120px;
    max-width: 220px;
    &:focus {
      outline: 1px solid ${props => props.theme.colors.primary};
      background: ${props => props.theme.colors.panel};
    }
  }

  span {
    color: ${props => props.theme.colors.text};
    font-size: 1.1rem;
    font-weight: 700;
    padding: 0.2rem 0.4rem;
    border-radius: 4px;
    cursor: pointer;
    &:hover {
      background: ${props => `${props.theme.colors.primary}18`};
    }
  }
`;

function PatchNameEditorComponent() {
  const currentPatch = useCurrentPatch();
  const { updatePatchName } = usePatchStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const handleSave = () => {
    if (editValue.trim() && editValue !== currentPatch.name) {
      updatePatchName(editValue.trim());
      const { sourceA, sourceB, setCustomName } = useMutationStore.getState();
      if (sourceA && sourceB) setCustomName(editValue.trim());
    }
    setIsEditing(false);
  };

  return (
    <PatchNameBar>
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value.replace(/[^\x20-\x7E]/g, '').slice(0, 12))}
          onBlur={handleSave}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleSave();
            else if (e.key === 'Escape') setIsEditing(false);
          }}
          autoFocus
          maxLength={12}
        />
      ) : (
        <span
          onClick={() => { setEditValue(currentPatch.name); setIsEditing(true); }}
          title="Cliquer pour éditer le nom"
        >
          {currentPatch.name}
        </span>
      )}
    </PatchNameBar>
  );
}


export function PatchEditor() {
  const { theme } = useThemeStore();
  const currentPatch = useCurrentPatch();
  const pfm3Version = useSynthStore(state => state.pfm3Version);

  if(!currentPatch) {
    return null;
  }

  const globalKnobs = (
    <>
      <GlobalKnobWrapper>
        <KnobBase
          size={55}
          knobRadius={18}
          min={0}
          max={16}
          step={1}
          value={currentPatch.global.velocitySensitivity}
          valuePosition="left"
          onChange={(val) =>
            updateGlobal({ velocitySensitivity: Math.round(val) })
          }
          color={theme.colors.knobVelocity}
          backgroundColor={theme.colors.knobBackground}
          strokeColor={theme.colors.knobStroke}
          renderLabel={(v) => Math.round(v)}
          label="Velocity"
        />
      </GlobalKnobWrapper>
      <GlobalKnobWrapper>
        {/* Note: Le nombre de voix n'est PAS récupéré lors du patch pull.
            C'est un paramètre du Mixer State (global instrument), pas du Patch.
            Sur PreenfM3, le NRPN [0,2] est réutilisé pour le Play Mode (Poly/Mono/Unison).
            Valeur par défaut : 8 voix (à ajuster manuellement si besoin). */}
        <KnobBase
          size={55}
          knobRadius={18}
          min={1}
          max={16}
          step={1}
          value={currentPatch.global.polyphony}
          valuePosition='left'
          onChange={(val) =>
            updateGlobal({ polyphony: Math.round(val) })
          }
          color={theme.colors.knobFrequency}
          backgroundColor={theme.colors.knobBackground}
          strokeColor={theme.colors.knobStroke}
          renderLabel={(v) => Math.round(v)}
          label="Voices*"
          title="Non récupéré du PreenfM3 (paramètre mixer). Ajuster manuellement."
        />
      </GlobalKnobWrapper>
      <GlobalKnobWrapper>
        <KnobBase
          size={55}
          knobRadius={18}
          min={0}
          max={12}
          step={1}
          value={currentPatch.global.glideTime}
          valuePosition='left'
          onChange={(val) =>
            updateGlobal({ glideTime: Math.round(val) })
          }
          color={theme.colors.knobLfo}
          backgroundColor={theme.colors.knobBackground}
          strokeColor={theme.colors.knobStroke}
          renderLabel={(v) => Math.round(v)}
          label="Glide"
        />
      </GlobalKnobWrapper>
    </>
  );

  return (
    <div className="editor-container">
      <PatchNameEditorComponent />
      <FMSynthProvider patch={currentPatch}>
        <Row>
          <BaseFMGrid>
            <FMAlgorithmSelector />
            <ModulationIndexesEditor algorithm={currentPatch.algorithm} globalKnobs={globalKnobs} />
          </BaseFMGrid>
        </Row>
        

        <Row>
          <OperatorGrid>
            {currentPatch.operators.map((op) => (
              <OperatorPanel opNumber={op.id} key={op.id} />
            ))}
          </OperatorGrid>
        </Row>
        
        <Row>
          <CarrierControls />
        </Row>

        <Row>
          <FilterEditor filterIndex={0} />
          {pfm3Version !== null && pfm3Version > 100 && (
            <FilterEditor filterIndex={1} />
          )}
        </Row>

      </FMSynthProvider>
    </div>
  );
}