/**
 * PatchSlotRack
 * ──────────────────────────────────────────────────────────────────────────────
 * A compact horizontal rack of 4 temporary patch memory slots.
 *
 * Behaviour per slot:
 *   Empty   — clicking captures the current patch editor state into the slot.
 *   Filled  — clicking loads the stored patch into the editor.
 *             "×" button clears the slot.
 *             "→ A" / "→ B" buttons push the patch to the Breeder's parent slots.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useCurrentPatch } from '../stores/patchStore';
import { useWorkspaceStore, SLOT_COUNT } from '../stores/workspaceStore';

// ── Styled ────────────────────────────────────────────────────────────────────

const Rack = styled.div`
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
`;

const RackLabel = styled.span`
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textMuted};
  align-self: center;
  white-space: nowrap;
  margin-right: 4px;
`;

const SlotGroup = styled.div`
  display: flex;
  gap: 8px;
  flex: 1;
  flex-wrap: wrap;
`;

const SlotCard = styled.div<{ $filled: boolean; $expanded: boolean }>`
  position: relative;
  flex: 1;
  min-width: 110px;
  max-width: 200px;
  border: 1px solid ${({ $filled, theme }) =>
    $filled ? theme.colors.primary + '66' : theme.colors.border};
  border-radius: 8px;
  background: ${({ $filled, theme }) =>
    $filled ? theme.colors.primary + '0d' : theme.colors.button};
  transition: background 0.15s, border-color 0.15s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const SlotMain = styled.button<{ $filled: boolean }>`
  flex: 1;
  padding: 7px 10px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;

  &:hover { background: ${({ theme }) => theme.colors.buttonHover}; }
`;

const SlotIndex = styled.span`
  font-size: 0.68rem;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 1px 5px;
  flex-shrink: 0;
`;

const SlotName = styled.span<{ $filled: boolean }>`
  font-size: 0.78rem;
  font-weight: ${({ $filled }) => ($filled ? 600 : 400)};
  color: ${({ $filled, theme }) =>
    $filled ? theme.colors.text : theme.colors.textMuted};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
`;

const SlotActions = styled.div`
  display: flex;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const HelpBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textNotice};
  padding: 0 4px;
  line-height: 1;
  align-self: center;
  opacity: 0.8;
  &:hover { opacity: 1; color: ${({ theme }) => theme.colors.textNotice}; }
`;

const HelpOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
`;

const HelpPanel = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  max-width: 420px;
  width: 90%;
  padding: 20px 24px;
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  line-height: 1.6;

  h3 {
    margin: 0 0 12px;
    font-size: 15px;
  }

  ul {
    margin: 8px 0;
    padding-left: 20px;
  }

  li {
    margin-bottom: 4px;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const HelpCloseBtn = styled.button`
  display: block;
  margin: 16px auto 0;
  padding: 5px 20px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.button};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  font-size: 13px;

  &:hover {
    background: ${({ theme }) => theme.colors.buttonHover};
  }
`;

const ActionBtn = styled.button<{ $color?: string }>`
  flex: 1;
  padding: 3px 0;
  background: none;
  border: none;
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 600;
  color: ${({ $color, theme }) => $color ?? theme.colors.textMuted};

  &:last-child { border-right: none; }
  &:hover { background: ${({ theme }) => theme.colors.buttonHover}; }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export function PatchSlotRack() {
  const { t } = useTranslation();
  const currentPatch = useCurrentPatch();
  const { slots, saveToSlot, clearSlot, loadFromSlot, setBreedParentA, setBreedParentB } =
    useWorkspaceStore();

  /** Track which slot is showing its action bar (click on filled slot toggles it). */
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleSlotClick = (i: number) => {
    if (slots[i]) {
      // Toggle action bar / load directly
      if (expandedIdx === i) {
        // Second click → load into editor
        loadFromSlot(i);
        setExpandedIdx(null);
      } else {
        setExpandedIdx(i);
      }
    } else {
      // Empty slot — capture current patch
      saveToSlot(i, currentPatch);
      setExpandedIdx(i);
    }
  };

  const handleClear = (i: number, e: React.MouseEvent) => {
    e.stopPropagation();
    clearSlot(i);
    if (expandedIdx === i) setExpandedIdx(null);
  };

  return (
    <div>
    <Rack>
      <RackLabel>
        {t('slotRack.label')}
        <HelpBtn
          title={t('slotRack.helpTooltip')}
          onClick={() => setShowHelp(v => !v)}
        >
          ℹ
        </HelpBtn>
      </RackLabel>
      <SlotGroup>
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const patch = slots[i];
          const isExpanded = expandedIdx === i;
          return (
            <SlotCard key={i} $filled={!!patch} $expanded={isExpanded}>
              <SlotMain $filled={!!patch} onClick={() => handleSlotClick(i)}>
                <SlotIndex>{i + 1}</SlotIndex>
                <SlotName $filled={!!patch}>
                  {patch ? patch.name || t('slotRack.unnamed') : t('slotRack.capture')}
                </SlotName>
              </SlotMain>

              {patch && isExpanded && (
                <SlotActions>
                  <ActionBtn
                    $color="#10b981"
                    title={t('slotRack.loadTitle')}
                    onClick={() => { loadFromSlot(i); setExpandedIdx(null); }}
                  >
                    {t('slotRack.load')}
                  </ActionBtn>
                  <ActionBtn
                    $color="#818cf8"
                    title={t('slotRack.sendToATitle')}
                    onClick={() => setBreedParentA(JSON.parse(JSON.stringify(patch)))}
                  >
                    {t('slotRack.sendToA')}
                  </ActionBtn>
                  <ActionBtn
                    $color="#34d399"
                    title={t('slotRack.sendToBTitle')}
                    onClick={() => setBreedParentB(JSON.parse(JSON.stringify(patch)))}
                  >
                    {t('slotRack.sendToB')}
                  </ActionBtn>
                  <ActionBtn
                    $color="#f87171"
                    title={t('slotRack.clearTitle')}
                    onClick={(e) => handleClear(i, e)}
                  >
                    {t('slotRack.clear')}
                  </ActionBtn>
                </SlotActions>
              )}
            </SlotCard>
          );
        })}
      </SlotGroup>
    </Rack>
    {showHelp && (
      <HelpOverlay onClick={(e) => e.target === e.currentTarget && setShowHelp(false)}>
        <HelpPanel>
          <h3>{t('slotRack.help.title')}</h3>
          <ul>
            <li>{t('slotRack.help.emptySlot')}</li>
            <li>{t('slotRack.help.filledSlot')}</li>
            <li>{t('slotRack.help.load')}</li>
            <li>{t('slotRack.help.sendAB')}</li>
            <li>{t('slotRack.help.clear')}</li>
          </ul>
          <HelpCloseBtn onClick={() => setShowHelp(false)}>{t('slotRack.help.close')}</HelpCloseBtn>
        </HelpPanel>
      </HelpOverlay>
    )}
    </div>
  );
}
