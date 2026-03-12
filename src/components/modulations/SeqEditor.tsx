import React, { useState, useRef } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import KnobBase from '../knobs/KnobBase';
import { useStepSequencer, updateStepSequencer } from '../../stores/patchStore';
import type { StepSeqSyncMode, StepSeqMidiClockMode } from '../../types/modulation';
import { STEP_SEQ_MIDI_CLOCK_MODES } from '../../types/modulation';
import { useThemeStore } from '../../theme/themeStore';

const SeqContainer = styled.div`
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border: 1px solid ${props => props.theme.colors.border};
  width: 100%;
  max-width: 520px;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
`;

const TitleTabGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const SeqTitle = styled.h3`
  color: ${props => props.theme.colors.text};
  font-size: 0.9rem;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
  min-width: 150px;
`;

const SeqTabs = styled.div`
  display: flex;
  gap: 8px;
`;

const SeqTab = styled.button<{ $active: boolean }>`
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

const StepsContainer = styled.div`
  margin-bottom: 12px;
  overflow-x: auto;
`;

const StepGrid = styled.div`
  display: flex;
  gap: 6px;
  justify-content: space-between;
`;

const StepColumn = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  user-select: none;
`;

const StepBar = styled.div`
  width: 100%;
  height: 120px;
  background: ${props => `linear-gradient(to bottom, ${props.theme.colors.primary}20 0%, ${props.theme.colors.primary}10 100%)`};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  position: relative;
  cursor: crosshair;
  transition: border-color 0.2s;
  
  &:hover {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const StepFill = styled.div<{ $value: number }>`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: ${props => props.$value}%;
  background: ${props => `linear-gradient(to top, ${props.theme.colors.primary} 0%, ${props.theme.colors.accent} 100%)`};
  border-radius: 0 0 3px 3px;
  pointer-events: none;
  transition: height 0.05s ease-out;
`;

const StepLabel = styled.div`
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.65rem;
  text-align: center;
`;

const StepValue = styled.div`
  color: ${props => props.theme.colors.text};
  font-size: 0.65rem;
  font-weight: bold;
  text-align: center;
  min-height: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
`;

const SeqControls = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
  flex-wrap: wrap;
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
`;

