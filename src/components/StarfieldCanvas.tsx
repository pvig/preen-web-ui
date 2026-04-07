import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { audioBands } from '../stores/spectrogramBridge';

// ── Constants ──────────────────────────────────────────────────────────────
const NUM_STARS = 550;
const SPHERE_R = 900;          // field radius (world units)
const FOCAL = 500;             // perspective focal length

// Rotation speeds in radians per frame (~60fps)
const BASE_ROT_Y = 0.00015;    // ~2°/s  — gentle drift
const BASE_ROT_X = 0.00018;    // slight tilt drift
const WARP_ROT_Y = 0.00001;      // burst on tab change
const WARP_ROT_X = 0.0016;
const ROT_DECAY  = 0.9865;      // deceleration factor after burst

// ── Star ──────────────────────────────────────────────────────────────────
interface Star {
  ox: number; // original coords (unit sphere * radius)
  oy: number;
  oz: number;
  brightness: number;
  lfoPhase:   number;  // random initial phase [0, 2π]
  lfoFreq:    number;  // oscillation frequency in rad/s — period ~11–25 s
  shell:      0 | 1 | 2 | 3; // frequency band this star reacts to
  reactivity: number;  // [0, 1] — fraction of the shell energy this star receives
}

// ── Mutable state (lives in ref) ──────────────────────────────────────────
interface State {
  stars: Star[];
  angleY: number;
  angleX: number;
  speedY: number;
  speedX: number;
  skipFirst: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────
/** Parse a hex color string (#rrggbb or #rgb) to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ];
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Random point in a shell sphere (4 shells at distinct radius ranges) */
const SHELL_R: [number, number][] = [
  [0.70, 1.00],  // shell 0 (bass)    — outermost, spreads wide on screen
  [0.55, 0.85],  // shell 1 (low-mid)
  [0.40, 0.70],  // shell 2 (hi-mid)
  [0.25, 0.55],  // shell 3 (high)   — innermost, tighter cluster
];
function randomStar(shell: 0|1|2|3): Star {
  const [rMin, rMax] = SHELL_R[shell];
  const r = SPHERE_R * (rMin + Math.random() * (rMax - rMin));
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  return {
    ox: r * Math.sin(phi) * Math.cos(theta),
    oy: r * Math.sin(phi) * Math.sin(theta),
    oz: r * Math.cos(phi),
    brightness: 0.35 + Math.random() * 0.65,
    lfoPhase:   Math.random() * Math.PI * 2,
    lfoFreq:    0.08 + Math.random() * 0.12,
    shell,
    // Skewed distribution: most stars are low-reactivity, a few pop strongly.
    reactivity: Math.random() < 0.25 ? 0.1 + Math.random() * 0.9 : Math.random() * 0.25,
  };
}

// ── Canvas element ─────────────────────────────────────────────────────────
const CanvasEl = styled.canvas`
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  pointer-events: none;
`;

// ── Component ──────────────────────────────────────────────────────────────
interface Props {
  /** Index of the active tab in display order — direction of rotation follows this order */
  tabIndex: number;
  /** Background color as hex string, e.g. "#1a202c". Defaults to near-black space blue. */
  bgColor?: string;
}

export const StarfieldCanvas: React.FC<Props> = ({ tabIndex, bgColor = '#0a0a16' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRgbRef = useRef<[number, number, number]>(hexToRgb(bgColor));
  const prevIndexRef = useRef<number>(tabIndex);

  // Update parsed bg color when prop changes
  useEffect(() => {
    bgRgbRef.current = hexToRgb(bgColor);
  }, [bgColor]);
  const stateRef = useRef<State>({
    stars: [],
    angleY: 0,
    angleX: 0,
    speedY: BASE_ROT_Y,
    speedX: BASE_ROT_X,
    skipFirst: true,
  });

  // ── Rotation burst on tab change ───────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (s.skipFirst) { s.skipFirst = false; prevIndexRef.current = tabIndex; return; }
    // Direction: forward (higher index) → positive (right), backward → negative (left)
    const dir = tabIndex > prevIndexRef.current ? 1 : -1;
    prevIndexRef.current = tabIndex;
    s.speedY = WARP_ROT_Y * dir;
    s.speedX = WARP_ROT_X;
  }, [tabIndex]);

  // ── Render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Generate stars: equal share per shell
    const st = stateRef.current;
    st.stars = Array.from({ length: NUM_STARS }, (_, i) =>
      randomStar((i % 4) as 0|1|2|3)
    );

    let raf = 0;
    // Per-shell smoothed envelopes — fast attack, slow decay
    const env = [0, 0, 0, 0];
    const ATTACK = 0.35, DECAY = 0.96;

