import React, { useState } from 'react';
import styled from 'styled-components';
import KnobBase from '../knobs/KnobBase';
import LfoWaveformSelector from './LfoWaveformSelector';
import { type MidiClockMode, MIDI_CLOCK_MODES, MIDI_CLOCK_LABELS, lfoFrequencyToNrpn } from '../../types/lfo';
import { useLfo, updateLfo } from '../../stores/patchStore';
import { sendLfoParamNRPN } from '../../midi/midiService';
import { LFO_TYPES } from '../../types/lfo';
import { useThemeStore } from '../../theme/themeStore';

const LfoContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid ${props => props.theme.colors.border};
`;

const LfoTitle = styled.h3`
  color: ${props => props.theme.colors.text};
  font-size: 1rem;
  margin: 0 0 8px 0;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
`;

const HeaderLeft = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
`;

const LfoTabs = styled.div`
  display: flex;
  gap: 8px;
`;

const LfoTab = styled.button<{ $active: boolean }>`
  background: ${props => props.$active ? props.theme.colors.buttonActive : props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.$active ? props.theme.colors.background : props.theme.colors.textMuted};
  padding: 6px 12px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.theme.colors.buttonHover};
    color: ${props => props.theme.colors.primary};
  }
`;

const LfoControls = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
  align-items: start;
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

const ControlLabel = styled.label`
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.75rem;
  text-transform: uppercase;
`;

const Select = styled.select`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.theme.colors.text};
  padding: 6px 8px;
  font-size: 0.75rem;
  min-width: 80px;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
`;

/**
 * Composant LfoEditor
 * Gère les 3 LFOs du PreenFM3 (selon le code de référence)
 */
export const LfoEditor: React.FC = () => {
  const [activeLfo, setActiveLfo] = useState<0 | 1 | 2>(0);
  const lfo = useLfo(activeLfo);
  const { theme } = useThemeStore();

  // Helper: send correct NRPN for frequency or MIDI clock
  const sendLfoFrequencyOrClock = (freqOrMode: number | MidiClockMode) => {
    // If string, it's a MIDI clock mode
    sendLfoParamNRPN(activeLfo, 'frequency', lfoFrequencyToNrpn(freqOrMode));
  };

  return (
    <LfoContainer>
      <HeaderRow>
        <HeaderLeft>
          <LfoTitle>LFO Editor</LfoTitle>
          <LfoTabs>
            {([0, 1, 2] as const).map((lfoNum) => (
              <LfoTab
                key={lfoNum}
                $active={activeLfo === lfoNum}
                onClick={() => setActiveLfo(lfoNum)}
              >
                LFO {lfoNum + 1}
              </LfoTab>
            ))}
          </LfoTabs>
        </HeaderLeft>

        <LfoWaveformSelector
          value={lfo.shape}
          frequency={lfo.syncMode === 'Int' ? lfo.frequency : 10}
          keysync={lfo.keysync !== 'Off' ? (lfo.keysync as number) : undefined}
          phase={typeof lfo.phase === 'number' ? lfo.phase : 0}
          onChange={(shape) => {
            updateLfo(activeLfo, { shape });
            const shapeIndex = LFO_TYPES.indexOf(shape as any);
            sendLfoParamNRPN(activeLfo, 'shape', shapeIndex >= 0 ? shapeIndex : 0);
          }}
        />
      </HeaderRow>

      <LfoControls>
        <ControlGroup>
          <ControlLabel>Sync Mode</ControlLabel>
          <Select
            value={lfo.syncMode}
            onChange={(e) => {
              const newMode = e.target.value as 'Int' | 'Ext';
              updateLfo(activeLfo, { syncMode: newMode });
              if (newMode === 'Int') {
                // Send current frequency as NRPN
                sendLfoFrequencyOrClock(lfo.frequency);
              } else {
                // Send current MIDI clock mode as NRPN
                sendLfoFrequencyOrClock(lfo.midiClockMode);
              }
            }}
          >
            <option value="Int">Internal (0-99.9 Hz)</option>
            <option value="Ext">External (MIDI Clock)</option>
          </Select>
        </ControlGroup>

        <ControlGroup>
          {lfo.syncMode === 'Int' ? (
            <KnobBase
              size={60}
              min={0}
              max={99.9}
              step={0.1}
              value={lfo.frequency}
              onChange={(frequency) => {
                // If user sets freq > 99.9, switch to Ext and send default MIDI clock
                if (frequency > 99.9) {
                  const defaultClock = lfo.midiClockMode || MIDI_CLOCK_MODES[0];
                  updateLfo(activeLfo, { syncMode: 'Ext', midiClockMode: defaultClock });
                  sendLfoFrequencyOrClock(defaultClock);
                } else {
                  updateLfo(activeLfo, { frequency });
                  sendLfoFrequencyOrClock(frequency);
                }
              }}
              color={theme.colors.knobLfo}
              backgroundColor={theme.colors.knobBackground}
              strokeColor={theme.colors.knobStroke}
              renderLabel={(v) => v.toFixed(1) + ' Hz'}
              label="Frequency"
              labelPosition="left"
            />
          ) : (
            <div>
              <ControlLabel>MIDI Clock Mode</ControlLabel>
              <Select
                value={lfo.midiClockMode}
                onChange={(e) => {
                  const mode = e.target.value as MidiClockMode;
                  updateLfo(activeLfo, { midiClockMode: mode });
                  sendLfoFrequencyOrClock(mode);
                }}
              >
                {MIDI_CLOCK_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {MIDI_CLOCK_LABELS[mode]}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </ControlGroup>

        <ControlGroup>
          <KnobBase
            size={60}
            min={0}
            max={1.00}
            step={0.001}
            value={lfo.phase}
            onChange={(phase) => {
              updateLfo(activeLfo, { phase });
              sendLfoParamNRPN(activeLfo, 'phase', phase);
            }}
            color={theme.colors.knobPhase}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => v.toFixed(3)}
            label="Phase (0-1)"
            labelPosition="left"
          />
        </ControlGroup>

        <ControlGroup>
          <KnobBase
            size={60}
            min={-1}
            max={1}
            step={0.01}
            value={lfo.bias}
            onChange={(bias) => {
              updateLfo(activeLfo, { bias });
              sendLfoParamNRPN(activeLfo, 'bias', bias);
            }}
            color={theme.colors.knobBias}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => v.toFixed(2)}
            label="Bias"
            labelPosition="left"
          />
        </ControlGroup>

        <ControlGroup>
          <KnobBase
            size={60}
            min={-1}
            max={16}
            step={0.1}
            value={lfo.keysync === 'Off' ? -1 : lfo.keysync}
            onChange={(value) => {
              const keysync = value < 0 ? 'Off' : Math.max(0, value);
              updateLfo(activeLfo, { keysync });
              sendLfoParamNRPN(activeLfo, 'keysync', value);
            }}
            color={theme.colors.knobFrequency}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => v < 0 ? 'Off' : v.toFixed(1)}
            label="KeySync"
            labelPosition="left"
          />
        </ControlGroup>
      </LfoControls>
    </LfoContainer>
  );
};
