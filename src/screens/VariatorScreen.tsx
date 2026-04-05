import styled from 'styled-components';
import { PatchVariatorEditor } from '../components/PatchVariatorEditor';

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

export function VariatorScreen() {
  return (
    <Container>
      <PatchVariatorEditor />
    </Container>
  );
}
