import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useThemeStore } from '../../theme/themeStore';

const Container = styled.div`
  width: 100%;
  height: 200px;
  background: ${props => props.theme.colors.background};
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border};
  position: relative;
  user-select: none;
  cursor: crosshair;
`;

const StyledSvg = styled.svg`
  width: 100%;
  height: 100%;
`;

const ValueLabels = styled.div`
  position: absolute;
  right: 10px;
  top: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ValueLabel = styled.div<{ $highlighted?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  color: ${props => props.$highlighted ? props.theme.colors.highlight : props.theme.colors.text};
  font-size: 0.75rem;
  font-family: monospace;
  transition: color 0.2s;
`;

const LabelName = styled.span`
  width: 15px;
  font-weight: bold;
`;

const LabelValue = styled.span`
  width: 45px;
  text-align: right;
`;

const MARGIN = { left: 30, right: 110, top: 20, bottom: 30 };
const POINT_RADIUS = 5;
const ACTIVE_POINT_RADIUS = 7;

export interface EnvelopePoint {
  time: number;  // 0 to 16 seconds
  level: number; // 0 to 1 (0-100%)
}

// Envelope 1: ADSR structure
export interface EnvelopeDataADSR {
  attack: EnvelopePoint;
  decay: EnvelopePoint;
  sustain: EnvelopePoint; // Only time is used, level is same as decay
  release: EnvelopePoint;
}

// Envelope 2: Silence-Attack-Release structure
export interface EnvelopeDataSAR {
  silence: EnvelopePoint;  // Only time is used, level is 0
  attack: EnvelopePoint;   // Only time is used, level is fixed at 1
  release: EnvelopePoint;  // Only time is used, level is 0
}

export type EnvelopeData = EnvelopeDataADSR | EnvelopeDataSAR;

interface Props {
  envelope: EnvelopeData;
  onChange: (envelope: EnvelopeData) => void;
  type: 'env1' | 'env2';  // Specify which envelope structure to use
}

type PointTypeEnv1 = 'attack' | 'decay' | 'sustain' | 'release';
type PointTypeEnv2 = 'silence' | 'attack' | 'release';
type PointType = PointTypeEnv1 | PointTypeEnv2;

