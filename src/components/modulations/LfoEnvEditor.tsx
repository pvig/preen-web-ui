import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sendLfoEnvelopeCurve, sendLfoEnvelopeParam } from '../../midi/midiService';
import styled from 'styled-components';
import KnobBase from '../knobs/KnobBase';
import { useLfoEnvelope, updateLfoEnvelope } from '../../stores/patchStore';
import type { LfoEnvLoopMode } from '../../types/modulation';
import { ADSR_CURVE_TYPES, type CurveType } from '../../types/patch';
import { EnvelopeVisualizer, type EnvelopeDataADSR, type EnvelopeDataSAR, type PointType } from './EnvelopeVisualizer';
import { useThemeStore } from '../../theme/themeStore';
import { StyledSelect } from '../StyledSelect';

const EnvContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  width: 100%;
  max-width: 520px;
  border: 1px solid ${props => props.theme.colors.border};
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const EnvTitle = styled.h3`
  color: ${props => props.theme.colors.text};
  font-size: 1rem;
  margin: 0 0 10px 0;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const EnvTabs = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
`;

const EnvTab = styled.button<{ $active: boolean }>`
  background: ${props => props.$active ? props.theme.colors.buttonActive : props.theme.colors.background};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.$active ? props.theme.colors.background : props.theme.colors.textMuted};
  padding: 5px 10px;
  font-size: 0.75rem;
  line-height: 1.3;
  cursor: pointer;
  transition: all 0.2s;
  box-sizing: border-box;
  -moz-appearance: none;
  -webkit-appearance: none;
  
  /* Ajustement spécifique pour Firefox */
  @media screen and (-moz-user-select: none) {
    padding: 4px 9px;
    font-size: 0.7rem;
  }
  
  &:hover {
    background: ${props => props.theme.colors.buttonHover};
    color: ${props => props.theme.colors.primary};
  }
`;

