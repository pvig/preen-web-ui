import React from 'react';
import styled from 'styled-components';
import { useCurrentPatch, usePatchStore } from '../../stores/patchStore';
import { useThemeStore } from '../../theme/themeStore';
import KnobBase from '../knobs/KnobBase';
import { sendModulationMatrixParam } from '../../midi/midiService';

const MatrixContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 20px;
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
  gap: 10px;
`;

const MatrixRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 1fr 1fr;
  gap: 10px;
  padding: 8px;
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
  margin-bottom: 4px;
  display: block;
  margin-left: 64px;
`;

const KnobContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const MatrixSelect = styled.select`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.theme.colors.text};
  padding: 6px;
  font-size: 0.75rem;
  width: 100%;
  
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
  const { theme } = useThemeStore();
  const currentPatch = useCurrentPatch();
  const updateModulationMatrixRow = usePatchStore((state) => state.updateModulationMatrixRow);

  // Sources de modulation (SourceEnum du firmware PreenFM3)
  const modulationSources = [
    'None', 'LFO 1', 'LFO 2', 'LFO 3', 'LFOEnv1', 'LFOEnv2', 'LFOSeq1', 'LFOSeq2',
    'Modwheel', 'Pitchbend', 'Aftertouch', 'Velocity', 'Note1', 'CC1', 'CC2', 'CC3', 'CC4',
    'Note2', 'Breath', 'MPE Slide', 'Random', 'Poly AT', 
    'User CC1', 'User CC2', 'User CC3', 'User CC4', 'PB MPE', 'AT MPE',
  ];

  // Destinations possibles (DestinationEnum du firmware PreenFM3)
  const destinations = [
    'None', 'Gate', 'IM1', 'IM2', 'IM3', 'IM4', 'IM*',
    'Mix1', 'Pan1', 'Mix2', 'Pan2', 'Mix3', 'Pan3', 'Mix4', 'Pan4', 'Mix*', 'Pan*',
    'o1 Fq', 'o2 Fq', 'o3 Fq', 'o4 Fq', 'o5 Fq', 'o6 Fq', 'o* Fq',
    'Env1 A', 'Env2 A', 'Env3 A', 'Env4 A', 'Env5 A', 'Env6 A', 'Env* A', 'Env* R',
    'Mtx1 x', 'Mtx2 x', 'Mtx3 x', 'Mtx4 x',
    'Lfo1 F', 'Lfo2 F', 'Lfo3 F', 'Env2 S', 'Seq1 G', 'Seq2 G',
    'Flt1 P1', 'o* FqH', 'Env* D', 'EnvM A', 'EnvM D', 'EnvM R',
    'Mtx FB', 'Flt1 P2', 'Flt1 G', 'Flt2 P1', 'Flt2 P2', 'Flt2 G',
  ];

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
      <MatrixTitle>Modulation Matrix</MatrixTitle>
      <MatrixGrid>
        {currentPatch.modulationMatrix.map((row, index) => (
          <MatrixRow key={index}>
            <div>
              <MatrixLabel>Source {index + 1}</MatrixLabel>
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
              <AmountLabel>Amount</AmountLabel>
              <KnobContainer>
                <KnobBase
                  size={50}
                  knobRadius={18}
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
              <MatrixLabel>Dest1</MatrixLabel>
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
              <MatrixLabel>Dest2</MatrixLabel>
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
