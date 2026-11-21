import React from 'react';
import styled from 'styled-components';
import { useCurrentPatch, updateOperator, updateGlobal } from '../../stores/patchStore';
import KnobBase from '../knobs/KnobBase';
import { useFMSynthContext } from './FMSynthContext';
import { useThemeStore } from '../../theme/themeStore';
import {
  TIMBRE_DYNAMICS_PROFILES,
  ENGINE_DECIMATION_MODES,
  ENGINE_DECIMATION_DEFAULT,
  PLAY_MODES,
  VOICE_PRIORITIES,
  MFX_REVERB_PRESETS,
} from '../../midi/preenFmConstants';

const CarrierContainer = styled.div`
  margin: auto;
  background: ${props => props.theme.colors.panel};
  border-radius: 8px;
  border: 1px solid ${props => props.theme.colors.border};
  overflow: hidden;
  width: 900px;
  max-width: 900px;
  @media (max-width: 900px) {
    max-width: 100%;
    width: 100%;
  }
`;

const CarrierHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: ${props => props.theme.colors.panel};
  border-bottom: 1px solid ${props => props.theme.colors.border};
  flex-wrap: wrap;
  gap: 12px;
`;

const CarrierTitle = styled.h3`
  margin: 0;
  color: ${props => props.theme.colors.text};
  font-size: 0.95rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const HeaderControls = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`;

const HeaderControlItem = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

const CompactLabel = styled.label`
  font-size: 0.72rem;
  color: #a0aec0;
  text-transform: uppercase;
  font-weight: 600;
  white-space: nowrap;
`;

const CompactSelect = styled.select`
  background: ${props => props.theme.colors.button};
  border: 1px solid ${props => props.theme.colors.border};
  border-radius: 4px;
  color: ${props => props.theme.colors.text};
  padding: 3px 6px;
  font-size: 0.75rem;
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: ${props => props.theme.colors.primary};
  }
`;

const CompactRange = styled.input`
  width: 72px;
  height: 4px;
  cursor: pointer;
  accent-color: ${props => props.theme.colors.primary};
`;

const ValueBadge = styled.span`
  font-size: 0.72rem;
  color: ${props => props.theme.colors.text};
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
`;

const CarriersContent = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 16px 10px;
  background: ${props => props.theme.colors.panel};
  justify-content: center;
  align-items: center;
`;

