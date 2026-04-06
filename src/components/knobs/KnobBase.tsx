import React, { useRef, useState } from "react";
import { useThemeStore } from '../../theme/themeStore';

type ValuePosition = 'top' | 'bottom' | 'left' | 'none';
type LabelPosition = 'top' | 'left' | 'bottom' | 'none';

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
  onChange = (arg) => { console.log("arg", arg) },
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

  // Does the range span zero? If so, anchor 0 at 0° (12 o'clock)
  const crossesZero = min < 0 && max > 0;

  const angleForValue = (val: number) => {
    if (crossesZero) {
      // Piecewise: [min,0] → [START_ANGLE, 0°] and [0,max] → [0°, END_ANGLE]
      if (val <= 0) {
        const ratio = val / min; // 1 at min, 0 at zero
        return START_ANGLE * ratio;  // START_ANGLE when ratio=1, 0° when ratio=0
      } else {
        const ratio = val / max; // 0 at zero, 1 at max
        return END_ANGLE * ratio;    // 0° when ratio=0, END_ANGLE when ratio=1
      }
    }
    const ratio = (val - min) / (max - min);
    return START_ANGLE + ratio * ANGLE_RANGE;
  };

  const valueForAngle = (angle: number) => {
    const clamped = Math.max(START_ANGLE, Math.min(END_ANGLE, angle));
    if (crossesZero) {
      if (clamped <= 0) {
        // [START_ANGLE, 0°] → [min, 0]
        return min * (clamped / START_ANGLE);
      } else {
        // [0°, END_ANGLE] → [0, max]
        return max * (clamped / END_ANGLE);
      }
    }
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
  const tickZero = crossesZero ? getTick(0) : null;

  // ── Editable value ──────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startEditing = () => {
    setEditText(String(step && step >= 1 ? Math.round(value) : parseFloat(value.toFixed(4))));
    setIsEditing(true);
    // Focus will be set via autoFocus on the input
  };

  const commitEdit = () => {
    setIsEditing(false);
    const parsed = parseFloat(editText);
    if (isNaN(parsed)) return;
    let clamped = Math.max(min, Math.min(max, parsed));
    if (step && step > 0) {
      clamped = Math.round(clamped / step) * step;
    }
    onChange(clamped);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const editInputStyle: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${color}`,
    borderRadius: 3,
    color: color,
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    outline: 'none',
    padding: '0 2px',
    width: '100%',
    boxSizing: 'border-box',
  };

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
          className='label'

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
          }}
        >
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              inputMode="decimal"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
              autoFocus
              style={{ ...editInputStyle, textAlign: 'right', width: '45px' }}
            />
          ) : (
            <span
              onClick={startEditing}
              style={{ cursor: 'text', userSelect: 'none' }}
              title="Cliquer pour éditer"
            >
              {renderLabel(value)}
            </span>
          )}
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
          {tickZero && (
            <line {...tickZero} stroke={theme.colors.knobTick} strokeWidth="2" opacity="0.6" />
          )}
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

        {/* Valeur au-dessus */}
        {valuePosition === 'top' && (
          <div
            className='label'
            style={{
              position: "absolute",
              top: -8,
              left: 0,
              width: "100%",
              textAlign: "center",
              fontSize: 12,
              color: color,
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
                autoFocus
                style={editInputStyle}
              />
            ) : (
              <span
                onClick={startEditing}
                style={{ cursor: 'text', userSelect: 'none' }}
                title="Cliquer pour éditer"
              >
                {renderLabel(value)}
              </span>
            )}
          </div>
        )}

        {/* Label au-dessus */}
        {labelPosition === 'top' && label && (
          <div
            className='label'
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

        {/* Label en dessous */}
        {labelPosition === 'bottom' && label && (
          <div
            className='label'
            style={{
              position: "absolute",
              bottom: -12,
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
            className='label'
            style={{
              position: "absolute",
              bottom: -8,
              left: 0,
              width: "100%",
              textAlign: "center",
              fontSize: 12,
              color: color,
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
                autoFocus
                style={editInputStyle}
              />
            ) : (
              <span
                onClick={startEditing}
                style={{ cursor: 'text', userSelect: 'none' }}
                title="Cliquer pour éditer"
              >
                {renderLabel(value)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>

  );
}

export default React.memo(KnobBase);
