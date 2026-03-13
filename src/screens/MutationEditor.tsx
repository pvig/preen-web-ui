/**
 * MutationEditor — Screen for the Patch Mutation feature.
 *
 * Layout:
 *   ┌──────────┐  ┌───────────────┐  ┌──────────┐
 *   │ Source A  │  │   Mix slider  │  │ Source B  │
 *   │ (left)    │  │ + checkbox    │  │ (right)   │
 *   └──────────┘  └───────────────┘  └──────────┘
 *
 * When the "Mutation" checkbox is active and both sources are loaded,
 * the current patch is replaced by the interpolation of A and B at the
 * current mix position.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { PatchSlot } from '../components/mutation/PatchSlot';
import {
  useMutationStore,
  interpolatePatch,
} from '../stores/mutationStore';
import { usePatchStore } from '../stores/patchStore';
import { useMidiActions } from '../midi/useMidiActions';
import { MUTATION_EXCLUDED_NRPNS } from '../midi/patchSerializer';

// ── Styled ────────────────────────────────────────────────────────────────────

const Container = styled.div`
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const Title = styled.h2`
  font-size: 1.2rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`;

const SlotsRow = styled.div`
  display: flex;
  gap: 16px;
  align-items: stretch;
  flex-wrap: wrap;
  justify-content: center;
`;

const ControlPanel = styled.div`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
`;

const SliderRow = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
`;

const SliderLabel = styled.span<{ $active?: boolean }>`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.textMuted};
  min-width: 28px;
  text-align: center;
  transition: color 0.2s;
`;

/** Track height & thumb size for the big slider */
const TRACK_H = '14px';
const THUMB_W = '28px';
const THUMB_H = '28px';

const Slider = styled.input`
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: ${TRACK_H};
  border-radius: 7px;
  background: ${({ theme }) =>
    `linear-gradient(90deg, ${theme.colors.primary}44 0%, ${theme.colors.accent ?? theme.colors.primary}44 100%)`};
  outline: none;
  cursor: pointer;
  transition: background 0.2s;

  /* ── Webkit (Chrome, Edge, Brave, Safari) ── */
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: ${THUMB_W};
    height: ${THUMB_H};
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.primary};
    border: 3px solid ${({ theme }) => theme.colors.background};
    box-shadow: 0 0 6px ${({ theme }) => theme.colors.primary}88;
    cursor: grab;
    transition: box-shadow 0.15s, transform 0.15s;
  }
  &::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 0 12px ${({ theme }) => theme.colors.primary}cc;
  }
  &::-webkit-slider-thumb:active {
    cursor: grabbing;
    transform: scale(1.05);
  }

  /* ── Firefox ── */
  &::-moz-range-track {
    height: ${TRACK_H};
    border-radius: 7px;
    background: ${({ theme }) =>
      `linear-gradient(90deg, ${theme.colors.primary}44 0%, ${theme.colors.accent ?? theme.colors.primary}44 100%)`};
  }
  &::-moz-range-thumb {
    width: ${THUMB_W};
    height: ${THUMB_H};
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.primary};
    border: 3px solid ${({ theme }) => theme.colors.background};
    box-shadow: 0 0 6px ${({ theme }) => theme.colors.primary}88;
    cursor: grab;
  }
  &::-moz-range-thumb:hover {
    box-shadow: 0 0 12px ${({ theme }) => theme.colors.primary}cc;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    &::-webkit-slider-thumb { cursor: not-allowed; }
    &::-moz-range-thumb { cursor: not-allowed; }
  }
`;

const MixValue = styled.span`
  font-family: 'Courier New', monospace;
  font-size: 1.1rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  min-width: 56px;
  text-align: center;
  background: ${({ theme }) => theme.colors.background};
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;

const Hint = styled.p`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
  margin: 0;
`;

const SendingBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #10b981;
  padding: 4px 12px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  animation: sendPulse 1.2s ease-in-out infinite;

  @keyframes sendPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;


// ── Component ─────────────────────────────────────────────────────────────────

export function MutationEditor() {
  const { t } = useTranslation();
  const {
    sourceA,
    sourceB,
    mix,
    enabled,
    customName,
    setSourceA,
    setSourceB,
    setMix,
  } = useMutationStore();

  const { loadPatch } = usePatchStore();
  const { sendPatch, isSending, midi } = useMidiActions();

  const bothLoaded = sourceA !== null && sourceB !== null;

  // ── Effect: apply interpolation when both sources are loaded ──

  // Keep a ref to avoid stale closures in the effect
  const prevMutatedRef = useRef<string>('');

  useEffect(() => {
    if (!enabled || !sourceA || !sourceB) return;

    const mutated = interpolatePatch(sourceA, sourceB, mix);

    // Preserve user-edited name if set
    if (customName !== null) {
      mutated.name = customName;
    }

    // Avoid re-loading an identical patch (simple check on name + mix)
    const key = `${sourceA.name}|${sourceB.name}|${mix}|${customName ?? ''}`;
    if (key === prevMutatedRef.current) return;
    prevMutatedRef.current = key;

    loadPatch(mutated);
  }, [enabled, sourceA, sourceB, mix, customName, loadPatch]);

  // ── Handlers ──

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMix(parseFloat(e.target.value));
    },
    [setMix],
  );

  /** On pointer-up, push the interpolated patch to the PreenFM3 in one shot. */
  const handleSliderRelease = useCallback(() => {
    if (!enabled || !sourceA || !sourceB) return;
    if (!midi.selectedOutput) return;
    sendPatch({ exclude: MUTATION_EXCLUDED_NRPNS });
  }, [enabled, sourceA, sourceB, midi.selectedOutput, sendPatch]);

  // When a source is cleared, mutation auto-disables (derived from bothLoaded)
  const handleSourceA = useCallback(
    (patch: typeof sourceA) => {
      setSourceA(patch);
    },
    [setSourceA],
  );

  const handleSourceB = useCallback(
    (patch: typeof sourceB) => {
      setSourceB(patch);
    },
    [setSourceB],
  );

  // ── Render ──

  const mixPercent = Math.round(mix * 100);

  return (
    <Container>
      <Title>🧬 {t('mutation.title', 'Mutation de patch')}</Title>

      <SlotsRow>
        <PatchSlot label="A" patch={sourceA} onChange={handleSourceA} />
        <PatchSlot label="B" patch={sourceB} onChange={handleSourceB} />
      </SlotsRow>

      <ControlPanel>
        {!bothLoaded && (
          <Hint>
            {t(
              'mutation.loadBoth',
              'Chargez les deux patchs source pour activer la mutation.',
            )}
          </Hint>
        )}

        {bothLoaded && (
          <SliderRow>
            <SliderLabel $active={mix <= 0.5}>A</SliderLabel>
            <Slider
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mix}
              onChange={handleSlider}
              onPointerUp={handleSliderRelease}
              disabled={isSending}
            />
            <SliderLabel $active={mix > 0.5}>B</SliderLabel>
            <MixValue>{mixPercent}%</MixValue>
            {isSending && (
              <SendingBadge>
                ↻ {t('mutation.sending', 'Envoi…')}
              </SendingBadge>
            )}
          </SliderRow>
        )}

        {enabled && (
          <Hint>
            {t(
              'mutation.activeHint',
              'Le patch courant est l\'interpolation entre A et B. Déplacez le curseur pour muter.',
            )}
          </Hint>
        )}
      </ControlPanel>
    </Container>
  );
}
