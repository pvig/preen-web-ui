import styled from 'styled-components';

interface KeyboardTrackingSelectProps {
  value: number;
  onChange: (value: number) => void;
}

const trackingModes = [
  { value: 0, label: 'Fixed' },
  { value: 1, label: 'Keyboard' },
  { value: 2, label: 'Finetune Hz' }
];

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
  font-size: 0.875rem;
  width: 120px;
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

export const KeyboardTrackingSelect: React.FC<KeyboardTrackingSelectProps> = ({ value, onChange }) => {
  return (
    <ControlContainer>
      <ControlLabel>Tracking clavier</ControlLabel>
      <StyledSelect
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {trackingModes.map(mode => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </StyledSelect>
    </ControlContainer>
  );
}

export default KeyboardTrackingSelect;