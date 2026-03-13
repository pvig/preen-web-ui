/**
 * ReorderingComponent — Bank preset reorderer
 *
 * Inspired by the official preenfm2Controller ReorderingComponent (JUCE/C++)
 * by Xavier Hosxe: https://github.com/Ixox/preenfm2Controller
 *
 * @see PATCH_MANAGEMENT.md for binary format, firmware compatibility, and architecture overview.
 *
 * A PreenFM .bnk file is a flat binary of 128 presets × 1024 bytes each.
 * The preset name is stored as a null-terminated ASCII string at offset 0
 * within each 1024-byte block.
 *
 * This component lets the user:
 *  - View all 128 presets in an 8-column × 16-row grid
 *  - Drag-and-drop to swap preset positions
 *  - Double-click to rename a preset (12 chars max)
 *  - Save a new reordered .bnk file or cancel
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import styled from 'styled-components';

// ── Constants ────────────────────────────────────────────────────────────────

/** Bytes per preset block in a .bnk file */
export const PRESET_SIZE = 1024;
/** Total number of presets in a bank */
export const PRESET_COUNT = 128;
/** Maximum length of a preset name (null terminator not counted) */
export const NAME_MAX_LEN = 12;
/**
 * Byte offset of presetName[13] within FlashSynthParams (all fields are float = 4 bytes):
 *   engine1(16) + flashEngineIm1(16) + flashEngineIm2(16)
 *   + engineMix1-3 (3×16=48)
 *   + osc1-6 (6×16=96)
 *   + env1a-env6b (12×16=192)
 *   + matrixRow1-12 (12×16=192)
 *   + lfoOsc1-3 (3×16=48)
 *   + lfoEnv1+lfoEnv2+lfoSeq1+lfoSeq2 (4×16=64)
 *   + lfoSteps1+lfoSteps2 (2×16=32)
 *   = 720
 */
export const NAME_OFFSET = 720;
/** Grid layout */
const COLS = 8;
const ROWS = 16;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PresetSlot {
  /** Human-readable name (already decoded from binary) */
  name: string;
  /** Raw 1024-byte block — mutated in place for rename */
  data: Uint8Array;
}

interface Props {
  /** Raw contents of the loaded .bnk file */
  bankData: ArrayBuffer;
  /** Original filename (used to suggest a save name) */
  fileName: string;
  /** Called when the user clicks Cancel or after a successful Save */
  onClose: () => void;
}

// ── Styled components ─────────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 8px;
  width: 900px;
  max-width: 98vw;
  max-height: 96vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.backgroundSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
`;

const Title = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const Hint = styled.span<{ $dragging: boolean }>`
  font-size: 12px;
  color: ${({ theme, $dragging }) =>
    $dragging ? theme.colors.primary : theme.colors.textMuted};
`;

const Grid = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(${COLS}, 1fr);
  gap: 4px;
`;

const Cell = styled.div<{
  $dragOver: boolean;
  $dragging: boolean;
  $editing: boolean;
}>`
  position: relative;
  background: ${({ theme, $dragOver, $editing }) =>
    $dragOver
      ? theme.colors.primary + '44'
      : $editing
      ? theme.colors.backgroundSecondary
      : theme.colors.panel};
  border: 1px solid
    ${({ theme, $dragOver, $dragging }) =>
      $dragOver
        ? theme.colors.primary
        : $dragging
        ? theme.colors.accent
        : theme.colors.border};
  border-radius: 4px;
  padding: 4px 6px;
  cursor: ${({ $editing }) => ($editing ? 'text' : 'grab')};
  user-select: none;
  opacity: ${({ $dragging }) => ($dragging ? 0.4 : 1)};
  transition: background 0.1s, border-color 0.1s, opacity 0.1s;

  &:hover {
    border-color: ${({ theme, $dragOver }) =>
      $dragOver ? theme.colors.primary : theme.colors.borderHover};
  }
`;

const SlotIndex = styled.div`
  font-size: 9px;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1;
  margin-bottom: 2px;
`;

const SlotName = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Courier New', monospace;
`;

const NameInput = styled.input`
  font-size: 11px;
  font-family: 'Courier New', monospace;
  width: 100%;
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: 2px;
  padding: 1px 3px;
  margin-top: 2px;
  outline: none;
  box-sizing: border-box;
