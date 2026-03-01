import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import KnobBase from '../knobs/KnobBase';
import { useFilter, updateFilter } from '../../stores/patchStore';
import type { Filter1Type, Filter2Type } from '../../types/patch';
import { FILTER1_TYPE_LIST, FILTER2_TYPE_LIST } from '../../types/patch';
import { useThemeStore } from '../../theme/themeStore';

const FilterContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 16px;
  border: 1px solid ${props => props.theme.colors.border};
`;

const FilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const FilterTitle = styled.h3`
  color: ${props => props.theme.colors.text};
  font-size: 1rem;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const FilterControls = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
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
  padding: 8px 12px;
  font-size: 0.875rem;
  min-width: 120px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
`;

interface FilterEditorProps {
  filterIndex: 0 | 1;
}

/**
 * Composant FilterEditor
 * Gère un des 2 filtres du PreenFM3
 * Chaque filtre a : type, param1 (frequency), param2 (resonance), gain/mix
 */
export const FilterEditor: React.FC<FilterEditorProps> = ({ filterIndex }) => {
  const { t } = useTranslation();
  const filter = useFilter(filterIndex);
  const { theme } = useThemeStore();

  // Filter 1 types: canonical list from patch.ts (spread to mutable array)
  const filter1Types = [...FILTER1_TYPE_LIST];

  // Filter 2 types: canonical list from patch.ts (spread to mutable array)
  const filter2Types = [...FILTER2_TYPE_LIST];

  const filterTypes = filterIndex === 0 ? filter1Types : filter2Types;

  const thirdParamLabel = filterIndex === 0 ? t('filter.gain') : 'Mix';

  // Gain range: 0-2 for Filter1, 0-1 for Filter2
  const gainMin = 0;
  const gainMax = filterIndex === 0 ? 2 : 1;

  return (
    <FilterContainer>
      <FilterHeader>
        <FilterTitle>{t('filter.title')} {filterIndex + 1}</FilterTitle>
      </FilterHeader>

      <FilterControls>
        {/* Type de filtre */}
        <ControlGroup>
          <ControlLabel>{t('filter.type')}</ControlLabel>
          <Select 
            value={filter.type}
            onChange={(e) => updateFilter(filterIndex, { type: e.target.value as (Filter1Type | Filter2Type) })}
          >
            {filterTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </ControlGroup>

        {/* Param1 - Frequency/Cutoff (0-1) */}
        <ControlGroup>
          <KnobBase
            size={60}
            min={0}
            max={1}
            step={0.01}
            value={filter.param1}
            onChange={(v) => updateFilter(filterIndex, { param1: Math.max(0, Math.min(1, v)) })}
            color={theme.colors.knobFilter}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => v.toFixed(2)}
            label={t('filter.cutoff')}
          />
        </ControlGroup>

        {/* Param2 - Resonance (0-1) */}
        <ControlGroup>
          <KnobBase
            size={60}
            min={0}
            max={1}
            step={0.01}
            value={filter.param2}
            onChange={(v) => updateFilter(filterIndex, { param2: Math.max(0, Math.min(1, v)) })}
            color={theme.colors.knobPhase}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => v.toFixed(2)}
            label={t('filter.resonance')}
          />
        </ControlGroup>

        {/* Gain (Filter1: 0-2, Filter2: 0-1) */}
        <ControlGroup>
          <KnobBase
            size={60}
            min={gainMin}
            max={gainMax}
            step={0.01}
            value={filter.gain}
            onChange={(v) => updateFilter(filterIndex, { gain: Math.max(gainMin, Math.min(gainMax, v)) })}
            color={theme.colors.knobFrequency}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => v.toFixed(2)}
            label={thirdParamLabel}
          />
        </ControlGroup>
      </FilterControls>
    </FilterContainer>
  );
};
