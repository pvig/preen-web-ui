import { useRef } from 'react';
import { PatchSavePanel, BankOrganizerPanel } from '../components/PatchManager';
import { BreederEditor } from '../components/BreederEditor';
import { PatchSlotRack } from '../components/PatchSlotRack';
import { PreenSpectrogram } from '../components/PreenSpectrogram';
import type { PreenSpectrogramHandle } from '../components/PreenSpectrogram';
import styled from 'styled-components';

const LibraryContainer = styled.div`
  max-width: 900px;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export function PatchLibrary() {
  const spectrogramRef = useRef<PreenSpectrogramHandle>(null);
  return (
    <LibraryContainer>
      <PatchSavePanel />
      <BankOrganizerPanel />
      <PatchSlotRack />
      <PreenSpectrogram ref={spectrogramRef} />
      <BreederEditor />
    </LibraryContainer>
  );
}