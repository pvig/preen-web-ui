import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendLfoEnvelope } from '../../midi/midiService';
import { sendLfoEnvelope2 } from '../../midi/midiService';
import styled from 'styled-components';
import KnobBase from '../knobs/KnobBase';
import { useLfoEnvelope, updateLfoEnvelope } from '../../stores/patchStore';
import type { LfoEnvLoopMode } from '../../types/modulation';
import { EnvelopeVisualizer, type EnvelopeDataADSR, type EnvelopeDataSAR } from './EnvelopeVisualizer';
import { useThemeStore } from '../../theme/themeStore';

const EnvContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  width: 550px;
  border: 1px solid ${props => props.theme.colors.border};
`;

const EnvTitle = styled.h3`
  color: ${props => props.theme.colors.text};
  font-size: 1rem;
  margin: 0 0 15px 0;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const EnvTabs = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
`;

const EnvTab = styled.button<{ $active: boolean }>`
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

const EnvControls = styled.div`
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
  padding: 8px;
  font-size: 0.875rem;
  width: 100%;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary};
  }
`;

/**
 * Composant LfoEnvEditor
 * Gère les 2 enveloppes libres (Env1 et Env2) du PreenFM3
 * Ces enveloppes peuvent moduler les LFOs et autres paramètres
 */
