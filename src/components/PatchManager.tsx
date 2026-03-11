// src/components/PatchManager.tsx
// @see PATCH_MANAGEMENT.md for binary format, firmware compatibility, and architecture overview.
import { useState, useRef } from 'react';
import styled from 'styled-components';
import { useCurrentPatch, usePatchStore } from '../stores/patchStore';
import ReorderingComponent from './ReorderingComponent';
import { downloadPatchFile, loadPatchFile } from '../midi/patchSerializer';

interface BankState {
  data: ArrayBuffer;
  fileName: string;
}

// ── Shared styled components ──────────────────────────────────────────────────

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  padding: 16px 20px;
`;

const PanelTitle = styled.h3`
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  gap: 6px;
`;

const Btn = styled.button`
  padding: 6px 16px;
  border-radius: 4px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.button};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.buttonHover};
  }
`;

// ── Help modal styled components ──────────────────────────────────────────────

const HelpBtn = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 50%;
  width: 22px;
  height: 22px;
  font-size: 13px;
  line-height: 1;
  color: ${({ theme }) => theme.colors.textMuted};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    border-color: ${({ theme }) => theme.colors.primary};
  }
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
  max-width: 520px;
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
  }

  code {
    background: ${({ theme }) => theme.colors.backgroundSecondary};
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 12px;
  }

  p {
    margin: 8px 0;
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

// ── Patch Save Panel ──────────────────────────────────────────────────────────

export function PatchSavePanel() {
  const { loadPatch } = usePatchStore();
  const currentPatch = useCurrentPatch();

  const handleSavePatch = async () => {
    await downloadPatchFile(currentPatch);
  };

  const handleLoad = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const patch = loadPatchFile(buffer);
      loadPatch(patch);
    } catch (err) {
      console.error('[PatchManager] Erreur chargement .patch :', err);
      alert(`Erreur : ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <Panel>
      <PanelTitle>Patch courant</PanelTitle>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn onClick={handleSavePatch}>Sauvegarder le patch en .patch</Btn>
        <label style={{ cursor: 'pointer' }}>
          <Btn as="span">Charger un patch (.patch)</Btn>
          <input
            type="file"
            accept=".patch,.syx"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleLoad(e.target.files[0])}
          />
        </label>
      </div>
    </Panel>
  );
}

// ── Bank Organizer Panel ──────────────────────────────────────────────────────

export function BankOrganizerPanel() {
  const bankInputRef = useRef<HTMLInputElement>(null);
  const [bank, setBank] = useState<BankState | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const openBankFile = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'PreenFM Bank', accept: { 'application/octet-stream': ['.bnk'] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        const buffer = await file.arrayBuffer();
        setBank({ data: buffer, fileName: file.name });
        return;
      } catch {
        return;
      }
    }
    bankInputRef.current?.click();
  };

  const handleBankFileFallback = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        setBank({ data: buffer, fileName: file.name });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Panel>
      <PanelTitle>
        Organiser une bank
        <HelpBtn onClick={() => setShowHelp(true)} title="Mode d'emploi">?</HelpBtn>
      </PanelTitle>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <Btn onClick={openBankFile}>Ouvrir un fichier .bnk</Btn>
        <input
          ref={bankInputRef}
          type="file"
          accept=".bnk"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleBankFileFallback(file);
            e.target.value = '';
          }}
        />
      </div>

      {/* Reordering modal */}
      {bank && (
        <ReorderingComponent
          bankData={bank.data}
          fileName={bank.fileName}
          onClose={() => setBank(null)}
        />
      )}

      {/* Help modal */}
      {showHelp && (
        <HelpOverlay onClick={(e) => e.target === e.currentTarget && setShowHelp(false)}>
          <HelpPanel>
            <h3>Organiser une bank PreenFM (.bnk)</h3>
            <p>
              Ce module permet de réorganiser les 128 presets d'un fichier <code>.bnk</code>&nbsp;:
            </p>
            <ul>
              <li><strong>Glisser-déposer</strong> un preset sur un autre pour échanger leurs positions.</li>
              <li><strong>Double-cliquer</strong> sur un preset pour le renommer (12 caractères max).</li>
            </ul>

            <h3>Sauvegarde</h3>
            <ul>
              <li><strong>Sauvegarder</strong> — ouvre le dialogue de l'OS avec le nom d'origine pré-rempli ; vous pouvez écraser le fichier directement.</li>
              <li><strong>Sauvegarder sous…</strong> — même dialogue mais avec un nom <code>_reordered</code> pour conserver l'original.</li>
            </ul>

            <h3>⚠ Prérequis navigateur</h3>
            <p>
              Pour que la sauvegarde fonctionne correctement (écriture directe sur le disque,
              sans fichier numéroté <code>(1)</code>, <code>(2)</code>…), le navigateur
              doit supporter la <strong>File System Access API</strong>&nbsp;:
            </p>
            <ul>
              <li><strong>Chrome / Edge</strong> — supporté nativement.</li>
              <li><strong>Brave</strong> — ouvrir <code>brave://flags/#file-system-access-api</code>, passer sur <strong>Enabled</strong> puis relancer.</li>
              <li><strong>Firefox / Safari</strong> — non supporté ; le téléchargement se fera dans le dossier par défaut.</li>
            </ul>
            <HelpCloseBtn onClick={() => setShowHelp(false)}>Fermer</HelpCloseBtn>
          </HelpPanel>
        </HelpOverlay>
      )}
    </Panel>
  );
}

// ── Default export (backward compat) ─────────────────────────────────────────

export default function PatchManager() {
  return (
    <>
      <PatchSavePanel />
      <BankOrganizerPanel />
    </>
  );
}