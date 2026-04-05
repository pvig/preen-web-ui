import styled from 'styled-components';
import OperatorPanel from '../components/fmEngine/OperatorPanel';
import { FMSynthProvider } from '../components/fmEngine/FMSynthContext';
import { FMAlgorithmSelector } from '../components/fmEngine/FMAlgorithmSelector';
import CarrierControls from '../components/fmEngine/CarrierControls';
import { useCurrentPatch, updateGlobal } from '../stores/patchStore';
import ModulationIndexesEditor from '../components/fmEngine/ModulationIndexesEditor';
import KnobBase from '../components/knobs/KnobBase';
import { useThemeStore } from '../theme/themeStore';

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


export function PatchEditor() {
  const { theme } = useThemeStore();
  const currentPatch = useCurrentPatch();

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

      </FMSynthProvider>
    </div>
  );
}