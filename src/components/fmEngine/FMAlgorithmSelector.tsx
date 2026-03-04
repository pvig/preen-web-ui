import styled from 'styled-components';
import { AlgorithmVisualization } from './AlgorithmVisualization';
import { DEFAULT_ALGORITHMS } from '../../types/patch';
import { useCurrentPatch, selectAlgorithm } from '../../stores/patchStore';

const SelectorContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px;
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  min-width: 250px;
  max-width: 450px;
  width: 450px;
  flex: 1;

  @media (max-width: 768px) {
    max-width: 100%;
    width: 100%;
  }
`;

const NavigationControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const AlgorithmSection = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const NavButtonsContainer = styled.div`
  display: flex;
  flex-direction: row-reverse;
  gap: 4px;
`;

const NavButton = styled.button`
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: ${props => props.theme.colors.button};
  color: white;
  border: none;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: #63b3ed;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;



const AlgorithmSelect = styled.select`
  width: 140px;
  height: 38px;
  padding: 6px 30px 6px 10px;
  background: ${props => props.theme.colors.background};
  color: ${props => props.theme.colors.text};
  border: 2px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: all 0.2s;
  box-sizing: border-box;

  &:hover {
    border-color: #63b3ed;
  }

  &:focus {
    border-color: #63b3ed;
    box-shadow: 0 0 0 3px rgba(99, 179, 237, 0.1);
  }

  option {
    background: ${props => props.theme.colors.background};
    color: ${props => props.theme.colors.text};
  }
`;

const VisualizationWrapper = styled.div`
  background: ${props => props.theme.colors.background};
  border-radius: 8px;
  padding: 0;
  position: relative;
  min-height: 220px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  align-items: flex-start;
`;

const VisualizationContainer = styled.div`
  flex: 1 1 260px;
  min-width: 220px;
  background: ${props => props.theme.colors.background};
  border-radius: 8px;
  padding: 0;
  position: relative;
  min-height: 220px;
`;

export const FMAlgorithmSelector = () => {

  const currentPatch = useCurrentPatch();
  const currentAlgorithm = currentPatch?.algorithm;
  if(!currentAlgorithm) {
    return;
  }

  const currentIndex = DEFAULT_ALGORITHMS.findIndex(a => a.id === currentAlgorithm.id);
  const handlePrevious = () => {
    const newIndex = (currentIndex - 1 + DEFAULT_ALGORITHMS.length) % DEFAULT_ALGORITHMS.length;
    selectAlgorithm(DEFAULT_ALGORITHMS[newIndex]);
  };

  const handleNext = () => {
    const newIndex = (currentIndex + 1) % DEFAULT_ALGORITHMS.length;
    selectAlgorithm(DEFAULT_ALGORITHMS[newIndex]);
  };

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedAlgo = DEFAULT_ALGORITHMS.find(a => String(a.id) === event.target.value);
    if (selectedAlgo) {
      selectAlgorithm(selectedAlgo);
    }
  };

  return (
    <SelectorContainer>

      <NavigationControls>
        <AlgorithmSection>
          <NavButtonsContainer>
            <NavButton
              onClick={handleNext}
              disabled={currentIndex === DEFAULT_ALGORITHMS.length - 1}
              aria-label="Next algorithm"
            >
              +
            </NavButton>
            <NavButton
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              aria-label="Previous algorithm"
            >
              -
            </NavButton>
          </NavButtonsContainer>

          <AlgorithmSelect 
            value={String(currentAlgorithm.id)} 
            onChange={handleSelectChange}
            aria-label="Select algorithm"
          >
            {DEFAULT_ALGORITHMS.map((algo) => (
              <option key={String(algo.id)} value={String(algo.id)}>
                {algo.name}
              </option>
            ))}
          </AlgorithmSelect>
        </AlgorithmSection>
      </NavigationControls>

      <VisualizationWrapper>
        <VisualizationContainer>
          <AlgorithmVisualization algorithm={currentAlgorithm} />
        </VisualizationContainer>

      </VisualizationWrapper>

    </SelectorContainer>
  );
};