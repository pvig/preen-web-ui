/**
 * PreenFM3 MIDI Control Change and NRPN Mapping
 * Based on firmware/Src/midi/MidiDecoder.cpp
 * https://github.com/Ixox/preenfm3/blob/master/firmware/Src/midi/MidiDecoder.cpp
 *
 * All firmware constants have moved to preenFmConstants.ts.
 * They are re-exported below for backward compatibility.
 */

export {
  MIDI_CC,
  PREENFM3_CC,
  type NRPNMessage,
  NRPN_COMMANDS,
  MidiConfig,
  MatrixSource,
} from './preenFmConstants';

// ── Helper functions (pure math, no firmware data) ───────────────────────────

export function floatToNRPN(value: number, min: number, max: number): { msb: number; lsb: number } {
  const scaled = Math.round(((value - min) / (max - min)) * 16383);
  const clamped = Math.max(0, Math.min(16383, scaled));
  return {
    msb: (clamped >> 7) & 0x7F,
    lsb: clamped & 0x7F,
  };
}

export function nrpnToFloat(msb: number, lsb: number, min: number, max: number): number {
  const value = (msb << 7) | lsb;
  return (value / 16383) * (max - min) + min;
}

export function ccToFloat(value: number, min: number, max: number): number {
  return (value / 127) * (max - min) + min;
}

export function floatToCC(value: number, min: number, max: number): number {
  const scaled = Math.round(((value - min) / (max - min)) * 127);
  return Math.max(0, Math.min(127, scaled));
}

export function imToCC(im: number): number {
  return Math.round(im * 10);
}

export function ccToIM(cc: number): number {
  return cc * 0.1;
}
