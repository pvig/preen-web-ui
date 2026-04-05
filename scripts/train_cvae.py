#!/usr/bin/env python3
"""
train_cvae.py — PreenFM3 Patch CVAE Training Script
=====================================================

Trains the Conditional VAE described in src/ml/patchVariator.ts and exports
encoder + decoder in TensorFlow.js LayersModel format.

Architecture (mirrors patchVariator.ts exactly)
------------------------------------------------
ENCODER
  Content branch : params(85) → Dense(128,relu) → Dense(256,relu) → Dense(128,relu)
  Style branch   : spect(32×128×1) → Conv2D(8,3×3,same) → MaxPool(2×2)
                                   → Conv2D(16,3×3,same) → MaxPool(2×2)
                                   → Conv2D(32,3×3,same) → GlobalAvgPool
                                   → Dense(32,relu)
  Combined       : concat(128,32)=160 → Dense(128,relu) → Dense(64,relu)
                   → [μ(12), log_σ(12)]

  Structured latent heads (imposed via gradient masking, not separate branches):
    z_osc    [0..5]   (6D) — Timbre     = algo + freq × 6 + amp × 6 (p[0..12])
    z_env    [6..9]   (4D) — Dynamics   = ADSR × 6 operators (p[13..36])
    z_matrix [10..11] (2D) — Modulation = matrix routing (p[37..84])

DECODER
  [z(12) ‖ src_params(85)] → Dense(128,relu) → Dense(256,relu) → Dense(128,relu)
                           → Dense(85,sigmoid)

Loss weighting
--------------
  p[0]      algorithm index ×8   (strong anchoring to avoid topology jumps)
  p[1..6]   frequency ratios ×5  (FM harmonic complexity kernel)
  p[7..12]  operator amplitudes ×5  (modulation indices = FM "feedback" depth)
  p[13..36] ADSR parameters ×1   (envelope shape — less perceptually critical)

  β-VAE: β=0.1 (discovery mode — MSE dominates, latent space intentionally loose)

Parameter vector dimensions (37-dim, all normalised [0,1])
-----------------------------------------------------------
  p[0]      algorithm index / 31      (32 algorithms)
  p[1..6]   operator frequencies / 16
  p[7..12]  operator amplitudes       (already 0-1)
  p[13..18] ADSR attack times  / 100
  p[19..24] ADSR decay  times  / 100
  p[25..30] ADSR sustain levels / 100
  p[31..36] ADSR release times / 100

  Modulation Matrix (p[37..84], NUM_MATRIX_SLOTS × MATRIX_SLOT_DIM):
    Per slot i (base = 37 + i*4):
      +0  source   / (N_MATRIX_SOURCES-1)   normalised source index (0 = None/unused)
      +1  dest1    / (N_MATRIX_DESTS-1)     normalised primary destination
      +2  dest2    / (N_MATRIX_DESTS-1)     normalised secondary destination
      +3  (amount + 10) / 20                amount [-10,+10] → [0,1]
    All 4 sub-values are exactly 0.0 for unused slots (source=None or amount=0).
    This is "Digital Silence" — the zero-masking loss enforces sparsity.

Install
-------
  pip install tensorflow tensorflowjs numpy scipy tqdm

Usage
-----
  # Minimal — batch of JSON patches, no spectrograms
  python train_cvae.py --patches ./patch_library/

  # With spectrogram synthesis and more epochs
  python train_cvae.py --patches ./patch_library/ --synth-spect --epochs 300

  # Resume from checkpoint
  python train_cvae.py --patches ./patch_library/ --resume ./checkpoints/cvae_epoch050.weights.h5

  # Export only (weights already trained)
  python train_cvae.py --patches ./patch_library/ --export-only ./checkpoints/cvae_best.weights.h5

Output
------
  public/models/encoder/model.json  + binary shards
  public/models/decoder/model.json  + binary shards

These paths match the loadWeights() defaults in patchVariator.ts.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from pathlib import Path
from typing import Optional

import numpy as np

# ── Optional heavy imports (checked at runtime) ──────────────────────────────
try:
    import tensorflow as tf
    from tensorflow import keras  # type: ignore[attr-defined]
except ImportError:
    sys.exit("tensorflow is not installed. Run: pip install tensorflow tensorflowjs")

# ── Constants (must match patchVariator.ts) ───────────────────────────────────

# FM operator parameters: algo(1) + freq(6) + amp(6) + ADSR×6(24) = 37
PARAM_DIM_FM = 37

# ── Modulation matrix dimensions ─────────────────────────────────────────────
NUM_MATRIX_SLOTS        = 12    # PreenFM3 has 12 modulation matrix rows
MATRIX_SLOT_DIM         =  4    # sub-values per slot: [source, dest1, dest2, amount]
MATRIX_PARAM_DIM        = NUM_MATRIX_SLOTS * MATRIX_SLOT_DIM   # 48

N_MATRIX_SOURCES        = 28    # MATRIX_SOURCE_NAMES length (0 = None)
N_MATRIX_DESTS          = 54    # MATRIX_DEST_NAMES length  (0 = None)

# Penalty weight: if a target slot is unused (source == 0), penalise any
# non-zero reconstruction — keeps the latent space sparse by default.
MATRIX_ZERO_MASK_WEIGHT = 10.0

# ── Combined dimension (must match patchVariator.ts PARAM_DIM) ───────────────
PARAM_DIM = PARAM_DIM_FM + MATRIX_PARAM_DIM   # 37 + 48 = 85

# ── Structured latent space — DNA-block heads ─────────────────────────────────
#   z_osc    dims  0..5   (6D) : Timbre  — algo (1) + freq × 6 + amp × 6 = p[0..12]
#   z_env    dims  6..9   (4D) : Dynamics — ADSR × 6 operators            = p[13..36]
#   z_matrix dims 10..11  (2D) : Modulation routing                       = p[37..84]
Z_OSC_DIM    = 6
Z_ENV_DIM    = 4
Z_MATRIX_DIM = 2
LATENT_DIM   = Z_OSC_DIM + Z_ENV_DIM + Z_MATRIX_DIM   # 12 (was 16)

# Param vector slice endpoints for gradient masking
OSC_END      = 13         # p[0..12]  : algo + freq + amp
ENV_END      = PARAM_DIM_FM  # p[13..36] : ADSR
# MATRIX     : p[PARAM_DIM_FM..PARAM_DIM-1]

# Weight of the gradient-masking (disentanglement) auxiliary losses
MASK_LOSS_WEIGHT = 0.5    # relative to the main reconstruction loss

SPEC_H      = 32
SPEC_W      = 128
ALGO_COUNT  = 32   # number of PreenFM3 algorithms

# ── Sound category constants ──────────────────────────────────────────────────

# 6 practical categories — sorted alphabetically for stable integer indices.
CATEGORIES = ['BASS', 'LEAD', 'PAD', 'PERC', 'PLUCK', 'SFX']
NUM_CATEGORIES = len(CATEGORIES)
_CAT_IDX: dict[str, int] = {c: i for i, c in enumerate(CATEGORIES)}

# Mapping: sound category → allowed PreenFM3 algorithm indices (0-based).
CATEGORY_ALGO_MAP: dict[str, list[int]] = {
    'BASS':  [4, 5, 14, 15, 17],            # long FM chains, sub-bass capable
    'LEAD':  [4, 5, 7, 10, 11, 12, 16],     # moderate FM, bright and punchy
    'PAD':   [7, 8, 9, 10, 11, 17, 18],     # rich harmonics, multiple carriers
    'PERC':  [6, 23, 26, 27],               # noise/transient-capable topologies
    'PLUCK': [4, 5, 10, 11, 12, 16, 23],    # short decay, bright attack
    'SFX':   list(range(ALGO_COUNT)),        # unconstrained
}

# ── Timbral descriptor constants ─────────────────────────────────────────────

# 6 continuous characteristics [0, 1] predicted from spectrograms.
NUM_DESCRIPTORS  = 6
DESCRIPTOR_NAMES = ['Luminosité', 'Rugosité', 'Métal', 'Épaisseur', 'Mouvement', 'Poids']

# ── Algorithm-aware loss settings ────────────────────────────────────────────
# MSE weight for p[0] (algorithm). The algorithm dimension gets this many times
# more gradient signal than the other dimensions, making the model reluctant
# to change it unless the latent evidence is strong.
ALGO_LOSS_WEIGHT  = 8.0

# ── FM-complexity feature weights ─────────────────────────────────────────────
# p[1..6]  — frequency ratios  : define harmonic content → ×5
# p[7..12] — operator amplitudes (= modulation indices, FM "feedback" depth) → ×5
# All other params (ADSR) keep weight 1.0.
RATIO_WEIGHT     = 5.0
AMPLITUDE_WEIGHT = 5.0

# Extra L2 penalty on (decoded_algo − source_algo):  discourages the decoder
# from drifting away from the conditioning algorithm.
ALGO_JUMP_PENALTY = 4.0

# Precomputed per-dimension weight vector (broadcast over batch at training time)
_RECON_WEIGHTS: Optional[np.ndarray] = None

def _get_recon_weights() -> np.ndarray:
    """Return (and cache) the [PARAM_DIM] weight array as float32."""
    global _RECON_WEIGHTS
    if _RECON_WEIGHTS is None:
        w = np.ones(PARAM_DIM, dtype=np.float32)
        w[0]     = ALGO_LOSS_WEIGHT   # algorithm index — heavy emphasis
        w[1:7]   = RATIO_WEIGHT       # frequency ratios — FM harmonic complexity
        w[7:13]  = AMPLITUDE_WEIGHT   # operator amplitudes — modulation indices
        _RECON_WEIGHTS = w
    return _RECON_WEIGHTS


# ── Modulation matrix helpers ─────────────────────────────────────────────────
# Name ↔ integer lookups — must match MATRIX_SOURCE_NAMES / MATRIX_DEST_NAMES
# in src/midi/preenFmConstants.ts exactly (same order, same strings).

_MATRIX_SOURCE_NAMES_LIST: list[str] = [
    'None', 'LFO 1', 'LFO 2', 'LFO 3', 'LFOEnv1', 'LFOEnv2', 'LFOSeq1', 'LFOSeq2',
    'Modwheel', 'Pitchbend', 'Aftertouch', 'Velocity', 'Note1',
    'CC1', 'CC2', 'CC3', 'CC4', 'Note2', 'Breath', 'MPE Slide', 'Random', 'Poly AT',
    'User CC1', 'User CC2', 'User CC3', 'User CC4', 'PB MPE', 'AT MPE',
]  # len = 28  (indices 0–27)  assert len(_MATRIX_SOURCE_NAMES_LIST) == N_MATRIX_SOURCES

_MATRIX_DEST_NAMES_LIST: list[str] = [
    'None', 'Gate', 'IM1', 'IM2', 'IM3', 'IM4', 'IM*',
    'Mix1', 'Pan1', 'Mix2', 'Pan2', 'Mix3', 'Pan3', 'Mix4', 'Pan4', 'Mix*', 'Pan*',
    'o1 Fq', 'o2 Fq', 'o3 Fq', 'o4 Fq', 'o5 Fq', 'o6 Fq', 'o* Fq',
    'Env1 A', 'Env2 A', 'Env3 A', 'Env4 A', 'Env5 A', 'Env6 A', 'Env* A', 'Env* R',
    'Mtx1 x', 'Mtx2 x', 'Mtx3 x', 'Mtx4 x',
    'Lfo1 F', 'Lfo2 F', 'Lfo3 F', 'Env2 S', 'Seq1 G', 'Seq2 G',
    'Flt1 P1', 'o* FqH', 'Env* D', 'EnvM A', 'EnvM D', 'EnvM R',
    'Mtx FB', 'Flt1 P2', 'Flt1 G', 'Flt2 P1', 'Flt2 P2', 'Flt2 G',
]  # len = 54  (indices 0–53)  assert len(_MATRIX_DEST_NAMES_LIST) == N_MATRIX_DESTS

_MATRIX_SOURCE_IDX: dict[str, int] = {n: i for i, n in enumerate(_MATRIX_SOURCE_NAMES_LIST)}
_MATRIX_DEST_IDX:   dict[str, int] = {n: i for i, n in enumerate(_MATRIX_DEST_NAMES_LIST)}


def sanitize_matrix(slots: "list | None") -> list[dict]:
    """Normalise a raw modulation-matrix slot list for model training.

    Rule:  source == 'None' / 0 / ''   OR   amount == 0   →  zero entire slot.

    "Digital Silence": an unused slot becomes exactly 0 in every sub-value of
    the param vector so the zero-masking loss can enforce sparsity.

    Returns a list of exactly NUM_MATRIX_SLOTS dicts:
        {"source": str, "destination1": str, "destination2": str, "amount": float}
    """
    out: list[dict] = []
    for i in range(NUM_MATRIX_SLOTS):
        slot: dict = ((slots[i] if slots and i < len(slots) else {}) or {})
        src = slot.get("source", "None")
        amt = float(slot.get("amount", 0.0))
        if src in ("None", 0, "") or amt == 0.0:
            out.append({"source": "None", "destination1": "None",
                        "destination2": "None", "amount": 0.0})
        else:
            out.append({
                "source":       str(src),
                "destination1": str(slot.get("destination1", "None")),
                "destination2": str(slot.get("destination2", "None")),
                "amount":       amt,
            })
    return out


def _encode_matrix(slots: "list | None") -> np.ndarray:
    """Encode modulation-matrix rows to a float32 vector of length MATRIX_PARAM_DIM (48).

    Layout per slot i  (base = i * MATRIX_SLOT_DIM):
        [source/(N-1), dest1/(N-1), dest2/(N-1), (amount+10)/20]
    Unused slots (source=None after sanitization) → all four values 0.0.
    """
    vec   = np.zeros(MATRIX_PARAM_DIM, dtype=np.float32)
    clean = sanitize_matrix(slots)
    for i, slot in enumerate(clean):
        if slot["source"] == "None":
            continue   # zeros already in place
        src  = _MATRIX_SOURCE_IDX.get(slot["source"],       0)
        dst1 = _MATRIX_DEST_IDX.get(slot["destination1"], 0)
        dst2 = _MATRIX_DEST_IDX.get(slot["destination2"], 0)
        amt  = float(slot["amount"])          # range −10 … +10
        base = i * MATRIX_SLOT_DIM
        vec[base + 0] = src  / (N_MATRIX_SOURCES - 1)           # [0, 1]
        vec[base + 1] = dst1 / (N_MATRIX_DESTS   - 1)           # [0, 1]
        vec[base + 2] = dst2 / (N_MATRIX_DESTS   - 1)           # [0, 1]
        vec[base + 3] = float(np.clip((amt + 10.0) / 20.0, 0.0, 1.0))
    return vec


# ── Sound category auto-labeling ──────────────────────────────────────────────

# Priority-ordered name → category rules.  Patterns use word-boundary anchors so
# "bass" doesn't match "bassoon" and "pad" doesn't match "padding".
_NAME_PATTERNS: list[tuple[str, str]] = [
    # Order matters: first match wins.
    ('BASS',  r'\b(bass|sub|bs|bss|low|deep|bottom|doom)\b'),
    ('PERC',  r'\b(drum|kick|snare|hi.?hat|hat|perc|hit|bd|sd|tom|cymb|clap|rimshot|tabla|conga|bongo)\b'),
    ('PLUCK', r'\b(pluck|pizz(?:icato)?|harp|bell|vibes?|marimba|mallet|chime|pick|strum|twang|koto)\b'),
    ('PAD',   r'\b(pad|str|strings?|ambient|atmo|sweep|warm|pillow|cloud|texture|lush|drone|sustain)\b'),
    ('LEAD',  r'\b(lead|ld|mono|solo|melo|melody|arp|sync|brass|horn|trumpet|trombone|tuba|brs|clar(?:inet)?|flut(?:e)?|oboe|sax(?:ophone)?|reed|woodwind|organ|keys?|piano|ep|clav(?:inet)?|rhodes|voice|voc(?:al)?|choir|formant|vox|vowel|sing)\b'),
    ('SFX',   r'\b(sfx|fx|noise|wind|rain|ocean|wave|crash|static|glitch|crackle|whoosh|zap|laser|explosion|riser|impact)\b'),
]


def _spectral_features(spect_flat: list) -> dict[str, float]:
    """
    Compute timbral descriptors from a flat spectrogram (values in [0, 1]).

    Expected layout: spect_flat[frame * 128 + bin], length = 1024 * 128 = 131072.

    Returns a dict with:
      centroid  — mean frequency bin (0–127); higher → bright/treble-heavy
      flatness  — geometric/arithmetic mean ratio (0–1); higher → noise-like
      low_frac  — fraction of energy in freq bins 0–19  (sub-bass region)
      high_frac — fraction of energy in freq bins 80–127 (upper harmonics)
    """
    arr       = np.array(spect_flat, dtype=np.float32).reshape(1024, 128)
    mean_spec = arr.mean(axis=0) + 1e-9  # [128] mean spectrum per freq bin
    bins      = np.arange(128, dtype=np.float32)
    total     = float(mean_spec.sum())

    centroid  = float((mean_spec * bins).sum() / total)
    geom_mean = float(np.exp(np.mean(np.log(mean_spec))))
    flatness  = float(geom_mean / mean_spec.mean())
    low_frac  = float(mean_spec[:20].sum() / total)
    high_frac = float(mean_spec[80:].sum() / total)

    return {"centroid": centroid, "flatness": flatness,
            "low_frac": low_frac, "high_frac": high_frac}


def label_sound_category(patch_name: str,
                         spect_flat: "list | None" = None) -> str:
    """
    Assign one of CATEGORIES to a patch.

    Decision priority:
      1. Name-based keyword match  (high confidence, fast).
      2. Spectral feature heuristics (fallback when no keyword matches).
      3. 'SFX'  (catch-all — unconstrained algorithms).
    """
    name_lower = patch_name.lower()
    for cat, pattern in _NAME_PATTERNS:
        if re.search(pattern, name_lower):
            return cat

    if spect_flat and len(spect_flat) >= 128 * 128:
        feats = _spectral_features(spect_flat)
        # Sub-bass heavy energy → bass
        if feats["low_frac"] > 0.55:
            return "BASS"
        # True broadband noise (very flat spectrum) → SFX
        if feats["flatness"] > 0.65:
            return "SFX"
        # Very tonal, low centroid → sustained pad
        if feats["flatness"] < 0.08 and feats["centroid"] < 40:
            return "PAD"
        # Bright, tonal with high-freq content → pluck / bell
        if feats["centroid"] > 70 and feats["flatness"] < 0.40:
            return "PLUCK"
        # Percussive transient (noisy high-freq burst)
        if feats["flatness"] > 0.25 and feats["high_frac"] > 0.20:
            return "PERC"
        # Midrange tonal → lead
        if feats["flatness"] < 0.35 and 35 < feats["centroid"] < 85:
            return "LEAD"

    return "SFX"   # catch-all — unconstrained algorithms


def compute_timbral_descriptors(spect_flat: "list | None") -> np.ndarray:
    """
    Compute 6 normalised timbral descriptors from a raw spectrogram.

    Returns float32 array of shape (NUM_DESCRIPTORS,) with values in [0, 1]:
      [0] Luminosité — spectral brightness   (high = treble-heavy centroid)
      [1] Rugosité   — spectral roughness    (high = noisy/jagged spectrum)
      [2] Métal      — metallic/inharmonic   (high = sharp non-harmonic peaks in hi-freq)
      [3] Épaisseur  — spectral spread       (high = energy spread over many bins)
      [4] Mouvement  — temporal evolution    (high = centroid varies strongly over time)
      [5] Poids      — low-frequency weight  (high = bass-heavy)
    """
    if not spect_flat or len(spect_flat) < 128 * 128:
        return np.zeros(NUM_DESCRIPTORS, dtype=np.float32)

    arr       = np.array(spect_flat, dtype=np.float32).reshape(1024, 128)
    mean_spec = arr.mean(axis=0) + 1e-9  # [128] mean spectrum across time
    bins      = np.arange(128, dtype=np.float32)
    total     = float(mean_spec.sum())

    # Spectral centroid and spread
    centroid  = float((mean_spec * bins).sum() / total)
    spread    = float(np.sqrt(((mean_spec * (bins - centroid) ** 2).sum()) / total))

    # Roughness: mean absolute difference between adjacent spectral bins
    roughness = float(np.mean(np.abs(np.diff(mean_spec))) / mean_spec.mean())

    # Low-frequency fraction (bins 0–31 ≈ sub-bass + bass region)
    low_frac  = float(mean_spec[:32].sum() / total)

    # Métal: high-frequency crest factor (sharp peaks in upper spectrum = metallic)
    high_spec = mean_spec[32:] + 1e-9
    crest_hi  = float(high_spec.max() / high_spec.mean())

    # Mouvement: temporal variation of per-frame spectral centroid
    frame_totals    = arr.sum(axis=1) + 1e-9              # [1024]
    frame_centroids = (arr * bins).sum(axis=1) / frame_totals  # [1024]
    mouvement_std   = float(np.std(frame_centroids))

    # Normalise each descriptor to [0, 1]
    luminosite = float(np.clip(centroid  / 96.0,           0.0, 1.0))  # centroid 0-96 covers visible range
    rugosity   = float(np.clip(roughness / 2.0,            0.0, 1.0))  # empirical max ≈ 2
    metal      = float(np.clip((crest_hi - 1.0) / 15.0,   0.0, 1.0))  # crest 1 (flat) → 16 (spiky)
    epaisseur  = float(np.clip(spread    / 64.0,           0.0, 1.0))  # max spread = 64 bins
    mouvement  = float(np.clip(mouvement_std / 20.0,       0.0, 1.0))  # empirical max std ≈ 20
    poids      = float(np.clip(low_frac  * 2.5,            0.0, 1.0))  # boosted: low_frac typically < 0.4

    return np.array([luminosite, rugosity, metal, epaisseur, mouvement, poids], dtype=np.float32)

# ── Parameter-vector helpers ──────────────────────────────────────────────────

def patch_to_param_vector(patch: dict) -> Optional[np.ndarray]:
    """Convert a Patch JSON dict to a normalised PARAM_DIM-dim (85) float32 array.

    Returns None if the patch is malformed / incomplete.

    Handles three input formats:
      • JSONL new format   : {"params": [85 floats, normalised 0-1], ...}
      • JSONL legacy format: {"params": [37 FM floats], "matrix": [...], ...}
        ("matrix" absent → all 12 slots treated as unused = zeros)
      • Raw patch JSON     : {"algorithm": {...}, "operators": [...],
                              "modulationMatrix": [{source, dest1, dest2, amount}, ...]}
    """
    raw_params = patch.get("params")

    # ── JSONL new format: full 85-dim vector already stored ──────────────────
    if isinstance(raw_params, list) and len(raw_params) >= PARAM_DIM:
        return np.array(raw_params[:PARAM_DIM], dtype=np.float32)

    # ── JSONL legacy format: 37 FM dims + optional "matrix" key ─────────────
    if isinstance(raw_params, list) and len(raw_params) >= PARAM_DIM_FM:
        fm_vec  = np.array(raw_params[:PARAM_DIM_FM], dtype=np.float32)
        mtx_vec = _encode_matrix(patch.get("matrix"))
        return np.concatenate([fm_vec, mtx_vec])

    # ── Raw patch JSON format ────────────────────────────────────────────────
    p_fm = np.zeros(PARAM_DIM_FM, dtype=np.float32)

    # p[0] — algorithm index
    alg_id = str(patch.get("algorithm", {}).get("id", "alg1"))
    digits = re.sub(r"\D", "", alg_id)
    alg_num = int(digits) - 1 if digits else 0
    p_fm[0] = float(np.clip(alg_num, 0, ALGO_COUNT - 1)) / (ALGO_COUNT - 1)

    ops = patch.get("operators", [])
    for i, op in enumerate(ops[:6]):
        if op is None:
            continue
        adsr = op.get("adsr", {})
        att  = adsr.get("attack",  {})
        dec  = adsr.get("decay",   {})
        sus  = adsr.get("sustain", {})
        rel  = adsr.get("release", {})

        p_fm[1  + i] = float(np.clip(op.get("frequency", 1.0),  0, 16))  / 16.0
        p_fm[7  + i] = float(np.clip(op.get("amplitude", 0.0),  0,  1))
        p_fm[13 + i] = float(np.clip(att.get("time",     0.0),  0, 100)) / 100.0
        p_fm[19 + i] = float(np.clip(dec.get("time",     0.0),  0, 100)) / 100.0
        p_fm[25 + i] = float(np.clip(sus.get("level",    0.0),  0, 100)) / 100.0
        p_fm[31 + i] = float(np.clip(rel.get("time",     0.0),  0, 100)) / 100.0

    mtx_vec = _encode_matrix(patch.get("modulationMatrix"))
    return np.concatenate([p_fm, mtx_vec])


def enforce_validity(v: np.ndarray) -> np.ndarray:
    """Apply the same validity rules as enforceValidity() in patchVariator.ts."""
    v = v.copy()
    # Clamp frequencies [0.016, 1.0]
    v[1:7]  = np.clip(v[1:7], 0.016, 1.0)
    # Clamp attack to avoid infinite envelopes
    v[13:19] = np.clip(v[13:19], 0.0, 0.95)
    # At least one sustain > 0.05
    if v[25:31].max() < 0.05:
        v[25 + v[25:31].argmax()] = 0.05
    # At least one amplitude > 0.05
    if v[7:13].max() < 0.05:
        v[7 + v[7:13].argmax()] = 0.05
    return np.clip(v, 0.0, 1.0)


# ── Simple FM spectrogram synthesis ──────────────────────────────────────────

_SAMPLE_RATE = 22050
_NOTE_FREQ   = 220.0   # A3 — fixed reference pitch for spectrograms
_DURATION    = 2.0     # seconds — must be long enough so n_frames >= SPEC_W=128
                       # (1.0 s gives only 85 frames → trim_w=0 → empty spectrograms!)
_N_SAMPLES   = int(_SAMPLE_RATE * _DURATION)
_N_FFT       = 512
_HOP         = 256
_N_MELS      = 128     # before downsampling to SPEC_H=32


def _adsr_envelope(n: int, att: float, dec: float, sus_level: float, rel: float,
                   sr: int) -> np.ndarray:
    """Generate a simple ADSR amplitude envelope (float, 0-1)."""
    att_n = max(1, int(att / 100 * n))
    dec_n = max(1, int(dec / 100 * n))
    rel_n = max(1, int(rel / 100 * n))
    sus_n = max(0, n - att_n - dec_n - rel_n)

    attack  = np.linspace(0, 1, att_n)
    decay   = np.linspace(1, sus_level / 100, dec_n)
    sustain = np.full(sus_n, sus_level / 100)
    release = np.linspace(sus_level / 100, 0, rel_n)
    return np.concatenate([attack, decay, sustain, release])[:n]


def _avg_pool_2d(arr: np.ndarray, out_h: int, out_w: int) -> np.ndarray:
    """Average-pool a 2D float32 array to (out_h, out_w) using vectorised reshape."""
    h, w = arr.shape
    sh, sw = h // out_h, w // out_w
    return arr[:out_h * sh, :out_w * sw].reshape(out_h, sh, out_w, sw).mean(axis=(1, 3)).astype(np.float32)


def _downsample_jsonl_spect(raw: list) -> np.ndarray:
    """Convert a JSONL 128×1024 spectrogram (flat list, values already in [0,1])
    to a (SPEC_H=32, SPEC_W=128, 1) float32 array suitable for the encoder.

    The input is already normalised by the harvester as byte/255.0 — no further
    normalisation is applied.  Only spatial downsampling is performed.
    """
    arr = np.array(raw, dtype=np.float32).reshape(128, 1024)
    # Trim to a size divisible by the downsampling factors
    trim_h = (128 // SPEC_H) * SPEC_H   # = 32 * 4 (multiple of 4), trim 128 → 128
    trim_w = (1024 // SPEC_W) * SPEC_W  # = 128 * 8, trim 1024 → 1024
    ds = _avg_pool_2d(arr[:trim_h, :trim_w], SPEC_H, SPEC_W)
    return ds[:, :, np.newaxis]   # (32, 128, 1)


def synthesize_spectrogram(params: np.ndarray) -> np.ndarray:
    """
    Synthesize a simple FM patch from a param vector and return a
    log-magnitude spectrogram of shape (SPEC_H, SPEC_W, 1) as float32.

    This is a rough approximation: 6 sinusoidal operators summed, each
    modulated by the next (pairs 1→2, 3→4, 5→6 as basic DX-style FM).
    No algorithm topology is respected — the goal is only to produce a
    spectrogram that captures the rough harmonic character.
    """
    t = np.linspace(0, _DURATION, _N_SAMPLES, endpoint=False)
    signal = np.zeros(_N_SAMPLES, dtype=np.float64)

    frequencies   = params[1:7]  * 16   # denorm
    amplitudes    = params[7:13]         # 0-1
    attacks       = params[13:19] * 100
    decays        = params[19:25] * 100
    sustains      = params[25:31] * 100
    releases      = params[31:37] * 100

    # Compute individual operator waveforms
    op_waves = []
    for i in range(6):
        freq = max(0.25, frequencies[i]) * _NOTE_FREQ
        env  = _adsr_envelope(_N_SAMPLES, attacks[i], decays[i],
                               sustains[i], releases[i], _SAMPLE_RATE)
        wave = amplitudes[i] * env * np.sin(2 * np.pi * freq * t)
        op_waves.append(wave)

    # Stack in pairs: op(i+1) modulates op(i)
    for i in range(0, 6, 2):
        mod  = op_waves[i + 1] if i + 1 < 6 else np.zeros(_N_SAMPLES)
        carr = op_waves[i]
        # Phase modulation
        carrier_freq = max(0.25, frequencies[i]) * _NOTE_FREQ
        signal += np.sin(2 * np.pi * carrier_freq * t + mod) * amplitudes[i]

    # STFT → power spectrogram
    n_frames = (_N_SAMPLES - _N_FFT) // _HOP + 1
    n_bins   = _N_FFT // 2 + 1
    spec     = np.zeros((n_bins, n_frames), dtype=np.float32)
    window   = np.hanning(_N_FFT)
    for k in range(n_frames):
        frame = signal[k * _HOP: k * _HOP + _N_FFT] * window
        spec[:, k] = np.abs(np.fft.rfft(frame)).astype(np.float32)

    # Mel-scale (approximation: average into SPEC_H=32 bands)
    # Downsample both axes to (SPEC_H, SPEC_W) = (32, 128)
    # Trim to usable frequency/time bins
    trim_h = (n_bins  // SPEC_H) * SPEC_H
    trim_w = (n_frames // SPEC_W) * SPEC_W
    spec_crop = spec[:trim_h, :trim_w]
    ds = _avg_pool_2d(spec_crop, SPEC_H, SPEC_W)

    # Log magnitude + normalise
    ds = np.log1p(ds)
    max_v = ds.max()
    if max_v > 0:
        ds /= max_v
    return ds[:, :, np.newaxis]   # (32, 128, 1)


# ── Dataset loading ───────────────────────────────────────────────────────────

def load_patches_from_dir(patch_dir: Path) -> list[dict]:
    """
    Load all patches from a directory.  Accepts:
      • *.json files where each file is a single Patch object
      • *.json files where each file is an array of Patch objects
      • patches.json / library.json top-level arrays
    """
    patches: list[dict] = []

    # ── .json files (single object, array, or {patches:[…]} wrapper) ──────────
    for path in sorted(patch_dir.rglob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  [skip] {path.name}: {e}", file=sys.stderr)
            continue
        if isinstance(data, list):
            patches.extend([p for p in data if isinstance(p, dict)])
        elif isinstance(data, dict):
            # Could be a single patch or {patches: [...]} wrapper
            if "operators" in data:
                patches.append(data)
            elif "patches" in data and isinstance(data["patches"], list):
                patches.extend(data["patches"])

    # ── .jsonl files (one JSON object per line) ───────────────────────────────
    for path in sorted(patch_dir.rglob("*.jsonl")):
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                if isinstance(obj, dict):
                    patches.append(obj)
                elif isinstance(obj, list):
                    patches.extend([p for p in obj if isinstance(p, dict)])
        except Exception as e:
            print(f"  [skip] {path.name}: {e}", file=sys.stderr)

    return patches


def build_dataset(patches: list[dict],
                  synth_spect: bool,
                  rng: np.random.Generator,
                  augment_factor: int = 3) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Build training pairs (params_A, spect_B, params_B, labels_B).

    Strategy
    --------
    For each patch B, randomly pick a patch A from the same library.
    The CVAE learns: given the "content" of A and the "style" of B,
    decode the param vector of B.

    augment_factor: how many synthetic augmented copies to generate per patch
    (adds mild Gaussian noise to params).

    Returns
    -------
    params_A  : (N, 37)
    spects_B  : (N, SPEC_H, SPEC_W, 1)
    params_B  : (N, 37)
    labels_B  : (N,) int32 — category index per sample (see CATEGORIES)
    vectors   : (N_aug, 37) — full augmented vector array (for sanity check)
    """
    from tqdm import tqdm  # type: ignore[import]

    print(f"Building param vectors from {len(patches)} patches …")
    vectors = []
    valid_patches = []
    for p in tqdm(patches, unit="patch"):
        v = patch_to_param_vector(p)
        if v is not None:
            vectors.append(v)
            valid_patches.append(p)
    print(f"  → {len(vectors)} valid patches")

    if len(vectors) < 2:
        sys.exit("Need at least 2 valid patches to build training pairs.")

    # ── Auto-label each patch using name + spectral features ─────────────────
    print("Auto-labeling patches by sound category …")
    cat_strings: list[str] = []
    descs_list:  list[np.ndarray] = []
    for p in valid_patches:
        name     = p.get("meta", {}).get("patch_name") or p.get("name") or ""
        raw_spec = p.get("spectrogram")
        cat_strings.append(label_sound_category(name, raw_spec))
        descs_list.append(compute_timbral_descriptors(raw_spec))
    labels_orig = np.array(
        [_CAT_IDX.get(c, _CAT_IDX["SFX"]) for c in cat_strings],
        dtype=np.int32
    )
    descs_orig = np.stack(descs_list, axis=0).astype(np.float32)  # (N_orig, 4)
    # Distribution summary
    from collections import Counter
    dist = Counter(cat_strings)
    print("  Category distribution: " + ", ".join(
        f"{c}={dist[c]}" for c in CATEGORIES if dist.get(c, 0) > 0))


    # ── Extract real spectrograms for each valid patch ────────────────────────
    N_orig = len(valid_patches)
    print(f"Extracting real spectrograms from harvested data …")
    real_spects_orig = np.zeros((N_orig, SPEC_H, SPEC_W, 1), dtype=np.float32)
    n_real = 0
    for i, p in enumerate(valid_patches):
        raw = p.get("spectrogram")
        if isinstance(raw, list) and len(raw) == 128 * 1024:
            real_spects_orig[i] = _downsample_jsonl_spect(raw)
            n_real += 1
    print(f"  → {n_real}/{N_orig} patches have real spectrograms")

    vectors = np.array(vectors, dtype=np.float32)     # (N_orig, 37)
    N = N_orig

    # ── Optional: augment dataset with small perturbations ────────────────────
    if augment_factor > 1:
        aug_parts = [vectors]
        for _ in range(augment_factor - 1):
            noise = rng.normal(0, 0.03, size=vectors.shape).astype(np.float32)
            aug   = np.clip(vectors + noise, 0, 1).astype(np.float32)
            aug   = np.array([enforce_validity(v) for v in aug], dtype=np.float32)
            aug_parts.append(aug)
        vectors = np.concatenate(aug_parts, axis=0)
        N = len(vectors)
        print(f"  → {N} vectors after augmentation (×{augment_factor})")

    # Augmented copies inherit their original patch's label and descriptors.
    labels_aug = np.tile(labels_orig, augment_factor)[:N]   # (N,) int32
    descs_aug  = np.tile(descs_orig,  (augment_factor, 1))[:N]  # (N, 4)

    # Tile real spectrograms to match augmented dataset length.
    # Augmented copies keep the original patch's spectrogram (params changed slightly,
    # so the real audio character is approximately the same).
    real_spects = np.tile(real_spects_orig, (augment_factor, 1, 1, 1))[:N]  # (N, 32, 128, 1)

    # ── Build random pairs (A_idx, B_idx) ─────────────────────────────────────
    A_idx = rng.integers(0, N, size=N)
    B_idx = np.arange(N)
    # Avoid identical pairs
    same = A_idx == B_idx
    A_idx[same] = (B_idx[same] + 1) % N

    params_A = vectors[A_idx]   # (N, 37)
    params_B = vectors[B_idx]   # (N, 37)
    labels_B = labels_aug[B_idx].astype(np.int32)  # (N,)
    descs_B  = descs_aug[B_idx]                     # (N, 4)

    # ── Spectrograms for style branch ─────────────────────────────────────────
    # Shape: (N, SPEC_H, SPEC_W, 1)
    if n_real > 0:
        # Use real harvested spectrograms (preferred — same normalisation as SoundMatcher)
        print(f"Using {n_real} real harvested spectrograms for style branch.")
        spects_B = real_spects[B_idx]
    elif synth_spect:
        print("No real spectrograms found — synthesizing (this may take a while) …")
        spects_B = np.zeros((N, SPEC_H, SPEC_W, 1), dtype=np.float32)
        for i in tqdm(range(N), unit="patch"):
            spects_B[i] = synthesize_spectrogram(params_B[i])
    else:
        # Zero-pad spectrograms — the model can still train on params alone
        print("Using zero spectrograms (pass --synth-spect to enable synthesis).")
        spects_B = np.zeros((N, SPEC_H, SPEC_W, 1), dtype=np.float32)

    return params_A, spects_B, params_B, labels_B, descs_B, vectors


