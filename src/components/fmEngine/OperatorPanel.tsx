import React from "react";
import styled from 'styled-components';

import AdsrControl from './operator/AdsrControl';
import { WaveformSelector } from './operator/WaveformSelector';
import { KeyboardTrackingSelect } from './operator/KeyboardTrackingSelect';
import KnobBase from '../knobs/KnobBase';
import { useThemeStore } from '../../theme/themeStore';
import { useOperator, updateOperator } from '../../stores/patchStore';
import { useFMSynthContext } from './FMSynthContext';
import { useTranslation } from 'react-i18next';

const PanelContainer = styled.div<{ $isHighlighted?: boolean }>`
  background-color: ${props => props.theme.colors.panelHover};
  padding: 15px;
  border-radius: 8px;
  border: 2px solid ${props => props.$isHighlighted ? props.theme.colors.highlight : props.theme.colors.border};
  box-shadow: ${props => props.$isHighlighted ? `0 0 20px ${props.theme.colors.highlightGlow}` : 'none'};
  transition: ${props => props.$isHighlighted ? 'border-color 0.03s ease, box-shadow 0.03s ease' : 'border-color 0.5s ease, box-shadow 0.5s ease'};
  margin: 14px;
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
  gap: 0;

  justify-content: space-between;
  margin-bottom: 0;
`;

interface OperatorPanelProps {
  opNumber: number;
}

export const OperatorPanel = ({ opNumber }: OperatorPanelProps) => {
  const selectedOperator = useOperator(opNumber);
  const { highlightedNode, setHighlightedNode } = useFMSynthContext();
  const { theme } = useThemeStore();
  const opId = opNumber;
  const isHighlighted = highlightedNode === opNumber;
  const { t } = useTranslation();

  return (
    <PanelContainer
      $isHighlighted={isHighlighted}
      onMouseEnter={() => setHighlightedNode(opNumber)}
      onMouseLeave={() => setHighlightedNode(null)}
    >
      <h3>{t('operator.title', { number: opNumber })}</h3>

      <ControlsRow>
         <KnobBase
            label={t('operator.frequency')}
            value={selectedOperator?.frequency ?? 0}
            min={0}
            max={16}
            step={0.01}
            onChange={val => updateOperator(opId, { frequency: val })}
            renderLabel={(v: number) => v.toFixed(2)}
            labelPosition="left"
            color={theme.colors.knobFrequency}
            strokeColor={theme.colors.knobStroke}
            backgroundColor={theme.colors.knobBackground}
            size={60}
            knobRadius={16}
          />
          <KnobBase
            label={t('operator.fineTune')}
            value={selectedOperator?.detune ?? 0}
            min={-16}
            max={16}
            step={0.01}
            onChange={val => updateOperator(opId, { detune: val })}
            renderLabel={(v: number) => v.toFixed(2)}
            labelPosition="left"
            color={theme.colors.knobFrequency}
            strokeColor={theme.colors.knobStroke}
            backgroundColor={theme.colors.knobBackground}
            size={60}
            knobRadius={16}
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