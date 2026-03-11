import { PatchSavePanel, BankOrganizerPanel } from '../components/PatchManager';
import styled from 'styled-components';

const LibraryContainer = styled.div`
  max-width: 900px;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 0;
`;

export function PatchLibrary() {
  return (
    <LibraryContainer>
      <PatchSavePanel />
      <BankOrganizerPanel />
    </LibraryContainer>
  );
}