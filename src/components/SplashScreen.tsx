import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import { useThemeStore } from '../theme/themeStore';

const DURATION_MS = 15000;
const EXIT_MS = 500;

// ── ASCII logo (PREENFM3) ──────────────────────────────────────────────────
const LOGO_LINES = [
'      ____  ____  _____________   __________  ___  ',
'     / __ \/ __ \/ ____/ ____/ | / / ____/  |/  /  ',
'    / /_/ / /_/ / __/ / __/ /  |/ / /_  / /|_/ /   ',
'   / ____/ _, _/ /___/ /___/ /|  / __/ / /  / /    ',
'  /_/   /_/ |_/_____/_____/_/ |_/_/   /_/  /_/     '
];

const SUBTITLE = '·  W E B  U I  ·  F M  S Y N T H E S I Z E R  E D I T O R  ·';

const SCROLLER =
  '* * *  P R E E N F M ³  W E B  U I  · ' +
  ' FM Synthesizer Patch Editor · ' +
  ' Coded with ♥ in TypeScript + React · ' +
  ' PreenFM3 hardware by Xavier Hosxe · ' +
  '* * * * * * * * · * * * * * * * * · ';

// ── Plasma helpers (logo) ────────────────────────────────────────────────
/** Parse "#rrggbb" → [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
/** HSL (h∈[0,360], s∈[0,1], l∈[0,1]) → [r, g, b] in [0,255] */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
/** Linear interpolation between two RGB triples */
function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
/** Sample a multi-stop RGB gradient at t∈[0,1] */
function sampleGradient(stops: [number, number, number][], t: number): [number, number, number] {
  const sc = Math.min(t, 0.9999) * (stops.length - 1);
  const lo = sc | 0;
  return lerpRgb(stops[lo], stops[lo + 1], sc - lo);
}
const LOGO_W = 52;
const LOGO_H = 5;
/** Classic plasma value at grid (col, row, t), normalized to [0, 1] */
function plasmaVal(col: number, row: number, t: number): number {
  const x = col / LOGO_W, y = row / LOGO_H, cx = x - 0.5, cy = y - 0.5;
  const v = Math.sin(x * 7 + t) + Math.sin(y * 4 + t * 0.7)
          + Math.sin((x + y) * 5 + t * 1.3) + Math.sin(Math.sqrt(cx * cx + cy * cy) * 12 + t * 1.1);
  return (v + 4) / 8;
}

// ── Keyframes ─────────────────────────────────────────────────────────────

const slideInDown = keyframes`
  from { transform: translateX(-50%) translateY(-108%); opacity: 0; }
  to   { transform: translateX(-50%) translateY(0);     opacity: 1; }
`;

const slideOutUp = keyframes`
  from { transform: translateX(-50%) translateY(0);     opacity: 1; }
  to   { transform: translateX(-50%) translateY(-108%); opacity: 0; }
`;

const gradientSlide = keyframes`
  from { background-position: 0% 50%; }
  to   { background-position: 200% 50%; }
`;

const scrollMarquee = keyframes`
  from { transform: translateX(min(100vw, 900px)); }
  to   { transform: translateX(-100%); }
`;

const shrinkWidth = keyframes`
  from { width: 100%; }
  to   { width: 0%; }
`;

const glitch = keyframes`
  0%, 93%, 100% { clip-path: none; transform: skewX(0deg); }
  94% { clip-path: polygon(0 15%, 100% 15%, 100% 35%, 0 35%); transform: skewX(-3deg); }
  95% { clip-path: polygon(0 55%, 100% 55%, 100% 75%, 0 75%); transform: skewX(2deg); }
  96% { clip-path: none; transform: skewX(0deg); }
`;

const subtitlePulse = keyframes`
  0%, 100% { opacity: 0.9; text-shadow: 0 0 6px #0af, 0 0 18px #08f; }
  50%       { opacity: 1;   text-shadow: 0 0 10px #0cf, 0 0 28px #0af, 0 0 50px #08f; }
`;

