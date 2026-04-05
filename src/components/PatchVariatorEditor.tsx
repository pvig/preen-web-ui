/**
 * PatchVariatorEditor
 * ──────────────────────────────────────────────────────────────────────────────
 * Generates patch variations from the current patch using the PatchVariator
 * engine (src/ml/patchVariator.ts).
 *
 * Without neural weights (default): uses principled Gaussian perturbation
 * directly in the FM parameter space, respecting the musical hierarchy.
 *
 * Intensity controls variation depth:
 *   subtle   → amplitudes & sustain only (subtle tonal refinements)
 *   balanced → ADSR times + frequency ratios (harmonic shifts)
 *   radical  → algorithm topology (structural mutations)
 *
 * Dimension locks prevent specific mutation groups from being altered during
 * generation, regardless of intensity level.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useCurrentPatch, usePatchStore } from '../stores/patchStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useMidiStore } from '../midi/usePreenFM3Midi';
import { patchToNRPNMessages } from '../midi/patchSerializer';
import { sendNRPN, clearNRPNQueue, drainNRPNQueue } from '../midi/midiService';
import { generateVariations, variator, patchToParamVector, computeDescriptors, type VariatorDimension, type TimbralDescriptors } from '../ml/patchVariator';
import type { Patch } from '../types/patch';
// ── Descriptor config ────────────────────────────────────────────────────────────

const DESCRIPTOR_CONFIG: {
  key:   keyof TimbralDescriptors;
  label: string;
  low:   string;
  high:  string;
}[] = [
  { key: 'luminosite', label: 'Luminosité', low: 'sombre',    high: 'brillant'   },
  { key: 'rugosite',   label: 'Rugosité',   low: 'doux',      high: 'rugueux'    },
  { key: 'metal',      label: 'Métal',      low: 'organique', high: 'métallique' },
  { key: 'epaisseur',  label: 'Épaisseur',  low: 'fin',       high: 'épais'       },
  { key: 'mouvement',  label: 'Mouvement',  low: 'statique',  high: 'animé'      },
  { key: 'poids',      label: 'Poids',      low: 'léger',     high: 'lourd'      },
];

const DEFAULT_DESCRIPTORS: TimbralDescriptors = {
  luminosite: 0.5, rugosite: 0.5, metal: 0.5,
  epaisseur:  0.5, mouvement: 0.5, poids: 0.5,
};
// ── Styled components ─────────────────────────────────────────────────────────

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

const SourceBadge = styled.span`
  font-size: 0.78rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
  background: ${({ theme }) => theme.colors.button};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 2px 8px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

// ── Intensity selector ───────────────────────────────────

const IntensityRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const IntensityLabel = styled.span`
  font-size: 0.76rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

const IntensityBtns = styled.div`
  display: flex;
  gap: 4px;
  flex: 1;
`;

const IntensityBtn = styled.button<{ $active: boolean; $color: string }>`
  flex: 1;
  padding: 5px 0;
  border-radius: 5px;
  border: 1.5px solid ${({ $color }) => $color};
  background: ${({ $active, $color }) => $active ? $color : 'transparent'};
  color: ${({ $active, $color }) => $active ? '#fff' : $color};
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  opacity: ${({ $active }) => $active ? 1 : 0.45};
  transition: opacity 0.15s, background 0.15s;
  &:hover { opacity: 1; }
`;

// ── Dimension locks ───────────────────────────────────────

const DimRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const DimLabel = styled.span`
  font-size: 0.76rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

const DimChips = styled.div`
  display: flex;
  gap: 4px;
  flex: 1;
`;

const DimChip = styled.button<{ $color: string; $locked: boolean }>`
  flex: 1;
  padding: 3px 0;
  border-radius: 4px;
  border: 1px solid ${({ $color, $locked }) => $locked ? '#555' : $color};
  background: ${({ $color, $locked }) => $locked ? 'transparent' : `${$color}22`};
  color: ${({ $color, $locked }) => $locked ? '#555' : $color};
  font-size: 0.65rem;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  opacity: ${({ $locked }) => $locked ? 0.5 : 1};
  text-decoration: ${({ $locked }) => $locked ? 'line-through' : 'none'};
  transition: opacity 0.15s;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  &:hover { opacity: 1; }
`;

// ── Status row ────────────────────────────────────────────

const StatusRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`;

const StatusTag = styled.span`
  font-size: 0.7rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 3px 8px;
`;

// ── Descriptor section ─────────────────────────────────────────────────────

const DescSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const DescHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const DescToggleBtn = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: ${({ theme }) => theme.colors.textMuted};
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const SmallResetBtn = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 4px;
  padding: 1px 9px;
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.textMuted};
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const DescGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 20px;
  @media (max-width: 480px) { grid-template-columns: 1fr; }
`;

const DescItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const DescLabelRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const DescName = styled.span`
  font-size: 0.69rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const DescVal = styled.span<{ $biased: boolean }>`
  font-size: 0.67rem;
  font-family: monospace;
  color: ${({ $biased, theme }) => $biased ? theme.colors.primary : theme.colors.textMuted};
  font-weight: ${({ $biased }) => $biased ? 700 : 400};
`;

const DescBiasArrow = styled.span<{ $positive: boolean }>`
  color: ${({ $positive }) => $positive ? '#10b981' : '#6366f1'};
  font-size: 0.6rem;
`;

const DescSliderWrap = styled.div`
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
`;

const DescSlider = styled.input<{ $value: number }>`
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    ${({ theme }) => theme.colors.primary} ${({ $value }) => $value * 100}%,
    ${({ theme }) => theme.colors.button}  ${({ $value }) => $value * 100}%
  );
  border: 1px solid ${({ theme }) => theme.colors.border};
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.primary};
    border: 2px solid ${({ theme }) => theme.colors.panel};
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }

  &::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.primary};
    border: 2px solid ${({ theme }) => theme.colors.panel};
    cursor: pointer;
  }
`;

const DescCurrentMark = styled.div<{ $pct: number }>`
  position: absolute;
  bottom: 0;
  left: ${({ $pct }) => $pct * 100}%;
  transform: translateX(-50%);
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #6366f1;
  pointer-events: none;
  transition: left 0.15s ease;
`;

const DescHints = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.57rem;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 6px;
  font-style: italic;
  opacity: 0.7;
`;

// ── Controls row ──────────────────────────────────────────

const ControlsRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'default' }>`
  padding: 7px 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  background: ${({ $variant, theme }) =>
    $variant === 'primary' ? theme.colors.primary :
    $variant === 'danger'  ? '#ef4444' :
    theme.colors.button};
  color: ${({ $variant, theme }) =>
    $variant === 'primary' || $variant === 'danger' ? '#fff' : theme.colors.text};
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:hover:not(:disabled) { opacity: 0.85; }
`;



// ── Variation cards ────────────────────────────────────────

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
`;

const Card = styled.div<{ $active: boolean; $sending: boolean }>`
  background: ${({ $active, theme }) => $active ? `${theme.colors.primary}1a` : theme.colors.backgroundSecondary};
  border: 1.5px solid ${({ $active, $sending, theme }) =>
    $sending ? '#f59e0b' :
    $active ? theme.colors.primary :
    theme.colors.border};
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s, background 0.2s;
`;

const CardName = styled.div`
  font-size: 0.82rem;
  font-family: monospace;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardMeta = styled.div`
  font-size: 0.68rem;
  font-family: monospace;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.6;
`;

const CardActions = styled.div`
  display: flex;
  gap: 5px;
`;

const CardBtn = styled.button<{ $variant?: 'send' | 'load' | 'parentA' | 'parentB' }>`
  flex: 1;
  padding: 4px 0;
  font-size: 0.72rem;
  font-weight: 600;
  border-radius: 5px;
  border: 1px solid ${({ $variant, theme }) =>
    $variant === 'send'    ? theme.colors.primary :
    $variant === 'load'    ? '#10b981' :
    $variant === 'parentA' ? '#818cf844' :
    $variant === 'parentB' ? '#34d39944' :
    theme.colors.border};
  background: ${({ $variant, theme }) =>
    $variant === 'send'    ? `${theme.colors.primary}22` :
    $variant === 'load'    ? '#10b98122' :
    $variant === 'parentA' ? '#6366f118' :
    $variant === 'parentB' ? '#10b98118' :
    theme.colors.button};
  color: ${({ $variant, theme }) =>
    $variant === 'send'    ? theme.colors.primary :
    $variant === 'load'    ? '#10b981' :
    $variant === 'parentA' ? '#818cf8' :
    $variant === 'parentB' ? '#34d399' :
    theme.colors.text};
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.75; }
  &:disabled { opacity: 0.35; cursor: not-allowed; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function describeVariation(original: Patch, variation: Patch): string {
  const origAlg  = original.algorithm?.id ?? '';
  const varAlg   = variation.algorithm?.id ?? '';
  const algStr   = origAlg !== varAlg ? `algo ${varAlg}` : '';

  const origAmps = (original.operators ?? []).map(o => o.amplitude ?? 0);
  const varAmps  = (variation.operators ?? []).map(o => o.amplitude ?? 0);
  const ampDelta = origAmps.reduce((s, a, i) => s + Math.abs(a - (varAmps[i] ?? 0)), 0) / 6;

  const origFreqs = (original.operators ?? []).map(o => o.frequency ?? 1);
  const varFreqs  = (variation.operators ?? []).map(o => o.frequency ?? 1);
  const freqDelta = origFreqs.reduce((s, f, i) => s + Math.abs(f - (varFreqs[i] ?? f)), 0) / 6;

  const parts: string[] = [];
  if (algStr) parts.push(algStr);
  if (freqDelta > 0.5) parts.push(`freq Δ${freqDelta.toFixed(1)}`);
  else if (ampDelta > 0.06) parts.push(`amp Δ${(ampDelta * 100).toFixed(0)}%`);
  return parts.length > 0 ? parts.join(' · ') : 'subtle';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PatchVariatorEditor() {
  const currentPatch  = useCurrentPatch();
  const { loadPatch } = usePatchStore();
  const midiChannel   = useMidiStore(s => s.channel);
  const midiOutput    = useMidiStore(s => s.selectedOutput);

  const { setBreedParentA, setBreedParentB, saveToSlot } = useWorkspaceStore();

  const [intensity,   setIntensity]   = useState<'subtle' | 'balanced' | 'radical'>('balanced');
  const [count]                       = useState(5);
  const [variations,  setVariations]  = useState<Patch[]>([]);
  const [activeIdx,   setActiveIdx]   = useState<number | null>(null);
  const [sendingIdx,  setSendingIdx]  = useState<number | null>(null);
  const [generating,  setGenerating]  = useState(false);
  const [modelReady,  setModelReady]  = useState(variator.weightsLoaded);
  const [modelError,  setModelError]  = useState(false);

  // Timbral descriptor state
  const [showDescriptors,   setShowDescriptors]   = useState(false);
  const [descriptorTargets, setDescriptorTargets] = useState<TimbralDescriptors>({ ...DEFAULT_DESCRIPTORS });
  const [currentDescriptors, setCurrentDescriptors] = useState<TimbralDescriptors | null>(null);

  // Load CVAE weights once on first mount
  useEffect(() => {
    if (variator.weightsLoaded) return;
    variator.loadWeights(
      '/models/encoder/model.json',
      '/models/decoder/model.json',
    )
      .then(() => setModelReady(true))
      .catch(err => {
        console.warn('[Variator] Could not load CVAE weights, using parametric fallback:', err);
        setModelError(true);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [lockedDimensions, setLockedDimensions] = useState<Record<VariatorDimension, boolean>>({
    texture:      false,
    articulation: false,
    harmony:      false,
    structure:    false,
  });

  // Snapshot taken on mount so Restore always goes back to the entry state,
  // even if the user loads a variation and comes back after navigating away.
  const originalPatchRef = useRef<Patch | null>(null);
  const [originalName,  setOriginalName]  = useState<string>('');
  const [hasSnapshot,   setHasSnapshot]   = useState(false);

  // Track the latest patch as "original" whenever no variation session is active.
  // When hasSnapshot is true (a session is in progress), the ref is frozen so
  // "Restore original" always returns to the patch that was current at Generate time.
  useEffect(() => {
    if (!currentPatch || hasSnapshot) return;
    const snap = JSON.parse(JSON.stringify(currentPatch)) as Patch;
    originalPatchRef.current = snap;
    setOriginalName(snap.name ?? '');
  }, [currentPatch, hasSnapshot]);

  // When the hardware sends a new patch (pull), reset any in-progress session
  // so the variator adopts the pulled patch as its new base immediately.
  const pullRevision = usePatchStore(s => s.pullRevision);
  useEffect(() => {
    if (!currentPatch) return;
    const snap = JSON.parse(JSON.stringify(currentPatch)) as Patch;
    originalPatchRef.current = snap;
    setOriginalName(snap.name ?? '');
    setHasSnapshot(false);
    setVariations([]);
    setActiveIdx(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pullRevision]);

  // Recompute analytical descriptors whenever the current patch changes.
  useEffect(() => {
    const source = originalPatchRef.current ?? currentPatch;
    if (!source) return;
    setCurrentDescriptors(computeDescriptors(patchToParamVector(source)));
  }, [currentPatch]);

  // ── Send a specific patch via NRPN without touching the store ──────────────

  const sendVariation = useCallback(async (patch: Patch, idx: number) => {
    if (!midiOutput) return;
    setSendingIdx(idx);
    setActiveIdx(idx);
    clearNRPNQueue();
    for (const msg of patchToNRPNMessages(patch)) sendNRPN(msg, midiChannel);
    await drainNRPNQueue();
    setSendingIdx(null);
  }, [midiOutput, midiChannel]);

  // ── Load variation into store (replaces current patch) + send ─────────────

  const loadVariation = useCallback(async (patch: Patch, idx: number) => {
    loadPatch(patch);
    await sendVariation(patch, idx);
  }, [loadPatch, sendVariation]);

  // ── Generate ───────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    // Always generate from the entry-state snapshot so Regenerate never drifts
    // further from the original when a variation has been loaded in between.
    const source = originalPatchRef.current ?? currentPatch;
    if (!source) return;
    if (!hasSnapshot) setHasSnapshot(true);
    setGenerating(true);
    // Run on next tick so React can paint the disabled state
    setTimeout(() => {
      const intensityValue = intensity === 'subtle' ? 0.25 : intensity === 'balanced' ? 0.5 : 0.8;
      const vars = generateVariations(
        source, intensityValue, count, undefined, lockedDimensions,
        showDescriptors ? descriptorTargets : undefined,
      );
      setVariations(vars);
      setActiveIdx(null);
      setGenerating(false);
    }, 0);
  // hasSnapshot included so the flag is set correctly on first call
  }, [currentPatch, intensity, count, hasSnapshot, lockedDimensions, showDescriptors, descriptorTargets]);

  // ── Restore original ───────────────────────────────────────────────────────

  const restoreOriginal = useCallback(async () => {
    const original = originalPatchRef.current;
    console.log('[Variator] restoreOriginal – original:', original?.name ?? 'NULL');
    if (!original) return;
    // Deep-clone before passing to loadPatch to avoid any shared-reference issue
    const restoredPatch = JSON.parse(JSON.stringify(original)) as Patch;
    // Use getState() to bypass any stale closure on the captured loadPatch
    usePatchStore.getState().loadPatch(restoredPatch);
    console.log('[Variator] loadPatch called, currentPatch in store now:',
      usePatchStore.getState().currentPatch?.name);
    setHasSnapshot(false);
    setVariations([]);
    setActiveIdx(null);
    // Keep ref so subsequent Generate still uses the original as base.
    if (!midiOutput) return;
    try {
      clearNRPNQueue();
      for (const msg of patchToNRPNMessages(restoredPatch)) sendNRPN(msg, midiChannel);
      await drainNRPNQueue();
    } catch (err) {
      console.error('[Variator] NRPN restore failed:', err);
    }
  }, [midiOutput, midiChannel]);
  // ── Toggle dimension lock ───────────────────────────────────────────

  const toggleLock = useCallback((dim: VariatorDimension) => {
    setLockedDimensions(prev => ({ ...prev, [dim]: !prev[dim] }));
    setVariations([]);
    setActiveIdx(null);
  }, []);
  // ── Descriptor handlers ─────────────────────────────────────

  const handleToggleDescriptors = useCallback(() => {
    setShowDescriptors(v => {
      if (!v) {
        // Pre-load sliders with current patch values so default = no bias
        const source = originalPatchRef.current ?? currentPatch;
        if (source) {
          const descs = computeDescriptors(patchToParamVector(source));
          setDescriptorTargets({ ...descs });
        }
        setVariations([]);
      }
      return !v;
    });
  }, [currentPatch]);

  const handleDescriptorChange = useCallback((key: keyof TimbralDescriptors, val: number) => {
    setDescriptorTargets(prev => ({ ...prev, [key]: val }));
    setVariations([]);
  }, []);

  const resetDescriptors = useCallback(() => {
    const source = originalPatchRef.current ?? currentPatch;
    if (!source) return;
    const descs = computeDescriptors(patchToParamVector(source));
    setDescriptorTargets({ ...descs });
    setVariations([]);
  }, [currentPatch]);  // ── Derived ────────────────────────────────────────────────────────────────

  const canSend = !!midiOutput;

  const DIMS: { label: string; color: string; dim: VariatorDimension }[] = [
    { label: 'Texture',      color: '#10b981', dim: 'texture'      },
    { label: 'Articulation', color: '#6366f1', dim: 'articulation' },
    { label: 'Harmony',      color: '#f59e0b', dim: 'harmony'      },
    { label: 'Structure',    color: '#ef4444', dim: 'structure'    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Section>
      <Header>
        <Title>Patch Variator</Title>
        <SourceBadge title={hasSnapshot ? `original: ${originalName}` : undefined}>
          {hasSnapshot ? `original: ${originalName}` : `source: ${currentPatch?.name ?? '—'}`}
        </SourceBadge>
      </Header>

      {/* ── Intensity ─────────────────────────────────────────────────────── */}
      <IntensityRow>
        <IntensityLabel>Intensité</IntensityLabel>
        <IntensityBtns>
          <IntensityBtn
            $active={intensity === 'subtle'}
            $color="#10b981"
            onClick={() => { setIntensity('subtle');   setVariations([]); }}
            title="Subtil : variations légères sur les amplitudes et les durées d'enveloppe"
          >
            Subtil
          </IntensityBtn>
          <IntensityBtn
            $active={intensity === 'balanced'}
            $color="#f59e0b"
            onClick={() => { setIntensity('balanced'); setVariations([]); }}
            title="Modéré : ratios de fréquences et modulations"
          >
            Modéré
          </IntensityBtn>
          <IntensityBtn
            $active={intensity === 'radical'}
            $color="#ef4444"
            onClick={() => { setIntensity('radical');  setVariations([]); }}
            title="Radical : topologie d'algorithme et mutations structurelles"
          >
            Radical
          </IntensityBtn>
        </IntensityBtns>
      </IntensityRow>

      {/* ── Dimension locks ──────────────────────────────────────────────── */}
      <DimRow>
        <DimLabel>Verrouiller</DimLabel>
        <DimChips>
          {DIMS.map(d => (
            <DimChip
              key={d.dim}
              $color={d.color}
              $locked={lockedDimensions[d.dim]}
              onClick={() => toggleLock(d.dim)}
              title={lockedDimensions[d.dim]
                ? `${d.label} verrouillé – cliquer pour déverrouiller`
                : `${d.label} actif – cliquer pour verrouiller`}
            >
              {lockedDimensions[d.dim] ? `🔒 ${d.label}` : d.label}
            </DimChip>
          ))}
        </DimChips>
      </DimRow>

      {/* ── Timbral descriptor targets ───────────────────────────────────── */}
      <DescSection>
        <DescHeader>
          <DescToggleBtn onClick={handleToggleDescriptors}>
            {showDescriptors ? '▾' : '▸'} Caractéristiques timbrale
          </DescToggleBtn>
          {showDescriptors && (
            <SmallResetBtn
              onClick={resetDescriptors}
              title="Réinitialiser aux valeurs du patch actuel"
            >
              ↺ réinitialiser
            </SmallResetBtn>
          )}
        </DescHeader>

        {showDescriptors && (
          <DescGrid>
            {DESCRIPTOR_CONFIG.map(({ key, label, low, high }) => {
              const target  = descriptorTargets[key];
              const current = currentDescriptors?.[key] ?? target;
              const bias    = target - current;
              return (
                <DescItem key={key}>
                  <DescLabelRow>
                    <DescName>{label}</DescName>
                    <DescVal $biased={Math.abs(bias) > 0.04}>
                      {target.toFixed(2)}
                      {Math.abs(bias) > 0.04 && (
                        <DescBiasArrow $positive={bias > 0}>
                          {bias > 0 ? ' ▲' : ' ▼'}
                        </DescBiasArrow>
                      )}
                    </DescVal>
                  </DescLabelRow>
                  <DescSliderWrap>
                    <DescSlider
                      type="range"
                      min={0} max={1} step={0.01}
                      value={target}
                      $value={target}
                      onChange={e => handleDescriptorChange(key, parseFloat(e.target.value))}
                    />
                    <DescCurrentMark
                      $pct={current}
                      title={`valeur actuelle : ${current.toFixed(2)}`}
                    />
                  </DescSliderWrap>
                  <DescHints>
                    <span>◄ {low}</span>
                    <span>{high} ►</span>
                  </DescHints>
                </DescItem>
              );
            })}
          </DescGrid>
        )}
      </DescSection>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <ControlsRow>
        <Btn
          $variant="primary"
          onClick={handleGenerate}
          disabled={!currentPatch || generating}
        >
          {generating ? '…' : `⚡ Generate ${count} variations`}
        </Btn>
        {variations.length > 0 && (
          <Btn onClick={handleGenerate} disabled={generating}>
            ↺ Regenerate
          </Btn>
        )}
        {hasSnapshot && (
          <Btn
            $variant="danger"
            onClick={restoreOriginal}
            disabled={sendingIdx !== null}
            title={`Restore "${originalPatchRef.current?.name}" and discard changes`}
          >
            ↩ Restore original
          </Btn>
        )}
      </ControlsRow>

      {/* ── Status ───────────────────────────────────────────────────────── */}
      <StatusRow>
        <StatusTag title={modelReady ? 'Using trained CVAE neural network' : modelError ? 'Neural weights unavailable — using parametric fallback' : 'Loading neural weights…'}>
          {modelReady ? '⚡ neural' : modelError ? '~ parametric' : '⏳ loading…'}
        </StatusTag>
        <StatusTag>
          {canSend ? '● MIDI ready' : '○ no MIDI output'}
        </StatusTag>
      </StatusRow>

      {/* ── Variation cards ───────────────────────────────────────────────── */}
      {variations.length > 0 && (
        <CardsGrid>
          {variations.map((v, i) => (
            <Card key={i} $active={activeIdx === i} $sending={sendingIdx === i}>
              <CardName title={v.name}>{v.name}</CardName>
              <CardMeta>
                {describeVariation(currentPatch!, v)}
              </CardMeta>
              <CardActions>
                <CardBtn
                  $variant="send"
                  disabled={!canSend || sendingIdx !== null}
                  onClick={() => sendVariation(v, i)}
                  title="Send to PreenFM3 (preview only, does not change current patch)"
                >
                  {sendingIdx === i ? '…' : '▶ Send'}
                </CardBtn>
                <CardBtn
                  $variant="load"
                  disabled={sendingIdx !== null}
                  onClick={() => loadVariation(v, i)}
                  title="Load as current patch and send"
                >
                  ↓ Load
                </CardBtn>
              </CardActions>
              <CardActions>
                <CardBtn
                  $variant="parentA"
                  onClick={() => setBreedParentA(JSON.parse(JSON.stringify(v)))}
                  title="Send to Breeder as Parent A"
                >
                  → A
                </CardBtn>
                <CardBtn
                  $variant="parentB"
                  onClick={() => setBreedParentB(JSON.parse(JSON.stringify(v)))}
                  title="Send to Breeder as Parent B"
                >
                  → B
                </CardBtn>
              </CardActions>
              <CardActions>
                {[0, 1, 2, 3].map(si => (
                  <CardBtn
                    key={si}
                    onClick={() => saveToSlot(si, JSON.parse(JSON.stringify(v)))}
                    title={`Sauvegarder dans le slot ${si + 1}`}
                  >
                    → S{si + 1}
                  </CardBtn>
                ))}
              </CardActions>
            </Card>
          ))}
        </CardsGrid>
      )}
    </Section>
  );
}
