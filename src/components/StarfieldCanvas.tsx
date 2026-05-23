import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { audioBands } from '../stores/spectrogramBridge';

// ── Constants ──────────────────────────────────────────────────────────────
const NUM_STARS  = 550;
const FOCAL      = 500;            // perspective focal length
const FAR_Z      = 900;            // far clipping / respawn depth (world units)
const NEAR_Z     = 50;             // near clipping plane
const SPREAD     = 700;            // half-width of x/y distribution (world units)

// Rotation speed (rad/frame, ~60fps)
const BASE_ROT   = 0.0003;         // gentle drift
const WARP_ROT   = 0.003;          // burst on tab change
const ROT_DECAY  = 0.9865;         // deceleration factor after burst

// Plunge speed
const PLUNGE_SPD   = 0.5;           // z advance per frame (apparent speed varies with depth)
const PLUNGE_PERSP = 1.9;            // perspective exponent >1 = exaggerated zoom near center
const FAR_Z_POW    = Math.pow(FAR_Z, PLUNGE_PERSP - 1); // normalisation: far-end matches linear

// ── Star ──────────────────────────────────────────────────────────────────
interface Star {
  x:          number;  // world x — rotates in rotation mode, fixed in plunge
  y:          number;  // world y — rotates in rotation mode, fixed in plunge
  z:          number;  // world z / depth — fixed in rotation, advances in plunge
  brightness: number;
  lfoPhase:   number;  // random initial phase [0, 2π]
  lfoFreq:    number;  // oscillation frequency in rad/s — period ~11–25 s
  shell:      0 | 1 | 2 | 3; // frequency band this star reacts to
  reactivity: number;  // [0, 1] — fraction of the shell energy this star receives
}