export const EnvelopeVisualizer: React.FC<Props> = ({ envelope, onChange, type }) => {
  const [draggingPoint, setDraggingPoint] = useState<PointType | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<PointType | null>(null);
  const [hoveredAxis, setHoveredAxis] = useState<'x' | 'y' | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { theme } = useThemeStore();
  
  const isEnv1 = type === 'env1';

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const width = dimensions.width;
  const height = dimensions.height;
  const graphWidth = width - MARGIN.left - MARGIN.right;
  const graphHeight = height - MARGIN.top - MARGIN.bottom;

  // Ne pas rendre si les dimensions ne sont pas encore calculées
  if (width === 0 || height === 0 || graphWidth <= 0 || graphHeight <= 0) {
    return <Container ref={containerRef} />;
  }

  // Convert envelope points to screen coordinates
  const getScreenPosition = (time: number, level: number) => {
    // Calculate cumulative time position based on envelope type
    const totalTime = isEnv1
      ? (envelope as EnvelopeDataADSR).attack.time + 
        (envelope as EnvelopeDataADSR).decay.time + 
        (envelope as EnvelopeDataADSR).sustain.time + 
        (envelope as EnvelopeDataADSR).release.time
      : (envelope as EnvelopeDataSAR).silence.time +
        (envelope as EnvelopeDataSAR).attack.time +
        (envelope as EnvelopeDataSAR).release.time;
    
    // Pour Env1, ajouter le décalage de sustain au temps total pour l'échelle
    const sustainOffset = isEnv1 ? Math.max(totalTime, 4) * 0.05 : 0;
    const adjustedTotalTime = totalTime + sustainOffset;
    
    // Ensure minimum scale for visibility  
    const maxTime = Math.max(adjustedTotalTime, 4);
    
    const x = MARGIN.left + (time / maxTime) * graphWidth;
    const y = MARGIN.top + graphHeight - (level * graphHeight);
    
    return { x, y };
  };

  // Convert screen coordinates to envelope values
  const getEnvelopeValues = (screenX: number, screenY: number) => {
    const totalTime = isEnv1
      ? (envelope as EnvelopeDataADSR).attack.time + 
        (envelope as EnvelopeDataADSR).decay.time + 
        (envelope as EnvelopeDataADSR).sustain.time + 
        (envelope as EnvelopeDataADSR).release.time
      : (envelope as EnvelopeDataSAR).silence.time +
        (envelope as EnvelopeDataSAR).attack.time +
        (envelope as EnvelopeDataSAR).release.time;
    
    // Pour Env1, ajouter le décalage de sustain au temps total pour l'échelle
    const sustainOffset = isEnv1 ? Math.max(totalTime, 4) * 0.05 : 0;
    const adjustedTotalTime = totalTime + sustainOffset;
    const maxTime = Math.max(adjustedTotalTime, 4);

    const time = Math.max(0, Math.min(16, ((screenX - MARGIN.left) / graphWidth) * maxTime));
    const level = Math.max(0, Math.min(1, 1 - ((screenY - MARGIN.top) / graphHeight)));
    
    return { time, level };
  };

  // Calculate all point positions based on envelope type
  type PointsEnv1 = {
    start: { x: number; y: number };
    attack: { x: number; y: number };
    decay: { x: number; y: number };
    sustain: { x: number; y: number };
    release: { x: number; y: number };
  };

  type PointsEnv2 = {
    start: { x: number; y: number };
    silence: { x: number; y: number };
    attack: { x: number; y: number };
    release: { x: number; y: number };
  };

  const pointsEnv1: PointsEnv1 | null = isEnv1 ? {
    start: getScreenPosition(0, 0),
    attack: getScreenPosition((envelope as EnvelopeDataADSR).attack.time, 1),
    decay: getScreenPosition(
      (envelope as EnvelopeDataADSR).attack.time + (envelope as EnvelopeDataADSR).decay.time,
      (envelope as EnvelopeDataADSR).decay.level
    ),
    // Point S à 5% de la largeur graphique depuis D
    sustain: (() => {
      const totalTime = (envelope as EnvelopeDataADSR).attack.time + 
        (envelope as EnvelopeDataADSR).decay.time + 
        (envelope as EnvelopeDataADSR).sustain.time + 
        (envelope as EnvelopeDataADSR).release.time;
      const maxTime = Math.max(totalTime, 4);
      const sustainOffset = maxTime * 0.05; // 5% de la largeur d'affichage en temps
      return getScreenPosition(
        (envelope as EnvelopeDataADSR).attack.time + (envelope as EnvelopeDataADSR).decay.time + sustainOffset,
        (envelope as EnvelopeDataADSR).decay.level
      );
    })(),
    release: (() => {
      const totalTime = (envelope as EnvelopeDataADSR).attack.time + 
        (envelope as EnvelopeDataADSR).decay.time + 
        (envelope as EnvelopeDataADSR).sustain.time + 
        (envelope as EnvelopeDataADSR).release.time;
      const maxTime = Math.max(totalTime, 4);
      const sustainOffset = maxTime * 0.05;
      return getScreenPosition(
        (envelope as EnvelopeDataADSR).attack.time + (envelope as EnvelopeDataADSR).decay.time + sustainOffset + (envelope as EnvelopeDataADSR).release.time,
        (envelope as EnvelopeDataADSR).release.level
      );
    })(),
  } : null;

  const pointsEnv2: PointsEnv2 | null = !isEnv1 ? {
    start: getScreenPosition(0, 0),
    silence: getScreenPosition((envelope as EnvelopeDataSAR).silence.time, 0),  // Silence stays at 0
    attack: getScreenPosition(
      (envelope as EnvelopeDataSAR).silence.time + (envelope as EnvelopeDataSAR).attack.time,
      1  // Attack level is always 1
    ),
    release: getScreenPosition(
      (envelope as EnvelopeDataSAR).silence.time + (envelope as EnvelopeDataSAR).attack.time + (envelope as EnvelopeDataSAR).release.time,
      0  // Release level is 0
    ),
  } : null;

  // Find closest point to mouse
  const findClosestPoint = (mouseX: number, mouseY: number): { point: PointType | null; axis: 'x' | 'y' } => {
    let minDistance = Infinity;
    let closestPoint: PointType | null = null;
    let axis: 'x' | 'y' = 'x';

    const checkDistance = (pointName: PointType, pos: { x: number; y: number }, allowY: boolean = true) => {
      const distX = Math.abs(mouseX - pos.x);
      const distY = Math.abs(mouseY - pos.y);
      const dist = Math.sqrt(distX * distX + distY * distY);
      
      // Increased handicap for far points to make selection more intuitive
      const handicap = (dist / graphWidth) * 20;
      const adjustedDistX = distX + handicap;
      const adjustedDistY = distY + handicap;

      // For points with locked level, only allow Y axis (vertical line) for time adjustment
      if (!allowY) {
        if (adjustedDistX < minDistance) {
          minDistance = adjustedDistX;
          closestPoint = pointName;
          axis = 'y';  // Vertical line (X axis / time control)
        }
        return;
      }

      if (adjustedDistX < minDistance) {
        minDistance = adjustedDistX;
        closestPoint = pointName;
        axis = 'y';  // Vertical line (X axis / time control)
      }
      
      if (adjustedDistY < minDistance) {
        minDistance = adjustedDistY;
        closestPoint = pointName;
        axis = 'x';  // Horizontal line (Y axis / level control)
      }
    };

    if (isEnv1) {
      checkDistance('attack' as PointType, pointsEnv1!.attack);
      checkDistance('decay' as PointType, pointsEnv1!.decay);
      // S (sustain) suit D, donc pas de drag
      // checkDistance('sustain' as PointType, pointsEnv1!.sustain, true); // désactivé
      checkDistance('release' as PointType, pointsEnv1!.release);
    } else {
      checkDistance('silence' as PointType, pointsEnv2!.silence, false); // Silence: only time, level locked at 0
      checkDistance('attack' as PointType, pointsEnv2!.attack, false); // Attack: only time, level locked at 1
      checkDistance('release' as PointType, pointsEnv2!.release, false); // Release: only time, level locked at 0
    }

    return { point: closestPoint, axis };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (draggingPoint) {
      handleDrag(mouseX, mouseY);
    } else {
      const { point, axis } = findClosestPoint(mouseX, mouseY);
      setHoveredPoint(point);
      setHoveredAxis(axis);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (hoveredPoint) {
      setDraggingPoint(hoveredPoint);
      e.preventDefault();
    }
  };

  const handleMouseUp = () => {
    setDraggingPoint(null);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setHoveredAxis(null);
    setDraggingPoint(null);
  };

  const handleDrag = (mouseX: number, mouseY: number) => {
    if (!draggingPoint) return;

    const { time, level } = getEnvelopeValues(mouseX, mouseY);

    if (isEnv1) {
      const env = envelope as EnvelopeDataADSR;
      const newEnvelope = { ...env };

      switch (draggingPoint) {
        case 'attack':
          newEnvelope.attack = { time: Math.max(0, time), level: Math.max(0, Math.min(1, level)) };
          break;
        case 'decay': {
          const prevTime = env.attack.time;
          newEnvelope.decay = { 
            time: Math.max(0, time - prevTime), 
            level: Math.max(0, Math.min(1, level)) 
          };
          break;
        }
        case 'sustain': {
          // Sustain: non éditable, suit decay
          break;
        }
        case 'release': {
          // Empêche R d'être placé avant S (5% de la largeur d'affichage)
          const totalTime = env.attack.time + env.decay.time + env.sustain.time + env.release.time;
          const maxTime = Math.max(totalTime, 4);
          const sustainOffset = maxTime * 0.05;
          const minTime = env.attack.time + env.decay.time + sustainOffset;
          const releaseTime = Math.max(0, time - minTime);
          newEnvelope.release = {
            time: releaseTime,
            level: Math.max(0, Math.min(1, level))
          };
          break;
        }
      }
      onChange(newEnvelope);
    } else {
      // Env2: Silence-Attack-Release
      const env = envelope as EnvelopeDataSAR;
      const newEnvelope = { ...env };

      switch (draggingPoint) {
        case 'silence':
          // Silence: only time can be modified, level is always 0
          newEnvelope.silence = { time: Math.max(0, time), level: 0 };
          break;
        case 'attack': {
          // Attack: only time can be modified, level is always 1
          const prevTime = env.silence.time;
          newEnvelope.attack = { 
            time: Math.max(0, time - prevTime), 
            level: 1
          };
          break;
        }
        case 'release': {
          // Release: only time can be modified, level is always 0
          const prevTime = env.silence.time + env.attack.time;
          newEnvelope.release = { 
            time: Math.max(0, time - prevTime),
            level: 0
          };
          break;
        }
      }
      onChange(newEnvelope);
    }
  };

  // Build the envelope path based on type
  const pathData = isEnv1
    ? `
      M ${pointsEnv1!.start.x} ${pointsEnv1!.start.y}
      L ${pointsEnv1!.attack.x} ${pointsEnv1!.attack.y}
      L ${pointsEnv1!.decay.x} ${pointsEnv1!.decay.y}
      L ${pointsEnv1!.sustain.x} ${pointsEnv1!.sustain.y}
      L ${pointsEnv1!.release.x} ${pointsEnv1!.release.y}
    `
    : `
      M ${pointsEnv2!.start.x} ${pointsEnv2!.start.y}
      L ${pointsEnv2!.silence.x} ${pointsEnv2!.silence.y}
      L ${pointsEnv2!.attack.x} ${pointsEnv2!.attack.y}
      L ${pointsEnv2!.release.x} ${pointsEnv2!.release.y}
    `;

  // Build the fill path (envelope + bottom line back to start)
  const lastPoint = isEnv1 ? pointsEnv1!.release : pointsEnv2!.release;
  const startPoint = isEnv1 ? pointsEnv1!.start : pointsEnv2!.start;
  const fillPathData = `
    ${pathData}
    L ${lastPoint.x} ${startPoint.y}
    L ${startPoint.x} ${startPoint.y}
    Z
  `;


  // Draw grid lines
  const gridLines = [];
  // Calculate total envelope duration (maxTime) as in getScreenPosition
  const totalTime = isEnv1
    ? (envelope as EnvelopeDataADSR).attack.time +
      (envelope as EnvelopeDataADSR).decay.time +
      (envelope as EnvelopeDataADSR).sustain.time +
      (envelope as EnvelopeDataADSR).release.time
    : (envelope as EnvelopeDataSAR).silence.time +
      (envelope as EnvelopeDataSAR).attack.time +
      (envelope as EnvelopeDataSAR).release.time;
  
  // Pour Env1, ajouter le décalage de sustain au temps total pour l'échelle
  const sustainOffset = isEnv1 ? Math.max(totalTime, 4) * 0.05 : 0;
  const adjustedTotalTime = totalTime + sustainOffset;
  const maxTime = Math.max(adjustedTotalTime, 4);
  // 1 vertical line per second, min 2, max 16
  const numVerticalLines = Math.max(2, Math.min(16, Math.round(maxTime)));
  for (let i = 0; i <= numVerticalLines; i++) {
    const x = MARGIN.left + (i / numVerticalLines) * graphWidth;
    gridLines.push(
      <line
        key={`v-${i}`}
        x1={x}
        y1={MARGIN.top}
        x2={x}
        y2={height - MARGIN.bottom}
        stroke={theme.colors.border}
        strokeWidth="1"
      />
    );
  }

  const numHorizontalLines = 4;
  for (let i = 0; i <= numHorizontalLines; i++) {
    const y = MARGIN.top + (i / numHorizontalLines) * graphHeight;
    gridLines.push(
      <line
        key={`h-${i}`}
        x1={MARGIN.left}
        y1={y}
        x2={width - MARGIN.right}
        y2={y}
        stroke={theme.colors.border}
        strokeWidth="1"
      />
    );
  }

  const pointData: Array<{ name: PointType; pos: { x: number; y: number }; label: string }> = isEnv1
    ? [
        { name: 'attack' as PointType, pos: pointsEnv1!.attack, label: 'A' },
        { name: 'decay' as PointType, pos: pointsEnv1!.decay, label: 'D' },
        { name: 'sustain' as PointType, pos: pointsEnv1!.sustain, label: 'S' },
        { name: 'release' as PointType, pos: pointsEnv1!.release, label: 'R' },
      ]
    : [
        { name: 'silence' as PointType, pos: pointsEnv2!.silence, label: 'S' },
        { name: 'attack' as PointType, pos: pointsEnv2!.attack, label: 'A' },
        { name: 'release' as PointType, pos: pointsEnv2!.release, label: 'R' },
      ];

  return (
    <Container ref={containerRef}>
      <StyledSvg
        ref={svgRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Grid */}
        {gridLines}

        {/* Border */}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={graphWidth}
          height={graphHeight}
          fill="none"
          stroke={theme.colors.border}
          strokeWidth="2"
        />

        {/* Fill under envelope */}
        <path d={fillPathData} fill={`${theme.colors.primary}30`} />

        {/* Envelope line */}
        <path
          d={pathData}
          fill="none"
          stroke={theme.colors.textSecondary}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Guide lines for hovered/dragged point */}
        {(hoveredPoint || draggingPoint) && hoveredAxis && (() => {
          const activePoint = draggingPoint || hoveredPoint!;
          const activePointPos = isEnv1 
            ? (pointsEnv1 as any)[activePoint]
            : (pointsEnv2 as any)[activePoint];
          
          return (
            <>
              {hoveredAxis === 'y' && (
                <line
                  x1={activePointPos.x}
                  y1={MARGIN.top}
                  x2={activePointPos.x}
                  y2={height - MARGIN.bottom}
                  stroke={theme.colors.highlight}
                  strokeWidth="1"
                  strokeDasharray="4 2"
                />
              )}
              {hoveredAxis === 'x' && (
                <line
                  x1={MARGIN.left}
                  y1={activePointPos.y}
                  x2={width - MARGIN.right}
                  y2={activePointPos.y}
                  stroke={theme.colors.highlight}
                  strokeWidth="1"
                  strokeDasharray="4 2"
                />
              )}
            </>
          );
        })()}

        {/* Points */}
        {pointData.map(({ name, pos }) => {
          const isActive = draggingPoint === name;
          const isHovered = hoveredPoint === name;
          const radius = isActive || isHovered ? ACTIVE_POINT_RADIUS : POINT_RADIUS;
          const color = isActive || isHovered ? theme.colors.highlight : theme.colors.textSecondary;
          const fill = isActive ? color : 'none';

          return (
            <circle
              key={name}
              cx={pos.x}
              cy={pos.y}
              r={radius}
              fill={fill}
              stroke={color}
              strokeWidth="2"
            />
          );
        })}
      </StyledSvg>

      {/* Value labels on the right */}
      <ValueLabels>
        {isEnv1 ? (
          <>
            <ValueLabel $highlighted={hoveredPoint === 'attack' || draggingPoint === 'attack'}>
              <LabelName>A</LabelName>
              <LabelValue>{(envelope as EnvelopeDataADSR).attack.time.toFixed(2)}</LabelValue>
              <LabelValue>100</LabelValue>
            </ValueLabel>
            <ValueLabel $highlighted={hoveredPoint === 'decay' || draggingPoint === 'decay'}>
              <LabelName>D</LabelName>
              <LabelValue>{(envelope as EnvelopeDataADSR).decay.time.toFixed(2)}</LabelValue>
              <LabelValue>{((envelope as EnvelopeDataADSR).decay.level * 100).toFixed(0)}</LabelValue>
            </ValueLabel>
            <ValueLabel $highlighted={hoveredPoint === 'sustain' || draggingPoint === 'sustain'}>
              <LabelName>S</LabelName>
              <LabelValue>{(envelope as EnvelopeDataADSR).sustain.time.toFixed(2)}</LabelValue>
              <LabelValue>{((envelope as EnvelopeDataADSR).decay.level * 100).toFixed(0)}</LabelValue>
            </ValueLabel>
            <ValueLabel $highlighted={hoveredPoint === 'release' || draggingPoint === 'release'}>
              <LabelName>R</LabelName>
              <LabelValue>{(envelope as EnvelopeDataADSR).release.time.toFixed(2)}</LabelValue>
              <LabelValue>{((envelope as EnvelopeDataADSR).release.level * 100).toFixed(0)}</LabelValue>
            </ValueLabel>
          </>
        ) : (
          <>
            <ValueLabel $highlighted={hoveredPoint === 'silence' || draggingPoint === 'silence'}>
              <LabelName>S</LabelName>
              <LabelValue>{(envelope as EnvelopeDataSAR).silence.time.toFixed(2)}</LabelValue>
              <LabelValue>-</LabelValue>
            </ValueLabel>
            <ValueLabel $highlighted={hoveredPoint === 'attack' || draggingPoint === 'attack'}>
              <LabelName>A</LabelName>
              <LabelValue>{(envelope as EnvelopeDataSAR).attack.time.toFixed(2)}</LabelValue>
              <LabelValue>-</LabelValue>
            </ValueLabel>
            <ValueLabel $highlighted={hoveredPoint === 'release' || draggingPoint === 'release'}>
              <LabelName>R</LabelName>
              <LabelValue>{(envelope as EnvelopeDataSAR).release.time.toFixed(2)}</LabelValue>
              <LabelValue>-</LabelValue>
            </ValueLabel>
          </>
        )}
      </ValueLabels>
    </Container>
  );
};
