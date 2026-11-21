import React, { useRef, useState } from "react";
import { useThemeStore } from '../../theme/themeStore';

type ValuePosition = 'top' | 'bottom' | 'left' | 'right' | 'none';
type LabelPosition = 'top' | 'left' | 'bottom' | 'right' | 'none';

interface SliderBaseProps {
  width?: number;
  height?: number;
  min?: number;
  max?: number;
  value: number;
  onChange?: (value: number) => void;
  step?: number;
  color?: string;
  backgroundColor?: string;
  strokeColor?: string;
  renderLabel?: (value: number) => React.ReactNode;
  label?: string | null;
  title?: string;
  valuePosition?: ValuePosition;
  labelPosition?: LabelPosition;
}

const H_PADDING = 8; // horizontal padding inside the SVG

function SliderBase({
  width = 300,
  height = 20,
  min = 0,
  max = 100,
  value = 0,
  onChange = () => {},
  step,
  color = "#000",
  backgroundColor = "#eee",
  strokeColor = "#ccc",
  renderLabel = (val: number) => val,
  label = null,
  title,
  valuePosition = 'right',
  labelPosition = 'left',
}: SliderBaseProps) {
  const { theme } = useThemeStore();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const isDragging = useRef(false);

  const trackLeft  = H_PADDING;
  const trackRight = width - H_PADDING;
  const trackLen   = trackRight - trackLeft;
  const trackY     = height / 2;
  const thumbR     = Math.floor(height / 2) - 2;

  const clampedValue = Math.max(min, Math.min(max, value));
  const thumbX = trackLeft + ((clampedValue - min) / (max - min)) * trackLen;

  const updateFromEvent = (e: { clientX: number }) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clamped = Math.max(trackLeft, Math.min(trackRight, x));
    const ratio = (clamped - trackLeft) / trackLen;
    const rawValue = min + ratio * (max - min);
    const newValue =
      step && step > 0
        ? Math.round(rawValue / step) * step
        : rawValue;
    onChange(Math.max(min, Math.min(max, newValue)));
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    isDragging.current = true;
    updateFromEvent(e);
    try { svgRef.current?.setPointerCapture(e.pointerId); } catch { /* no-op */ }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    e.preventDefault();
    updateFromEvent(e);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    isDragging.current = false;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* no-op */ }
  };

  // ── Editable value ────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const startEditing = () => {
    setEditText(String(
      step && step >= 1
        ? Math.round(value)
        : parseFloat(value.toFixed(4))
    ));
    setIsEditing(true);
  };

  const commitEdit = () => {
    setIsEditing(false);
    const parsed = parseFloat(editText);
    if (isNaN(parsed)) return;
    let clamped = Math.max(min, Math.min(max, parsed));
    if (step && step > 0) clamped = Math.round(clamped / step) * step;
    onChange(clamped);
  };

  const cancelEdit = () => setIsEditing(false);

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitEdit();
    else if (e.key === 'Escape') cancelEdit();
  };

  const editInputStyle: React.CSSProperties = {
    background: 'transparent',
    border: `1px solid ${color}`,
    borderRadius: 3,
    color,
    fontSize: 12,
    fontFamily: 'var(--app-font-digit)',
    textAlign: 'center',
    outline: 'none',
    padding: '0 2px',
    width: '45px',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 'bold',
    color: theme.colors.knobLabel,
    pointerEvents: 'none',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 12,
    color,
    fontFamily: 'var(--app-font-digit)',
    minWidth: '40px',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  };

  const valueNode = isEditing ? (
    <input
      type="text"
      inputMode="decimal"
      value={editText}
      onChange={e => setEditText(e.target.value)}
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
  );

  const svgEl = (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ userSelect: 'none', cursor: 'ew-resize', touchAction: 'none', display: 'block' }}
    >
      {/* Track background */}
      <rect
        x={trackLeft}
        y={trackY - 3}
        width={trackLen}
        height={6}
        rx={3}
        fill={backgroundColor}
        stroke={strokeColor}
        strokeWidth={1}
      />
      {/* Track fill */}
      <rect
        x={trackLeft}
        y={trackY - 3}
        width={Math.max(0, thumbX - trackLeft)}
        height={6}
        rx={3}
        fill={color}
      />
      {/* Min tick */}
      <line
        x1={trackLeft}  y1={trackY - 6}
        x2={trackLeft}  y2={trackY + 6}
        stroke={theme.colors.knobTick} strokeWidth={1.5}
      />
      {/* Max tick */}
      <line
        x1={trackRight} y1={trackY - 6}
        x2={trackRight} y2={trackY + 6}
        stroke={theme.colors.knobTick} strokeWidth={1.5}
      />
      {/* Thumb */}
      <circle
        cx={thumbX}
        cy={trackY}
        r={thumbR}
        fill={backgroundColor}
        stroke={color}
        strokeWidth={2}
      />
    </svg>
  );

  return (
    <div title={title} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {labelPosition === 'left'  && label && <div style={labelStyle}>{label}</div>}
      {valuePosition === 'left'  && <div style={valueStyle}>{valueNode}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {labelPosition === 'top'    && label && <div style={labelStyle}>{label}</div>}
        {valuePosition === 'top'    && <div style={valueStyle}>{valueNode}</div>}
        {svgEl}
        {valuePosition === 'bottom' && <div style={valueStyle}>{valueNode}</div>}
        {labelPosition === 'bottom' && label && <div style={labelStyle}>{label}</div>}
      </div>

      {valuePosition === 'right' && <div style={valueStyle}>{valueNode}</div>}
      {labelPosition === 'right' && label && <div style={labelStyle}>{label}</div>}
    </div>
  );
}

export default React.memo(SliderBase);