# ── Model architecture ────────────────────────────────────────────────────────

def build_style_cnn() -> "keras.Model":
    """
    Shared CNN backbone used by both the encoder style branch and the classifier.

    Input : spectrogram (SPEC_H, SPEC_W, 1)
    Output: 32-dim style feature vector
    """
    spect_input = keras.Input(shape=(SPEC_H, SPEC_W, 1), name="spect_input")
    s = keras.layers.Conv2D(8,  3, padding="same", activation="relu", name="s_conv0")(spect_input)
    s = keras.layers.MaxPooling2D(2, name="s_pool0")(s)
    s = keras.layers.Conv2D(16, 3, padding="same", activation="relu", name="s_conv1")(s)
    s = keras.layers.MaxPooling2D(2, name="s_pool1")(s)
    s = keras.layers.Conv2D(32, 3, padding="same", activation="relu", name="s_conv2")(s)
    s = keras.layers.GlobalAveragePooling2D(name="s_gap")(s)
    style_feat = keras.layers.Dense(32, activation="relu", name="s_dense")(s)
    return keras.Model(inputs=spect_input, outputs=style_feat, name="style_cnn")


def build_encoder(style_cnn: "keras.Model") -> "keras.Model":
    """
    Encoder: (params, spect) → (z_mean, z_log_var).

    Content branch (3 hidden layers for richer non-linear FM mapping):
      37 → Dense(128) → Dense(256) → Dense(128)  →  content_feat

    Style branch (shared CNN backbone):
      spect(32×128×1) → style_cnn → Dense(32)     →  style_feat

    Combined → z:
      concat(128, 32) = 160 → Dense(128) → Dense(64) → [z_mean(16), z_log_var(16)]
    """
    params_input = keras.Input(shape=(PARAM_DIM,),         name="params_input")
    spect_input  = keras.Input(shape=(SPEC_H, SPEC_W, 1),  name="spect_input")

    # Content branch — deeper: 37 → 128 → 256 → 128
    x = keras.layers.Dense(128, activation="relu", name="c_dense0")(params_input)
    x = keras.layers.Dense(256, activation="relu", name="c_dense1")(x)
    x = keras.layers.Dense(128, activation="relu", name="c_dense2")(x)
    content_feat = x  # (128,)

    # Style branch — shared CNN backbone
    style_feat = style_cnn(spect_input)  # (32,)

    # Combined: 160 → 128 → 64 → z
    combined = keras.layers.Concatenate(name="concat")([content_feat, style_feat])
    h = keras.layers.Dense(128, activation="relu", name="enc_hidden0")(combined)
    h = keras.layers.Dense(64,  activation="relu", name="enc_hidden1")(h)

    z_mean    = keras.layers.Dense(LATENT_DIM, name="z_mean")(h)
    z_log_var = keras.layers.Dense(LATENT_DIM, name="z_log_var")(h)

    return keras.Model(
        inputs=[params_input, spect_input],
        outputs=[z_mean, z_log_var],
        name="encoder",
    )


