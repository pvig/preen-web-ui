import styled from 'styled-components';
import { useSynthStore } from '../stores/synthStore';
import { FilterEditor } from '../components/modulations/FilterEditor';
import { ArpeggiatorEditor } from '../components/modulations/ArpeggiatorEditor';
import { NoteCurveEditor } from '../components/modulations/NoteCurveEditor';

const ArpFilterContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  gap: 20px;
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
  min-width: 0;
  max-width: 520px;
  @media (max-width: 520px) {
    max-width: 100%;
  }
`;

/**
 * Éditeur Arpégiateur & Filtres
 * Basé sur le PanelArpAndFilter du preenfm2Controller
 * Contient 5 sections principales :
 * - Filter 1 : Premier filtre avec type, cutoff, resonance, gain
 * - Filter 2 : Deuxième filtre avec type, cutoff, resonance, mix
 * - Arpeggiator : Arpégiateur avec BPM, direction, octave, pattern, division, duration, latch
 * - Note Curve 1 : Première courbe de scaling des notes (before, break, after)
 * - Note Curve 2 : Deuxième courbe de scaling des notes (before, break, after)
 */
export function ArpFilterEditor() {
  const pfm3Version = useSynthStore(state => state.pfm3Version);
  return (
    <ArpFilterContainer>
      <LeftColumn>
        <FilterEditor filterIndex={0} />
        {pfm3Version !== null && pfm3Version > 100 && (
          <FilterEditor filterIndex={1} />
        )}
        <NoteCurveEditor curveIndex={0} />
        <NoteCurveEditor curveIndex={1} />
      </LeftColumn>
      <RightColumn>
        <ArpeggiatorEditor />
      </RightColumn>
    </ArpFilterContainer>
  );
}
