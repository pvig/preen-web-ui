import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useThemeStore } from '../../theme/themeStore';
import { type CurveType } from '../../types/patch';
import { generateCurvePoints, type CurvePoint } from '../../utils/envelopeCurve';

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
  user-select: none;
`;

const MARGIN = { left: 10, right: 10, top: 10, bottom: 10 };
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
  onChange: (envelope: EnvelopeData, changedPoint: PointType) => void;
  onLiveChange?: (envelope: EnvelopeData, changedPoint: PointType) => void;
  type: 'env1' | 'env2';  // Specify which envelope structure to use
  attackCurve?: CurveType;
  releaseCurve?: CurveType;
}

type PointTypeEnv1 = 'attack' | 'decay' | 'sustain' | 'release';
type PointTypeEnv2 = 'silence' | 'attack' | 'release';
export type PointType = PointTypeEnv1 | PointTypeEnv2;

const toLineCommands = (points: CurvePoint[]): string =>
  points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');

export const EnvelopeVisualizer: React.FC<Props> = ({
  envelope,
  onChange,
  onLiveChange,
  type,
  attackCurve = 'linear',
  releaseCurve = 'linear',
}) => {
  const [draggingPoint, setDraggingPoint] = useState<PointType | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<PointType | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const { theme } = useThemeStore();
  
  const isEnv1 = type === 'env1';
  const [dragEnvelope, setDragEnvelope] = useState<EnvelopeData | null>(null);
  const dragEnvelopeRef = useRef<EnvelopeData | null>(null);
  const changedPointRef = useRef<PointType | null>(null);
  const lastCommitRef = useRef(0);
  const flushDragRef = useRef<() => void>(() => {});
  const handleDragRef = useRef<(mouseX: number, mouseY: number) => void>(() => {});
  const dragAxisRef = useRef<{ maxTime: number; sustainOffset: number } | null>(null);
  const displayEnvelope = dragEnvelope ?? envelope;
  const env1Data = displayEnvelope as EnvelopeDataADSR;
  const env2Data = displayEnvelope as EnvelopeDataSAR;
  const actualTotal = isEnv1
    ? env1Data.attack.time + env1Data.decay.time + env1Data.sustain.time + env1Data.release.time
    : env2Data.silence.time + env2Data.attack.time + env2Data.release.time;
  const computedSustainOffset = isEnv1 ? Math.max(actualTotal, 4) * 0.05 : 0;
  const computedMaxTime = Math.max(actualTotal + computedSustainOffset, 4);
  const frozenAxis = dragAxisRef.current;
  const sustainOffset = frozenAxis ? frozenAxis.sustainOffset : computedSustainOffset;
  const maxTime = frozenAxis ? frozenAxis.maxTime : computedMaxTime;

  const commitDrag = () => {
    const current = dragEnvelopeRef.current;
    const point = changedPointRef.current;
    if (!current || !point) return;
    const now = performance.now();
    if (now - lastCommitRef.current >= 50) {
      lastCommitRef.current = now;
      onLiveChange?.(current, point);
    }
  };

  const flushDrag = () => {
    const current = dragEnvelopeRef.current;
    const point = changedPointRef.current;
    if (current && point) {
      onChange(current, point);
    }
    dragEnvelopeRef.current = null;
    changedPointRef.current = null;
    dragAxisRef.current = null;
    setDragEnvelope(null);
    setDraggingPoint(null);
  };
  flushDragRef.current = flushDrag;

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

  useEffect(() => {
    if (!draggingPoint) return;
    const stopDragging = () => flushDragRef.current();
    window.addEventListener('mouseup', stopDragging);
    return () => window.removeEventListener('mouseup', stopDragging);
  }, [draggingPoint]);

  useEffect(() => {
    if (!draggingPoint) return;
    const onWindowMouseMove = (e: MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      handleDragRef.current(e.clientX - rect.left, e.clientY - rect.top);
    };
    window.addEventListener('mousemove', onWindowMouseMove);
    return () => window.removeEventListener('mousemove', onWindowMouseMove);
  }, [draggingPoint]);

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
    const x = MARGIN.left + (time / maxTime) * graphWidth;
    const y = MARGIN.top + graphHeight - (level * graphHeight);
    return { x, y };
  };

  // Convert screen coordinates to envelope values
  const getEnvelopeValues = (screenX: number, screenY: number) => {
    const time = Math.max(0, ((screenX - MARGIN.left) / graphWidth) * maxTime);
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
    attack: getScreenPosition(env1Data.attack.time, 1),
    decay: getScreenPosition(
      env1Data.attack.time + env1Data.decay.time,
      env1Data.decay.level
    ),
    // Point S à 5% de la largeur graphique depuis D
    sustain: getScreenPosition(
      env1Data.attack.time + env1Data.decay.time + sustainOffset,
      env1Data.decay.level
    ),
    release: getScreenPosition(
      env1Data.attack.time + env1Data.decay.time + sustainOffset + env1Data.release.time,
      env1Data.release.level
    ),
  } : null;

  const pointsEnv2: PointsEnv2 | null = !isEnv1 ? {
    start: getScreenPosition(0, 0),
    silence: getScreenPosition(env2Data.silence.time, 0),  // Silence stays at 0
    attack: getScreenPosition(
      env2Data.silence.time + env2Data.attack.time,
      1  // Attack level is always 1
    ),
    release: getScreenPosition(
      env2Data.silence.time + env2Data.attack.time + env2Data.release.time,
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

    if (draggingPoint) return;
    const { point } = findClosestPoint(mouseX, mouseY);
    setHoveredPoint(point);
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (hoveredPoint) {
      dragAxisRef.current = {
        maxTime: computedMaxTime,
        sustainOffset: computedSustainOffset,
      };
      setDraggingPoint(hoveredPoint);
      e.preventDefault();
    }
  };

  const handleMouseUp = () => {
    flushDrag();
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  const handleDrag = (mouseX: number, mouseY: number) => {
    if (!draggingPoint) return;
    changedPointRef.current = draggingPoint;

    const { time, level } = getEnvelopeValues(mouseX, mouseY);

    if (isEnv1) {
      const env = displayEnvelope as EnvelopeDataADSR;
      const newEnvelope = { ...env };

      switch (draggingPoint) {
        case 'attack':
          newEnvelope.attack = { time: Math.min(16, Math.max(0, time)), level: 1 };
          break;
        case 'decay': {
          const prevTime = env.attack.time;
          newEnvelope.decay = { 
            time: Math.min(16, Math.max(0, time - prevTime)), 
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
          const minTime = env.attack.time + env.decay.time + sustainOffset;
          const releaseTime = Math.min(16, Math.max(0, time - minTime));
          newEnvelope.release = {
            time: releaseTime,
            level: 0
          };
          break;
        }
      }
      dragEnvelopeRef.current = newEnvelope;
      setDragEnvelope(newEnvelope);
      commitDrag();
    } else {
      // Env2: Silence-Attack-Release
      const env = displayEnvelope as EnvelopeDataSAR;
      const newEnvelope = { ...env };

      switch (draggingPoint) {
        case 'silence':
          // Silence: only time can be modified, level is always 0
          newEnvelope.silence = { time: Math.min(16, Math.max(0, time)), level: 0 };
          break;
        case 'attack': {
          // Attack: only time can be modified, level is always 1
          const prevTime = env.silence.time;
          newEnvelope.attack = { 
            time: Math.min(16, Math.max(0, time - prevTime)), 
            level: 1
          };
          break;
        }
        case 'release': {
          // Release: only time can be modified, level is always 0
          const prevTime = env.silence.time + env.attack.time;
          newEnvelope.release = { 
            time: Math.min(16, Math.max(0, time - prevTime)),
            level: 0
          };
          break;
        }
      }
      dragEnvelopeRef.current = newEnvelope;
      setDragEnvelope(newEnvelope);
      commitDrag();
    }
  };
  handleDragRef.current = handleDrag;

  // Build the envelope path based on type
  const pathData = isEnv1
    ? `
      M ${pointsEnv1!.start.x} ${pointsEnv1!.start.y}
      ${toLineCommands(generateCurvePoints(pointsEnv1!.start, pointsEnv1!.attack, attackCurve))}
      ${toLineCommands(generateCurvePoints(pointsEnv1!.attack, pointsEnv1!.decay, releaseCurve))}
      L ${pointsEnv1!.sustain.x} ${pointsEnv1!.sustain.y}
      ${toLineCommands(generateCurvePoints(pointsEnv1!.sustain, pointsEnv1!.release, releaseCurve))}
    `
    : `
      M ${pointsEnv2!.start.x} ${pointsEnv2!.start.y}
      L ${pointsEnv2!.silence.x} ${pointsEnv2!.silence.y}
      ${toLineCommands(generateCurvePoints(pointsEnv2!.silence, pointsEnv2!.attack, attackCurve))}
      ${toLineCommands(generateCurvePoints(pointsEnv2!.attack, pointsEnv2!.release, releaseCurve))}
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
        {(() => {
          const activePoint = draggingPoint || hoveredPoint;
          if (!activePoint) return null;
          const activePointPos = isEnv1
            ? (pointsEnv1 as any)[activePoint]
            : (pointsEnv2 as any)[activePoint];

          return (
            <>
              <line
                x1={activePointPos.x}
                y1={MARGIN.top}
                x2={activePointPos.x}
                y2={height - MARGIN.bottom}
                stroke={theme.colors.highlight}
                strokeWidth="1"
                strokeDasharray="4 2"
              />
              {activePoint === 'decay' && (
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
    </Container>
  );
};