def build_classifier(style_cnn: "keras.Model") -> "keras.Model":
    """
    Classifier head: spectrogram → category probabilities [NUM_CATEGORIES].

    Shares the style_cnn backbone with the encoder so spectral features
    learned for VAE conditioning simultaneously drive category prediction.
    A small Dropout layer (0.3) regularises the category-specific top.
    """
    spect_input = keras.Input(shape=(SPEC_H, SPEC_W, 1), name="spect_input")
    style_feat  = style_cnn(spect_input)                          # (32,)
    x   = keras.layers.Dense(32, activation="relu", name="cls_dense0")(style_feat)
    x   = keras.layers.Dropout(0.3, name="cls_drop")(x)
    out = keras.layers.Dense(NUM_CATEGORIES, activation="softmax",
                             name="cls_out")(x)
    return keras.Model(inputs=spect_input, outputs=out, name="classifier")


def build_descriptor_regressor(style_cnn: "keras.Model") -> "keras.Model":
    """
    Descriptor regressor head: spectrogram → 4 timbral values in [0, 1].

    Predicts [Rugosité, Largeur Harmonique, Profondeur, Pureté] via MSE.
    Shares the style_cnn backbone; trained jointly with the CVAE.
    """
    spect_input = keras.Input(shape=(SPEC_H, SPEC_W, 1), name="spect_input")
    style_feat  = style_cnn(spect_input)
    x   = keras.layers.Dense(32, activation="relu",  name="desc_dense0")(style_feat)
    x   = keras.layers.Dropout(0.2,                  name="desc_drop")(x)
    out = keras.layers.Dense(NUM_DESCRIPTORS, activation="sigmoid",
                             name="desc_out")(x)
    return keras.Model(inputs=spect_input, outputs=out, name="descriptor_regressor")