// ── Mutable state (lives in ref) ──────────────────────────────────────────
interface State {
  stars:     Star[];
  angleRot:  number;   // accumulated rotation angle in xy plane (rad)
  speedRot:  number;   // current rotation speed (rad/frame)
  skipFirst: boolean;
  mode:      'rotation' | 'plunge';
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

/**
 * Shell-based color palette shared by both movement modes.
 *   shell 0 (bass)    → warm orange/red
 *   shell 1 (low-mid) → warm yellow-white
 *   shell 2 (hi-mid)  → neutral white/cyan
 *   shell 3 (high)    → cool blue/violet
 * @param base  brightness base [170–255] derived from depth
 * @param e     audio energy [0, 1]
 */
function starColor(shell: 0|1|2|3, base: number, e: number): [number, number, number] {
  if (shell === 0) {
    return [
      Math.min(255, Math.floor(base + e * 140)),
      Math.min(255, Math.floor(base * 0.65 + e * 40)),
      Math.floor(100 + (1 - e) * 155),
    ];
  } else if (shell === 1) {
    return [
      Math.min(255, Math.floor(base + e * 80)),
      Math.min(255, Math.floor(base + e * 60)),
      Math.floor(180 + (1 - e) * 75),
    ];
  } else if (shell === 2) {
    return [
      Math.floor(base),
      Math.min(255, Math.floor(base + 20 + e * 40)),
      255,
    ];
  } else {
    return [
      Math.floor(base * (0.6 + (1 - e) * 0.4)),
      Math.floor(base * (0.7 + (1 - e) * 0.3)),
      Math.min(255, Math.floor(220 + e * 35)),
    ];
  }
}

/** Place a star randomly in the viewing volume. Shell determines audio reactivity. */
function randomStar(shell: 0|1|2|3): Star {
  const angle = Math.random() * Math.PI * 2;
  const r     = (0.3 + Math.random() * 0.7) * SPREAD;
  return {
    x:          Math.cos(angle) * r,
    y:          Math.sin(angle) * r,
    z:          NEAR_Z + Math.random() * (FAR_Z - NEAR_Z),
    brightness: 0.35 + Math.random() * 0.65,
    lfoPhase:   Math.random() * Math.PI * 2,
    lfoFreq:    0.08 + Math.random() * 0.12,
    shell,
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
  /** Star movement style. 'rotation' = spinning sphere (default). 'plunge' = hyperspace dive. */
  movement?: 'rotation' | 'plunge';
}

export const StarfieldCanvas: React.FC<Props> = ({ tabIndex, bgColor = '#0a0a16', movement = 'rotation' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRgbRef = useRef<[number, number, number]>(hexToRgb(bgColor));
  const prevIndexRef = useRef<number>(tabIndex);

  // Update parsed bg color when prop changes
  useEffect(() => {
    bgRgbRef.current = hexToRgb(bgColor);
  }, [bgColor]);
  const stateRef = useRef<State>({
    stars:     [],
    angleRot:  0,
    speedRot:  BASE_ROT,
    skipFirst: true,
    mode:      movement,
  });

  // ── Rotation burst on tab change ───────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (s.skipFirst) { s.skipFirst = false; prevIndexRef.current = tabIndex; return; }
    const dir = tabIndex > prevIndexRef.current ? 1 : -1;
    prevIndexRef.current = tabIndex;
    if (s.mode === 'rotation') s.speedRot = WARP_ROT * dir;
  }, [tabIndex]);

  // ── Mode change ────────────────────────────────────────────────────────
  useEffect(() => {
    stateRef.current.mode = movement;
  }, [movement]);

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

      // ── Speed decay toward base (rotation mode) ──────────────────────
      if (st.mode === 'rotation') {
        const sign = st.speedRot >= 0 ? 1 : -1;
        st.speedRot = sign * Math.max(BASE_ROT, Math.abs(st.speedRot) * ROT_DECAY);
      }

      // ── Background ────────────────────────────────────────────────────
      const isBursting = st.mode === 'rotation' && Math.abs(st.speedRot) > BASE_ROT * 3;
      const bgAlpha = isBursting ? 0.22 : 1.0;
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
      if (bassPulse > 0.05 && !isBursting && st.mode === 'rotation') {
        ctx.fillStyle = `rgba(${br},${bg},${bb},${bassPulse})`;
        ctx.fillRect(0, 0, W, H);
      }

      // ── Draw stars ────────────────────────────────────────────────────
      if (st.mode === 'rotation') {
        // Rotation: rotate x/y in-plane each frame, z stays fixed
        st.angleRot += st.speedRot;
        const cosA = Math.cos(st.speedRot);
        const sinA = Math.sin(st.speedRot);

        for (const star of st.stars) {
          const nx = star.x * cosA - star.y * sinA;
          const ny = star.x * sinA + star.y * cosA;
          star.x = nx;
          star.y = ny;

          const sx = (star.x / star.z) * FOCAL + cx;
          const sy = (star.y / star.z) * FOCAL + cy;

          const depth = Math.min(1, star.z / FAR_Z); // 0=near, 1=far
          const lfo   = 0.5 + 0.5 * Math.sin(t * star.lfoFreq + star.lfoPhase);
          const e     = Math.min(1, env[star.shell] * 4 * star.reactivity);
          const size  = Math.max(0.3, (1 - depth) * 2.4 + e * 3.5);
          const alpha = Math.min(1, star.brightness * lfo * (0.25 + (1 - depth) * 0.75) + e * 0.7);

          const base = 170 + (1 - depth) * 85;
          const [r, g, b] = starColor(star.shell, base, e);

          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fill();
        }
      } else {
        // Plunge: z advances toward camera, x/y stay fixed
        for (const star of st.stars) {
          star.z -= PLUNGE_SPD * (1 + env[star.shell] * 2);

          // Non-linear projection: z^α/FAR_Z^(α-1) — same as linear at FAR_Z,
          // but near stars are projected much further from center (exaggerated zoom)
          const projZ = Math.pow(star.z, PLUNGE_PERSP) / FAR_Z_POW;

          // Respawn check before projection
          const sxPre = (star.x / Math.max(1, projZ)) * FOCAL + cx;
          const syPre = (star.y / Math.max(1, projZ)) * FOCAL + cy;
          if (star.z < NEAR_Z ||
              sxPre < -W * 0.6 || sxPre > W * 1.6 ||
              syPre < -H * 0.6 || syPre > H * 1.6) {
            star.z = FAR_Z;
            const ang = Math.random() * Math.PI * 2;
            const rxy = (0.3 + Math.random() * 0.7) * SPREAD;
            star.x = Math.cos(ang) * rxy;
            star.y = Math.sin(ang) * rxy;
          }

          const sx = (star.x / projZ) * FOCAL + cx;
          const sy = (star.y / projZ) * FOCAL + cy;

          const depth = Math.min(1, star.z / FAR_Z); // real z for depth cue, not projZ // 0=near, 1=far
          const lfo   = 0.5 + 0.5 * Math.sin(t * star.lfoFreq + star.lfoPhase);
          const e     = Math.min(1, env[star.shell] * 4 * star.reactivity);
          const size  = Math.max(0.3, (1 - depth) * 5.0 + e * 3.0);
          const alpha = Math.min(1, star.brightness * lfo * (0.2 + (1 - depth) * 0.8) + e * 0.55);

          const base = 170 + (1 - depth) * 85;
          const [r, g, b] = starColor(star.shell, base, e);

          ctx.beginPath();
          ctx.arc(sx, sy, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fill();
        }
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
