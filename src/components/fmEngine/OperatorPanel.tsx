import React from "react";
import styled from 'styled-components';

import AdsrControl from './operator/AdsrControl';
import { WaveformSelector } from './operator/WaveformSelector';
import { FineTuneKnob } from './operator/FineTuneKnob';
import { FrequencyKnob } from './operator/FrequencyKnob';
import { KeyboardTrackingSelect } from './operator/KeyboardTrackingSelect';
import { useOperator, updateOperator } from '../../stores/patchStore';
import { useFMSynthContext } from './FMSynthContext';

const PanelContainer = styled.div<{ $isHighlighted?: boolean }>`
  background-color: ${props => props.theme.colors.panelHover};
  padding: 15px;
  border-radius: 8px;
  border: 2px solid ${props => props.$isHighlighted ? props.theme.colors.highlight : props.theme.colors.border};
  box-shadow: ${props => props.$isHighlighted ? `0 0 20px ${props.theme.colors.highlightGlow}` : 'none'};
  transition: ${props => props.$isHighlighted ? 'border-color 0.03s ease, box-shadow 0.03s ease' : 'border-color 0.5s ease, box-shadow 0.5s ease'};
  margin: 10px;
  width:270px;
  h3 {
    margin: 0 0 15px 0;
    color: ${props => props.theme.colors.text};
    font-size: 1rem;
    text-align: center;
  }
`;

const ControlsRow = styled.div`
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-bottom: 10px;
`;

interface OperatorPanelProps {
  opNumber: number;
}

export const OperatorPanel = ({ opNumber }: OperatorPanelProps) => {
  const selectedOperator = useOperator(opNumber);
  const { highlightedNode, setHighlightedNode } = useFMSynthContext();
  const opId = opNumber;
  const isHighlighted = highlightedNode === opNumber;

  return (
    <PanelContainer
      $isHighlighted={isHighlighted}
      onMouseEnter={() => setHighlightedNode(opNumber)}
      onMouseLeave={() => setHighlightedNode(null)}
    >
      <h3>Operator {opNumber}</h3>

      <ControlsRow>
        <FrequencyKnob 
        label="Frequency" 
        value={selectedOperator?.frequency ?? 0}
        min={0} max={16} 
        onChange={val => updateOperator(opId, { frequency: val })}
        />
        <FineTuneKnob 
        label="Finetuning" 
        value={selectedOperator?.detune ?? 0}
        min={-16} max={16} 
        onChange={val => updateOperator(opId, { detune: val })}
        />
      </ControlsRow>

      <AdsrControl operatorId={opId} />

      <ControlsRow>
        <WaveformSelector
          value={selectedOperator?.waveform}
          onChange={(waveform) => updateOperator(opId, { waveform })}
        />
        <KeyboardTrackingSelect
          value={selectedOperator?.keyboardTracking ?? 1}
          onChange={(keyboardTracking) => updateOperator(opId, { keyboardTracking })}
        />
      </ControlsRow>

    </PanelContainer>
  );
};

export default React.memo(OperatorPanel)