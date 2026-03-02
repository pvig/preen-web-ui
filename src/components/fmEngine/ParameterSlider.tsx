
import React from 'react';
import { cn } from '../../utils/cn';

// components/fmEngine/ParameterSlider.tsx

interface ParameterSliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  unit?: string;
  vertical?: boolean;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  onChange: (value: number) => void;
  disabled?: boolean;
}

const ParameterSlider: React.FC<ParameterSliderProps> = ({
  value,
  min,
  max,
  step = 0.01,
  label,
  unit = '',
  vertical = false,
  color = 'blue',
  onChange,
  disabled = false
}) => {
  const formatValue = (val: number): string => {
    if (unit === 'Hz' && val >= 1000) {
      return `${(val / 1000).toFixed(1)}k${unit}`;
    }
    if (step >= 1) {
      return `${Math.round(val)}${unit}`;
    }
    return `${val.toFixed(2)}${unit}`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    onChange(parseFloat(e.target.value));
  };

  const colorClasses = {
    blue: 'accent-blue-500',
    green: 'accent-green-500',
    orange: 'accent-orange-500',
    red: 'accent-red-500',
    purple: 'accent-purple-500'
  };

  return (
    <div className={cn(
      'flex items-center space-x-3',
      vertical && 'flex-col space-x-0 space-y-2'
    )}>
      <label className="text-sm text-gray-400 font-medium min-w-0">
        {label}
      </label>
      
      <div className={cn(
        'flex items-center space-x-2',
        vertical && 'flex-col space-x-0 space-y-2'
      )}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className={cn(
            'flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer',
            'slider-thumb:appearance-none slider-thumb:h-4 slider-thumb:w-4',
            'slider-thumb:rounded-full slider-thumb:bg-current slider-thumb:cursor-pointer',
            'slider-thumb:shadow-lg slider-thumb:border-2 slider-thumb:border-gray-800',
            colorClasses[color],
            disabled && 'opacity-50 cursor-not-allowed',
            vertical && 'writing-mode-vertical-lr'
          )}
        />
        
        <div className="text-xs text-white font-mono min-w-[60px] text-right">
          {formatValue(value)}
        </div>
      </div>
    </div>
  );
};

export { ParameterSlider };