const EnvControls = styled.div`
  display: flex;
  gap: 10px;
  align-items: start;
  padding-top: 10px;
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

  // Send envelope values to the PreenFM3 in real time
  const sendEnvelopeMidi = (
    envelopeData: EnvelopeDataADSR | EnvelopeDataSAR,
    changedPoint: PointType,
  ) => {
    if (activeEnv === 0) {
      const env1Data = envelopeData as EnvelopeDataADSR;
      switch (changedPoint) {
        case 'attack':
          sendLfoEnvelopeParam(0, 'attack', env1Data.attack.time);
          break;
        case 'decay':
          sendLfoEnvelopeParam(0, 'decay', env1Data.decay.time);
          sendLfoEnvelopeParam(0, 'sustain', env1Data.decay.level);
          break;
        case 'sustain':
          sendLfoEnvelopeParam(0, 'sustain', env1Data.decay.level);
          break;
        case 'release':
          sendLfoEnvelopeParam(0, 'release', env1Data.release.time);
          break;
        default:
          break;
      }
    } else {
      const env2Data = envelopeData as EnvelopeDataSAR;
      switch (changedPoint) {
        case 'silence':
          sendLfoEnvelopeParam(1, 'silence', env2Data.silence.time);
          break;
        case 'attack':
          sendLfoEnvelopeParam(1, 'attack', env2Data.attack.time);
          break;
        case 'release':
          sendLfoEnvelopeParam(1, 'release', env2Data.release.time);
          break;
        default:
          break;
      }
    }
  };

  // Live drag: MIDI only, no store update
  const handleLiveEnvelopeChange = (
    envelopeData: EnvelopeDataADSR | EnvelopeDataSAR,
    changedPoint: PointType,
  ) => {
    sendEnvelopeMidi(envelopeData, changedPoint);
  };

  // Drag end: update store, then send final MIDI
  const handleEnvelopeChange = (
    envelopeData: EnvelopeDataADSR | EnvelopeDataSAR,
    changedPoint: PointType,
  ) => {
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
    }
    sendEnvelopeMidi(envelopeData, changedPoint);
  };

  return (
    <EnvContainer>
      <HeaderRow>
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
      </HeaderRow>

      <EnvelopeVisualizer 
        envelope={toEnvelopeData()} 
        onChange={handleEnvelopeChange}
        onLiveChange={handleLiveEnvelopeChange}
        type={activeEnv === 0 ? 'env1' : 'env2'}
        attackCurve={env.attackCurve}
        releaseCurve={env.releaseCurve}
      />

      <EnvControls>
        {activeEnv === 0 ? (
          // Env1: Only 4 user-editable parameters (A time, D time, S level, R time)
          <>
            <ControlGroup>
              <KnobBase
                size={60}
                knobRadius={16}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.attack.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, attack: { ...env.adsr.attack, time } }
                  });
                  if (activeEnv === 0) {
                    sendLfoEnvelopeParam(0, 'attack', time);
                  }
                }}
                color={theme.colors.adsrAttack}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.attackTime')}
                labelPosition="top"
              />
            </ControlGroup>
            <ControlGroup>
              <KnobBase
                size={60}
                knobRadius={16}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.decay.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, decay: { ...env.adsr.decay, time } }
                  });
                  if (activeEnv === 0) {
                    sendLfoEnvelopeParam(0, 'decay', time);
                  }
                }}
                color={theme.colors.adsrDecay}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.decayTime')}
                labelPosition="top"
              />
            </ControlGroup>
            <ControlGroup>
              <KnobBase
                size={60}
                knobRadius={16}
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
                    sendLfoEnvelopeParam(0, 'sustain', level / 100);
                  }
                }}
                color={theme.colors.adsrSustain}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => Math.round(v)}
                label={t('modulation.sustainLevel')}
                labelPosition="top"
              />
            </ControlGroup>
            <ControlGroup>
              <KnobBase
                size={60}
                knobRadius={16}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.release.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, release: { ...env.adsr.release, time } }
                  });
                  if (activeEnv === 0) {
                    sendLfoEnvelopeParam(0, 'release', time);
                  }
                }}
                color={theme.colors.adsrRelease}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.releaseTime')}
                labelPosition="top"
              />
            </ControlGroup>
          </>
        ) : (
          // Env2: Silence-Attack-Release controls (only times, levels are fixed)
          <>
            <ControlGroup>
              <KnobBase
                size={60}
                knobRadius={16}
                min={0}
                max={16}
                step={0.01}
                value={env.silence}
                onChange={(silence) => {
                  updateLfoEnvelope(activeEnv, { silence });
                  if (activeEnv === 1) {
                    sendLfoEnvelopeParam(1, 'silence', silence);
                  }
                }}
                color={theme.colors.knobSeq}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.silence')}
                labelPosition="top"
              />
            </ControlGroup>

            <ControlGroup>
              <KnobBase
                size={60}
                knobRadius={16}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.attack.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, attack: { time, level: 100 } }
                  });
                  if (activeEnv === 1) {
                    sendLfoEnvelopeParam(1, 'attack', time);
                  }
                }}
                color={theme.colors.adsrAttack}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.attack')}
                labelPosition="top"
              />
            </ControlGroup>

            <ControlGroup>
              <KnobBase
                size={60}
                knobRadius={16}
                min={0}
                max={16}
                step={0.01}
                value={env.adsr.decay.time}
                onChange={(time) => {
                  updateLfoEnvelope(activeEnv, {
                    adsr: { ...env.adsr, decay: { time, level: 0 } }
                  });
                  if (activeEnv === 1) {
                    sendLfoEnvelopeParam(1, 'release', time);
                  }
                }}
                color={theme.colors.knobFrequency}
                backgroundColor={theme.colors.knobBackground}
                strokeColor={theme.colors.knobStroke}
                renderLabel={(v) => v.toFixed(2)}
                label={t('modulation.release')}
                labelPosition="top"
              />
            </ControlGroup>
          </>
        )}

        {/* Attack & Release Curves (NRPN 280-283) */}
        <ControlGroup>
          <ControlLabel>{t('modulation.attackCurve', 'Atk Curve')}</ControlLabel>
          <StyledSelect
            $width="80px"
            value={env.attackCurve ?? 'linear'}
            onChange={(e) => {
              const curve = e.target.value as CurveType;
              updateLfoEnvelope(activeEnv, { attackCurve: curve });
              sendLfoEnvelopeCurve(activeEnv, 'attack', curve);
            }}
          >
            {ADSR_CURVE_TYPES.map((curve) => (
              <option key={curve} value={curve}>
                {curve.charAt(0).toUpperCase() + curve.slice(1)}
              </option>
            ))}
          </StyledSelect>
        </ControlGroup>

        <ControlGroup>
          <ControlLabel>{t('modulation.releaseCurve', 'Rel Curve')}</ControlLabel>
          <StyledSelect
            $width="80px"
            value={env.releaseCurve ?? 'linear'}
            onChange={(e) => {
              const curve = e.target.value as CurveType;
              updateLfoEnvelope(activeEnv, { releaseCurve: curve });
              sendLfoEnvelopeCurve(activeEnv, 'release', curve);
            }}
          >
            {ADSR_CURVE_TYPES.map((curve) => (
              <option key={curve} value={curve}>
                {curve.charAt(0).toUpperCase() + curve.slice(1)}
              </option>
            ))}
          </StyledSelect>
        </ControlGroup>

        {/* Loop Mode only for Env2 */}
        {activeEnv === 1 && (
          <ControlGroup>
            <ControlLabel>Loop Mode</ControlLabel>
            <StyledSelect 
              $width="80px"
              value={env.loopMode}
              onChange={(e) => {
                const newMode = e.target.value as LfoEnvLoopMode;
                updateLfoEnvelope(activeEnv, { loopMode: newMode });
                if (activeEnv === 1) {
                  sendLfoEnvelopeParam(1, 'loopMode', newMode === 'Off' ? 0 : newMode === 'Silence' ? 1 : 2);
                }
              }}
            >
              {loopModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </StyledSelect>
          </ControlGroup>
        )}
      </EnvControls>
    </EnvContainer>
  );
};