`;

const Warning = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.backgroundSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 6px 12px;
  text-align: center;
`;

const Footer = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 10px 16px;
  background: ${({ theme }) => theme.colors.backgroundSecondary};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  flex-shrink: 0;
`;

const Btn = styled.button<{ $primary?: boolean }>`
  padding: 6px 20px;
  border-radius: 4px;
  border: 1px solid
    ${({ theme, $primary }) =>
      $primary ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $primary }) =>
    $primary ? theme.colors.primary : theme.colors.button};
  color: ${({ theme, $primary }) =>
    $primary ? '#fff' : theme.colors.text};
  font-size: 13px;
  cursor: pointer;
  font-weight: ${({ $primary }) => ($primary ? 600 : 400)};

  &:hover {
    background: ${({ theme, $primary }) =>
      $primary ? theme.colors.primaryHover : theme.colors.buttonHover};
  }
`;

const ContextMenuWrap = styled.div`
  position: fixed;
  z-index: 1100;
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  min-width: 220px;
  overflow: hidden;
`;

const ContextMenuItem = styled.button`
  display: block;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.primary + '22'};
  }

  & + & {
    border-top: 1px solid ${({ theme }) => theme.colors.border};
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract a null-terminated ASCII name from a preset block */
export function readName(block: Uint8Array): string {
  let name = '';
  for (let i = NAME_OFFSET; i < NAME_OFFSET + NAME_MAX_LEN; i++) {
    const byte = block[i];
    if (byte === 0) break;
    name += String.fromCharCode(byte);
  }
  return name || '(empty)';
}

/** Write a name back into a preset block (in-place) */
export function writeName(block: Uint8Array, name: string): void {
  const truncated = name.slice(0, NAME_MAX_LEN);
  for (let i = 0; i < NAME_MAX_LEN; i++) {
    block[NAME_OFFSET + i] =
      i < truncated.length ? truncated.charCodeAt(i) & 0xff : 0;
  }
}

/** Parse a .bnk ArrayBuffer into an array of PresetSlot */
export function parseBankData(buffer: ArrayBuffer): PresetSlot[] {
  const bytes = new Uint8Array(buffer);
  const slots: PresetSlot[] = [];

  for (let p = 0; p < PRESET_COUNT; p++) {
    const start = p * PRESET_SIZE;
    // Copy the block so we own the data
    const data = bytes.slice(start, start + PRESET_SIZE);
    slots.push({ name: readName(data), data });
  }

  return slots;
}

/** Rebuild a bank ArrayBuffer from an ordered array of PresetSlot */
export function buildBankData(slots: PresetSlot[]): ArrayBuffer {
  const out = new Uint8Array(PRESET_COUNT * PRESET_SIZE);
  for (let i = 0; i < PRESET_COUNT; i++) {
    out.set(slots[i].data, i * PRESET_SIZE);
  }
  return out.buffer;
}

/** Suggest a new output filename (strip extension + any existing _reordered suffix, add suffix once) */
export function suggestFileName(original: string): string {
  const base = original.replace(/\.bnk$/i, '').replace(/(_reordered)+$/i, '');
  return base + '_reordered.bnk';
}

/** Swap two elements in an array (immutably) */
export function swapAt<T>(arr: T[], a: number, b: number): T[] {
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Check if a preset slot is empty (name bytes are all zero) */
export function isEmptySlot(data: Uint8Array): boolean {
  for (let i = NAME_OFFSET; i < NAME_OFFSET + NAME_MAX_LEN; i++) {
    if (data[i] !== 0) return false;
  }
  return true;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReorderingComponent({ bankData, fileName, onClose }: Props) {
  const [presets, setPresets] = useState<PresetSlot[]>(() => parseBankData(bankData));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<number | null>(null);

  // ── Drag-and-drop ──

  const handleDragStart = useCallback(
    (e: React.DragEvent, idx: number) => {
      setDragIndex(idx);
      e.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, idx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (idx !== dragIndex) setHoverIndex(idx);
    },
    [dragIndex]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, targetIdx: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== targetIdx) {
        setPresets((prev) => swapAt(prev, dragIndex, targetIdx));
      }
      setDragIndex(null);
      setHoverIndex(null);
    },
    [dragIndex]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setHoverIndex(null);
  }, []);

  // ── Rename (double-click) ──

  const beginEdit = useCallback(
    (idx: number) => {
      // Don't start editing while dragging
      if (dragIndex !== null) return;
      setEditingIndex(idx);
      setEditName(presets[idx].name === '(empty)' ? '' : presets[idx].name);
      setTimeout(() => inputRef.current?.select(), 0);
    },
    [dragIndex, presets]
  );

  const commitEdit = useCallback(() => {
    if (editingIndex === null) return;
    const newName = editName.trim().slice(0, NAME_MAX_LEN) || presets[editingIndex].name;
    setPresets((prev) => {
      const next = [...prev];
      const slot = { ...next[editingIndex], name: newName, data: next[editingIndex].data.slice() };
      writeName(slot.data, newName);
      next[editingIndex] = slot;
      return next;
    });
    setEditingIndex(null);
  }, [editingIndex, editName, presets]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commitEdit();
      if (e.key === 'Escape') setEditingIndex(null);
    },
    [commitEdit]
  );

  // ── Save helpers ──

  // ── Context menu (right-click) ──

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, idx: number) => {
      e.preventDefault();
      if (editingIndex !== null) return;
      setContextMenu({ index: idx, x: e.clientX, y: e.clientY });
    },
    [editingIndex]
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  // ── Replace a slot with a .patch file ──

  const handleReplaceClick = useCallback((idx: number) => {
    setReplaceTarget(idx);
    setContextMenu(null);
    setTimeout(() => replaceInputRef.current?.click(), 0);
  }, []);

  const handleReplaceFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || replaceTarget === null) return;
      try {
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength < PRESET_SIZE) {
          alert(`Fichier trop petit : ${buffer.byteLength} octets (attendu ${PRESET_SIZE})`);
          return;
        }
        const patchData = new Uint8Array(buffer, 0, PRESET_SIZE).slice();
        setPresets((prev) => {
          const next = [...prev];
          next[replaceTarget] = { name: readName(patchData), data: patchData };
          return next;
        });
      } finally {
        setReplaceTarget(null);
        e.target.value = '';
      }
    },
    [replaceTarget]
  );

  // ── Export a slot as .patch ──

  const handleExportSlot = useCallback(
    async (idx: number) => {
      setContextMenu(null);
      const slot = presets[idx];
      const slotName = slot.name === '(empty)' ? 'empty' : slot.name;
      const exportName = `${slotName.replace(/[^a-zA-Z0-9_-]/g, '_')}.patch`;

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: exportName,
            types: [
              {
                description: 'PreenFM3 Preset',
                accept: { 'application/octet-stream': ['.patch'] },
              },
            ],
          });
          const writable = await handle.createWritable();
          await writable.write(new Uint8Array(slot.data) as BlobPart);
          await writable.close();
          return;
        } catch {
          return;
        }
      }

      const blob = new Blob([new Uint8Array(slot.data)], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [presets]
  );

  // ── Import multiple .patch files into empty slots ──

  const handleImportPatches = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const patchDatas: Uint8Array[] = [];
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength >= PRESET_SIZE) {
          patchDatas.push(new Uint8Array(buffer, 0, PRESET_SIZE).slice());
        }
      }
      if (patchDatas.length === 0) return;

      setPresets((prev) => {
        const next = [...prev];
        let patchIdx = 0;
        for (let i = 0; i < PRESET_COUNT && patchIdx < patchDatas.length; i++) {
          if (isEmptySlot(next[i].data)) {
            next[i] = { name: readName(patchDatas[patchIdx]), data: patchDatas[patchIdx] };
            patchIdx++;
          }
        }
        if (patchIdx < patchDatas.length) {
          alert(
            `${patchDatas.length - patchIdx} patch(s) non importé(s) : plus de slots vides disponibles.`
          );
        }
        return next;
      });

      e.target.value = '';
    },
    []
  );

  const buildBlob = useCallback(() => {
    return new Blob([buildBankData(presets)], { type: 'application/octet-stream' });
  }, [presets]);

  /** Fallback: triggers a browser download (may add "(1)" if file already exists) */
  const triggerDownload = useCallback(
    (name: string) => {
      const url = URL.createObjectURL(buildBlob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name.endsWith('.bnk') ? name : name + '.bnk';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    },
    [buildBlob, onClose]
  );

  /** Core save: opens showSaveFilePicker with the given suggested name. */
  /** Save — dialog pré-rempli avec le nom original. */
  const handleSave = useCallback(async () => {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'PreenFM Bank', accept: { 'application/octet-stream': ['.bnk'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(buildBlob());
        await writable.close();
        onClose();
      } catch { /* annulé */ }
      return;
    }
    triggerDownload(fileName);
  }, [fileName, buildBlob, triggerDownload, onClose]);

  /** Save As — dialog pré-rempli avec un nom _reordered. */
  const handleSaveAs = useCallback(async () => {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestFileName(fileName),
          types: [{ description: 'PreenFM Bank', accept: { 'application/octet-stream': ['.bnk'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(buildBlob());
        await writable.close();
        onClose();
      } catch { /* annulé */ }
      return;
    }
    triggerDownload(suggestFileName(fileName));
  }, [fileName, buildBlob, triggerDownload, onClose]);

  const hasFilePicker = 'showSaveFilePicker' in window;

  // ── Render ──

  const isDragging = dragIndex !== null;

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Panel>
        <Header>
          <Title>Réorganiser la bank — {fileName}</Title>
          <Hint $dragging={isDragging}>
            {isDragging
              ? 'Déposez sur la position cible...'
              : 'Glisser-déposer • Double-clic renommer • Clic-droit importer/exporter'}
          </Hint>
        </Header>

        <Grid>
          {presets.map((slot, idx) => {
            const col = Math.floor(idx / ROWS); // column-major: same as JUCE (col*16+row)
            const row = idx % ROWS;
            const gridCol = col + 1;
            const gridRow = row + 1;
            const isBeingDragged = dragIndex === idx;
            const isDragTarget = hoverIndex === idx && dragIndex !== null && dragIndex !== idx;
            const isEditing = editingIndex === idx;

            return (
              <Cell
                key={idx}
                style={{ gridColumn: gridCol, gridRow: gridRow }}
                $dragging={isBeingDragged}
                $dragOver={isDragTarget}
                $editing={isEditing}
                draggable={!isEditing}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onDoubleClick={() => beginEdit(idx)}
                onContextMenu={(e) => handleContextMenu(e, idx)}
                title={`Position ${idx + 1} — double-clic pour renommer, clic-droit pour importer/exporter`}
              >
                <SlotIndex>{idx + 1}</SlotIndex>
                {isEditing ? (
                  <NameInput
                    ref={inputRef}
                    value={editName}
                    maxLength={NAME_MAX_LEN}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={commitEdit}
                    autoFocus
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <SlotName title={slot.name}>{slot.name}</SlotName>
                )}
              </Cell>
            );
          })}
        </Grid>

        {/* Context menu (right-click on a slot) */}
        {contextMenu && (
          <ContextMenuWrap
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <ContextMenuItem onClick={() => handleReplaceClick(contextMenu.index)}>
              📥 Remplacer par un .patch…
            </ContextMenuItem>
            <ContextMenuItem onClick={() => handleExportSlot(contextMenu.index)}>
              📤 Exporter en .patch
            </ContextMenuItem>
          </ContextMenuWrap>
        )}

        {/* Hidden file inputs for patch import/replace */}
        <input
          ref={replaceInputRef}
          type="file"
          accept=".patch,.syx"
          style={{ display: 'none' }}
          onChange={handleReplaceFile}
        />
        <input
          ref={importInputRef}
          type="file"
          accept=".patch,.syx"
          multiple
          style={{ display: 'none' }}
          onChange={handleImportPatches}
        />

        <Footer>
          {!hasFilePicker && (
            <Warning>
              Votre navigateur ne supporte pas l'enregistrement natif. Activez « File System Access API » dans brave://flags pour sauvegarder directement.
            </Warning>
          )}
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn onClick={() => importInputRef.current?.click()}>Importer .patch</Btn>
          <Btn onClick={handleSave}>Sauvegarder</Btn>
          <Btn $primary onClick={handleSaveAs}>Sauvegarder sous…</Btn>
        </Footer>
      </Panel>
    </Overlay>
  );
}