def build_decoder() -> "keras.Model":
    """
    Decoder: (z, src_params) → reconstructed_params.

    3 hidden layers mirror the encoder depth:
      concat(16, 37) = 53 → Dense(128) → Dense(256) → Dense(128) → Dense(37, sigmoid)
    """
    z_input   = keras.Input(shape=(LATENT_DIM,), name="z_input")
    src_input = keras.Input(shape=(PARAM_DIM,),  name="src_input")

    x = keras.layers.Concatenate(name="dec_concat")([z_input, src_input])
    x = keras.layers.Dense(128, activation="relu", name="dec_dense0")(x)
    x = keras.layers.Dense(256, activation="relu", name="dec_dense1")(x)
    x = keras.layers.Dense(128, activation="relu", name="dec_dense2")(x)
    x = keras.layers.Dense(PARAM_DIM, activation="sigmoid", name="dec_out")(x)

    return keras.Model(
        inputs=[z_input, src_input],
        outputs=x,
        name="decoder",
    )


# ── CVAE training step ────────────────────────────────────────────────────────

class CVAE(keras.Model):
    """
    Multi-head Conditional VAE:
      Head 1 (Classifier)           : spectrogram  → sound category  (Softmax, NUM_CATEGORIES)
      Head 2 (Descriptor Regressor) : spectrogram  → 4 timbral values (Sigmoid, NUM_DESCRIPTORS)
      Head 3 (Decoder)              : z ‖ src_params → 37 FM parameters (Sigmoid)

    Training losses:
      recon_loss      — weighted MSE on FM parameters
                        p[0] algorithm ×8, ratios p[1..6] ×5, amplitudes p[7..12] ×5
      kl_loss         — β-VAE KL divergence (β default 0.1, annealed from 0)
      algo_jump_loss  — L2 penalty on algorithm change (keeps resynthesis stable)
      cls_loss        — Sparse cross-entropy for category classification
      desc_loss       — MSE for timbral descriptor regression
    """

    def __init__(self, encoder: "keras.Model", decoder: "keras.Model",
                 classifier: "keras.Model", descriptor_reg: "keras.Model",
                 beta: float = 0.1, cls_weight: float = 1.0,
                 desc_weight: float = 1.0,
                 class_weights: "dict | None" = None):
        super().__init__()
        self.encoder        = encoder
        self.decoder        = decoder
        self.classifier     = classifier
        self.descriptor_reg = descriptor_reg
        self.beta           = beta
        self.cls_weight     = cls_weight
        self.desc_weight    = desc_weight

        # Per-class weights for the classification loss (compensates imbalance).
        # Shape: [NUM_CATEGORIES].  If None, uniform weighting is used.
        if class_weights is not None:
            cw = np.array([class_weights[i] for i in range(NUM_CATEGORIES)],
                          dtype=np.float32)
            self._class_weights_tensor = tf.constant(cw, dtype=tf.float32)
        else:
            self._class_weights_tensor = None

        self.total_loss_tracker     = keras.metrics.Mean(name="loss")
        self.recon_loss_tracker     = keras.metrics.Mean(name="recon_loss")
        self.kl_loss_tracker        = keras.metrics.Mean(name="kl_loss")
        self.algo_jump_loss_tracker = keras.metrics.Mean(name="algo_jump_loss")
        self.cls_loss_tracker       = keras.metrics.Mean(name="cls_loss")
        self.cls_acc_tracker        = keras.metrics.SparseCategoricalAccuracy(
                                          name="cls_acc")
        self.desc_loss_tracker      = keras.metrics.Mean(name="desc_loss")
        self.zero_mask_loss_tracker = keras.metrics.Mean(name="zero_mask_loss")
        self.mask_osc_loss_tracker  = keras.metrics.Mean(name="mask_osc")
        self.mask_env_loss_tracker  = keras.metrics.Mean(name="mask_env")
        self.mask_mat_loss_tracker  = keras.metrics.Mean(name="mask_mat")

        self._recon_weights = tf.constant(_get_recon_weights(), dtype=tf.float32)

    def set_class_weights(self, class_weights: dict) -> None:
        """Set per-class weights for the classification loss after construction."""
        cw = np.array([class_weights[i] for i in range(NUM_CATEGORIES)],
                      dtype=np.float32)
        self._class_weights_tensor = tf.constant(cw, dtype=tf.float32)

    @property
    def metrics(self):
        return [
            self.total_loss_tracker, self.recon_loss_tracker,
            self.kl_loss_tracker, self.algo_jump_loss_tracker,
            self.cls_loss_tracker, self.cls_acc_tracker,
            self.desc_loss_tracker, self.zero_mask_loss_tracker,
            self.mask_osc_loss_tracker, self.mask_env_loss_tracker,
            self.mask_mat_loss_tracker,
        ]

    def reparameterise(self, z_mean, z_log_var):
        """z = μ + σ * ε,  ε ~ N(0,I)."""
        eps = tf.random.normal(shape=tf.shape(z_mean))
        return z_mean + eps * tf.exp(z_log_var * 0.5)

    def call(self, inputs, training=False):
        params_a, spect_b, src_params = inputs
        z_mean, z_log_var = self.encoder([params_a, spect_b], training=training)
        z = self.reparameterise(z_mean, z_log_var)
        return self.decoder([z, src_params], training=training)

    def _compute_losses(self, params_a, spect_b, params_b, labels_b, descs_b, training):
        z_mean, z_log_var = self.encoder([params_a, spect_b], training=training)
        z       = self.reparameterise(z_mean, z_log_var)
        decoded = self.decoder([z, params_a],  training=training)
        cat_probs  = self.classifier(spect_b,      training=training)
        desc_pred  = self.descriptor_reg(spect_b,  training=training)

        # Weighted reconstruction: p[0] (algorithm) gets ALGO_LOSS_WEIGHT×
        per_dim_sq = tf.square(decoded - params_b)          # [B, PARAM_DIM]
        recon_loss = tf.reduce_mean(
            tf.reduce_mean(per_dim_sq * self._recon_weights, axis=-1)
        )
        # β-weighted KL divergence
        kl_loss = -0.5 * tf.reduce_mean(
            1.0 + z_log_var - tf.square(z_mean) - tf.exp(z_log_var)
        )
        # Algorithm jump penalty: discourages large algorithm changes
        algo_jump_loss = ALGO_JUMP_PENALTY * tf.reduce_mean(
            tf.square(decoded[:, 0:1] - params_a[:, 0:1])
        )
        # Classification cross-entropy
        cls_loss_per_sample = keras.losses.sparse_categorical_crossentropy(
            labels_b, cat_probs
        )  # shape [B]
        if self._class_weights_tensor is not None:
            sample_weights = tf.gather(self._class_weights_tensor,
                                       tf.cast(labels_b, tf.int32))
            cls_loss = tf.reduce_mean(cls_loss_per_sample * sample_weights)
        else:
            cls_loss = tf.reduce_mean(cls_loss_per_sample)
        # Descriptor regression MSE
        desc_loss = tf.reduce_mean(tf.square(desc_pred - descs_b))

        # ── Zero-masking loss ──────────────────────────────────────────────────
        # Penalise the model for inventing non-zero modulation in slots that
        # were empty in the target patch (source sub-value == 0.0).
        # This enforces "Digital Silence" — the latent space stays sparse w.r.t.
        # the modulation matrix unless there is genuine matrix information.
        mtx_target  = params_b[:, PARAM_DIM_FM:]                        # [B, 48]
        mtx_decoded = decoded[:, PARAM_DIM_FM:]                         # [B, 48]
        mtx_t_rs  = tf.reshape(mtx_target,  [-1, NUM_MATRIX_SLOTS, MATRIX_SLOT_DIM])
        mtx_d_rs  = tf.reshape(mtx_decoded, [-1, NUM_MATRIX_SLOTS, MATRIX_SLOT_DIM])
        # unused_mask: 1.0 where target slot source == 0.0  [B, NUM_MATRIX_SLOTS, 1]
        unused_mask = tf.cast(tf.equal(mtx_t_rs[:, :, 0:1], 0.0), tf.float32)
        zero_mask_loss = MATRIX_ZERO_MASK_WEIGHT * tf.reduce_mean(
            tf.square(mtx_d_rs) * unused_mask
        )

        # ── Structured gradient masking ────────────────────────────────────────
        # Each DNA block's head is trained by stop-gradient-ing the other heads.
        # This encourages z_osc to encode timbre, z_env dynamics, z_mat routing.
        sg = tf.stop_gradient

        _z_osc   = z[:, :Z_OSC_DIM]                              # (B, 6)
        _z_env   = z[:, Z_OSC_DIM:Z_OSC_DIM + Z_ENV_DIM]        # (B, 4)
        _z_mat   = z[:, Z_OSC_DIM + Z_ENV_DIM:]                  # (B, 2)

        # OSC-head decode: only z_osc can update from OSC reconstruction
        dec_osc = self.decoder(
            [tf.concat([_z_osc, sg(_z_env), sg(_z_mat)], axis=-1), sg(params_a)],
            training=training,
        )
        mask_osc_loss = tf.reduce_mean(
            tf.square(dec_osc[:, :OSC_END] - params_b[:, :OSC_END]) * ALGO_LOSS_WEIGHT
        )

        # ENV-head decode: only z_env can update from ENV reconstruction
        dec_env = self.decoder(
            [tf.concat([sg(_z_osc), _z_env, sg(_z_mat)], axis=-1), sg(params_a)],
            training=training,
        )
        mask_env_loss = tf.reduce_mean(
            tf.square(dec_env[:, OSC_END:ENV_END] - params_b[:, OSC_END:ENV_END])
        )

        # MAT-head decode: only z_mat can update from MATRIX reconstruction
        dec_mat = self.decoder(
            [tf.concat([sg(_z_osc), sg(_z_env), _z_mat], axis=-1), sg(params_a)],
            training=training,
        )
        mask_mat_loss = tf.reduce_mean(
            tf.square(dec_mat[:, PARAM_DIM_FM:] - params_b[:, PARAM_DIM_FM:])
            * MATRIX_ZERO_MASK_WEIGHT * 0.3   # scaled down to avoid dominating
        )

        mask_total = MASK_LOSS_WEIGHT * (mask_osc_loss + mask_env_loss + mask_mat_loss)

        total_loss = (recon_loss + self.beta * kl_loss
                      + algo_jump_loss + self.cls_weight * cls_loss
                      + self.desc_weight * desc_loss + zero_mask_loss
                      + mask_total)
        return (total_loss, recon_loss, kl_loss, algo_jump_loss,
                cls_loss, cat_probs, desc_loss, zero_mask_loss,
                mask_osc_loss, mask_env_loss, mask_mat_loss)

    def train_step(self, data):
        (params_a, spect_b, params_b, labels_b, descs_b) = data[0]

        with tf.GradientTape() as tape:
            (total_loss, recon_loss, kl_loss, algo_jump_loss,
             cls_loss, cat_probs, desc_loss, zero_mask_loss,
             mask_osc_loss, mask_env_loss, mask_mat_loss) = \
                self._compute_losses(params_a, spect_b, params_b, labels_b, descs_b,
                                     training=True)

        grads = tape.gradient(total_loss, self.trainable_variables)
        self.optimizer.apply_gradients(zip(grads, self.trainable_variables))

        self.total_loss_tracker.update_state(total_loss)
        self.recon_loss_tracker.update_state(recon_loss)
        self.kl_loss_tracker.update_state(kl_loss)
        self.algo_jump_loss_tracker.update_state(algo_jump_loss)
        self.cls_loss_tracker.update_state(cls_loss)
        self.cls_acc_tracker.update_state(labels_b, cat_probs)
        self.desc_loss_tracker.update_state(desc_loss)
        self.zero_mask_loss_tracker.update_state(zero_mask_loss)
        self.mask_osc_loss_tracker.update_state(mask_osc_loss)
        self.mask_env_loss_tracker.update_state(mask_env_loss)
        self.mask_mat_loss_tracker.update_state(mask_mat_loss)
        return {m.name: m.result() for m in self.metrics}

    def test_step(self, data):
        (params_a, spect_b, params_b, labels_b, descs_b) = data[0]
        (total_loss, recon_loss, kl_loss, algo_jump_loss,
         cls_loss, cat_probs, desc_loss, zero_mask_loss,
         mask_osc_loss, mask_env_loss, mask_mat_loss) = \
            self._compute_losses(params_a, spect_b, params_b, labels_b, descs_b,
                                 training=False)

        self.total_loss_tracker.update_state(total_loss)
        self.recon_loss_tracker.update_state(recon_loss)
        self.kl_loss_tracker.update_state(kl_loss)
        self.algo_jump_loss_tracker.update_state(algo_jump_loss)
        self.cls_loss_tracker.update_state(cls_loss)
        self.cls_acc_tracker.update_state(labels_b, cat_probs)
        self.desc_loss_tracker.update_state(desc_loss)
        self.zero_mask_loss_tracker.update_state(zero_mask_loss)
        self.mask_osc_loss_tracker.update_state(mask_osc_loss)
        self.mask_env_loss_tracker.update_state(mask_env_loss)
        self.mask_mat_loss_tracker.update_state(mask_mat_loss)
        return {m.name: m.result() for m in self.metrics}


