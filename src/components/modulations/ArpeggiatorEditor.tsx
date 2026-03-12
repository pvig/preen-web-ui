import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import KnobBase from '../knobs/KnobBase';
import { useArpeggiator, updateArpeggiator } from '../../stores/patchStore';
import type { ArpClock, ArpDirection, ArpPattern, ArpDivision, ArpDuration, ArpLatch } from '../../types/patch';
import { useThemeStore } from '../../theme/themeStore';
import { 
  sendArpeggiatorClock,
  sendArpeggiatorBpm,
  sendArpeggiatorDirection,
  sendArpeggiatorOctave,
  sendArpeggiatorPattern,
  sendArpeggiatorDivision,
  sendArpeggiatorDuration,
  sendArpeggiatorLatch
} from '../../midi/midiService';

const ArpContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 16px;
  border: 1px solid ${props => props.theme.colors.border};
`;

const ArpHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const ArpTitle = styled.h3`
  color: ${props => props.theme.colors.text};
  font-size: 1rem;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const ArpControls = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 20px;
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
  padding: 8px 28px 8px 12px;
  font-size: 0.875rem;
  width: 120px;
  max-width: 120px;
  height: 36px;
  box-sizing: border-box;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
`;

/**
 * Composant ArpeggiatorEditor
 * Gère l'arpégiateur du PreenFM3
 * Paramètres : Clock (BPM), Direction, Octave, Pattern, Division, Duration, Latch
 */
export const ArpeggiatorEditor: React.FC = () => {
  const { t } = useTranslation();
  const arp = useArpeggiator();
  const { theme } = useThemeStore();

  const clockSources: ArpClock[] = ['Off', 'Int', 'Ext'];

  const directions: ArpDirection[] = [
    'Up', 'Down', 'UpDown', 'Played', 'Random', 'Chord', 'Rotate U', 'Rotate D', 'Shift U', 'Shift D'
  ];

  const patterns: ArpPattern[] = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
    '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
    '21', '22', 'Usr1', 'Usr2', 'Usr3', 'Usr4'
  ];

  const divisions: ArpDivision[] = [
    '2/1', '3/2', '1/1', '3/4', '2/3', '1/2', '3/8', '1/3', '1/4', 
    '1/6', '1/8', '1/12', '1/16', '1/24', '1/32', '1/48', '1/96'
  ];

  const durations: ArpDuration[] = [
    '2/1', '3/2', '1/1', '3/4', '2/3', '1/2', '3/8', '1/3', '1/4', 
    '1/6', '1/8', '1/12', '1/16', '1/24', '1/32', '1/48', '1/96'
  ];

  const latchModes: ArpLatch[] = ['Off', 'On'];

  return (
    <ArpContainer>
      <ArpHeader>
        <ArpTitle>{t('modulation.arpeggiator')}</ArpTitle>
      </ArpHeader>

      <ArpControls>
        {/* Clock Source (Off/Int/Ext) */}
        <ControlGroup>
          <ControlLabel>{t('modulation.clockSource')}</ControlLabel>
          <Select 
            value={arp.clockSource}
            onChange={(e) => {
              const clockSource = e.target.value as ArpClock;
              updateArpeggiator({ clockSource });
              sendArpeggiatorClock(clockSource);
            }}
          >
            {clockSources.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </Select>
        </ControlGroup>

        {/* BPM */}
        <ControlGroup>
          <KnobBase
            size={60}
            min={10}
            max={240}
            step={1}
            value={arp.clock}
            onChange={(clock) => {
              updateArpeggiator({ clock });
              sendArpeggiatorBpm(clock);
            }}
            color={theme.colors.knobArp}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => Math.round(v)}
            label={t('modulation.bpm')}
          />
        </ControlGroup>

        {/* Direction */}
        <ControlGroup>
          <ControlLabel>{t('modulation.direction')}</ControlLabel>
          <Select 
            value={arp.direction}
            onChange={(e) => {
              const direction = e.target.value as ArpDirection;
              updateArpeggiator({ direction });
              sendArpeggiatorDirection(direction);
            }}
          >
            {directions.map((dir) => (
              <option key={dir} value={dir}>
                {dir}
              </option>
            ))}
          </Select>
        </ControlGroup>

        {/* Octave */}
        <ControlGroup>
          <KnobBase
            size={60}
            min={1}
            max={3}
            step={1}
            value={arp.octave}
            onChange={(octave) => {
              updateArpeggiator({ octave });
              sendArpeggiatorOctave(octave);
            }}
            color={theme.colors.knobVolume}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => Math.round(v)}
            label={t('modulation.octaves')}
          />
        </ControlGroup>

        {/* Pattern */}
        <ControlGroup>
          <ControlLabel>{t('modulation.pattern')}</ControlLabel>
          <Select 
            value={arp.pattern}
            onChange={(e) => {
              const pattern = e.target.value as ArpPattern;
              updateArpeggiator({ pattern });
              sendArpeggiatorPattern(pattern);
            }}
          >
            {patterns.map((pattern) => (
              <option key={pattern} value={pattern}>
                {pattern}
              </option>
            ))}
          </Select>
        </ControlGroup>

        {/* Division */}
        <ControlGroup>
          <ControlLabel>{t('modulation.division')}</ControlLabel>
          <Select 
            value={arp.division}
            onChange={(e) => {
              const division = e.target.value as ArpDivision;
              updateArpeggiator({ division });
              sendArpeggiatorDivision(division);
            }}
          >
            {divisions.map((div) => (
              <option key={div} value={div}>
                {div}
              </option>
            ))}
          </Select>
        </ControlGroup>

        {/* Duration */}
        <ControlGroup>
          <ControlLabel>{t('modulation.duration')}</ControlLabel>
          <Select 
            value={arp.duration}
            onChange={(e) => {
              const duration = e.target.value as ArpDuration;
              updateArpeggiator({ duration });
              sendArpeggiatorDuration(duration);
            }}
          >
            {durations.map((dur) => (
              <option key={dur} value={dur}>
                {dur}
              </option>
            ))}
          </Select>
        </ControlGroup>

        {/* Latch */}
        <ControlGroup>
          <ControlLabel>{t('modulation.latch')}</ControlLabel>
          <Select 
            value={arp.latch}
            onChange={(e) => {
              const latch = e.target.value as ArpLatch;
              updateArpeggiator({ latch });
              sendArpeggiatorLatch(latch);
            }}
          >
            {latchModes.map((latch) => (
              <option key={latch} value={latch}>
                {latch}
              </option>
            ))}
          </Select>
        </ControlGroup>
      </ArpControls>
    </ArpContainer>
  );
};
