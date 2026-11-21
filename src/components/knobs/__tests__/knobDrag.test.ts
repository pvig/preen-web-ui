import { describe, it, expect } from 'vitest';
import { clampAndStep, valueFromVerticalDrag } from '../KnobBase';

const base = { startValue: 50, startY: 100, min: 0, max: 100, dragRangePx: 100 };

describe('valueFromVerticalDrag', () => {
  it('increases when dragging up', () => {
    expect(valueFromVerticalDrag({ ...base, currentY: 50 })).toBe(100);
  });

  it('decreases when dragging down', () => {
    expect(valueFromVerticalDrag({ ...base, currentY: 150 })).toBe(0);
  });

  it('clamps to the range', () => {
    expect(valueFromVerticalDrag({ ...base, currentY: -1000 })).toBe(100);
    expect(valueFromVerticalDrag({ ...base, currentY: 1000 })).toBe(0);
  });

  it('rounds to the step', () => {
    expect(valueFromVerticalDrag({ ...base, currentY: 90, step: 10 })).toBe(60);
    expect(valueFromVerticalDrag({ ...base, currentY: 95, step: 10 })).toBe(60);
  });

  it('is 10x finer when fine is enabled', () => {
    expect(valueFromVerticalDrag({ ...base, currentY: 50, fine: true })).toBe(55);
  });

  it('falls back to 1px for a zero drag range', () => {
    expect(valueFromVerticalDrag({ ...base, dragRangePx: 0, currentY: 50 })).toBe(100);
  });
});

describe('clampAndStep', () => {
  it('clamps and rounds', () => {
    expect(clampAndStep(105, 0, 100, 4)).toBe(100);
    expect(clampAndStep(-1, 0, 100, 4)).toBe(0);
    expect(clampAndStep(53, 0, 100, 10)).toBe(50);
  });
});