const OperatorControl = styled.div<{ $isHighlighted?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  background: ${props => props.theme.colors.panelHover};
  border-radius: 6px;
  border: 2px solid ${props => props.theme.colors.border};
  transition: border-color 3s ease, box-shadow 3s ease;
  
  ${props => props.$isHighlighted && `
    border-color: ${props.theme.colors.highlight};
    box-shadow: 0 0 10px ${props.theme.colors.highlightGlow};
    transition: border-color 0.03s ease, box-shadow 0.03s ease;
  `}
`;

const OperatorTitle = styled.h4`
  margin: 0;
  font-size: 0.95rem;
  text-align: center;
  color: ${props => props.theme.colors.text};
`;

const ControlGroup = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 100%;
`;

const ControlLabel = styled.span`
  font-size: 0.75rem;
  color: #a0aec0;
  text-align: center;
  text-transform: uppercase;
`;

const CarrierFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 6px 16px;
  background: ${props => props.theme.colors.panelHover};
  border-top: 1px solid ${props => props.theme.colors.border};
  flex-wrap: wrap;
`;

const FooterTitle = styled.span`
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  color: ${props => props.theme.colors.textMuted};
  letter-spacing: 0.5px;
`;

const FooterControlGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

export const CarrierControls: React.FC = () => {
  const currentPatch = useCurrentPatch();
  const currentAlgorithm = currentPatch.algorithm;
  const carriers = currentAlgorithm?.ops?.filter(op => op.type === 'CARRIER') || [];
  const { setHighlightedNode, highlightedNode } = useFMSynthContext();
  const { theme } = useThemeStore();

  const global = currentPatch.global;
  const dynamicsValue = global.dynamics ?? 0;
  const reverbDryWetValue = global.reverbDryWet ?? 0.2;
  const decimationValue = global.decimation ?? ENGINE_DECIMATION_DEFAULT;
  const playModeValue = global.playMode ?? 1;
  const voicePriorityValue = global.voicePriority ?? 0;
  const mfxReturnValue = global.mfxReturn ?? 0.5;
  const mfxPresetValue = global.mfxPreset ?? 0;

  return (
    <CarrierContainer>
      {/* Header: Titre & Paramètres du Timbre (CC 40, 41, 42, 43) */}
      <CarrierHeader>
        <CarrierTitle>Mixer & Carriers</CarrierTitle>

        <HeaderControls>
          {/* CC 40: Timbre Reverb Dry/Wet */}
          <HeaderControlItem title="Timbre Reverb Dry/Wet (CC 40)">
            <CompactLabel>Reverb Send:</CompactLabel>
            <CompactRange
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={reverbDryWetValue}
              onChange={(e) => updateGlobal({ reverbDryWet: Number(e.target.value) })}
            />
            <ValueBadge>{Math.round(reverbDryWetValue * 100)}%</ValueBadge>
          </HeaderControlItem>

          {/* CC 41: Timbre Dynamics (Off, Glue, Punch, Tube, Limit, Drive, Fuzz) */}
          <HeaderControlItem title="Timbre Dynamics profile (CC 41)">
            <CompactLabel>Dynamics:</CompactLabel>
            <CompactSelect
              value={dynamicsValue}
              onChange={(e) => updateGlobal({ dynamics: Number(e.target.value) })}
            >
              {TIMBRE_DYNAMICS_PROFILES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </CompactSelect>
          </HeaderControlItem>

          {/* CC 42: Engine Decimation (1-bit .. 19-bit, FULL, HQx2) */}
          <HeaderControlItem title="Engine Decimation lo-fi bit reduction (CC 42)">
            <CompactLabel>Decim:</CompactLabel>
            <CompactSelect
              value={decimationValue}
              onChange={(e) => updateGlobal({ decimation: Number(e.target.value) })}
            >
              {ENGINE_DECIMATION_MODES.map((mode, idx) => (
                <option key={mode} value={idx}>
                  {mode}
                </option>
              ))}
            </CompactSelect>
          </HeaderControlItem>

          {/* CC 43: Play Mode (Mono, Poly, Unison) */}
          <HeaderControlItem title="Play Mode (CC 43)">
            <CompactLabel>Play:</CompactLabel>
            <CompactSelect
              value={playModeValue}
              onChange={(e) => updateGlobal({ playMode: Number(e.target.value) })}
            >
              {PLAY_MODES.map((mode, idx) => (
                <option key={mode} value={idx}>
                  {mode}
                </option>
              ))}
            </CompactSelect>
          </HeaderControlItem>

          {/* NRPN 276 [2,20]: Voice Priority (Last, High, Low, BassP, Cycl) */}
          <HeaderControlItem title="Voice Priority (NRPN 276 [2,20])">
            <CompactLabel>Prio:</CompactLabel>
            <CompactSelect
              value={voicePriorityValue}
              onChange={(e) => updateGlobal({ voicePriority: Number(e.target.value) })}
            >
              {VOICE_PRIORITIES.map((prio, idx) => (
                <option key={prio} value={idx}>
                  {prio}
                </option>
              ))}
            </CompactSelect>
          </HeaderControlItem>
        </HeaderControls>
      </CarrierHeader>
      
      {/* Contenu principal : Carrier Operators Mix & Pan */}
      <CarriersContent>
        {carriers.length === 0 ? (
          <div style={{ color: theme.colors.textMuted, textAlign: 'center', padding: '16px' }}>
            No carrier operators in current algorithm
          </div>
        ) : (
          carriers.map(({ id }) => {
            const operator = currentPatch.operators.find(op => op.id === id);
            return (
              <OperatorControl 
                key={`carrier-${id}`}
                $isHighlighted={highlightedNode === id}
                onMouseEnter={() => setHighlightedNode(id)}
                onMouseLeave={() => setHighlightedNode(null)}
              >
                <OperatorTitle>OP{id}</OperatorTitle>

                <ControlGroup>
                  <KnobBase
                    size={55}
                    knobRadius={18}
                    min={0}
                    max={1}
                    step={0.01}
                    value={operator?.amplitude ?? 0}
                    onChange={val => updateOperator(id, { amplitude: Math.max(0, Math.min(1, val)) })}
                    color={theme.colors.knobVolume}
                    backgroundColor={theme.colors.knobBackground}
                    strokeColor={theme.colors.knobStroke}
                    renderLabel={(val) => val.toFixed(2)}
                    label="Level"
                  />
                </ControlGroup>

                <ControlGroup>
                  <CompactRange
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={operator?.pan ?? 0}
                    onChange={e => updateOperator(id, { pan: Number(e.target.value) })}
                    onDoubleClick={() => updateOperator(id, { pan: 0 })}
                  />
                  <ControlLabel>Pan</ControlLabel>
                </ControlGroup>
              </OperatorControl>
            );
          })
        )}
      </CarriersContent>

      {/* Footer ultra-compact : Paramètres globaux Master FX Reverb (CC 44, 45) */}
      <CarrierFooter>
        <FooterTitle>Global FX</FooterTitle>

        {/* CC 44: Master FX Return Level */}
        <FooterControlGroup title="Master FX Global Reverb Return Level (CC 44)">
          <CompactLabel>Reverb level:</CompactLabel>
          <CompactRange
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={mfxReturnValue}
            onChange={(e) => updateGlobal({ mfxReturn: Number(e.target.value) })}
          />
          <ValueBadge>{Math.round(mfxReturnValue * 100)}%</ValueBadge>
        </FooterControlGroup>

        {/* CC 45: Master FX Preset */}
        <FooterControlGroup title="Master FX Global Reverb Preset (CC 45)">
          <CompactLabel>Reverb Preset:</CompactLabel>
          <CompactSelect
            value={mfxPresetValue}
            onChange={(e) => updateGlobal({ mfxPreset: Number(e.target.value) })}
          >
            {MFX_REVERB_PRESETS.map((presetName, idx) => (
              <option key={presetName} value={idx}>
                {idx}: {presetName}
              </option>
            ))}
          </CompactSelect>
        </FooterControlGroup>
      </CarrierFooter>
    </CarrierContainer>
  );
};

export default CarrierControls;
