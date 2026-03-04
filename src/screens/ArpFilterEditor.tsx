import styled from 'styled-components';
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
  max-width: 520px;
`;

const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 520px;
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
  return (
    <ArpFilterContainer>
      <LeftColumn>
        <FilterEditor filterIndex={0} />
        {/* TODO: Gestion du filtre 2 à implémenter aussi sur le firmware */}
        {/* <FilterEditor filterIndex={1} /> */}
        <NoteCurveEditor curveIndex={0} />
        <NoteCurveEditor curveIndex={1} />
      </LeftColumn>
      
      <RightColumn>
        <ArpeggiatorEditor />
      </RightColumn>
    </ArpFilterContainer>
  );
}