    const draw = (ms: number) => {
      raf = requestAnimationFrame(draw);
      const t = ms * 0.001; // time in seconds
      const { width: W, height: H } = canvas;

      // ── Speed decay toward base ──────────────────────────────────────
      const signY = st.speedY >= 0 ? 1 : -1;
      if (Math.abs(st.speedY) > BASE_ROT_Y) {
        st.speedY = signY * Math.max(BASE_ROT_Y, Math.abs(st.speedY) * ROT_DECAY);
      } else {
        st.speedY = signY * BASE_ROT_Y;
      }
      if (st.speedX > BASE_ROT_X) {
        st.speedX = Math.max(BASE_ROT_X, st.speedX * ROT_DECAY);
      }

      st.angleY += st.speedY;
      st.angleX += st.speedX;

      const cosY = Math.cos(st.angleY);
      const sinY = Math.sin(st.angleY);
      const cosX = Math.cos(st.angleX);
      const sinX = Math.sin(st.angleX);

      // ── Background ── (low alpha → persistent trails; lower during burst) ──
      const isBursting = Math.abs(st.speedY) > BASE_ROT_Y * 3;
      const bgAlpha = isBursting ? 0.22 : 1;
      const [br, bg, bb] = bgRgbRef.current;
      ctx.fillStyle = `rgba(${br},${bg},${bb},${bgAlpha})`;
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;

      // ── Per-shell audio envelopes ──────────────────────────────────────
      const raw = [audioBands.band0, audioBands.band1, audioBands.band2, audioBands.band3];
      for (let s = 0; s < 4; s++) {
        env[s] = raw[s] > env[s]
          ? raw[s] * ATTACK + env[s] * (1 - ATTACK)
          : env[s] * DECAY;
      }

      // Bass pulse: flash the background slightly on strong sub-bass hits
      const bassPulse = Math.min(0.5, env[0] * 4);
      if (bassPulse > 0.05 && !isBursting) {
        ctx.fillStyle = `rgba(${br},${bg},${bb},${bassPulse})`;
        ctx.fillRect(0, 0, W, H);
      }

      for (const star of st.stars) {
        // Rotate around Y axis
        const x1 =  star.ox * cosY + star.oz * sinY;
        const z1 = -star.ox * sinY + star.oz * cosY;
        // Rotate around X axis
        const y2 =  star.oy * cosX - z1 * sinX;
        const z2 =  star.oy * sinX + z1 * cosX;

        // Skip stars behind or too close to camera
        if (z2 < 50) continue;

        const sx = (x1 / z2) * FOCAL + cx;
        const sy = (y2 / z2) * FOCAL + cy;

        // Depth cue: z2 ranges ~[50, SPHERE_R*2]
        const depth = Math.min(1, z2 / (SPHERE_R * 1.6)); // 0=near, 1=far
        // Per-star LFO on alpha: range [0, 1] so stars can fully vanish → true twinkle.
        const lfo   = 0.5 + 0.5 * Math.sin(t * star.lfoFreq + star.lfoPhase);

        // Energy for this star's shell, scaled by its individual reactivity
        const e = Math.min(1, env[star.shell] * 4 * star.reactivity);
        const size  = Math.max(0.3, (1 - depth) * 2.4 + e * 3.5);
        const alpha = Math.min(1, star.brightness * lfo * (0.25 + (1 - depth) * 0.75) + e * 0.7);

        // Shell-based color palette:
        //   shell 0 (bass)    → warm orange/red
        //   shell 1 (low-mid) → warm yellow-white
        //   shell 2 (hi-mid)  → neutral white (default)
        //   shell 3 (high)    → cool blue/violet
        const base = 170 + (1 - depth) * 85;
        let r: number, g: number, b: number;
        if (star.shell === 0) {
          r = Math.min(255, Math.floor(base + e * 140));   // push red up
          g = Math.min(255, Math.floor(base * 0.65 + e * 40));
          b = Math.floor(100 + (1 - e) * 155);             // push blue down
        } else if (star.shell === 1) {
          r = Math.min(255, Math.floor(base + e * 80));
          g = Math.min(255, Math.floor(base + e * 60));
          b = Math.floor(180 + (1 - e) * 75);
        } else if (star.shell === 2) {
          r = Math.floor(base);
          g = Math.min(255, Math.floor(base + 20 + e * 40));
          b = 255;
        } else {
          r = Math.floor(base * (0.6 + (1 - e) * 0.4));   // dim red
          g = Math.floor(base * (0.7 + (1 - e) * 0.3));
          b = Math.min(255, Math.floor(220 + e * 35));     // push blue up
        }

        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.fill();
      }
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []); // mount once — state mutated via ref

  return <CanvasEl ref={canvasRef} style={{ backgroundColor: bgColor }} />;
};
