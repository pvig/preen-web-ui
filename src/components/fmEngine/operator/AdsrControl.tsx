import * as d3 from 'd3';
import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { useOperatorEnvelope, updateADSR } from '../../../stores/patchStore';
import { type AdsrState, type CurveType } from '../../../types/adsr';
import { useThemeStore } from '../../../theme/themeStore';

const AdsrContainer = styled.div`
  background: ${props => props.theme.colors.background};
  margin-top: 10px;
  border-radius: 4px;
  overflow: hidden;
`;

const StyledSvg = styled.svg`
  width: 100%;
  height: 100%;
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
  //Console.log("AdsrControl", operatorId);
  const envelope = useOperatorEnvelope(operatorId);
  //console.log("envelope", envelope);
  const { theme } = useThemeStore();

  if (!envelope) return null;

  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ key: string; time: number; level: number } | null>(null);
  const maxSegmentSize = 16; // Limite fixe de 16 pour chaque segment
  const margin = { top: 20, right: 20, bottom: 10, left: 30 };
  const width = 250 - margin.left - margin.right;
  const height = 120 - margin.top - margin.bottom;

  // Références pour les éléments D3
  const lineRef = useRef<d3.Selection<SVGPathElement, Point[], null, undefined> | null>(null);
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
        case 'exponential':
          factor = t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
          break;
        case 'logarithmic':
          factor = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          break;
        case 'user':
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

  // Construit le chemin complet de l'enveloppe
  const generateFullPath = (points: Point[]): Point[] => {
    const fullPath: Point[] = [];

    fullPath.push(...generateCurvePoints(points[0], points[1], envelope.curves?.attack || 'linear'));
    fullPath.push(...generateCurvePoints(points[1], points[2], envelope.curves?.decay || 'linear').slice(1));
    fullPath.push(...generateCurvePoints(points[2], points[3], envelope.curves?.sustain || 'linear').slice(1));
    fullPath.push(...generateCurvePoints(points[3], points[4], envelope.curves?.release || 'linear').slice(1));

    return fullPath;
  };

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
    const xScale = d3.scaleLinear().domain([0, maxTime]).range([0, width]);
    const yScale = d3.scaleLinear().domain([100, 0]).range([0, height]);

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

    // Dessin de la ligne
    lineRef.current = g.append('path')
      .datum(generateFullPath(currentPoints.current))
      .attr('d', lineGenerator)
      .attr('stroke', theme.colors.primary)
      .attr('stroke-width', 2)
      .attr('fill', 'none');

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
            // Attack peut aller de 0 à maxSegmentSize (16)
            let constrainedX = Math.min(newX, maxSegmentSize);
            
            // Si Attack pousse Decay, déplacer Decay en cascade
            if (constrainedX > d.x) {
              currentPoints.current[2].x = constrainedX;
              
              // Si Decay pousse maintenant Sustain, le déplacer aussi
              if (currentPoints.current[2].x > s.x) {
                currentPoints.current[3].x = currentPoints.current[2].x;
                
                // Si Sustain pousse maintenant Release, le déplacer aussi
                if (currentPoints.current[3].x > r.x) {
                  currentPoints.current[4].x = currentPoints.current[3].x;
                }
              }
            }
            
            currentPoints.current[1] = { x: constrainedX, y: constrainedY };
            break;
          }
          
          case 'decay': {
            // Decay peut aller de attack.x à attack.x + maxSegmentSize (16)
            let constrainedX = Math.max(a.x, Math.min(newX, a.x + maxSegmentSize));
            
            // Si Decay pousse Sustain, déplacer Sustain en cascade
            if (constrainedX > s.x) {
              currentPoints.current[3].x = constrainedX;
              
              // Si Sustain pousse maintenant Release, le déplacer aussi
              if (currentPoints.current[3].x > r.x) {
                currentPoints.current[4].x = currentPoints.current[3].x;
              }
            }
            
            currentPoints.current[2] = { x: constrainedX, y: constrainedY };
            break;
          }
          
          case 'sustain': {
            // Sustain peut aller de decay.x à decay.x + maxSegmentSize (16)
            let constrainedX = Math.max(d.x, Math.min(newX, d.x + maxSegmentSize));
            
            // Si Sustain pousse Release, le déplacer
            if (constrainedX > r.x) {
              currentPoints.current[4].x = constrainedX;
            }
            
            currentPoints.current[3] = { x: constrainedX, y: constrainedY };
            break;
          }
          
          case 'release': {
            // Release peut aller de sustain.x à sustain.x + maxSegmentSize (16)
            const constrainedX = Math.max(s.x, Math.min(newX, s.x + maxSegmentSize));
            currentPoints.current[4] = { x: constrainedX, y: constrainedY };
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

        lineRef.current?.datum(generateFullPath(currentPoints.current)).attr('d', lineGenerator);

      })
      .on('end', function () {
        setDragging(null);
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
        
        // Notification du changement
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

  return (
    <AdsrContainer>
      <StyledSvg ref={svgRef} />
      {/* Tooltip pendant le drag */}
      {dragging && (
        <Tooltip>
          Editing: {dragging} |
          Time: {(
            dragging === 'attack' ? envelope.attack.time :
              dragging === 'decay' ? envelope.decay.time :
                dragging === 'sustain' ? envelope.sustain.time : envelope.release.time
          ).toFixed(1)} |
          Level: {Math.round(
            dragging === 'attack' ? envelope.attack.level :
              dragging === 'decay' ? envelope.decay.level :
                dragging === 'sustain' ? envelope.sustain.level : envelope.release.level
          )}%
        </Tooltip>
      )}
      {/* Tooltip au survol */}
      {!dragging && hoverInfo && (
        <div style={{
          position: 'absolute',
          top: '5px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: theme.colors.panel,
          color: theme.colors.textSecondary,
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 1000,
          boxShadow: `0 2px 8px ${theme.colors.border}`
        }}>
          {hoverInfo.key.charAt(0).toUpperCase() + hoverInfo.key.slice(1)} - 
          Time: {hoverInfo.time.toFixed(1)} | 
          Level: {hoverInfo.level.toFixed(1)}%
        </div>
      )}
    </AdsrContainer>
  );
}

export default React.memo(AdsrControl);