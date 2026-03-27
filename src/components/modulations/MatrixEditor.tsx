import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { useCurrentPatch, usePatchStore } from '../../stores/patchStore';
import { useThemeStore } from '../../theme/themeStore';
import KnobBase from '../knobs/KnobBase';
import { sendModulationMatrixParam } from '../../midi/midiService';
import { MATRIX_SOURCE_NAMES, MATRIX_DEST_NAMES } from '../../midi/preenFmConstants';

const MatrixContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 20px;
`;

const MatrixTitle = styled.h3`
  color: ${props => props.theme.colors.text};
  font-size: 1rem;
  margin: 0 0 15px 0;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const MatrixGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const MatrixRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 1fr 1fr;
  gap: 10px;
  padding: 0 8px;
  background: ${props => props.theme.colors.background};
  border-radius: 4px;
  align-items: center;
`;

const MatrixLabel = styled.label`
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.65rem;
  text-transform: uppercase;
  margin-bottom: 4px;
  display: block;
`;

const AmountLabel = styled.label`
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.65rem;
  text-transform: uppercase;
  margin-top: 8px;
  margin-bottom: -4px;
  margin-left: 30px;
`;

const KnobContainer = styled.div`
  max-width:100px;
`;

const MatrixSelect = styled.select`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.theme.colors.text};
  padding: 4px;
  font-size: 0.75rem;
  width: 60px;

  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
`;

/**
 * Composant MatrixEditor
 * Gère la matrice de modulation (12 lignes, chacune avec Source + 2 Destinations)
 */
export const MatrixEditor: React.FC = () => {
  const { t } = useTranslation();
  const { theme } = useThemeStore();
  const currentPatch = useCurrentPatch();
  const updateModulationMatrixRow = usePatchStore((state) => state.updateModulationMatrixRow);

  const modulationSources = MATRIX_SOURCE_NAMES;
  const destinations = MATRIX_DEST_NAMES;

  const handleSourceChange = (rowIndex: number, source: string) => {
    updateModulationMatrixRow(rowIndex, { source });
    sendModulationMatrixParam(rowIndex, 'source', source);
  };

  const handleDestination1Change = (rowIndex: number, destination1: string) => {
    updateModulationMatrixRow(rowIndex, { destination1 });
    sendModulationMatrixParam(rowIndex, 'destination1', destination1);
  };

  const handleDestination2Change = (rowIndex: number, destination2: string) => {
    updateModulationMatrixRow(rowIndex, { destination2 });
    sendModulationMatrixParam(rowIndex, 'destination2', destination2);
  };

  const handleAmountChange = (rowIndex: number, amount: number) => {
    updateModulationMatrixRow(rowIndex, { amount });
    sendModulationMatrixParam(rowIndex, 'amount', amount);
  };

  return (
    <MatrixContainer>
      <MatrixTitle>{t('modulation.matrix')}</MatrixTitle>
      <MatrixGrid>
        {currentPatch.modulationMatrix.map((row, index) => (
          <MatrixRow key={index}>
            <div>
              <MatrixLabel>{t('modulation.source')} {index + 1}</MatrixLabel>
              <MatrixSelect 
                value={row.source}
                onChange={(e) => handleSourceChange(index, e.target.value)}
              >
                {modulationSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </MatrixSelect>
            </div>
            
            <div>
              <AmountLabel>{t('modulation.amount')}</AmountLabel>
              <KnobContainer>
                <KnobBase
                  size={50}
                  knobRadius={16}
                  min={-10}
                  max={24}
                  value={row.amount}
                  onChange={(value) => handleAmountChange(index, value)}
                  step={0.01}
                  color={theme.colors.knobModulation}
                  backgroundColor={theme.colors.knobBackground}
                  strokeColor={theme.colors.knobStroke}
                  renderLabel={(val) => val.toFixed(2)}
                  label={null}
                  valuePosition="left"
                />
              </KnobContainer>
            </div>
            
            <div>
              <MatrixLabel>{t('modulation.dest1')}</MatrixLabel>
              <MatrixSelect 
                value={row.destination1}
                onChange={(e) => handleDestination1Change(index, e.target.value)}
              >
                {destinations.map((dest) => (
                  <option key={dest} value={dest}>
                    {dest}
                  </option>
                ))}
              </MatrixSelect>
            </div>
            
            <div>
              <MatrixLabel>{t('modulation.dest2')}</MatrixLabel>
              <MatrixSelect 
                value={row.destination2}
                onChange={(e) => handleDestination2Change(index, e.target.value)}
              >
                {destinations.map((dest) => (
                  <option key={dest} value={dest}>
                    {dest}
                  </option>
                ))}
              </MatrixSelect>
            </div>
          </MatrixRow>
        ))}
      </MatrixGrid>
    </MatrixContainer>
  );
};
