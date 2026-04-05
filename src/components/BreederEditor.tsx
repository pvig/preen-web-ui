/**
 * BreederEditor
 * ──────────────────────────────────────────────────────────────────────────────
 * Genetic algorithm UI for evolving new PreenFM3 patches from two parents.
 *
 * Workflow:
 *   1. Load a patch into Parent A and Parent B slots (from the current editor).
 *   2. Adjust the Mutation Rate slider.
 *   3. Click "Generate Children" — 4 offspring are created via crossover + mutation.
 *   4. For each child:
 *        ▶ Listen  — send to PreenFM3 via MIDI without touching the editor.
 *        A / B     — promote the child to Parent A or Parent B.
 *        Load      — load the child into the main patch editor.
 *        ⬇ Save   — download as a .patch file.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useCurrentPatch, usePatchStore } from '../stores/patchStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useMidiStore } from '../midi/usePreenFM3Midi';
import { patchToNRPNMessages, downloadPatchFile } from '../midi/patchSerializer';
import { sendNRPN, clearNRPNQueue, drainNRPNQueue } from '../midi/midiService';
import { generateChildren, type BreedResult, type DNABlock } from '../utils/geneticAlgorithm';
import type { Patch } from '../types/patch';

// ─── Styled components ────────────────────────────────────────────────────────

const Section = styled.section`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  letter-spacing: 0.03em;
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 0.72rem;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.5;
`;

// ── Parents row ───────────────────────────────────────────────────────

const ParentsRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 40px 1fr;
  gap: 8px;
  align-items: center;
`;

const CrossIcon = styled.div`
  font-size: 1.4rem;
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
  user-select: none;
`;

const ParentSlot = styled.div<{ $filled: boolean }>`
  background: ${({ $filled, theme }) =>
    $filled ? `${theme.colors.primary}12` : theme.colors.backgroundSecondary};
  border: 1.5px dashed ${({ $filled, theme }) =>
    $filled ? theme.colors.primary : theme.colors.border};
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.2s, background 0.2s;
  min-height: 90px;
`;

const SlotLabel = styled.div`
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const SlotName = styled.div`
  font-size: 0.82rem;
  font-family: monospace;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SlotMeta = styled.div`
  font-size: 0.67rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const SlotEmpty = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textMuted};
  font-style: italic;
  flex: 1;
  display: flex;
  align-items: center;
`;

const SlotActions = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 2px;
`;

// ── Controls ──────────────────────────────────────────────────────────

const ControlsRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

const MutationRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 180px;
`;

const ControlLabel = styled.span`
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

const MutationSlider = styled.input`
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: ${({ theme }) => theme.colors.button};
  border: 1px solid ${({ theme }) => theme.colors.border};
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.primary};
    border: 2px solid ${({ theme }) => theme.colors.panel};
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }
  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.primary};
    border: 2px solid ${({ theme }) => theme.colors.panel};
    cursor: pointer;
  }
`;

const MutationValue = styled.span`
  font-size: 0.76rem;
  font-family: monospace;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  min-width: 32px;
  text-align: right;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'ghost' | 'default' }>`
  padding: 6px 14px;
  border: 1px solid ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.primary :
    $variant === 'danger'  ? '#ef4444' :
    theme.colors.border};
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
  background: ${({ $variant, theme }) =>
    $variant === 'primary' ? theme.colors.primary :
    $variant === 'danger'  ? '#ef4444' :
    $variant === 'ghost'   ? 'transparent' :
    theme.colors.button};
  color: ${({ $variant, theme }) =>
    $variant === 'primary' || $variant === 'danger' ? '#fff' : theme.colors.text};
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.8; }
`;

// ── Generate button ───────────────────────────────────────────────────

const GenerateBtn = styled(Btn)`
  padding: 9px 24px;
  font-size: 0.9rem;
  letter-spacing: 0.03em;
`;

// ── Children grid ─────────────────────────────────────────────────────

const ChildrenGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
`;

const ChildCard = styled.div<{ $sending: boolean; $active: boolean }>`
  background: ${({ $active, theme }) =>
    $active ? `${theme.colors.primary}18` : theme.colors.backgroundSecondary};
  border: 1.5px solid ${({ $sending, $active, theme }) =>
    $sending ? '#f59e0b' :
    $active   ? theme.colors.primary :
    theme.colors.border};
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s, background 0.2s;
`;

const ChildName = styled.div`
  font-size: 0.82rem;
  font-family: monospace;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChildMeta = styled.div`
  font-size: 0.67rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.6;
`;

const BlockBadges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
`;

const BlockBadge = styled.span<{ $src: 'A' | 'B' }>`
  font-size: 0.58rem;
  font-family: monospace;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.03em;
  background: ${({ $src }) => $src === 'A' ? '#6366f122' : '#10b98122'};
  color:       ${({ $src }) => $src === 'A' ? '#818cf8'  : '#34d399'  };
  border: 1px solid ${({ $src }) => $src === 'A' ? '#6366f144' : '#10b98144'};
`;

const CardActions = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
`;

const CardBtn = styled.button<{ $variant?: 'listen' | 'parentA' | 'parentB' | 'load' | 'save' }>`
  flex: 1;
  min-width: 0;
  padding: 4px 2px;
  font-size: 0.67rem;
  font-weight: 600;
  border-radius: 4px;
  border: 1px solid ${({ $variant }) =>
    $variant === 'listen'  ? '#f59e0b44' :
    $variant === 'parentA' ? '#818cf844' :
    $variant === 'parentB' ? '#34d39944' :
    $variant === 'load'    ? '#a78bfa44' :
    '#ffffff22'};
  background: ${({ $variant }) =>
    $variant === 'listen'  ? '#f59e0b18' :
    $variant === 'parentA' ? '#6366f118' :
    $variant === 'parentB' ? '#10b98118' :
    $variant === 'load'    ? '#8b5cf618' :
    '#ffffff0a'};
  color: ${({ $variant }) =>
    $variant === 'listen'  ? '#f59e0b' :
    $variant === 'parentA' ? '#818cf8' :
    $variant === 'parentB' ? '#34d399' :
    $variant === 'load'    ? '#c4b5fd' :
    '#aaaaaa'};
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.75; }
  &:disabled { opacity: 0.3; cursor: not-allowed; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BLOCK_LABELS: DNABlock[] = ['ALGO', 'OSC', 'ENV', 'MATRIX', 'FILTER1', 'FILTER2'];

function algoLabel(patch: Patch): string {
  return `ALGO #${patch.algorithm?.id ?? '?'}`;
}

function patchMeta(patch: Patch): string {
  const ops = patch.operators?.filter(o => o.enabled).length ?? 0;
  return `${algoLabel(patch)} · ${ops} ops`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BreederEditor() {
  const { t } = useTranslation();
  const currentPatch  = useCurrentPatch();
  const { loadPatch } = usePatchStore();
  const midiChannel   = useMidiStore(s => s.channel);
  const midiOutput    = useMidiStore(s => s.selectedOutput);

  const parentA    = useWorkspaceStore(s => s.breedParentA);
  const parentB    = useWorkspaceStore(s => s.breedParentB);
  const setParentA = useWorkspaceStore(s => s.setBreedParentA);
  const setParentB = useWorkspaceStore(s => s.setBreedParentB);
  const saveToSlot = useWorkspaceStore(s => s.saveToSlot);
  const slots      = useWorkspaceStore(s => s.slots);
  const [mutationRate, setMutationRate] = useState(0.10);   // 10 %
  const [children,     setChildren]     = useState<BreedResult[]>([]);
  const [activeIdx,    setActiveIdx]    = useState<number | null>(null);
  const [sendingIdx,   setSendingIdx]   = useState<number | null>(null);
  const [generating,   setGenerating]   = useState(false);

  // ── MIDI send ─────────────────────────────────────────────────────────────

  const sendPatch = useCallback(async (patch: Patch, idx: number) => {
    if (!midiOutput) return;
    setSendingIdx(idx);
    setActiveIdx(idx);
    clearNRPNQueue();
    for (const msg of patchToNRPNMessages(patch)) sendNRPN(msg, midiChannel);
    await drainNRPNQueue();
    setSendingIdx(null);
  }, [midiOutput, midiChannel]);

  // ── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (!parentA || !parentB) return;
    setGenerating(true);
    setActiveIdx(null);
    setTimeout(() => {
      const results = generateChildren(parentA, parentB, 4, mutationRate);
      setChildren(results);
      setGenerating(false);
    }, 0);
  }, [parentA, parentB, mutationRate]);

  // ── Load current patch into a parent slot ─────────────────────────────────

  const loadIntoSlot = useCallback((slot: 'A' | 'B') => {
    if (!currentPatch) return;
    const snap: Patch = JSON.parse(JSON.stringify(currentPatch));
    if (slot === 'A') setParentA(snap);
    else              setParentB(snap);
    setChildren([]);
    setActiveIdx(null);
  }, [currentPatch]);

  // ── Promote child to parent slot ──────────────────────────────────────────

  const promoteChild = useCallback((result: BreedResult, slot: 'A' | 'B') => {
    const snap: Patch = JSON.parse(JSON.stringify(result.patch));
    if (slot === 'A') setParentA(snap);
    else              setParentB(snap);
    setChildren([]);
    setActiveIdx(null);
  }, []);

  // ── Load child into editor ────────────────────────────────────────────────

  const loadChild = useCallback(async (result: BreedResult, idx: number) => {
    loadPatch(result.patch);
    await sendPatch(result.patch, idx);
  }, [loadPatch, sendPatch]);

  // ── Save child as file ────────────────────────────────────────────────────

  const saveChild = useCallback((result: BreedResult) => {
    downloadPatchFile(result.patch);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const canGenerate = !!(parentA && parentB);
  const canListen   = !!midiOutput;

  return (
    <Section>
      {/* Header */}
      <Header>
        <Title>{t('breeder.title')}</Title>
        <Subtitle>{t('breeder.subtitle')}</Subtitle>
      </Header>

      {/* Parents */}
      <ParentsRow>
        {/* Parent A */}
        <ParentSlot $filled={!!parentA}>
          <SlotLabel>{t('breeder.parentA')}</SlotLabel>
          {parentA ? (
            <>
              <SlotName title={parentA.name}>{parentA.name}</SlotName>
              <SlotMeta>{patchMeta(parentA)}</SlotMeta>
            </>
          ) : (
            <SlotEmpty>{t('breeder.nopatch')}</SlotEmpty>
          )}
          <SlotActions>
            <Btn $variant="ghost" style={{ flex: 1 }} onClick={() => loadIntoSlot('A')}>
              {t('breeder.loadFromEditor')}
            </Btn>
            {parentA && (
              <Btn $variant="ghost" onClick={() => { setParentA(null); setChildren([]); }}>
                ✕
              </Btn>
            )}
          </SlotActions>
          <SlotActions>
            {slots.map((s, i) => (
              <Btn
                key={i}
                $variant="ghost"
                style={{ flex: 1, opacity: s ? 1 : 0.35 }}
                disabled={!s}
                title={s ? t('breeder.slotTitle', { name: s.name, index: i + 1 }) : t('breeder.slotEmpty', { index: i + 1 })}
                onClick={() => {
                  if (!s) return;
                  setParentA(JSON.parse(JSON.stringify(s)));
                  setChildren([]);
                  setActiveIdx(null);
                }}
              >
                S{i + 1}
              </Btn>
            ))}
          </SlotActions>
        </ParentSlot>

        <CrossIcon>✕</CrossIcon>

        {/* Parent B */}
        <ParentSlot $filled={!!parentB}>
          <SlotLabel>{t('breeder.parentB')}</SlotLabel>
          {parentB ? (
            <>
              <SlotName title={parentB.name}>{parentB.name}</SlotName>
              <SlotMeta>{patchMeta(parentB)}</SlotMeta>
            </>
          ) : (
            <SlotEmpty>{t('breeder.nopatch')}</SlotEmpty>
          )}
          <SlotActions>
            <Btn $variant="ghost" style={{ flex: 1 }} onClick={() => loadIntoSlot('B')}>
              {t('breeder.loadFromEditor')}
            </Btn>
            {parentB && (
              <Btn $variant="ghost" onClick={() => { setParentB(null); setChildren([]); }}>
                ✕
              </Btn>
            )}
          </SlotActions>
          <SlotActions>
            {slots.map((s, i) => (
              <Btn
                key={i}
                $variant="ghost"
                style={{ flex: 1, opacity: s ? 1 : 0.35 }}
                disabled={!s}
                title={s ? t('breeder.slotTitle', { name: s.name, index: i + 1 }) : t('breeder.slotEmpty', { index: i + 1 })}
                onClick={() => {
                  if (!s) return;
                  setParentB(JSON.parse(JSON.stringify(s)));
                  setChildren([]);
                  setActiveIdx(null);
                }}
              >
                S{i + 1}
              </Btn>
            ))}
          </SlotActions>
        </ParentSlot>
      </ParentsRow>

      {/* Controls */}
      <ControlsRow>
        <MutationRow>
          <ControlLabel>{t('breeder.mutation')}</ControlLabel>
          <MutationSlider
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={mutationRate}
            onChange={e => setMutationRate(parseFloat(e.target.value))}
          />
          <MutationValue>{Math.round(mutationRate * 100)}%</MutationValue>
        </MutationRow>

        <GenerateBtn
          $variant="primary"
          disabled={!canGenerate || generating}
          onClick={handleGenerate}
        >
          {generating ? t('breeder.generating') : t('breeder.generate')}
        </GenerateBtn>
      </ControlsRow>

      {/* Children */}
      {children.length > 0 && (
        <ChildrenGrid>
          {children.map((result, idx) => (
            <ChildCard
              key={idx}
              $sending={sendingIdx === idx}
              $active={activeIdx === idx}
            >
              <ChildName title={result.patch.name}>{result.patch.name}</ChildName>

              <ChildMeta>{algoLabel(result.patch)}</ChildMeta>

              {/* Block provenance badges */}
              <BlockBadges>
                {BLOCK_LABELS.map(block => (
                  <BlockBadge key={block} $src={result.blocks[block]}>
                    {block}:{result.blocks[block]}
                  </BlockBadge>
                ))}
              </BlockBadges>

              <CardActions>
                <CardBtn
                  $variant="listen"
                  disabled={!canListen || sendingIdx !== null}
                  onClick={() => sendPatch(result.patch, idx)}
                  title={t('breeder.listenTitle')}
                >
                  {sendingIdx === idx ? t('breeder.listening') : t('breeder.listen')}
                </CardBtn>
              </CardActions>

              <CardActions>
                <CardBtn
                  $variant="parentA"
                  onClick={() => promoteChild(result, 'A')}
                  title={t('breeder.setAsATitle')}
                >
                  {t('breeder.setAsA')}
                </CardBtn>
                <CardBtn
                  $variant="parentB"
                  onClick={() => promoteChild(result, 'B')}
                  title={t('breeder.setAsBTitle')}
                >
                  {t('breeder.setAsB')}
                </CardBtn>
                <CardBtn
                  $variant="load"
                  onClick={() => loadChild(result, idx)}
                  title={t('breeder.loadTitle')}
                >
                  {t('breeder.load')}
                </CardBtn>
                <CardBtn
                  onClick={() => saveChild(result)}
                  title={t('breeder.saveTitle')}
                >
                  ⬇
                </CardBtn>
              </CardActions>
              <CardActions>
                {[0, 1, 2, 3].map(si => (
                  <CardBtn
                    key={si}
                    onClick={() => saveToSlot(si, JSON.parse(JSON.stringify(result.patch)))}
                    title={t('breeder.saveToSlotTitle', { index: si + 1 })}
                  >
                    → S{si + 1}
                  </CardBtn>
                ))}
              </CardActions>
            </ChildCard>
          ))}
        </ChildrenGrid>
      )}
    </Section>
  );
}
