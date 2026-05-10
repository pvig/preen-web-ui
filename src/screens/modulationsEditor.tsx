import styled from 'styled-components';
import { MatrixEditor } from '../components/modulations/MatrixEditor';
import { LfoEditor } from '../components/modulations/LfoEditor';
import { LfoEnvEditor } from '../components/modulations/LfoEnvEditor';
import { SeqEditor } from '../components/modulations/SeqEditor';
import { NoteCurveEditor } from '../components/modulations/NoteCurveEditor';

const ModulationsContainer = styled.div`
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 20px;
  padding: 0;
  max-width: 900px;
  margin: 0 auto;
  
  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  max-width: 520px;
  @media (max-width: 520px) {
    max-width: 100%;
  }
`;

const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const NoteCurveRow = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
  }
`;

export function ModulationsEditor() {
  return (
    <ModulationsContainer>
      <LeftColumn>
        <LfoEditor />
        <LfoEnvEditor />
        <SeqEditor />
      </LeftColumn>

      <RightColumn>
        <MatrixEditor />
      </RightColumn>

      <NoteCurveRow>
        <NoteCurveEditor curveIndex={0} />
        <NoteCurveEditor curveIndex={1} />
      </NoteCurveRow>
    </ModulationsContainer>
  );
}