const ControlLabel = styled.label`
  color: ${props => props.theme.colors.textMuted};
  font-size: 0.65rem;
  text-transform: uppercase;
  white-space: nowrap;
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
 * Composant SeqEditor
 * Gère les 2 séquenceurs à pas (Step Sequencers) du PreenFM3
 * Structure firmware:
 * - 16 steps avec valeurs 0-100
 * - Gate global (0-1, représenté en % 0-100%)
 * - Sync mode: Internal (BPM) ou External (MIDI Clock)
 * - BPM: 10-240 (utilisé si syncMode = 'Int')
 * - MIDI Clock mode: C/16, Ck/8, Ck/4, Ck/2, Ck, Ck*2, Ck*3, Ck*4, Ck*8 (utilisé si syncMode = 'Ext')
 */
export const SeqEditor: React.FC = () => {
  const { t } = useTranslation();
  const [activeSeq, setActiveSeq] = useState<0 | 1>(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const seq = useStepSequencer(activeSeq);
  const { theme } = useThemeStore();
  
  // État local pour un dessin fluide, synchronisé avec le store uniquement à la fin
  const [localSteps, setLocalSteps] = useState<number[] | null>(null);
  const displaySteps = localSteps || seq.steps;
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  /** Trouve le step le plus proche en X et calcule la valeur en Y (sensible au-dessus/dessous des barres) */
  const findStepAndValue = (clientX: number, clientY: number): { index: number; value: number } | null => {
    if (!stepsContainerRef.current) return null;
    const bars = stepsContainerRef.current.querySelectorAll<HTMLElement>('[data-step-index]');
    if (bars.length === 0) return null;
    let closestIndex = -1;
    let minDist = Infinity;
    let closestRect: DOMRect | null = null;
    bars.forEach((bar) => {
      const rect = bar.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const dist = Math.abs(clientX - centerX);
      const idx = parseInt(bar.getAttribute('data-step-index') || '-1');
      if (dist < minDist && idx >= 0) {
        minDist = dist;
        closestIndex = idx;
        closestRect = rect;
      }
    });
    if (closestIndex < 0 || !closestRect) return null;
    const rect = closestRect as DOMRect;
    const y = clientY - rect.top;
    const value = Math.round(100 - (y / rect.height) * 100);
    return { index: closestIndex, value: Math.max(0, Math.min(100, value)) };
  };

  // Synchroniser l'état local quand on change de séquenceur
  React.useEffect(() => {
    setLocalSteps(null);
  }, [activeSeq]);

  const calculateValueFromMouseY = (e: React.MouseEvent<HTMLDivElement>, rect: DOMRect) => {
    const y = e.clientY - rect.top;
    const height = rect.height;
    const value = Math.round(100 - (y / height) * 100);
    return Math.max(0, Math.min(100, value));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDrawing(true);
    const newSteps = [...seq.steps];
    const hit = findStepAndValue(e.clientX, e.clientY);
    if (hit) newSteps[hit.index] = hit.value;
    setLocalSteps(newSteps);
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    // Synchroniser avec le store uniquement à la fin
    if (localSteps) {
      updateStepSequencer(activeSeq, { steps: localSteps });
      setLocalSteps(null);
    }
  };

  const handleStepClick = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const value = calculateValueFromMouseY(e, rect);
    // Mise à jour immédiate du store pour un simple clic
    const newSteps = [...seq.steps];
    newSteps[index] = value;
    updateStepSequencer(activeSeq, { steps: newSteps });
  };

  // Envoie le NRPN midiClockMode à chaque changement de mode Ext ou de valeur midiClockMode
  const handleSyncModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value as StepSeqSyncMode;
    if (newMode === 'Ext') {
      updateStepSequencer(activeSeq, { syncMode: 'Ext', bpm: 241, midiClockMode: seq.midiClockMode });
    } else {
      updateStepSequencer(activeSeq, { syncMode: 'Int', bpm: seq.bpm });
    }
  };

  const handleMidiClockModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newClockMode = e.target.value as StepSeqMidiClockMode;
    // Si on est en mode Ext, envoyer bpm = 240 + index du mode clock à chaque changement
    if (seq.syncMode === 'Ext') {
      const modeIndex = STEP_SEQ_MIDI_CLOCK_MODES.indexOf(newClockMode);
      const bpm = 240 + (modeIndex >= 0 ? modeIndex : 0);
      updateStepSequencer(activeSeq, { midiClockMode: newClockMode, bpm });
    } else {
      updateStepSequencer(activeSeq, { midiClockMode: newClockMode });
    }
  };

  React.useEffect(() => {
    if (!isDrawing) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!localSteps) return;
      const hit = findStepAndValue(e.clientX, e.clientY);
      if (!hit) return;
      const newSteps = [...localSteps];
      if (newSteps[hit.index] !== hit.value) {
        newSteps[hit.index] = hit.value;
        setLocalSteps(newSteps);
      }
    };

    const handleGlobalMouseUp = () => {
      setIsDrawing(false);
      if (localSteps) {
        updateStepSequencer(activeSeq, { steps: localSteps });
        setLocalSteps(null);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDrawing, localSteps, activeSeq]);

  const syncModes: StepSeqSyncMode[] = ['Int', 'Ext'];

  return (
    <SeqContainer>
      <HeaderRow>
        <TitleTabGroup>
          <SeqTitle>{t('modulation.stepSeq')}</SeqTitle>
          <SeqTabs>
            {([0, 1] as const).map((seqNum) => (
              <SeqTab
                key={seqNum}
                $active={activeSeq === seqNum}
                onClick={() => setActiveSeq(seqNum)}
              >
                Seq {seqNum + 1}
              </SeqTab>
            ))}
          </SeqTabs>
        </TitleTabGroup>
      </HeaderRow>

      <StepsContainer ref={stepsContainerRef} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
        <StepGrid>
          {displaySteps.map((value, index) => (
            <StepColumn key={index}>
              <StepValue>{value}</StepValue>
              <StepBar
                data-step-index={index}
                onClick={(e) => handleStepClick(index, e)}
                title={`Step ${index + 1}: ${value}`}
              >
                <StepFill $value={value} />
              </StepBar>
              <StepLabel>{index + 1}</StepLabel>
            </StepColumn>
          ))}
        </StepGrid>
      </StepsContainer>

      <SeqControls>
        <ControlGroup>
          <KnobBase
            size={50}
            min={0}
            max={1}
            step={0.01}
            value={seq.gate}
            onChange={(gate) => updateStepSequencer(activeSeq, { gate })}
            color={theme.colors.knobSeq}
            backgroundColor={theme.colors.knobBackground}
            strokeColor={theme.colors.knobStroke}
            renderLabel={(v) => `${(v * 100).toFixed(0)}%`}
            label={t('modulation.gate')}
          />
        </ControlGroup>

        <ControlGroup>
          <ControlLabel>Sync</ControlLabel>
          <Select 
            value={seq.syncMode}
            onChange={handleSyncModeChange}
          >
            {syncModes.map(mode => (
              <option key={mode} value={mode}>{mode === 'Int' ? 'Internal' : 'External'}</option>
            ))}
          </Select>
        </ControlGroup>

        {seq.syncMode === 'Int' && (
          <ControlGroup>
            <KnobBase
              size={50}
              min={10}
              max={240}
              step={1}
              value={seq.bpm}
              onChange={(bpm) => updateStepSequencer(activeSeq, { bpm })}
              color={theme.colors.knobPhase}
              backgroundColor={theme.colors.knobBackground}
              strokeColor={theme.colors.knobStroke}
              renderLabel={(v) => Math.round(v)}
              label={t('modulation.bpm')}
            />
          </ControlGroup>
        )}

        {seq.syncMode === 'Ext' && (
          <ControlGroup>
            <ControlLabel>MIDI Clock</ControlLabel>
            <Select 
              value={seq.midiClockMode}
              onChange={handleMidiClockModeChange}
            >
              {STEP_SEQ_MIDI_CLOCK_MODES.map(mode => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </Select>
          </ControlGroup>
        )}
      </SeqControls>
    </SeqContainer>
  );
};
