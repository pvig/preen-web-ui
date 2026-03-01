// FineTuneKnob.jsx
import React from "react";
import Knob from "../../knobs/KnobBase";
import { useThemeStore } from '../../../theme/themeStore';

interface FineTuneKnobProps {
  min?: number;
  max?: number;
  step?: number;
  value: number; // <-- contrôlé par le parent
  label?: string;
  onChange: (v: number) => void;
}

export const FineTuneKnob: React.FC<FineTuneKnobProps> = ({
  min = -16,
  max = 16,
  step = 0.01,
  value,
  label = "",
  onChange,
  ...props
}) => {
  const { theme } = useThemeStore();
  const setFineValue = (v: number) => {
    const rounded = Math.round(v / step) * step;
    onChange(parseFloat(rounded.toFixed(4))); // 4 décimales max
  };

  return (
    <Knob
      {...props}
      min={min}
      max={max}
      value={value}
      onChange={setFineValue}
      label={label}
      renderLabel={(v: number) => v.toFixed(2)}
      color={theme.colors.knobFrequency}
      strokeColor={theme.colors.knobStroke}
      backgroundColor={theme.colors.knobBackground}
      size={60}
    />
  );
};

export default FineTuneKnob;