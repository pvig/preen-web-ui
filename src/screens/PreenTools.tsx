import { useRef } from 'react';
import { PatchSavePanel, BankOrganizerPanel } from '../components/PatchManager';
import { BreederEditor } from '../components/BreederEditor';
import { PatchSlotRack } from '../components/PatchSlotRack';
import { PreenSpectrogram } from '../components/PreenSpectrogram';
import type { PreenSpectrogramHandle } from '../components/PreenSpectrogram';
import styled from 'styled-components';

const ToolsContainer = styled.div`
  max-width: 900px;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const PatchEvolverContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 16px;
  border: 1px solid ${props => props.theme.colors.border};
  gap: 20px;
`;

export function PreenTools() {
  const spectrogramRef = useRef<PreenSpectrogramHandle>(null);
  return (
    <ToolsContainer>
      <PatchSavePanel />
      <BankOrganizerPanel />
      <PreenSpectrogram ref={spectrogramRef} />
      <PatchEvolverContainer>
        <PatchSlotRack />
        <BreederEditor />
      </PatchEvolverContainer>
    </ToolsContainer>
  );
}