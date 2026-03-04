// components/fmEngine/WaveformSelector.tsx
import React from 'react';
import { WaveformType, WAVEFORMS, WaveformItem } from '../../types/waveform';
import { cn } from '../../utils/cn';
import { generateWaveformPath, waveformToDisplayName } from '../../utils/waveformUtils';

interface WaveformSelectorProps {
  value: WaveformType;
  onChange: (waveform: WaveformType) => void;
  disabled?: boolean;
  compact?: boolean;
}

const WaveformSelector: React.FC<WaveformSelectorProps> = ({
  value,
  onChange,
  disabled = false,
  compact = true,
}) => {
  if (compact) {
    return (
      <div className="flex flex-col space-y-1">
        <label className="text-xs text-gray-400 font-medium">Forme d'onde</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as WaveformType)}
          disabled={disabled}
          className="w-32 max-w-32 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          {WAVEFORMS.map((waveform: WaveformItem) => (
            <option key={waveform.id} value={waveform.name}>
              {waveformToDisplayName(waveform.name)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-400 font-medium">Forme d'onde</label>
      <div className="grid grid-cols-3 gap-2">
        {WAVEFORMS.map((waveform: WaveformItem) => (
          <button
            key={waveform.id}
            onClick={() => onChange(waveform.name)}
            disabled={disabled}
            className={cn(
              'p-2 border rounded-lg flex flex-col items-center space-y-1 transition-all',
              'hover:border-blue-500 hover:bg-gray-800',
              value === waveform.name
                ? 'border-blue-500 bg-blue-500/20'
                : 'border-gray-600 bg-gray-900',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <svg width="40" height="20" viewBox="0 0 40 20" className="text-white">
              <path
                d={generateWaveformPath(waveform.name, 40, 20)}
                stroke="currentColor"
                strokeWidth="1"
                fill="none"
              />
            </svg>
            <span className="text-xs text-gray-300">
              {waveformToDisplayName(waveform.name)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default WaveformSelector;
