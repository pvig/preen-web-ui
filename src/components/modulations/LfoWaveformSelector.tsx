// Générateur pseudo-aléatoire déterministe (LCG)
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return (state / 4294967296) * 2 - 1; // [-1, 1]
  };
}
import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { LfoType, LFO_TYPES } from '../../types/lfo';
import { useThemeStore } from '../../theme/themeStore';

const SelectorContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const WaveformVisualization = styled.div`
  flex: 1;
  background: ${props => props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 6px;
  padding: 0;
  min-height: 60px;
  display: flex;
  align-items: center;
`;

const WaveformCanvas = styled.svg`
  width: 100%;
  height: 50px;
`;

const Select = styled.select`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.theme.colors.text};
  padding: 8px 12px;
  font-size: 0.875rem;
  min-width: 140px;
  cursor: pointer;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
  
  &:hover {
    background: ${props => props.theme.colors.buttonHover};
  }
`;

interface LfoWaveformSelectorProps {
  value: LfoType;
  onChange: (type: LfoType) => void;
  frequency?: number; // Hz, optionnel pour compatibilité
  keysync?: number; // 0 (off) to 16 (max fadein)
  phase?: number; // 0..1
}

/**
 * Génère les points pour visualiser une forme d'onde LFO
 * Basé sur le firmware PreenFM3 LfoOsc.cpp
 */
const generateWaveformPath = (type: LfoType, frequency: number = 1, width: number = 200, height: number = 50, keysync?: number, phaseOffset: number = 0): string => {
  const points: number[] = [];
  const numPoints = 200;
  const centerY = height / 2;
  const amplitude = height * 0.4;
  // On affiche N cycles pour N Hz (limite à 1000 pour test)
  const cycles = Math.max(1, Math.min(1000, Math.round(frequency)));
  // Fade-in envelope: keysync 0 = instant, 16 = max fade (full width)
  // We'll use a linear fade-in for visualization
  let fadeLength = 0;
  if (keysync && keysync > 0) {
    // keysync 1..16, fade from 10% to 100% of the width
    fadeLength = width * (0.01 + 0.99 * (keysync / 8));
  }
  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    // phaseOffset is 0..1, shift phase by this amount (in cycles)
    const phase = (t * cycles + phaseOffset) % cycles; // phase = 0..cycles
    const x = t * width;
    // Fade-in envelope multiplier
    let fade = 1;
    if (fadeLength > 0) {
      fade = Math.min(1, x / fadeLength);
    }
    let y: number;
    switch (type) {
      case 'LFO_SIN':
        y = centerY - Math.sin(phase * Math.PI * 2) * amplitude * fade;
        break;
      case 'LFO_SAW':
        y = centerY - (1 - (phase * 2 % 2)) * amplitude * fade;
        break;
      case 'LFO_TRIANGLE': {
        const trianglePhase = (phase * 2) % 2;
        y = centerY - (trianglePhase < 1 ? trianglePhase : 2 - trianglePhase) * 2 * amplitude * fade + amplitude * fade;
        break;
      }
      case 'LFO_SQUARE':
        y = centerY - (Math.sin(phase * Math.PI * 2) >= 0 ? 1 : -1) * amplitude * fade;
        break;
      case 'LFO_RANDOM': {
        // Sample & Hold dépendant de la fréquence : 1 step par cycle, déterministe
        const steps = Math.max(1, Math.round(cycles));
        // Génère la séquence de steps pseudo-aléatoires une fois pour toute la courbe
        const prng = lcg(456321);
        const stepVals: number[] = [];
        for (let s = 0; s < steps; s++) {
          stepVals.push(prng());
        }
        const stepIndex = Math.floor(phase) % steps;
        const rand = stepVals[stepIndex];
        y = centerY - rand * amplitude * fade;
        break;
      }
      case 'LFO_BROWNIAN': {
        // Brownian S&H dépendant de la fréquence : 1 step par cycle, amorti, déterministe
        const steps = Math.max(1, Math.round(cycles));
        // Génère la séquence de steps pseudo-aléatoires une fois pour toute la courbe
        const prng = lcg(67890);
        const stepVals: number[] = [];
        let prev = 0;
        for (let s = 0; s < steps; s++) {
          const rand = prng();
          const val = rand * 0.5 + prev * 0.5;
          stepVals.push(val);
          prev = val;
        }
        const stepIndex = Math.floor(phase) % steps;
        const val = stepVals[stepIndex];
        y = centerY - val * amplitude * 2 * fade;
        break;
      }
      case 'LFO_WANDERING': {
        // Version interpolée de LFO_RANDOM : interpolation linéaire entre les steps S&H
        const steps = Math.max(1, Math.round(cycles));
        // Génère la séquence de steps pseudo-aléatoires une fois pour toute la courbe
        const prng = lcg(12345);
        const stepVals: number[] = [];
        for (let s = 0; s < steps; s++) {
          stepVals.push(prng());
        }
        // Interpolation linéaire entre deux steps
        const f = phase;
        const idx = Math.floor(f) % steps;
        const frac = f - Math.floor(f);
        const v0 = stepVals[idx];
        const v1 = stepVals[(idx + 1) % steps];
        const interp = v0 + (v1 - v0) * frac;
        y = centerY - interp * amplitude * fade;
        break;
      }
      case 'LFO_FLOW': {
        // Version interpolée de LFO_BROWNIAN : interpolation linéaire entre les steps brownien amortis
        const steps = Math.max(1, Math.round(cycles));
        // Génère la séquence brownienne amortie une fois pour toute la courbe
        const prng = lcg(654);
        const stepVals: number[] = [];
        let prev = 0;
        for (let s = 0; s < steps; s++) {
          const rand = prng();
          const val = rand * 0.5 + prev * 0.5;
          stepVals.push(val);
          prev = val;
        }
        // Interpolation linéaire entre deux steps
        const f = phase;
        const idx = Math.floor(f) % steps;
        const frac = f - Math.floor(f);
        const v0 = stepVals[idx];
        const v1 = stepVals[(idx + 1) % steps];
        const interp = v0 + (v1 - v0) * frac;
        y = centerY - interp * amplitude * 2 * fade;
        break;
      }
      default:
        y = centerY;
    }
    points.push(x, y);
  }
  let path = `M ${points[0]} ${points[1]}`;
  for (let i = 2; i < points.length; i += 2) {
    path += ` L ${points[i]} ${points[i + 1]}`;
  }
  return path;
};

const LfoWaveformSelector: React.FC<LfoWaveformSelectorProps> = ({ value, onChange, frequency, keysync, phase }) => {
  const { theme } = useThemeStore();
  const { t } = useTranslation();
  const path = generateWaveformPath(value, frequency ?? 1, 200, 50, keysync, phase ?? 0);
  return (
    <SelectorContainer>
      <WaveformVisualization>
        <WaveformCanvas viewBox="0 0 200 50" preserveAspectRatio="none">
          <path
            d={path}
            fill="none"
            stroke={theme.colors.primary}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </WaveformCanvas>
      </WaveformVisualization>
      <Select value={value} onChange={(e) => onChange(e.target.value as LfoType)}>
        {LFO_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`lfo.types.${type}`)}
          </option>
        ))}
      </Select>
    </SelectorContainer>
  );
};

export default LfoWaveformSelector;
