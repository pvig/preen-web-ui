/**
 * PatchSlot — A slot that holds a source patch for the Mutation feature.
 *
 * The user can:
 *  - Load a .patch file from disk
 *  - Pull a patch from the PreenFM3 via MIDI
 *  - See the patch name and a summary
 *  - Clear the slot
 */

import React, { useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { loadPatchFile } from '../../midi/patchSerializer';
import { usePreenFM3Midi } from '../../midi/usePreenFM3Midi';
import { requestPatchDump, onNRPNScoped } from '../../midi/midiService';
import { PreenFM3Parser } from '../../midi/preenFM3Parser';
import type { Patch } from '../../types/patch';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PatchSlotProps {
  /** Label (e.g. "A" or "B") */
  label: string;
  /** Currently loaded patch, or null */
  patch: Patch | null;
  /** Callback when a patch is loaded or cleared */
  onChange: (patch: Patch | null) => void;
}

// ── Styled ────────────────────────────────────────────────────────────────────

const SlotContainer = styled.div<{ $hasData: boolean }>`
  flex: 1;
  min-width: 260px;
  max-width: 400px;
  border: 2px dashed ${({ theme, $hasData }) =>
    $hasData ? theme.colors.primary : theme.colors.border};
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: ${({ theme }) => theme.colors.panel};
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryHover};
  }
`;

const SlotLabel = styled.div`
  font-size: 1.1rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  text-transform: uppercase;
  letter-spacing: 0.1em;
  user-select: none;
`;

const PatchName = styled.div`
  font-size: 1rem;
  font-weight: 600;
  font-family: 'Courier New', monospace;
  color: ${({ theme }) => theme.colors.text};
  padding: 8px;
  background: ${({ theme }) => theme.colors.background};
  border-radius: 4px;
  text-align: center;
  min-height: 1.4em;
`;

const PatchInfo = styled.div`
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.4;
`;

const Empty = styled.div`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
  padding: 24px 0;
`;

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  flex: 1;
  min-width: 100px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid
    ${({ theme, $primary, $danger }) =>
      $danger
        ? theme.colors.adsrAttack ?? '#e74c3c'
        : $primary
        ? theme.colors.primary
        : theme.colors.border};
  background: ${({ theme, $primary, $danger }) =>
    $danger
      ? 'transparent'
      : $primary
      ? theme.colors.primary
      : theme.colors.button};
  color: ${({ theme, $primary, $danger }) =>
    $danger
      ? theme.colors.adsrAttack ?? '#e74c3c'
      : $primary
      ? '#fff'
      : theme.colors.text};
  font-weight: ${({ $primary }) => ($primary ? 600 : 400)};

  &:hover {
    background: ${({ theme, $primary }) =>
      $primary ? theme.colors.primaryHover : theme.colors.buttonHover};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export function PatchSlot({ label, patch, onChange }: PatchSlotProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const midi = usePreenFM3Midi();
  const [isPulling, setIsPulling] = useState(false);

  // ── Load from file ──

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const loaded = loadPatchFile(buffer);
        onChange(loaded);
      } catch (err) {
        console.error(`[PatchSlot ${label}] Erreur chargement .patch :`, err);
        alert(`Erreur lors du chargement : ${err}`);
      } finally {
        e.target.value = '';
      }
    },
    [label, onChange],
  );

  // ── Pull from PreenFM3 ──

  // Keep a ref to the unsubscribe function so we can clean up on unmount
  const unsubRef = useRef<(() => void) | null>(null);

  const handlePull = useCallback(() => {
    if (!midi.selectedInput) {
      alert(t('mutation.noMidiInput', 'Aucune entrée MIDI sélectionnée'));
      return;
    }

    // Clean up any previous listener for THIS slot
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }

    setIsPulling(true);
    const parser = new PreenFM3Parser();
    parser.reset();

    let timeout: number | null = null;
    let securityTimeout: number | null = null;

    const finish = () => {
      setIsPulling(false);
      if (timeout) clearTimeout(timeout);
      if (securityTimeout) clearTimeout(securityTimeout);
      // Remove only this slot's listener
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };

    const checkAndLoad = () => {
      const stats = parser.getStats();
      if (stats.count === 0) {
        alert(t('mutation.pullFailed', 'Aucune donnée reçue du PreenFM3.'));
        finish();
        return;
      }
      try {
        const p = parser.toPatch();
        onChange(p);
      } catch (err) {
        console.error(`[PatchSlot ${label}] Pull error:`, err);
        alert(`Erreur : ${err}`);
      }
      finish();
    };

    const listener = (nrpn: any, _channel: number) => {
      parser.addNRPN(nrpn);
      if (timeout) clearTimeout(timeout);
      timeout = window.setTimeout(checkAndLoad, 500);
    };

    // Use scoped listener — returns an unsubscribe function
    const unsub = onNRPNScoped(listener);
    if (!unsub) {
      alert(t('mutation.noMidiInput', 'Aucune entrée MIDI sélectionnée'));
      setIsPulling(false);
      return;
    }
    unsubRef.current = unsub;

    requestPatchDump(0, midi.channel);

    // Safety timeout 10s
    securityTimeout = window.setTimeout(() => {
      const stats = parser.getStats();
      if (stats.count > 0) checkAndLoad();
      else {
        alert(t('mutation.pullTimeout', 'Timeout : pas de réponse du PreenFM3.'));
        finish();
      }
    }, 10000);
  }, [midi, label, onChange, t]);

  // ── Render ──

  return (
    <SlotContainer $hasData={!!patch}>
      <SlotLabel>{t('mutation.source', 'Source')} {label}</SlotLabel>

      {patch ? (
        <>
          <PatchName>{patch.name}</PatchName>
          <PatchInfo>
            Algo {String(patch.algorithm.id)} • {patch.operators.length} ops
            {patch.lfos ? ` • ${patch.lfos.length} LFOs` : ''}
          </PatchInfo>
        </>
      ) : (
        <Empty>{t('mutation.emptySlot', 'Aucun patch chargé')}</Empty>
      )}

      <Actions>
        <Btn onClick={() => fileRef.current?.click()}>
          📂 {t('mutation.loadFile', 'Charger .patch')}
        </Btn>
        <Btn
          $primary
          onClick={handlePull}
          disabled={!midi.selectedInput || isPulling}
        >
          {isPulling ? '⏳' : '↓'} {t('mutation.pull', 'Pull MIDI')}
        </Btn>
        {patch && (
          <Btn $danger onClick={() => onChange(null)}>
            ✕ {t('mutation.clear', 'Vider')}
          </Btn>
        )}
      </Actions>

      <input
        ref={fileRef}
        type="file"
        accept=".patch,.syx"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </SlotContainer>
  );
}
