import PatchManager from '../components/PatchManager';
import styled from 'styled-components';

const LibraryContainer = styled.div`
  max-width: 900px;
  margin: auto;
`;

const LibraryContent = styled.div`
`;

export function PatchLibrary() {
  return (
    <LibraryContainer>
      <LibraryContent>
        <PatchManager />
      </LibraryContent>
    </LibraryContainer>
  );
}