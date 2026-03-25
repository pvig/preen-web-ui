import * as d3 from 'd3';
import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useOperatorEnvelope, updateADSR } from '../../../stores/patchStore';
import { type AdsrState } from '../../../types/adsr';
import { ADSR_CURVE_TYPES, type CurveType } from '../../../types/patch';
import { sendOperatorEnvCurve } from '../../../midi/midiService';
import { useThemeStore } from '../../../theme/themeStore';
import { useSynthStore } from '../../../stores/synthStore';

const AdsrContainer = styled.div`
  position: relative;
  background: ${props => props.theme.colors.background};
  margin-top: 10px;
  margin-bottom: 10px;
  border-radius: 4px;
`;

const StyledSvg = styled.svg`
  width: 100%;
  height: 100%;
  user-select: none;
`;

const Tooltip = styled.div`
  position: absolute;
  transform: translate(30px, -30px);
  background: ${props => props.theme.colors.panel};
  color: ${props => props.theme.colors.text};
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  box-shadow: 0 2px 8px ${props => props.theme.colors.border};
`;

interface AdsrControlProps {
  operatorId: number;
}

const AdsrControl: React.FC<AdsrControlProps> = ({ operatorId }) => {

  const envelope = useOperatorEnvelope(operatorId);
  const { theme } = useThemeStore();
  const pfm3Version = useSynthStore(state => state.pfm3Version);

  if (!envelope) return null;

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragInfo, setDragInfo] = useState<{ key: string; time: number; level: number } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ key: string; time: number; level: number } | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<null | 'attack' | 'decay' | 'sustain' | 'release'>(null);
  const maxSegmentSize = 16; // Limite fixe de 16 pour chaque segment
  const margin = { top: 20, right: 20, bottom: 20, left: 30 };
  const width = 250 - margin.left - margin.right;
  const height = 120 - margin.top - margin.bottom;

  // Références pour les éléments D3
  const circlesRef = useRef<{ [key: string]: d3.Selection<SVGCircleElement, Point, null, undefined> }>({});

  // Stocke les positions actuelles avec leur contrainte
  const currentPoints = useRef<Point[]>([]);
  const dragOffset = useRef<{ x: number, y: number } | null>(null);

  // Couleurs distinctes pour chaque point (depuis le thème)
  const pointColors = {
    attack: theme.colors.adsrAttack,
    decay: theme.colors.adsrDecay,
    sustain: theme.colors.adsrSustain,
    release: theme.colors.adsrRelease
  };

  type Point = { x: number; y: number };

  // Génère les points intermédiaires selon le type de courbe
  const generateCurvePoints = (start: Point, end: Point, curveType: CurveType, numPoints = 20): Point[] => {
    const points: Point[] = [];

    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      let factor: number;

      switch (curveType) {
        // Inverser la logique pour correspondre au PreenFM :
        case 'exponential':
          // PreenFM: exponentielle = montée rapide puis plateau (utiliser ancien logarithmic)
          factor = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          break;
        case 'logarithmic':
          // PreenFM: logarithmique = montée lente puis rapide (utiliser ancien exponentielle)
          factor = t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
          break;
        case 'user1':
        case 'user2':
        case 'user3':
        case 'user4':
          // Courbes utilisateur personnalisées (exemples)
            factor = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          break;
        default: // 'linear'
          factor = t;
      }

      points.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * factor
      });
    }

    return points;
  };

  // Génère les points pour chaque segment (pour interaction)
  const getSegmentPoints = (points: Point[]) => ([
    generateCurvePoints(points[0], points[1], envelope.curves?.attack || 'linear'),
    generateCurvePoints(points[1], points[2], envelope.curves?.decay || 'exponential'),
    generateCurvePoints(points[2], points[3], envelope.curves?.sustain || 'linear'),
    generateCurvePoints(points[3], points[4], envelope.curves?.release || 'exponential'),
  ]);

  // Initialise et met à jour les points  
  useEffect(() => {
    currentPoints.current = [
      { x: 0, y: 0 },
      { x: envelope.attack.time, y: envelope.attack.level },
      { x: envelope.decay.time, y: envelope.decay.level },
      { x: envelope.sustain.time, y: envelope.sustain.level },
      { x: envelope.release.time, y: envelope.release.level }
    ];
  }, [envelope]);

  // Gestion du rendu D3
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // L'échelle X s'adapte à la durée réelle de l'enveloppe
    // Logique adaptative pour les enveloppes courtes vs longues
    const actualMaxTime = envelope.release.time;
    let maxTime;
    if (actualMaxTime < 1) {
      // Pour les enveloppes très courtes, utilise la durée réelle + petite marge pour s'étendre sur toute la largeur
      maxTime = Math.max(actualMaxTime * 1.15, 0.1);
    } else if (actualMaxTime < 4) {
      // Pour les enveloppes moyennes, utilise la durée réelle + marge modérée
      maxTime = actualMaxTime * 1.15;
    } else {
      // Pour les enveloppes longues, utilise la logique d'origine avec marge fixe
      maxTime = Math.max(actualMaxTime * 1.15, actualMaxTime + 2, 1);
    }
    // Déplacer xScale/yScale dans le scope du composant pour accès dans le handler drag
    const xScale = d3.scaleLinear().domain([0, maxTime]).range([0, width]);
    const yScale = d3.scaleLinear().domain([100, 0]).range([0, height]);
    // Stocker les scales dans des refs pour accès stable dans le handler drag
    (AdsrControl as any)._xScale = xScale;
    (AdsrControl as any)._yScale = yScale;

    // Quadrillage adaptatif pour l'axe Y (levels)
    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-width).tickFormat(null))
      .selectAll('.tick line')
      .attr('stroke', theme.colors.border)
      .attr('stroke-dasharray', '2,2');

    // Quadrillage adaptatif : moins de lignes pour les enveloppes courtes
    const numTicks = maxTime < 1 
      ? Math.max(1, Math.ceil(maxTime * 2)) // Max 2 ticks pour enveloppes < 1s
      : Math.ceil(maxTime); // 1 tick par seconde pour les longues
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(numTicks).tickSize(-height).tickFormat(null))
      .selectAll('.tick line')
      .attr('stroke', theme.colors.border)
      .attr('stroke-dasharray', '2,2');

    const lineGenerator = d3.line<Point>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y));


    // Dessin de chaque segment séparément pour interaction
    const segmentKeys: Array<'attack' | 'decay' | 'sustain' | 'release'> = ['attack', 'decay', 'sustain', 'release'];
    const segmentColors = [theme.colors.adsrAttack, theme.colors.adsrDecay, theme.colors.adsrSustain, theme.colors.adsrRelease];
    const segmentPoints = getSegmentPoints(currentPoints.current);
    segmentPoints.forEach((seg, i) => {
      // Large hit area (invisible)
      g.append('path')
        .datum(seg)
        .attr('d', lineGenerator)
        .attr('stroke', 'transparent')
        .attr('stroke-width', 18)
        .attr('fill', 'none')
        .attr('cursor', 'pointer')
        .attr('data-segment', segmentKeys[i])
        .on('click', () => setSelectedSegment(segmentKeys[i]));

      // Visible segment line (as avant)
      g.append('path')
        .datum(seg)
        .attr('d', lineGenerator)
        .attr('stroke', selectedSegment === segmentKeys[i] ? theme.colors.accent : segmentColors[i])
        .attr('stroke-width', selectedSegment === segmentKeys[i] ? 4 : 2)
        .attr('fill', 'none')
        .attr('pointer-events', 'none'); // Ignore events, only the hit area above is interactive
    });

    // Gestion du drag
    const dragHandler = d3.drag<SVGCircleElement, Point, Point>()









      .on('start', function (event) {
        const key = d3.select(this).attr('data-key');
        setDragging(key);
        setHoverInfo(null); // Cacher le tooltip hover pendant le drag

        const pointIndex = ['attack', 'decay', 'sustain', 'release'].indexOf(key) + 1;
        const point = currentPoints.current[pointIndex];
        const mouseX = xScale.invert(event.x);
        const mouseY = yScale.invert(event.y);
        dragOffset.current = {
          x: mouseX - point.x,
          y: mouseY - point.y
        };

        setDragInfo({ key, time: point.x, level: point.y });
        d3.select(this).attr('fill', theme.colors.accent);
      })
      .on('drag', function (event) {
        const key = d3.select(this).attr('data-key');
        if (!dragOffset.current) return;

        let newX = xScale.invert(event.x) - dragOffset.current.x;
        const newY = yScale.invert(event.y) - dragOffset.current.y;

        // Application des contraintes avec possibilité de pousser les points suivants
        // maxSegmentSize est fixé à 16 pour tous les segments
        const [, a, d, s, r] = currentPoints.current;

        // Contraindre la nouvelle position
        newX = Math.max(0, newX);
        const constrainedY = Math.max(0, Math.min(100, newY));

        // Logique de poussée des points suivants en cascade
        switch (key) {
          case 'attack': {
            let constrainedX = Math.min(newX, maxSegmentSize);
            if (constrainedX > d.x) {
              currentPoints.current[2].x = constrainedX;
              if (currentPoints.current[2].x > s.x) {
                currentPoints.current[3].x = currentPoints.current[2].x;
                if (currentPoints.current[3].x > r.x) {
                  currentPoints.current[4].x = currentPoints.current[3].x;
                }
              }
            }
            currentPoints.current[1] = { x: constrainedX, y: constrainedY };
            setDragInfo({ key, time: constrainedX, level: constrainedY });
            break;
          }
          case 'decay': {
            let constrainedX = Math.max(a.x, Math.min(newX, a.x + maxSegmentSize));
            if (constrainedX > s.x) {
              currentPoints.current[3].x = constrainedX;
              if (currentPoints.current[3].x > r.x) {
                currentPoints.current[4].x = currentPoints.current[3].x;
              }
            }
            currentPoints.current[2] = { x: constrainedX, y: constrainedY };
            setDragInfo({ key, time: constrainedX, level: constrainedY });
            break;
          }
          case 'sustain': {
            let constrainedX = Math.max(d.x, Math.min(newX, d.x + maxSegmentSize));
            if (constrainedX > r.x) {
              currentPoints.current[4].x = constrainedX;
            }
            currentPoints.current[3] = { x: constrainedX, y: constrainedY };
            setDragInfo({ key, time: constrainedX, level: constrainedY });
            break;
          }
          case 'release': {
            const constrainedX = Math.max(s.x, Math.min(newX, s.x + maxSegmentSize));
            currentPoints.current[4] = { x: constrainedX, y: constrainedY };
            setDragInfo({ key, time: constrainedX, level: constrainedY });
            break;
          }
        }

        // Mise à jour visuelle de tous les points
        ['attack', 'decay', 'sustain', 'release'].forEach((k, idx) => {
          const pt = currentPoints.current[idx + 1];
          circlesRef.current[k]
            ?.attr('cx', xScale(pt.x))
            .attr('cy', yScale(pt.y));
        });

      })
      .on('end', function () {
        setDragging(null);
        setDragInfo(null);
        dragOffset.current = null;
        const key = d3.select(this).attr('data-key');
        d3.select(this).attr('fill', pointColors[key as keyof typeof pointColors]);

        // Sauvegarder le point modifié
        const updates: Partial<AdsrState> = {
          attack: { time: currentPoints.current[1].x, level: currentPoints.current[1].y },
          decay: { time: currentPoints.current[2].x, level: currentPoints.current[2].y },
          sustain: { time: currentPoints.current[3].x, level: currentPoints.current[3].y },
          release: { time: currentPoints.current[4].x, level: currentPoints.current[4].y }
        };
        requestAnimationFrame(() => {
          updateADSR(operatorId, updates);
        });
      });

    // Création des points interactifs
    circlesRef.current = {};
    ['attack', 'decay', 'sustain', 'release'].forEach((key, i) => {
      circlesRef.current[key] = g.append('circle')
        .datum(currentPoints.current[i + 1])
        .attr('cx', d => xScale(d.x))
        .attr('cy', d => yScale(d.y))
        .attr('r', 8)
        .attr('fill', pointColors[key as keyof typeof pointColors])
        .attr('stroke', theme.colors.background)
        .attr('stroke-width', 2)
        .attr('cursor', 'pointer')
        .attr('data-key', key)
        .on('mouseover', function() {
          const point = currentPoints.current[i + 1];
          setHoverInfo({ key, time: point.x, level: point.y });
          d3.select(this).attr('r', 10); // Agrandir au survol
        })
        .on('mouseout', function() {
          if (!dragging) {
            setHoverInfo(null);
            d3.select(this).attr('r', 8); // Taille normale
          }
        })
        .call(dragHandler);
    });

  }, [envelope, theme]); // Rafraîchir quand l'enveloppe ou le thème change

  // Détermine si on doit afficher le tooltip (drag ou hover)
  const infoToShow = dragInfo || hoverInfo;
  // Affiche le menu de sélection de courbe si un segment est sélectionné

  const handleCurveChange = (curve: CurveType) => {
    if (!selectedSegment) return;
    // Toujours fournir un objet complet pour curves
    const prev = envelope.curves ?? {
      attack: 'linear',
      decay: 'exponential',
      sustain: 'linear',
      release: 'exponential',
    };
    updateADSR(operatorId, {
      curves: {
        attack: selectedSegment === 'attack' ? curve : prev.attack,
        decay: selectedSegment === 'decay' ? curve : prev.decay,
        sustain: selectedSegment === 'sustain' ? curve : prev.sustain,
        release: selectedSegment === 'release' ? curve : prev.release,
      }
    });
    sendOperatorEnvCurve(operatorId, selectedSegment, curve);
    setSelectedSegment(null);
  };

  return (
    <AdsrContainer>
      <StyledSvg ref={svgRef} />
      {/* Tooltip affiché au même endroit pour drag et hover */}
      {infoToShow && (
        <Tooltip style={{
          top: '4px',
          left: '-25px'
        }}>
          {dragging ? 'Editing' : 'Point'}: {infoToShow.key} |
          Time: {infoToShow.time.toFixed(1)} |
          Level: {Math.round(infoToShow.level)}%
        </Tooltip>
      )}
      {/* Menu de sélection de courbe d'enveloppe (uniquement si version > 100) */}
      {selectedSegment && pfm3Version !== null && pfm3Version > 100 && (
        <Tooltip style={{ top: '40px', left: '10px', zIndex: 10 }}>
          <div style={{ marginBottom: 6, fontWeight: 600 }}>
            {selectedSegment.charAt(0).toUpperCase() + selectedSegment.slice(1)} curve
          </div>
          {ADSR_CURVE_TYPES.map(type => (
            <div key={type} style={{
              padding: '2px 8px',
              margin: '2px 0',
              borderRadius: 3,
              background: envelope.curves?.[selectedSegment] === type ? theme.colors.accent : 'transparent',
              color: envelope.curves?.[selectedSegment] === type ? theme.colors.background : theme.colors.text,
              cursor: 'pointer',
              fontWeight: envelope.curves?.[selectedSegment] === type ? 700 : 400
            }}
              onClick={() => handleCurveChange(type)}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <button onClick={() => setSelectedSegment(null)} style={{ fontSize: 12 }}>Annuler</button>
          </div>
        </Tooltip>
      )}
    </AdsrContainer>
  );
}

export default React.memo(AdsrControl);