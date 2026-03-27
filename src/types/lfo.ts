// LFO constants moved to preenFmConstants.ts — imported for local use and re-exported for backward compatibility
import {
  type LfoType, LFO_TYPES, LFO_TYPE_LABELS,
  LFO_FREQ_MAX_INTERNAL, LFO_FREQ_MIDI_CLOCK_BASE, LFO_FREQ_SCALE_FACTOR,
  LFO_BIAS_CENTER, LFO_BIAS_MIN, LFO_BIAS_MAX, LFO_BIAS_RANGE,
  LFO_KEYSYNC_OFF_VALUE, LFO_KEYSYNC_MIN_NRPN, LFO_KEYSYNC_MAX_NRPN,
  LFO_KEYSYNC_SCALE_FACTOR, LFO_KEYSYNC_OFFSET,
  LFO_PHASE_MAX_NRPN, LFO_PHASE_MAX_DEGREES,
  LFO_SHAPE_MIN, LFO_SHAPE_MAX,
  type MidiClockMode, MIDI_CLOCK_MODES, MIDI_CLOCK_LABELS, MIDI_CLOCK_NRPN,
} from '../midi/preenFmConstants';
export {
  type LfoType, LFO_TYPES, LFO_TYPE_LABELS,
  LFO_FREQ_MAX_INTERNAL, LFO_FREQ_MIDI_CLOCK_BASE, LFO_FREQ_SCALE_FACTOR,
  LFO_BIAS_CENTER, LFO_BIAS_MIN, LFO_BIAS_MAX, LFO_BIAS_RANGE,
  LFO_KEYSYNC_OFF_VALUE, LFO_KEYSYNC_MIN_NRPN, LFO_KEYSYNC_MAX_NRPN,
  LFO_KEYSYNC_SCALE_FACTOR, LFO_KEYSYNC_OFFSET,
  LFO_PHASE_MAX_NRPN, LFO_PHASE_MAX_DEGREES,
  LFO_SHAPE_MIN, LFO_SHAPE_MAX,
  type MidiClockMode, MIDI_CLOCK_MODES, MIDI_CLOCK_LABELS, MIDI_CLOCK_NRPN,
};

// ── Conversion functions ─────────────────────────────────────────────────────

export function nrpnToLfoFrequency(nrpnValue: number): number | MidiClockMode {
  if (nrpnValue >= LFO_FREQ_MIDI_CLOCK_BASE) {
    for (const [mode, value] of Object.entries(MIDI_CLOCK_NRPN)) {
      if (value === nrpnValue) {
        return mode as MidiClockMode;
      }
    }
    return 5.0;
  }
  return nrpnValue / LFO_FREQ_SCALE_FACTOR;
}

export function lfoFrequencyToNrpn(value: number | MidiClockMode): number {
  if (typeof value === 'string') {
    return MIDI_CLOCK_NRPN[value] || LFO_FREQ_MIDI_CLOCK_BASE;
  }
  return Math.round(value * LFO_FREQ_SCALE_FACTOR);
}

export function parseLfoBias(nrpnValue: number): number {
  return (nrpnValue - LFO_BIAS_CENTER) / LFO_BIAS_RANGE;
}

export function encodeLfoBias(bias: number): number {
  const clamped = Math.max(-1, Math.min(1, bias));
  return Math.round(clamped * LFO_BIAS_RANGE + LFO_BIAS_CENTER);
}

export function parseLfoKeysync(nrpnValue: number): 'Off' | number {
  if (nrpnValue === LFO_KEYSYNC_OFF_VALUE) {
    return 'Off';
  }
  const keysyncFloat = (nrpnValue * LFO_KEYSYNC_SCALE_FACTOR) - LFO_KEYSYNC_OFFSET;
  return Math.max(0, Math.min(16, Math.round(keysyncFloat * 100) / 100));
}

export function encodeLfoKeysync(value: 'Off' | number): number {
  if (value === 'Off') {
    return LFO_KEYSYNC_OFF_VALUE;
  }
  const clamped = Math.max(0, Math.min(16, value));
  return Math.round((clamped + LFO_KEYSYNC_OFFSET) / LFO_KEYSYNC_SCALE_FACTOR);
}

export function parseLfoShape(nrpnValue: number): LfoType {
  const index = Math.max(LFO_SHAPE_MIN, Math.min(LFO_SHAPE_MAX, nrpnValue));
  return LFO_TYPES[index] || 'LFO_SIN';
}

export function encodeLfoShape(shape: LfoType): number {
  const index = LFO_TYPES.indexOf(shape);
  return index >= 0 ? index : 0;
}