const glitchColor = keyframes`
  0%, 79%, 84%, 100% { filter: none; }
  80% { filter: hue-rotate(175deg) brightness(1.8) saturate(1.5); }
  81% { filter: hue-rotate(-65deg) brightness(0.7); }
  82% { filter: none; }
  92% { filter: hue-rotate(115deg) brightness(2) saturate(1.3); }
  93% { filter: none; }
`;

const glitchBar = keyframes`
  0%, 78%, 84%, 91%, 97%, 100% { opacity: 0; }
  79% { opacity: 0.55; transform: translateY(5px);  background: rgba(0,255,255,0.4); }
  80% { opacity: 0.3;  transform: translateY(16px); background: rgba(255,0,255,0.35); }
  81% { opacity: 0; }
  92% { opacity: 0.45; transform: translateY(10px); background: rgba(0,255,80,0.3); }
  93% { opacity: 0; }
`;

// ── Styled components ──────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.5);
`;

const Panel = styled.div<{ $leaving: boolean }>`
  position: fixed;
  top: 0;
  left: 50%;
  width: min(900px, 100%);
  z-index: 9999;
  font-family: 'Courier New', 'Lucida Console', monospace;
  background: #04040e;
  border: 1px solid #1e1e3e;
  border-top: none;
  border-radius: 0 0 10px 10px;
  overflow: hidden;
  box-shadow:
    0 0 0 1px #0a0a1a,
    0 16px 60px rgba(40, 60, 200, 0.3),
    0 32px 80px rgba(0, 0, 0, 0.85);
  animation: ${p => p.$leaving ? slideOutUp : slideInDown}
    ${EXIT_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards;

  /* CRT scanlines */
  &::after {
    content: '';
    pointer-events: none;
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      to bottom,
      transparent 0px,
      transparent 3px,
      rgba(0, 0, 0, 0.13) 3px,
      rgba(0, 0, 0, 0.13) 4px
    );
    z-index: 200;
    border-radius: inherit;
  }
`;

const CopperBar = styled.div`
  height: 4px;
  background: linear-gradient(
    90deg,
    hsl(0,100%,55%), hsl(30,100%,55%), hsl(60,100%,55%), hsl(90,100%,55%),
    hsl(120,100%,55%), hsl(150,100%,55%), hsl(180,100%,55%), hsl(210,100%,55%),
    hsl(240,100%,55%), hsl(270,100%,55%), hsl(300,100%,55%), hsl(330,100%,55%),
    hsl(360,100%,55%)
  );
  background-size: 300% 100%;
  animation: ${gradientSlide} 1.4s linear infinite;
`;

const Body = styled.div`
  padding: 20px 28px 14px;
  position: relative;
`;

const CloseBtn = styled.button`
  position: absolute;
  top: 10px;
  right: 12px;
  z-index: 201;
  background: rgba(20, 20, 40, 0.9);
  border: 1px solid #3a3a5a;
  color: #666;
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
  transition: border-color 0.15s, color 0.15s, background 0.15s;

  &:hover {
    border-color: #ff5555;
    color: #ff5555;
    background: rgba(255, 85, 85, 0.12);
  }
`;

const LogoGlitch = styled.div`
  animation: ${glitch} 9s linear infinite;
`;

const LogoLine = styled.pre`
  margin: 0;
  padding: 0;
  line-height: 1.3;
  font-size: clamp(0.35rem, 0.95vw, 0.68rem);
  white-space: pre;
  overflow: hidden;
  user-select: none;
`;

const Subtitle = styled.div`
  font-size: clamp(0.42rem, 1.1vw, 0.65rem);
  letter-spacing: 0.12em;
  color: #0af;
  margin: 6px 0 14px;
  animation: ${subtitlePulse} 2.4s ease-in-out infinite;
`;

const Hr = styled.div`
  border-top: 1px solid #141428;
  margin: 4px 0 8px;
`;

const Credits = styled.div`
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px;
  color: #33335a;
  font-size: 0.62rem;

  span {
    color: #4a4a7a;
  }
