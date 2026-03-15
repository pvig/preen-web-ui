import { useTranslation } from 'react-i18next';
import { PatchSavePanel, BankOrganizerPanel } from '../components/PatchManager';
import { MutationEditor } from './MutationEditor';
import styled from 'styled-components';

const LibraryContainer = styled.div`
  max-width: 900px;
  margin: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 0;
`;

const MutationPanel = styled.section`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 8px 0;
  margin-top: 8px;
`;

export function PatchLibrary() {
  return (
    <LibraryContainer>
      <PatchSavePanel />
      <BankOrganizerPanel />
      <MutationPanel>
        <MutationEditor />
      </MutationPanel>
    </LibraryContainer>
  );
}