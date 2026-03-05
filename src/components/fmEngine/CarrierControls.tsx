import { useCurrentPatch, updateOperator } from '../../stores/patchStore';
import KnobBase from '../knobs/KnobBase';
import styled from 'styled-components';
import { useFMSynthContext } from './FMSynthContext';
import { useThemeStore } from '../../theme/themeStore';

const CarrierContainer = styled.div`
  margin: auto;
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border};
  overflow: hidden;
  width: 900px;
  max-width: 900px;
  @media (max-width: 900px) {
    max-width: 100%;
    width: 100%;
  }
`;

const CarrierTitle = styled.h3`
  margin: 0;
  padding: 12px 20px;
  background: ${props => props.theme.colors.panel};
  color: ${props => props.theme.colors.text};
  font-size: 1rem;
  font-weight: 600;
  text-align: left;
`;

const ControlsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  padding-bottom: 20px;
  background: ${props => props.theme.colors.panel};
`;

const OperatorControl = styled.div<{ $isHighlighted?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 15px;
  background: ${props => props.theme.colors.panelHover};
  border-radius: 6px;
  border: 2px solid ${props => props.theme.colors.border};
  transition: border-color 3s ease, box-shadow 3s ease;
  
  ${props => props.$isHighlighted && `
    border-color: ${props.theme.colors.highlight};
    box-shadow: 0 0 20px ${props.theme.colors.highlightGlow};
    transition: border-color 0.03s ease, box-shadow 0.03s ease;
  `}
`;

const OperatorTitle = styled.h4`
  margin: 0;
  color: #e2e8f0;
  font-size: 1rem;
  text-align: center;
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 100%;
`;

const ControlLabel = styled.span`
  font-size: 0.8rem;
  color: #a0aec0;
  text-align: center;
`;

const ControlInput = styled.input`
  font-size: 0.8rem;
  color: #a0aec0;
  text-align: center;
  width:80px;
  margin-top:10px;
`;

const CarrierControls = () => {
  const currentPatch = useCurrentPatch();
  const currentAlgorithm = currentPatch.algorithm;
  const carriers = currentAlgorithm?.ops?.filter(op => op.type === 'CARRIER') || [];
  const { setHighlightedNode, highlightedNode } = useFMSynthContext();
  const { theme } = useThemeStore();

  if (carriers.length === 0) {
    return (
      <CarrierContainer>
        <CarrierTitle>Mixer</CarrierTitle>
        <ControlsContainer>
          <div style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
            No carrier operators in current algorithm
          </div>
        </ControlsContainer>
      </CarrierContainer>
    );
  }

  return (
    <CarrierContainer>
      <CarrierTitle>Mixer</CarrierTitle>
      <ControlsContainer>
      {carriers.map(({ id }) => {
        const operator = currentPatch.operators.find(op => op.id === id);
        return (
        <OperatorControl 
          key={`carrier-${id}`}
          $isHighlighted={highlightedNode === id}
          onMouseEnter={() => setHighlightedNode(id)}
          onMouseLeave={() => setHighlightedNode(null)}
        >
          <OperatorTitle>OP{id}</OperatorTitle>

          <ControlGroup>
            <KnobBase
              size={60}
              knobRadius={20}
              min={0}
              max={1}
              step={0.01}
              value={operator?.amplitude ?? 0}
              onChange={val => updateOperator(id, { amplitude: Math.max(0, Math.min(1, val)) })}
              color={theme.colors.knobVolume}
              backgroundColor={theme.colors.knobBackground}
              strokeColor={theme.colors.knobStroke}
              renderLabel={(val) => val.toFixed(2)}
              label="Volume"
            />
          </ControlGroup>

          <ControlGroup>
            <ControlInput
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={operator?.pan ?? 0}
              onChange={e => updateOperator(id, { pan: Number(e.target.value) })}
              width="80px"
            />
            <ControlLabel>Pan</ControlLabel>
          </ControlGroup>
        </OperatorControl>
        );
      })}
    </ControlsContainer>
    </CarrierContainer>
  );
};

export default CarrierControls;