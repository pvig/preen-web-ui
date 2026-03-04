import React, { useRef } from "react";
import { useThemeStore } from '../../theme/themeStore';

type ValuePosition = 'bottom' | 'left' | 'none';
type LabelPosition = 'top' | 'left' | 'none';

interface KnobBaseProps {
  size?: number;
  knobRadius?: number;
  min?: number;
  max?: number;
  value: number;
  onChange?: (value: number) => void;
  step?: number; // pas optionnel : si défini -> mode discret, sinon continu
  color?: string;
  backgroundColor?: string;
  strokeColor?: string;
  renderLabel?: (value: number) => React.ReactNode;
  label?: string | null;
  title?: string; // Tooltip HTML natif
  valuePosition?: ValuePosition; // Position d'affichage de la valeur
  labelPosition?: LabelPosition; // Position d'affichage du label
}

function KnobBase({
  size = 100,
  knobRadius = 20,
  min = 0,
  max = 100,
  value = 0,
  onChange = (arg) => { console.log("arg", arg)},
  step,
  color = "#000",
  backgroundColor = "#eee",
  strokeColor = "#ccc",
  renderLabel = (val: number) => val,
  label = null,
  title,
  valuePosition = 'bottom',
  labelPosition = 'top'
}: KnobBaseProps) {
  const { theme } = useThemeStore();
  const center = size / 2;
  const radius = knobRadius ?? (center - 10);
  const tickLength = 6;
  const isDragging = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const START_ANGLE = -135;
  const END_ANGLE = 135;
  const ANGLE_RANGE = END_ANGLE - START_ANGLE;

  //value = value?.toFixed(2);

  const angleForValue = (val:number) => {
    const ratio = (val - min) / (max - min);
    return START_ANGLE + ratio * ANGLE_RANGE;
  };

  const valueForAngle = (angle:number) => {
    const clamped = Math.max(START_ANGLE, Math.min(END_ANGLE, angle));
    const ratio = (clamped - START_ANGLE) / ANGLE_RANGE;
    return min + ratio * (max - min);
  };

  const getAngleFromEvent = (e: { clientX: number; clientY: number }) => {
    if (!svgRef.current) return 0;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - (rect.left + center);
    const y = e.clientY - (rect.top + center);
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    angle = angle + 90;
    if (angle < -180) angle += 360;
    if (angle > 180) angle -= 360;
    return angle;
  };

  const updateFromEvent = (e: { clientX: number; clientY: number }) => {
    if (!svgRef.current) return; 
    const angle = getAngleFromEvent(e);
    const clampedAngle = Math.max(START_ANGLE, Math.min(END_ANGLE, angle));
    const rawValue = valueForAngle(clampedAngle);

    // Mode discret si un pas est défini, sinon continu
    const newValue =
      step && step > 0
        ? Math.round(rawValue / step) * step
        : rawValue;

    onChange(newValue);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return 0;

    e.preventDefault();
    isDragging.current = true;
    updateFromEvent(e);

    // Capture: garantit la réception des pointermove/up pendant le drag
    try {
      (svgRef.current as unknown as SVGSVGElement).setPointerCapture(e.pointerId);
    } catch {
      // no-op (certains environnements peuvent ne pas supporter)
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || !isDragging.current) return;
    e.preventDefault();
    updateFromEvent(e);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    isDragging.current = false;
    try {
      (svgRef.current as unknown as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
  };

  const angle = angleForValue(value);
  const angleRad = (angle - 90) * (Math.PI / 180);
  const pointerX = center + radius * Math.cos(angleRad);
  const pointerY = center + radius * Math.sin(angleRad);

  const getTick = (deg: number) => {
    const rad = (deg - 90) * (Math.PI / 180);
    const outerX = center + radius * Math.cos(rad);
    const outerY = center + radius * Math.sin(rad);
    const innerX = center + (radius - tickLength) * Math.cos(rad);
    const innerY = center + (radius - tickLength) * Math.sin(rad);
    return { x1: innerX, y1: innerY, x2: outerX, y2: outerY };
  };

  const tickMin = getTick(START_ANGLE);
  const tickMax = getTick(END_ANGLE);
  
  React.useEffect(() => {
    return () => {
      // Rien à nettoyer: pas de listeners globaux
    };
  }, []);

  return (
    <div
      title={title}
      style={{
        position: "relative",
        display: (valuePosition === 'left' || labelPosition === 'left') ? 'flex' : 'block',
        alignItems: (valuePosition === 'left' || labelPosition === 'left') ? 'center' : 'initial',
        gap: (valuePosition === 'left' || labelPosition === 'left') ? '4px' : 0,
      }}
    >
      {/* Label à gauche */}
      {labelPosition === 'left' && label && (
        <div
          style={{
            fontSize: 11,
            color: theme.colors.knobLabel,
            fontWeight: "bold",
            minWidth: '55px',
            textAlign: 'right',
            pointerEvents: "none",
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
      )}

      {/* Valeur à gauche */}
      {valuePosition === 'left' && (
        <div
          style={{
            fontSize: 12,
            color: color,
            fontFamily: 'monospace',
            minWidth: '45px',
            textAlign: 'right',
            pointerEvents: "none",
          }}
        >
          {renderLabel(value)}
        </div>
      )}

      <div
        style={{
          position: "relative",
          width: size,
          height: size,
        }}
      >
        {/* SVG du knob */}
        <svg
          ref={svgRef}
          width={size}
          height={size}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ userSelect: "none", cursor: "pointer", touchAction: "none" }}
        >
          <circle
            cx={center}
            cy={center}
            r={radius * 1.2}
            fill="transparent"
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill={backgroundColor}
            stroke={strokeColor}
            strokeWidth="2"
          />
          <line {...tickMin} stroke={theme.colors.knobTick} strokeWidth="2" />
          <line {...tickMax} stroke={theme.colors.knobTick} strokeWidth="2" />
          <line
            x1={center}
            y1={center}
            x2={pointerX}
            y2={pointerY}
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        {/* Label au-dessus */}
        {labelPosition === 'top' && label && (
          <div
            style={{
              position: "absolute",
              top: -12,
              left: 0,
              width: "100%",
              textAlign: "center",
              fontSize: 12,
              fontWeight: "bold",
              pointerEvents: "none",
              color: theme.colors.knobLabel
            }}
          >
            {label}
          </div>
        )}

        {/* Valeur en dessous */}
        {valuePosition === 'bottom' && (
          <div
            style={{
              position: "absolute",
              bottom: -8,
              left: 0,
              width: "100%",
              textAlign: "center",
              fontSize: 12,
              color: color,
              pointerEvents: "none",
            }}
          >
            {renderLabel(value)}
          </div>
        )}
      </div>
    </div>

  );
}

export default React.memo(KnobBase);