# ── Beta annealing schedule ───────────────────────────────────────────────────

class BetaAnnealingCallback(keras.callbacks.Callback):
    """Linearly ramp beta from 0 → target over the first half of training."""

    def __init__(self, model: CVAE, target_beta: float, warmup_epochs: int):
        super().__init__()
        self._cvae        = model
        self._target_beta = target_beta
        self._warmup      = max(1, warmup_epochs)

    def on_epoch_begin(self, epoch, logs=None):
        frac = min(1.0, epoch / self._warmup)
        self._cvae.beta = self._target_beta * frac


# ── Inference helpers ─────────────────────────────────────────────────────────

def constrain_algo_by_category(
    params: np.ndarray,
    category: str,
) -> np.ndarray:
    """
    Post-processing: clamp p[0] (algorithm) to the allowed set for `category`.

    Args:
        params:   float32 array of shape [PARAM_DIM], values in [0, 1].
                  p[0] = algo_index / (ALGO_COUNT - 1).
        category: one of CATEGORIES (falls back to no constraint if unknown).
    Returns:
        A copy of params with p[0] possibly adjusted to the nearest allowed
        algorithm index.
    """
    allowed = CATEGORY_ALGO_MAP.get(category, list(range(ALGO_COUNT)))
    if not allowed:
        return params
    params = params.copy()
    decoded_idx = int(round(params[0] * (ALGO_COUNT - 1)))
    if decoded_idx not in allowed:
        closest = min(allowed, key=lambda a: abs(a - decoded_idx))
        params[0] = float(closest) / (ALGO_COUNT - 1)
    return params


