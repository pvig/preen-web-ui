// Waveform constants moved to preenFmConstants.ts — re-exported for backward compatibility
import { type WaveformType, type WaveformItem, WAVEFORMS } from '../midi/preenFmConstants';
export { type WaveformType, type WaveformItem, WAVEFORMS };

export function getWaveformId(waveform: WaveformType): number {
  const item = WAVEFORMS.find(w => w.name === waveform);
  return item?.id ?? 0;
}
