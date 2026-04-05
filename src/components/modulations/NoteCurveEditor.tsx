import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import KnobBase from '../knobs/KnobBase';
import { useNoteCurve, updateNoteCurve } from '../../stores/patchStore';
import type { NoteCurveType } from '../../types/patch';
import { NOTE_CURVE_TYPES_LIST } from '../../types/patch';
import { useThemeStore } from '../../theme/themeStore';
import { NoteCurveVisualizer } from './NoteCurveVisualizer';

const NoteCurveContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 16px;
  border: 1px solid ${props => props.theme.colors.border};
`;

const NoteCurveHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const NoteCurveTitle = styled.h3`
  color: ${props => props.theme.colors.text};
  font-size: 1rem;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const NoteCurveControls = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 20px;
  align-items: start;
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const ControlLabel = styled.label`
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.75rem;
  text-transform: uppercase;
`;

const Select = styled.select`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.theme.colors.text};
  padding: 8px 28px 8px 12px;
  font-size: 0.875rem;
  width: 120px;
  max-width: 120px;
  height: 36px;
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
`;

interface NoteCurveEditorProps {
  curveIndex: 0 | 1;
}

/**
 * Composant NoteCurveEditor
 * Gère les courbes de scaling des notes (NOTE1CURVE et NOTE2CURVE)
 * Chaque courbe a : Before (type de courbe avant break), Break (note de break), After (type après break)
 */
export const NoteCurveEditor: React.FC<NoteCurveEditorProps> = ({ curveIndex }) => {
  const { t } = useTranslation();
  const curve = useNoteCurve(curveIndex);
  const { theme } = useThemeStore();

  return (
    <NoteCurveContainer>
      <NoteCurveHeader>
        <NoteCurveTitle>{t('modulation.noteCurve')} {curveIndex + 1}</NoteCurveTitle>
      </NoteCurveHeader>

      <NoteCurveVisualizer
        before={curve.before}
        breakNote={curve.breakNote}
        after={curve.after}
      />

      <NoteCurveControls>
        {/* Before - Type de courbe avant le breakpoint */}
        <ControlGroup>
          <ControlLabel>Before</ControlLabel>
          <Select 
            value={curve.before}
            onChange={(e) => updateNoteCurve(curveIndex, { before: e.target.value as NoteCurveType })}
          >
            {NOTE_CURVE_TYPES_LIST.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </ControlGroup>

        {/* Break Note - Note de breakpoint */}
        <ControlGroup>
          <KnobBase
            size={60}
            knobRadius={16}
            min={0}
            max={127}
            step={1}
            value={curve.breakNote}
            onChange={(breakNote) => updateNoteCurve(curveIndex, { breakNote })}
            color={theme.colors.knobLfo}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => Math.round(v).toString()}
            label={t('modulation.break')}
            labelPosition="top"
          />
        </ControlGroup>

        {/* After - Type de courbe après le breakpoint */}
        <ControlGroup>
          <ControlLabel>After</ControlLabel>
          <Select 
            value={curve.after}
            onChange={(e) => updateNoteCurve(curveIndex, { after: e.target.value as NoteCurveType })}
          >
            {NOTE_CURVE_TYPES_LIST.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </ControlGroup>
      </NoteCurveControls>
    </NoteCurveContainer>
  );
};
