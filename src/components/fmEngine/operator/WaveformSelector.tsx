import styled from 'styled-components';
import { WaveformType, WAVEFORMS } from '../../../types/waveform';
import { waveformToDisplayName } from '../../../utils/waveformUtils';
import { useTranslation } from 'react-i18next';

const ControlContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const ControlLabel = styled.label`
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.75rem;
  text-transform: uppercase;
`;

const StyledSelect = styled.select`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.theme.colors.text};
  padding: 8px 28px 8px 12px;
  font-size: 0.75rem;
  width: 100px;
  max-width: 120px;
  height: 36px;
  cursor: pointer;
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
  
  &:hover {
    border-color: ${props => props.theme.colors.primary};
  }
`;

export const WaveformSelector = ({ value, onChange }: { value?: WaveformType; onChange: (v: WaveformType) => void }) => {
  const { t } = useTranslation();

  return (
    <ControlContainer>
      <ControlLabel>{t('waveformSelector.label')}</ControlLabel>
      <StyledSelect
        value={value || 'SINE'}
        onChange={(e) => onChange(e.target.value as WaveformType)}
      >
        {WAVEFORMS.map(wave => (
          <option key={wave.name} value={wave.name}>
            {waveformToDisplayName(wave.name)}
          </option>
        ))}
      </StyledSelect>
    </ControlContainer>
  );
}


export default WaveformSelector;