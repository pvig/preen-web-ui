
import React from 'react';
import { cn } from '../../utils/cn';
import ParameterKnob from './ParameterKnob';

// components/fmEngine/FrequencyControl.tsx

interface FrequencyControlProps {
    frequency: number;
    frequencyType: 'FIXED' | 'KEYBOARD';
    onFrequencyChange: (frequency: number) => void;
    onTypeChange: (type: 'FIXED' | 'KEYBOARD') => void;
    disabled?: boolean;
  }
  
  const FrequencyControl: React.FC<FrequencyControlProps> = ({
    frequency,
    frequencyType,
    onFrequencyChange,
    onTypeChange,
    disabled = false
  }) => {
    const [displayMode, setDisplayMode] = React.useState<'freq' | 'ratio' | 'midi'>('freq');
  
    const frequencyToRatio = (freq: number): number => {
      return freq / 440; // Ratio par rapport à A4
    };
  
    const ratioToFrequency = (ratio: number): number => {
      return ratio * 440;
    };
  
    const handleValueChange = (value: number) => {
      switch (displayMode) {
        case 'freq':
          onFrequencyChange(value);
          break;
        case 'ratio':
          onFrequencyChange(ratioToFrequency(value));
          break;
        case 'midi':
          onFrequencyChange(440 * Math.pow(2, (value - 69) / 12));
          break;
      }
    };
  
    const getCurrentValue = (): number => {
      switch (displayMode) {
        case 'freq':
          return frequency;
        case 'ratio':
          return frequencyToRatio(frequency);
        case 'midi':
          return 69 + 12 * Math.log2(frequency / 440);
      }
    };
  
    const getRange = () => {
      switch (displayMode) {
        case 'freq':
          return { min: 20, max: 20000, step: 1 };
        case 'ratio':
          return { min: 0.1, max: 32, step: 0.01 };
        case 'midi':
          return { min: 0, max: 127, step: 1 };
      }
    };
  
    const getUnit = (): string => {
      switch (displayMode) {
        case 'freq':
          return 'Hz';
        case 'ratio':
          return ':1';
        case 'midi':
          return '';
      }
    };
  
    const range = getRange();
  
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400 font-medium">Fréquence</label>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setDisplayMode('freq')}
              className={cn(
                'px-2 py-1 text-xs rounded',
                displayMode === 'freq' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
              )}
            >
              Hz
            </button>
            <button
              onClick={() => setDisplayMode('ratio')}
              className={cn(
                'px-2 py-1 text-xs rounded',
                displayMode === 'ratio' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
              )}
            >
              Ratio
            </button>
            <button
              onClick={() => setDisplayMode('midi')}
              className={cn(
                'px-2 py-1 text-xs rounded',
                displayMode === 'midi' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300'
              )}
            >
              MIDI
            </button>
          </div>
        </div>
  
        <div className="flex items-center space-x-2">
          <select
            value={frequencyType}
            onChange={(e) => onTypeChange(e.target.value as 'FIXED' | 'KEYBOARD')}
            disabled={disabled}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="KEYBOARD">Clavier</option>
            <option value="FIXED">Fixe</option>
          </select>
        </div>
  
        <ParameterKnob
          value={getCurrentValue()}
          min={range.min}
          max={range.max}
          step={range.step}
          label={`${displayMode.toUpperCase()}`}
          unit={getUnit()}
          onChange={handleValueChange}
          disabled={disabled}
          color="green"
        />
      </div>
    );
  };
  
  export default FrequencyControl;