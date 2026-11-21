import React, { useEffect, useRef, useState } from "react";
import { useThemeStore } from '../../theme/themeStore';
import { useUIStore } from '../../stores/uiStore';

type MovePos = { clientX: number; clientY: number; shiftKey: boolean };

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

interface VerticalDragParams {
  startValue: number;
  startY: number;
  currentY: number;
  min: number;
  max: number;
  dragRangePx: number;
  step?: number;
  fine?: boolean;
}

export function clampAndStep(raw: number, min: number, max: number, step?: number): number {
  const clamped = Math.max(min, Math.min(max, raw));
  if (step && step > 0) {
    return Math.max(min, Math.min(max, Math.round(clamped / step) * step));
  }
  return clamped;
}

export function valueFromVerticalDrag({
  startValue,
  startY,
  currentY,
  min,
  max,
  dragRangePx,
  step,
  fine = false,
}: VerticalDragParams): number {
  const dragRange = dragRangePx > 0 ? dragRangePx : 1;
  const sensitivity = fine ? 0.1 : 1;
  const deltaPx = startY - currentY;
  const raw = startValue + (deltaPx * (max - min)) / dragRange * sensitivity;
  return clampAndStep(raw, min, max, step);
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
  const knobDragMode = useUIStore(state => state.knobDragMode);
  const center = size / 2;
  const radius = knobRadius ?? (center - 10);
  const isDragging = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const verticalDragRef = useRef<{ startY: number; startValue: number; lastY: number; lastValue: number; fine: boolean } | null>(null);
  const pendingMoveRef = useRef<MovePos | null>(null);
  const rafRef = useRef<number | null>(null);
  const applyMoveRef = useRef<(pos: MovePos) => void>(() => {});
  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});

  useEffect(() => () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelHandlerRef.current(e);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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
    onChange(clampAndStep(rawValue, min, max, step));
  };

  const applyMove = (pos: MovePos) => {
    if (knobDragMode === 'vertical' && verticalDragRef.current) {
      const drag = verticalDragRef.current;
      // Rebasing on Shift toggle keeps the current value and only changes
      // the sensitivity of subsequent movement.
      if (pos.shiftKey !== drag.fine) {
        drag.startY = drag.lastY;
        drag.startValue = drag.lastValue;
        drag.fine = pos.shiftKey;
      }
      const next = valueFromVerticalDrag({
        startValue: drag.startValue,
        startY: drag.startY,
        currentY: pos.clientY,
        min,
        max,
        dragRangePx: 100,
        step,
        fine: drag.fine,
      });
      drag.lastY = pos.clientY;
      drag.lastValue = next;
      onChange(next);
      return;
    }

    updateFromEvent(pos);
  };
  applyMoveRef.current = applyMove;

  wheelHandlerRef.current = (e) => {
    if (isDragging.current || e.deltaY === 0) return;
    e.preventDefault();
    const baseStep = step && step > 0 ? step : (max - min) / 100;
    const amount = e.shiftKey ? baseStep : baseStep * 10;
    const dir = e.deltaY < 0 ? 1 : -1;
    onChange(clampAndStep(value + dir * amount, min, max, step));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return 0;

    e.preventDefault();
    isDragging.current = true;
    pendingMoveRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (knobDragMode === 'vertical') {
      verticalDragRef.current = { startY: e.clientY, startValue: value, lastY: e.clientY, lastValue: value, fine: e.shiftKey };
    } else {
      verticalDragRef.current = null;
      updateFromEvent(e);
    }

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

    pendingMoveRef.current = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey };

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const pending = pendingMoveRef.current;
        if (!pending || !isDragging.current) return;
        pendingMoveRef.current = null;
        applyMoveRef.current(pending);
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (pending) {
      applyMoveRef.current(pending);
    }
    isDragging.current = false;
    verticalDragRef.current = null;
    try {
      (svgRef.current as unknown as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {
      // no-op
    }
  };

  const angle = angleForValue(value);
  const angleRad = (angle - 90) * (Math.PI / 180);
  const pointerRadius = radius - 2;
  const pointerX = center + pointerRadius * Math.cos(angleRad);
  const pointerY = center + pointerRadius * Math.sin(angleRad);

  const describeArc = (fromDeg: number, toDeg: number) => {
    const fromRad = (fromDeg - 90) * (Math.PI / 180);
    const toRad = (toDeg - 90) * (Math.PI / 180);
    const x1 = center + radius * Math.cos(fromRad);
    const y1 = center + radius * Math.sin(fromRad);
    const x2 = center + radius * Math.cos(toRad);
    const y2 = center + radius * Math.sin(toRad);
    const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    const sweep = toDeg >= fromDeg ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
  };

  const valueArcPath = describeArc(crossesZero ? 0 : START_ANGLE, angle);
  const trackArcPath = describeArc(START_ANGLE, END_ANGLE);
  const showValueArc = crossesZero ? Math.abs(angle) > 0.01 : angle > START_ANGLE + 0.01;

  // ── Editable value ──────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [isHovered, setIsHovered] = useState(false);
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
    fontFamily: 'var(--app-font-digit)',
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
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
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
            fontFamily: 'var(--app-font-digit)',
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

      {/* Colonne knob : label-top / value-top / SVG / value-bottom / label-bottom */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Label au-dessus */}
        {labelPosition === 'top' && label && (
          <div
            className='label'
            style={{
              width: size,
              textAlign: "center",
              fontSize: 12,
              fontWeight: "bold",
              pointerEvents: "none",
              color: theme.colors.knobLabel,
            }}
          >
            {label}
          </div>
        )}

        {/* Valeur au-dessus */}
        {valuePosition === 'top' && (
          <div
            className='label'
            style={{
              width: size,
              textAlign: "center",
              fontSize: 12,
              color: color,
              fontFamily: 'var(--app-font-digit)',
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

        {/* SVG du knob */}
        <div style={{ width: size, height: size }}>
          <svg
            ref={svgRef}
            width={size}
            height={size}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerEnter={() => setIsHovered(true)}
            onPointerLeave={() => setIsHovered(false)}
            style={{ userSelect: "none", cursor: knobDragMode === 'vertical' ? 'ns-resize' : 'pointer', touchAction: "none" }}
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
              style={{ filter: isHovered ? 'brightness(1.2)' : undefined }}
            />
            <path
              d={trackArcPath}
              fill="none"
              stroke={strokeColor}
              strokeOpacity="0.4"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {showValueArc && (
              <path
                d={valueArcPath}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                style={{ filter: isHovered ? 'brightness(1.2)' : undefined }}
              />
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
        </div>

        {/* Valeur en dessous */}
        {valuePosition === 'bottom' && (
          <div
            className='label'
            style={{
              width: size,
              textAlign: "center",
              fontSize: 12,
              color: color,
              fontFamily: 'var(--app-font-digit)',
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

        {/* Label en dessous */}
        {labelPosition === 'bottom' && label && (
          <div
            className='label'
            style={{
              width: size,
              textAlign: "center",
              fontSize: 12,
              fontWeight: "bold",
              pointerEvents: "none",
              color: theme.colors.knobLabel,
            }}
          >
            {label}
          </div>
        )}
      </div>
    </div>

  );
}

export default React.memo(KnobBase);