`;

const ProgressTrack = styled.div`
  height: 2px;
  background: #0d0d1e;
  margin-top: 12px;
  border-radius: 1px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background: linear-gradient(90deg, #0f8 0%, #0cf 60%, #06f 100%);
  animation: ${shrinkWidth} ${DURATION_MS}ms linear forwards;
`;

const ScrollerWrap = styled.div`
  background: #000;
  border-top: 1px solid #0d0d1a;
  height: 26px;
  overflow: hidden;
  display: flex;
  align-items: center;
  position: relative;

  &::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 6px;
    pointer-events: none;
    z-index: 10;
    opacity: 0;
    animation: ${glitchBar} 9s linear infinite;
  }
`;

const ScrollerText = styled.span`
  display: inline-block;
  white-space: nowrap;
  color: #00ee44;
  font-size: 0.8rem;
  text-shadow: 0 0 6px #00ee44;
  animation: ${scrollMarquee} 20s linear infinite, ${glitchColor} 9s linear infinite;
`;

// ── Component ──────────────────────────────────────────────────────────────

interface SplashScreenProps {
  onClose: () => void;
  noAutoClose?: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onClose, noAutoClose }) => {
  const [leaving, setLeaving] = useState(false);
  const closingRef = useRef(false);

  const { theme } = useThemeStore();

  // Plasma palette: spectro3–spectro6 (bright stops) blended with rainbow HSL
  const spectroStops = useMemo<[number, number, number][]>(
    () => [theme.colors.spectro3, theme.colors.spectro4, theme.colors.spectro5, theme.colors.spectro6].map(hexToRgb),
    [theme.colors.spectro3, theme.colors.spectro4, theme.colors.spectro5, theme.colors.spectro6],
  );

  const logoRef = useRef<HTMLDivElement>(null);
  const plasmaRafRef = useRef<number>(0);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLeaving(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // Plasma animation — drives per-character color via RAF
  useEffect(() => {
    const container = logoRef.current;
    if (!container) return;
    const spans = Array.from(container.querySelectorAll<HTMLSpanElement>('span[data-col]'));
    const loop = (ms: number) => {
      const t = ms * 0.001;
      for (const span of spans) {
        const col = Number(span.dataset.col);
        const row = Number(span.dataset.row);
        const v = plasmaVal(col, row, t);
        const hue = (v * 300 + t * 30) % 360;
        const [rR, gR, bR] = hslToRgb(hue, 1, 0.62);
        const [rS, gS, bS] = sampleGradient(spectroStops, v);
        const r = (rR * 0.55 + rS * 0.45) | 0;
        const g = (gR * 0.55 + gS * 0.45) | 0;
        const b = (bR * 0.55 + bS * 0.45) | 0;
        const c = `rgb(${r},${g},${b})`;
        span.style.color = c;
        span.style.textShadow = `0 0 5px ${c}`;
      }
      plasmaRafRef.current = requestAnimationFrame(loop);
    };
    plasmaRafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(plasmaRafRef.current);
  }, [spectroStops]);

  // Auto-close after DURATION_MS (disabled when noAutoClose is set)
  useEffect(() => {
    if (noAutoClose) return;
    const t = setTimeout(handleClose, DURATION_MS);
    return () => clearTimeout(t);
  }, [handleClose, noAutoClose]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  return (
    <>
      <Overlay onClick={handleClose} />
      <Panel $leaving={leaving}>
        <CopperBar />
        <Body>
          <CloseBtn onClick={handleClose} title="Fermer [Échap]">✕</CloseBtn>

          <LogoGlitch ref={logoRef}>
            {LOGO_LINES.map((line, row) => (
              <LogoLine key={row}>
                {[...line].map((ch, col) => (
                  <span key={col} data-col={col} data-row={row}>{ch}</span>
                ))}
              </LogoLine>
            ))}
          </LogoGlitch>

          <Subtitle>{SUBTITLE}</Subtitle>

          <Hr />

          <Credits>
            <div>Hardware : <span>PreenFM3 by Xavier Hosxe</span></div>
            <div>Web UI : <span>patvig</span></div>
            <div>Stack : <span>TypeScript · React · Vite</span></div>
          </Credits>

          <ProgressTrack>
            <ProgressFill />
          </ProgressTrack>
        </Body>

        <ScrollerWrap>
          <ScrollerText>{SCROLLER}</ScrollerText>
        </ScrollerWrap>
      </Panel>
    </>
  );
};
