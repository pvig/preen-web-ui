import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';

const DURATION_MS = 15000;
const EXIT_MS = 500;

// ── ASCII logo (PREENFM3) ──────────────────────────────────────────────────
const LOGO_LINES = [
  '  ____  ____  ____  ____  _   _ _____ __  __ _____ ',
  ' |  _ \\|  _ \\| ___|/ ___|| \\ | |  ___|  \\/  |___ /',
  ' | |_) | |_) |  _| \\___ \\|  \\| |  _| | |\\/| | |_ \\',
  ' |  __/|    /| |___|  ___) | |\\  |  _|| |  | |___) |',
  ' |_|   |_|\\_\\|_____|_____/ |_| \\_|_|   |_|  |_|____/',
];

const SUBTITLE = '·  W E B  U I  ·  F M  S Y N T H E S I Z E R  E D I T O R  ·';

const SCROLLER =
  '* * *  P R E E N F M ³  W E B  U I  · ' +
  ' FM Synthesizer Patch Editor · ' +
  ' Coded with ♥ in TypeScript + React · ' +
  ' PreenFM3 hardware by Xavier Hosxe · ' +
  '* * * * * * * * · * * * * * * * * · ';

// ── Keyframes ─────────────────────────────────────────────────────────────

const slideInDown = keyframes`
  from { transform: translateX(-50%) translateY(-108%); opacity: 0; }
  to   { transform: translateX(-50%) translateY(0);     opacity: 1; }
`;

const slideOutUp = keyframes`
  from { transform: translateX(-50%) translateY(0);     opacity: 1; }
  to   { transform: translateX(-50%) translateY(-108%); opacity: 0; }
`;

const hueRoll = keyframes`
  from { filter: hue-rotate(0deg); }
  to   { filter: hue-rotate(360deg); }
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

const LogoLine = styled.pre<{ $row: number }>`
  margin: 0;
  padding: 0;
  line-height: 1.3;
  font-size: clamp(0.35rem, 0.95vw, 0.68rem);
  white-space: pre;
  overflow: hidden;
  user-select: none;
  color: hsl(130, 100%, 55%);
  text-shadow: 0 0 6px currentColor, 0 0 18px currentColor;
  /* Each line gets a different initial hue, cycling at the same speed → copper wave */
  filter: hue-rotate(${p => p.$row * 22}deg);
  animation: ${hueRoll} 3.5s linear infinite;
  animation-delay: ${p => -(p.$row * 0.44)}s;
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
`;

const ScrollerText = styled.span`
  display: inline-block;
  white-space: nowrap;
  color: #00ee44;
  font-size: 0.8rem;
  text-shadow: 0 0 6px #00ee44;
  animation: ${scrollMarquee} 20s linear infinite;
`;

// ── Component ──────────────────────────────────────────────────────────────

interface SplashScreenProps {
  onClose: () => void;
  noAutoClose?: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onClose, noAutoClose }) => {
  const [leaving, setLeaving] = useState(false);
  const closingRef = useRef(false);

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setLeaving(true);
    setTimeout(onClose, EXIT_MS);
  }, [onClose]);

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

          <LogoGlitch>
            {LOGO_LINES.map((line, i) => (
              <LogoLine key={i} $row={i}>{line}</LogoLine>
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