export const LfoEnvEditor: React.FC = () => {
  const { t } = useTranslation();
  const [activeEnv, setActiveEnv] = useState<0 | 1>(0);
  const env = useLfoEnvelope(activeEnv);
  const { theme } = useThemeStore();

  const loopModes: LfoEnvLoopMode[] = [
    'Off',
    'Silence',  // Loop all: silence + attack + release
    'Attack',   // Loop from end of silence: attack + release only
  ];

  // Convert PreenFM-style ADSR to EnvelopeDataADSR for visualizer (Env1)
  const toEnvelopeData = (): EnvelopeDataADSR | EnvelopeDataSAR => {
    if (activeEnv === 0) {
      // Env1: 5-point structure for visualizer, but only 4 user params
      // Points: 0 (0,0), 1 (A,1), 2 (A+D,S), 3 (A+D, S), 4 (A+D+R,0)
      const attackTime = env.adsr.attack.time;
      const decayTime = env.adsr.decay.time;
      const sustainLevel = env.adsr.decay.level / 100; // S = decay.level
      const releaseTime = env.adsr.release.time;
      return {
        attack: {
          time: attackTime,
          level: 1,
        },
        decay: {
          time: decayTime,
          level: sustainLevel,
        },
        sustain: {
          time: 0, // Not user-editable, just for plateau
          level: sustainLevel,
        },
        release: {
          time: releaseTime,
          level: 0,
        },
      };
    } else {
      // Env2: Silence-Attack-Release structure
      return {
        silence: {
          time: env.silence,
          level: 0,
        },
        attack: {
          time: env.adsr.attack.time,
          level: 1,
        },
        release: {
          time: env.adsr.decay.time,
          level: 0,
        },
      };
    }
  };

  // Handle envelope changes from visualizer (Env1: only 4 params editable)
  const handleEnvelopeChange = (envelopeData: EnvelopeDataADSR | EnvelopeDataSAR) => {
    if (activeEnv === 0) {
      const env1Data = envelopeData as EnvelopeDataADSR;
      // Only allow editing of attack.time, decay.time, decay.level (S), release.time
      updateLfoEnvelope(activeEnv, {
        adsr: {
          attack: {
            time: env1Data.attack.time,
            level: 0, // Always 0 for PreenFM
          },
          decay: {
            time: env1Data.decay.time,
            level: env1Data.decay.level * 100, // S level (0-1) to 0-100
          },
          sustain: {
            time: 0, // Not user-editable
            level: env1Data.decay.level * 100, // S = D.level
          },
          release: {
            time: env1Data.release.time,
            level: 0, // Always 0 for PreenFM
          },
        },
      });
      // Send values to PreenFM in real time
      sendLfoEnvelope(0, {
        attack: env1Data.attack.time,
        decay: env1Data.decay.time,
        sustain: env1Data.decay.level,
        release: env1Data.release.time
      });
    } else {
      // Env2: Silence-Attack-Release
      const env2Data = envelopeData as EnvelopeDataSAR;
      updateLfoEnvelope(activeEnv, {
        silence: env2Data.silence.time,
        adsr: {
          attack: {
            time: env2Data.attack.time,
            level: 100,
          },
          decay: {
            time: env2Data.release.time,
            level: 0,
          },
          sustain: { time: 0, level: 0 },
          release: { time: 0, level: 0 },
        },
      });
      // Send values to PreenFM in real time for Env2
      sendLfoEnvelope2({
        silence: env2Data.silence.time,
        attack: env2Data.attack.time,
        release: env2Data.release.time,
        loopMode: env.loopMode === 'Off' ? 0 : env.loopMode === 'Silence' ? 1 : 2
      });
    }
  };

  return (
    <EnvContainer>
      <EnvTitle>{t('modulation.lfoEnvEditor')}</EnvTitle>
      
      <EnvTabs>
        {([0, 1] as const).map((envNum) => (
          <EnvTab
            key={envNum}
            $active={activeEnv === envNum}
            onClick={() => setActiveEnv(envNum)}
          >
            Env {envNum + 1}
          </EnvTab>
        ))}
      </EnvTabs>

      <EnvelopeVisualizer 
        envelope={toEnvelopeData()} 
        onChange={handleEnvelopeChange}
        type={activeEnv === 0 ? 'env1' : 'env2'}
      />

      <EnvControls>
        {activeEnv === 0 ? (
          // Env1: Only 4 user-editable parameters (A time, D time, S level, R time)
          <>
            <ControlGroup>
              <KnobBase
                size={60}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.attack.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, attack: { ...env.adsr.attack, time } }
                  });
                  if (activeEnv === 0) {
                    sendLfoEnvelope(0, {
                      attack: time,
                      decay: env.adsr.decay.time,
                      sustain: env.adsr.decay.level / 100,
                      release: env.adsr.release.time
                    });
                  }
                }}
                color={theme.colors.adsrAttack}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.attackTime')}
                labelPosition="left"
              />
            </ControlGroup>
            <ControlGroup>
              <KnobBase
                size={60}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.decay.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, decay: { ...env.adsr.decay, time } }
                  });
                  if (activeEnv === 0) {
                    sendLfoEnvelope(0, {
                      attack: env.adsr.attack.time,
                      decay: time,
                      sustain: env.adsr.decay.level / 100,
                      release: env.adsr.release.time
                    });
                  }
                }}
                color={theme.colors.adsrDecay}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.decayTime')}
                labelPosition="left"
              />
            </ControlGroup>
            <ControlGroup>
              <KnobBase
                size={60}
                min={0}
                max={100}
                step={1}
                value={env.adsr.decay.level}
                onChange={(level) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: {
                      ...env.adsr,
                      decay: { ...env.adsr.decay, level },
                      sustain: { ...env.adsr.sustain, level }
                    }
                  });
                  if (activeEnv === 0) {
                    sendLfoEnvelope(0, {
                      attack: env.adsr.attack.time,
                      decay: env.adsr.decay.time,
                      sustain: level / 100,
                      release: env.adsr.release.time
                    });
                  }
                }}
                color={theme.colors.adsrSustain}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => Math.round(v)}
                label={t('modulation.sustainLevel')}
                labelPosition="left"
              />
            </ControlGroup>
            <ControlGroup>
              <KnobBase
                size={60}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.release.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, release: { ...env.adsr.release, time } }
                  });
                  if (activeEnv === 0) {
                    sendLfoEnvelope(0, {
                      attack: env.adsr.attack.time,
                      decay: env.adsr.decay.time,
                      sustain: env.adsr.decay.level / 100,
                      release: time
                    });
                  }
                }}
                color={theme.colors.adsrRelease}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.releaseTime')}
                labelPosition="left"
              />
            </ControlGroup>
          </>
        ) : (
          // Env2: Silence-Attack-Release controls (only times, levels are fixed)
          <>
            <ControlGroup>
              <KnobBase
                size={60}
                min={0}
                max={16}
                step={0.01}
                value={env.silence}
                onChange={(silence) => {
                  updateLfoEnvelope(activeEnv, { silence });
                  if (activeEnv === 1) {
                    sendLfoEnvelope2({
                      silence: env.silence,
                      attack: env.adsr.attack.time,
                      release: env.adsr.decay.time,
                      loopMode: env.loopMode === 'Off' ? 0 : env.loopMode === 'Silence' ? 1 : 2
                    });
                  }
                }}
                color={theme.colors.knobSeq}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.silence')}
                labelPosition="left"
              />
            </ControlGroup>

            <ControlGroup>
              <KnobBase
                size={60}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.attack.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, attack: { time, level: 100 } }
                  });
                  if (activeEnv === 1) {
                    sendLfoEnvelope2({
                      silence: env.silence,
                      attack: time,
                      release: env.adsr.decay.time,
                      loopMode: env.loopMode === 'Off' ? 0 : env.loopMode === 'Silence' ? 1 : 2
                    });
                  }
                }}
                color={theme.colors.adsrAttack}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.attack')}
                labelPosition="left"
              />
            </ControlGroup>

            <ControlGroup>
              <KnobBase
                size={60}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.decay.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, decay: { time, level: 0 } }
                  });
                  if (activeEnv === 1) {
                    sendLfoEnvelope2({
                      silence: env.silence,
                      attack: env.adsr.attack.time,
                      release: time,
                      loopMode: env.loopMode === 'Off' ? 0 : env.loopMode === 'Silence' ? 1 : 2
                    });
                  }
                }}
                color={theme.colors.knobFrequency}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.release')}
                labelPosition="left"
              />
            </ControlGroup>
          </>
        )}

        {/* Loop Mode only for Env2 */}
        {activeEnv === 1 && (
          <ControlGroup>
            <ControlLabel>Loop Mode</ControlLabel>
            <Select 
              value={env.loopMode}
              onChange={(e) => {
                const newMode = e.target.value as LfoEnvLoopMode;
                updateLfoEnvelope(activeEnv, { loopMode: newMode });
                if (activeEnv === 1) {
                  sendLfoEnvelope2({
                    silence: env.silence,
                    attack: env.adsr.attack.time,
                    release: env.adsr.decay.time,
                    loopMode: newMode === 'Off' ? 0 : newMode === 'Silence' ? 1 : 2
                  });
                }
              }}
            >
              {loopModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </Select>
          </ControlGroup>
        )}
      </EnvControls>
    </EnvContainer>
  );
};