def predict_category(
    classifier: "keras.Model",
    spect: np.ndarray,
) -> "tuple[str, np.ndarray]":
    """
    Run the classifier on a spectrogram and return the predicted category.

    Args:
        spect: (SPEC_H, SPEC_W, 1) or (N, SPEC_H, SPEC_W, 1) float32 array.
    Returns:
        (category_name, probabilities [NUM_CATEGORIES])
    """
    single = spect.ndim == 3
    if single:
        spect = spect[np.newaxis]
    probs = classifier.predict(spect, verbose=0)   # (N, NUM_CATEGORIES)
    top_cat = CATEGORIES[int(np.argmax(probs[0]))]
    return top_cat, (probs[0] if single else probs)


# ── TF.js export ─────────────────────────────────────────────────────────────

# ── TF.js export — self-contained, no tensorflowjs dependency ─────────────────

def _keras3_inbound_nodes_to_k2(k3_nodes: list) -> list:
    """Convert Keras 3 inbound_nodes to Keras 2 format expected by TF.js."""
    k2_nodes: list = []
    for node in k3_nodes:
        args0 = (node.get("args") or [None])[0]
        if isinstance(args0, list):
            # Multiple inputs (e.g. Concatenate)
            row = []
            for t in args0:
                kh = t["config"]["keras_history"]
                row.append([kh[0], kh[1], kh[2], {}])
            k2_nodes.append(row)
        elif isinstance(args0, dict) and args0.get("class_name") == "__keras_tensor__":
            kh = args0["config"]["keras_history"]
            k2_nodes.append([[kh[0], kh[1], kh[2], {}]])
    return k2_nodes


_K3_ONLY_FIELDS = {"module", "registered_name", "build_config", "compile_config",
                   "quantization_config", "optional"}


def _clean_k3_obj(v: object) -> object:
    """
    Recursively convert Keras 3 serialized sub-objects to their Keras 2
    equivalents that TF.js understands.

    Keras 3 wraps every serializable object as:
      {"module": "...", "class_name": "...", "config": {...}, "registered_name": ...}

    TF.js only understands:
      {"class_name": "...", "config": {...}}

    We also strip layer-level Keras-3-only keys and simplify DTypePolicy dicts
    to plain "float32" strings.
    """
    if isinstance(v, dict):
        # Keras 3 serialized object — strip k3-only wrapper fields
        if "class_name" in v:
            # DTypePolicy → plain "float32" string
            if v.get("class_name") == "DTypePolicy":
                return v.get("config", {}).get("name", "float32")
            cleaned: dict = {}
            for k, val in v.items():
                if k in _K3_ONLY_FIELDS:
                    continue
                if k == "dtype" and isinstance(val, dict):
                    cleaned[k] = "float32"
                else:
                    cleaned[k] = _clean_k3_obj(val)
            return cleaned
        # Plain dict — recurse into values, simplifying any dtype dict as well
        return {k: ("float32" if k == "dtype" and isinstance(val, dict)
                    else _clean_k3_obj(val))
                for k, val in v.items()
                if k not in _K3_ONLY_FIELDS}
    if isinstance(v, list):
        return [_clean_k3_obj(item) for item in v]
    return v


def _topology_to_k2(model: "keras.Model") -> dict:
    """
    Serialize a Keras 3 Functional model topology to the Keras 2 format that
    tf.loadLayersModel() understands in the browser.

    Key transformations:
    - Strip Keras 3-only wrapper fields (module, registered_name, build_config…)
      from ALL nested objects (initializers, constraints, regularizers, etc.)
    - Convert DTypePolicy dicts to plain "float32" strings
    - Rename InputLayer's "batch_shape" → "batch_input_shape"
    - Convert inbound_nodes from Keras 3 dict format to Keras 2 array format
    """
    from keras.saving import serialize_keras_object  # type: ignore[import]
    k3 = serialize_keras_object(model)

    # serialize_keras_object returns:
    #   { class_name, module, config: { name, trainable, layers: [...],
    #                                   input_layers, output_layers }, ... }
    inner = k3["config"]

    layers_k2 = []
    for layer_k3 in inner["layers"]:
        class_name = layer_k3["class_name"]
        layer_name = layer_k3["name"]

        # Config is nested one level deeper in Keras 3 serialization
        k3_cfg = layer_k3.get("config", {})
        raw_cfg = k3_cfg.get("config", k3_cfg)

        # Deep-clean all Keras 3-specific fields from the config and every
        # nested object within it (initializers, constraints, regularizers…)
        config = _clean_k3_obj(raw_cfg)
        assert isinstance(config, dict)

        # InputLayer: Keras 3 uses "batch_shape", TF.js expects "batch_input_shape"
        if class_name == "InputLayer" and "batch_shape" in config:
            config["batch_input_shape"] = config.pop("batch_shape")

        layers_k2.append({
            "class_name": class_name,
            "config":     config,
            "inbound_nodes": _keras3_inbound_nodes_to_k2(
                layer_k3.get("inbound_nodes", [])
            ),
            "name": layer_name,
        })

    def _ensure_list_of_lists(val: list) -> list:
        """Normalise to [[name, node, tensor], ...].
        Keras 3 serialises a single-output model as a flat [name, n, t] instead
        of the expected [[name, n, t]] that TF.js fromConfig requires."""
        if not val:
            return []
        if isinstance(val[0], str):   # flat single entry → wrap
            return [list(val)]
        return [list(item) for item in val]

    return {
        "class_name": "Functional",
        "config": {
            "name":         inner["name"],
            "trainable":    inner.get("trainable", True),
            "layers":       layers_k2,
            "input_layers":  _ensure_list_of_lists(inner.get("input_layers",  [])),
            "output_layers": _ensure_list_of_lists(inner.get("output_layers", [])),
        },
    }


def _write_tfjs_layers_model(model: "keras.Model", output_dir: Path) -> None:
    """
    Serialize a Keras 3 Functional model to the TF.js LayersModel format:
      output_dir/model.json           — topology + weights manifest
      output_dir/group1-shard1of1.bin — concatenated float32 weights

    Fixed vs the previous version:
      • Uses ``w.path`` (e.g. ``s_conv0/kernel``) instead of ``w.name``
        (e.g. ``kernel``) so TF.js can map weights to layers by name.
      • Converts ``inbound_nodes`` from Keras 3 dict format to the Keras 2
        array format that ``tf.loadLayersModel()`` expects.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    # ── Collect weights — use w.path for TF.js-compatible names ─────────────
    weight_specs: list[dict] = []
    weight_chunks: list[bytes] = []

    for w in model.weights:
        arr  = w.numpy().astype(np.float32)
        name = getattr(w, "path", w.name)   # "s_conv0/kernel" in Keras 3
        weight_specs.append({
            "name":  name,
            "shape": list(arr.shape),
            "dtype": "float32",
        })
        weight_chunks.append(arr.flatten(order="C").tobytes())

    bin_path = output_dir / "group1-shard1of1.bin"
    with bin_path.open("wb") as fout:
        for chunk in weight_chunks:
            fout.write(chunk)

    # ── Build topology (Keras 2 format) ──────────────────────────────────────
    try:
        topology = _topology_to_k2(model)
    except Exception as exc:
        # Last-resort: raw Keras 3 format (may not load in browser, but keeps the file)
        print(f"  Warning: Keras-2 topology conversion failed ({exc}); using raw Keras 3 topology")
        from keras.saving import serialize_keras_object  # type: ignore[import]
        topology = {
            "class_name": model.__class__.__name__,
            "config":     serialize_keras_object(model),
            "keras_version": "3",
            "backend":    "tensorflow",
        }

    model_json = {
        "format":       "layers-model",
        "generatedBy":  "train_cvae.py (PreenFM3 CVAE)",
        "convertedBy":  "custom serializer v2",
        "modelTopology": topology,
        "weightsManifest": [{
            "paths":   ["group1-shard1of1.bin"],
            "weights": weight_specs,
        }],
    }

    (output_dir / "model.json").write_text(
        json.dumps(model_json, separators=(",", ":"))
    )


def export_tfjs(encoder: "keras.Model", decoder: "keras.Model",
                classifier: "keras.Model", descriptor_reg: "keras.Model",
                output_dir: Path) -> None:
    """Export encoder, decoder, classifier, and descriptor_reg to TF.js LayersModel format.

    Primary path: tensorflowjs Python package (produces format that
    tf.loadLayersModel() in the browser can parse correctly).
    Fallback: custom serializer if tensorflowjs is not installed.
    """
    enc_dir  = output_dir / "encoder"
    dec_dir  = output_dir / "decoder"
    cls_dir  = output_dir / "classifier"
    desc_dir = output_dir / "descriptor"

    # ── Primary path: tensorflowjs package ───────────────────────────────────
    try:
        import tensorflowjs as tfjs        # type: ignore[import]
        import tempfile

        print("\nExporting models with tensorflowjs…")
        for model, out_dir, label in [
            (encoder,        enc_dir,  "encoder"),
            (decoder,        dec_dir,  "decoder"),
            (classifier,     cls_dir,  "classifier"),
            (descriptor_reg, desc_dir, "descriptor_regressor"),
        ]:
            out_dir.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory() as tmp_saved:
                try:
                    model.export(tmp_saved)
                except AttributeError:
                    import tensorflow as tf  # type: ignore[import]
                    tf.saved_model.save(model, tmp_saved)
                tfjs.converters.convert_tf_saved_model(
                    tmp_saved,
                    str(out_dir),
                    skip_op_check=True,
                    strip_debug_ops=True,
                )
            print(f"  {label} → {out_dir}/model.json")
        return

    except ImportError:
        print("tensorflowjs not found, falling back to custom serializer…")
    except Exception as exc:
        print(f"tensorflowjs export failed ({exc}), falling back to custom serializer…")

    # ── Fallback: self-contained serializer ──────────────────────────────────
    _write_tfjs_layers_model(encoder,        enc_dir)
    _write_tfjs_layers_model(decoder,        dec_dir)
    _write_tfjs_layers_model(classifier,     cls_dir)
    _write_tfjs_layers_model(descriptor_reg, desc_dir)
    print(f"\nExported encoder            → {enc_dir}/model.json  (custom serializer)")
    print(f"Exported decoder            → {dec_dir}/model.json  (custom serializer)")
    print(f"Exported classifier         → {cls_dir}/model.json  (custom serializer)")
    print(f"Exported descriptor_reg     → {desc_dir}/model.json (custom serializer)")


# ── CLI ───────────────────────────────────────────────────────────────────────

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Train the PreenFM3 Patch CVAE and export to TF.js",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--patches",      required=True, type=Path,
                   help="Directory of JSON patch files")
    p.add_argument("--output",       type=Path, default=Path("public/models"),
                   help="Output directory for TF.js models")
    p.add_argument("--checkpoints",  type=Path, default=Path("checkpoints"),
                   help="Directory to save weight checkpoints")
    p.add_argument("--epochs",       type=int,   default=200)
    p.add_argument("--batch-size",   type=int,   default=64)
    p.add_argument("--lr",           type=float, default=1e-3,
                   help="Adam learning rate")
    p.add_argument("--beta",         type=float, default=0.1,
                   help="Final KL weight β (annealed from 0 during warmup). Low value (0.1) prioritises MSE reconstruction over latent space organisation.")
    p.add_argument("--warmup",       type=int,   default=None,
                   help="KL warmup epochs (default: epochs // 3)")
    p.add_argument("--augment",      type=int,   default=3,
                   help="Dataset augmentation factor (1 = no augmentation)")
    p.add_argument("--cls-weight",   type=float, default=1.0,
                   help="Weight of classification loss relative to reconstruction")
    p.add_argument("--desc-weight",  type=float, default=1.0,
                   help="Weight of descriptor regression loss relative to reconstruction")
    p.add_argument("--synth-spect",  action="store_true",
                   help="Synthesize FM spectrograms for style conditioning")
    p.add_argument("--val-split",    type=float, default=0.1,
                   help="Validation fraction")
    p.add_argument("--seed",         type=int,   default=42)
    p.add_argument("--resume",       type=Path, default=None,
                   help="Resume from checkpoint (.weights.h5)")
    p.add_argument("--export-only",  type=Path, default=None,
                   help="Skip training; just load weights and export to TF.js")
    return p.parse_args()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    args = parse_args()

    rng = np.random.default_rng(args.seed)
    tf.random.set_seed(args.seed)

    # ── Build models ──────────────────────────────────────────────────────────
    style_cnn      = build_style_cnn()
    encoder        = build_encoder(style_cnn)
    decoder        = build_decoder()
    classifier     = build_classifier(style_cnn)
    descriptor_reg = build_descriptor_regressor(style_cnn)

    if args.export_only:
        enc_path = args.export_only
        dec_path = Path(str(args.export_only).replace("encoder", "decoder"))
        cls_path = Path(str(args.export_only).replace("encoder", "classifier")
                                             .replace("decoder", "classifier"))
        if args.export_only.is_dir():
            enc_path  = args.export_only / "encoder_best.weights.h5"
            dec_path  = args.export_only / "decoder_best.weights.h5"
            cls_path  = args.export_only / "classifier_best.weights.h5"
            desc_path = args.export_only / "descriptor_best.weights.h5"
        print(f"Loading encoder weights from {enc_path} …")
        dummy_pa = tf.zeros((1, PARAM_DIM))
        dummy_sp = tf.zeros((1, SPEC_H, SPEC_W, 1))
        encoder([dummy_pa, dummy_sp], training=False)
        decoder([tf.zeros((1, LATENT_DIM)), dummy_pa], training=False)
        classifier(dummy_sp, training=False)
        descriptor_reg(dummy_sp, training=False)
        encoder.load_weights(str(enc_path))
        decoder.load_weights(str(dec_path))
        if cls_path.exists():
            classifier.load_weights(str(cls_path))
        else:
            print(f"  [warn] classifier weights not found at {cls_path}, exporting untrained head")
        if desc_path.exists():
            descriptor_reg.load_weights(str(desc_path))
        else:
            print(f"  [warn] descriptor weights not found at {desc_path}, exporting untrained head")
        export_tfjs(encoder, decoder, classifier, descriptor_reg, args.output)
        return

    # ── Load patches ──────────────────────────────────────────────────────────
    print(f"\nLoading patches from {args.patches} …")
    patches = load_patches_from_dir(args.patches)
    print(f"  → {len(patches)} patches found")

    if len(patches) == 0:
        sys.exit("No patches found. Make sure --patches points to a directory "
                 "containing .json files exported from the PreenFM3 web UI.")

    # ── Build dataset ─────────────────────────────────────────────────────────
    try:
        from tqdm import tqdm  # noqa: F401  (imported for progress bars)
    except ImportError:
        print("  tip: pip install tqdm for progress bars")
        # Monkey-patch tqdm with a passthrough
        class _tqdm:  # type: ignore[no-redef]
            def __init__(self, it, **_kw): self._it = it
            def __iter__(self): return iter(self._it)
        sys.modules.setdefault("tqdm", type(sys)("tqdm"))
        sys.modules["tqdm"].tqdm = _tqdm  # type: ignore[attr-defined]

    params_A, spects_B, params_B, labels_B, descs_B, all_vectors = build_dataset(
        patches, synth_spect=args.synth_spect,
        rng=rng, augment_factor=args.augment,
    )
    N = len(params_A)

    # Shuffle and split
    perm = rng.permutation(N)
    params_A, spects_B, params_B, labels_B, descs_B = (
        params_A[perm], spects_B[perm], params_B[perm], labels_B[perm], descs_B[perm]
    )
    n_val = max(1, int(N * args.val_split))
    train = (params_A[n_val:], spects_B[n_val:], params_B[n_val:], labels_B[n_val:], descs_B[n_val:])
    val   = (params_A[:n_val], spects_B[:n_val],  params_B[:n_val], labels_B[:n_val], descs_B[:n_val])

    print(f"  → {N - n_val} train pairs, {n_val} val pairs")

    # Build tf.data datasets
    def to_dataset(data, shuffle=False, batch_size=64):
        ds = tf.data.Dataset.from_tensor_slices(data)
        if shuffle:
            ds = ds.shuffle(buffer_size=min(10000, len(data[0])), seed=args.seed)
        ds = ds.batch(batch_size).prefetch(tf.data.AUTOTUNE)
        # Wrap the 5-tuple as a 1-element tuple so Keras 3’s data adapter accepts
        # it (Keras rejects tuples longer than 3 elements at validation time).
        # train_step / test_step unpack from data[0].
        ds = ds.map(lambda *args: (args,))
        return ds

    train_ds = to_dataset(train, shuffle=True,  batch_size=args.batch_size)
    val_ds   = to_dataset(val,   shuffle=False, batch_size=args.batch_size)

    # ── Compile ───────────────────────────────────────────────────────────────
    cvae = CVAE(encoder, decoder, classifier, descriptor_reg,
                beta=0.0, cls_weight=args.cls_weight, desc_weight=args.desc_weight)
    cvae.compile(optimizer=keras.optimizers.Adam(learning_rate=args.lr))

    warmup = args.warmup if args.warmup is not None else args.epochs // 3

    # ── Callbacks ─────────────────────────────────────────────────────────────
    args.checkpoints.mkdir(parents=True, exist_ok=True)
    enc_best  = args.checkpoints / "encoder_best.weights.h5"
    dec_best  = args.checkpoints / "decoder_best.weights.h5"
    cls_best  = args.checkpoints / "classifier_best.weights.h5"
    desc_best = args.checkpoints / "descriptor_best.weights.h5"

    class _BestModelCheckpoint(keras.callbacks.Callback):
        """Save encoder+decoder+classifier weights whenever val_loss improves."""
        def __init__(self):
            super().__init__()
            self._best = float("inf")

        def on_epoch_end(self, epoch, logs=None):
            val_loss = (logs or {}).get("val_loss", float("inf"))
            if val_loss < self._best:
                self._best = val_loss
                encoder.save_weights(str(enc_best))
                decoder.save_weights(str(dec_best))
                classifier.save_weights(str(cls_best))
                descriptor_reg.save_weights(str(desc_best))
                print(f"\nEpoch {epoch+1}: val_loss improved to {val_loss:.5f} "
                      f"— saved best weights")

    class _RestoreBestWeights(keras.callbacks.Callback):
        """Restore the best encoder+decoder+classifier+descriptor_reg weights at the end of training."""
        def on_train_end(self, logs=None):
            if enc_best.exists() and dec_best.exists():
                encoder.load_weights(str(enc_best))
                decoder.load_weights(str(dec_best))
                if cls_best.exists():
                    classifier.load_weights(str(cls_best))
                if desc_best.exists():
                    descriptor_reg.load_weights(str(desc_best))
                print("Restored best weights from checkpoint.")

    callbacks = [
        BetaAnnealingCallback(cvae, target_beta=args.beta, warmup_epochs=warmup),
        _BestModelCheckpoint(),
        _RestoreBestWeights(),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=15,
            min_lr=1e-5, verbose=1,
        ),
        keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=40, verbose=1,
        ),
        keras.callbacks.CSVLogger(str(args.checkpoints / "training_log.csv")),
    ]

    # Epoch checkpoints every 50 epochs (save_freq accepts integer = every N batches
    # in Keras 3; use a custom callback instead for epoch-level granularity)
    epoch_ckpt = str(args.checkpoints / "cvae_epoch{epoch:03d}.weights.h5")

    class _EpochCheckpoint(keras.callbacks.Callback):
        def on_epoch_end(self, epoch, logs=None):
            if (epoch + 1) % 50 == 0:
                encoder.save_weights(
                    str(args.checkpoints / f"encoder_epoch{epoch+1:03d}.weights.h5")
                )
                decoder.save_weights(
                    str(args.checkpoints / f"decoder_epoch{epoch+1:03d}.weights.h5")
                )
                classifier.save_weights(
                    str(args.checkpoints / f"classifier_epoch{epoch+1:03d}.weights.h5")
                )
                descriptor_reg.save_weights(
                    str(args.checkpoints / f"descriptor_epoch{epoch+1:03d}.weights.h5")
                )

    callbacks.append(_EpochCheckpoint())

    # Resume from checkpoint if requested
    if args.resume:
        enc_resume = Path(str(args.resume).replace("cvae_best", "encoder_best")
                                          .replace(".weights.h5", ".weights.h5"))
        dec_resume = Path(str(args.resume).replace("cvae_best", "decoder_best")
                                          .replace(".weights.h5", ".weights.h5"))
        # Accept either a directory or direct encoder/decoder paths
        if args.resume.is_dir():
            enc_resume = args.resume / "encoder_best.weights.h5"
            dec_resume = args.resume / "decoder_best.weights.h5"
        # Fall back: if a single file is given, try loading into encoder first
        if enc_resume.exists() and dec_resume.exists():
            print(f"\nResuming — loading encoder from {enc_resume} …")
            encoder.load_weights(str(enc_resume))
            print(f"Resuming — loading decoder from {dec_resume} …")
            decoder.load_weights(str(dec_resume))
            cls_resume = enc_resume.parent / "classifier_best.weights.h5"
            if cls_resume.exists():
                print(f"Resuming — loading classifier from {cls_resume} …")
                classifier.load_weights(str(cls_resume))
            desc_resume = enc_resume.parent / "descriptor_best.weights.h5"
            if desc_resume.exists():
                print(f"Resuming — loading descriptor from {desc_resume} …")
                descriptor_reg.load_weights(str(desc_resume))
        else:
            print(f"  [warn] Could not find checkpoint at {args.resume}, "
                  "starting from scratch.")

    # ── Print summaries ───────────────────────────────────────────────────────
    style_cnn.summary(line_length=80)
    encoder.summary(line_length=80)
    decoder.summary(line_length=80)
    classifier.summary(line_length=80)
    descriptor_reg.summary(line_length=80)
    total_params = (style_cnn.count_params() +
                    encoder.count_params() +
                    decoder.count_params() +
                    classifier.count_params() +
                    descriptor_reg.count_params())
    print(f"\nTotal trainable parameters: {total_params:,}")
    print(f"Sound categories: {CATEGORIES}")

    # ── Train ─────────────────────────────────────────────────────────────────
    print(f"\nTraining for up to {args.epochs} epochs  "
          f"(β={args.beta}, warmup={warmup} epochs) …\n")

    # ── Class weights (compensate for label imbalance) ────────────────────────
    train_labels = train[3]  # integer category indices for training set
    label_counts = np.bincount(train_labels, minlength=NUM_CATEGORIES).astype(float)
    label_counts = np.where(label_counts == 0, 1, label_counts)  # avoid /0
    total_train  = float(len(train_labels))
    class_weight = {
        i: total_train / (NUM_CATEGORIES * label_counts[i])
        for i in range(NUM_CATEGORIES)
    }
    print("\nClass weights:")
    for i, w in class_weight.items():
        print(f"  {CATEGORIES[i]:12s}: count={int(label_counts[i]):5d}  weight={w:.3f}")

    # Now that class_weight is computed, apply it to the model
    cvae.set_class_weights(class_weight)

    history = cvae.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        callbacks=callbacks,
        verbose=1,
    )

    # Best weights already restored by _RestoreBestWeights callback

    export_tfjs(encoder, decoder, classifier, descriptor_reg, args.output)

    # ── Quick sanity check ────────────────────────────────────────────────────
    print("\nSanity check — reconstructing first 3 training patches …")
    pa_test = params_A[:3]
    sp_test = spects_B[:3]

    z_mean, z_log_var = encoder.predict([pa_test, sp_test], verbose=0)
    decoded = decoder.predict([z_mean, pa_test], verbose=0)

    for i in range(min(3, len(decoded))):
        mse = np.mean((decoded[i] - params_B[i]) ** 2)
        # Classifier prediction + algo constraint
        cat, probs = predict_category(classifier, sp_test[i])
        constrained = constrain_algo_by_category(decoded[i], cat)
        orig_algo   = int(round(decoded[i][0]     * (ALGO_COUNT - 1)))
        new_algo    = int(round(constrained[0]    * (ALGO_COUNT - 1)))
        desc_pred   = descriptor_reg.predict(sp_test[i:i+1], verbose=0)[0]
        desc_str    = ", ".join(
            f"{DESCRIPTOR_NAMES[d]}={desc_pred[d]:.2f}" for d in range(NUM_DESCRIPTORS)
        )
        print(f"  patch {i}: MSE={mse:.5f}  category={cat} "
              f"(conf={probs.max():.2f})  "
              f"algo {orig_algo+1}→{new_algo+1} "
              f"{'(clamped)' if orig_algo != new_algo else '(ok)'}\n"
              f"    descriptors: {desc_str}")

    print("\nDone ✓")
    print(f"Models saved to {args.output}/{{encoder,decoder,classifier,descriptor}}/model.json")
    print(f"In patchVariator.ts: await variator.loadWeights("
          f"'/models/encoder/model.json', '/models/decoder/model.json', "
          f"'/models/classifier/model.json', '/models/descriptor/model.json')")
    print(f"\nInference snippet:")
    print(f"  category, probs = predict_category(classifier, spect)")
    print(f"  params = constrain_algo_by_category(decoded_params, category)")


if __name__ == "__main__":
    main()
