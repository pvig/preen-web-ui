#!/usr/bin/env python3
"""
generate_map.py — 2D Latent Space Map Generator for PreenFM3 WebUI
==================================================================
Reads all patches from the patch library, encodes them via the trained CVAE
encoder, projects to 2D via UMAP (falling back to t-SNE then PCA), and writes
public/latent_map.json for the LatentSpaceMap React component.

Output format
-------------
{
  "has_z_vectors": bool,          -- false when encoder unavailable
  "latent_dim": 12,               -- z_vector length (or 85 if PCA fallback)
  "method": "umap",
  "structured": true,             -- present when z_vector is 12-dim (3-head)
  "z_osc_dim":    6,              -- dims 0-5  (Timbre)
  "z_env_dim":    4,              -- dims 6-9  (Dynamics)
  "z_matrix_dim": 2,              -- dims 10-11 (Modulation)
  "points": [
    {
      "name":          "PatchName",
      "x":             0.42,      -- global 2D (alias for x_timbre)
      "y":             0.67,      -- global 2D (alias for y_timbre)
      "z_vector":      [12 floats], -- empty [] when has_z_vectors=false
      "params":        [85 floats], -- always present (for crosshair distance)
      "category":      "LEAD",
      "x_timbre":      0.42,      -- Timbre head 2D projection
      "y_timbre":      0.67,
      "x_dynamics":    0.31,      -- Dynamics head 2D projection
      "y_dynamics":    0.58,
      "x_modulation":  0.72,      -- Modulation head 2D projection (raw z_mat)
      "y_modulation":  0.44
    }, ...
  ]
}

Usage
-----
  cd /path/to/preenWebUI

  # Default: UMAP + CVAE encoder
  python scripts/generate_map.py

  # t-SNE instead of UMAP
  python scripts/generate_map.py --method tsne

  # Skip encoder (PCA on raw params — no TensorFlow needed)
  python scripts/generate_map.py --no-encoder

  # Custom paths
  python scripts/generate_map.py \\
    --patches scripts/patch_library \\
    --checkpoints checkpoints \\
    --output public/latent_map.json

Install dependencies
--------------------
  pip install tensorflow umap-learn          # recommended
  pip install tensorflow scikit-learn        # t-SNE alternative
  pip install numpy                          # minimum (PCA fallback only)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import warnings
from collections import Counter
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
warnings.filterwarnings("ignore")

import numpy as np

# ── Import shared helpers from train_cvae.py ─────────────────────────────────
# Both scripts live in scripts/, so we add that directory to sys.path.
_SCRIPTS_DIR = Path(__file__).parent
sys.path.insert(0, str(_SCRIPTS_DIR))

from train_cvae import (  # noqa: E402
    PARAM_DIM,
    LATENT_DIM,
    Z_OSC_DIM,
    Z_ENV_DIM,
    Z_MATRIX_DIM,
    SPEC_H,
    SPEC_W,
    CATEGORIES,
    build_style_cnn,
    build_encoder,
    build_classifier,
    load_patches_from_dir,
    patch_to_param_vector,
    label_sound_category,
    _downsample_jsonl_spect,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _load_weights(model, path: Path, label: str) -> bool:
    """Load Keras weights from path. Returns True on success."""
    if not path.exists():
        print(f"  [skip] {label}: {path} not found", file=sys.stderr)
        return False
    try:
        model.load_weights(str(path))
        print(f"  ✓  {label} weights loaded  ({path.name})")
        return True
    except Exception as exc:
        print(f"  [warn] {label}: {exc}", file=sys.stderr)
        return False


def _encode_batched(
    params: "np.ndarray",  # (N, 37)
    spects: "np.ndarray",  # (N, 32, 128, 1)
    encoder,
    batch: int = 256,
) -> "np.ndarray":  # (N, LATENT_DIM)
    """Encode params + spectrograms → z_mean in batches to fit GPU memory."""
    parts = []
    for start in range(0, len(params), batch):
        end = min(start + batch, len(params))
        z_mean, _ = encoder([params[start:end], spects[start:end]])
        parts.append(z_mean.numpy())
    return np.concatenate(parts, axis=0)


def _reduce_2d(vectors: "np.ndarray", method: str) -> "np.ndarray":
    """Project (N, D) → (N, 2) using method='umap' or 'tsne'."""
    N, D = vectors.shape
    print(f"\n📐  Reducing {N}×{D} to 2D via {method.upper()} …")

    if method == "umap":
        try:
            import umap as umap_lib  # type: ignore

            reducer = umap_lib.UMAP(
                n_components=2,
                n_neighbors=min(30, N - 1),
                min_dist=0.05,
                random_state=42,
            )
            return reducer.fit_transform(vectors).astype(np.float32)
        except ImportError:
            print("    umap-learn not installed — falling back to t-SNE")
            method = "tsne"

    if method == "tsne":
        try:
            from sklearn.manifold import TSNE  # type: ignore

            perp = min(30, max(5, N // 5))
            reducer = TSNE(n_components=2, perplexity=perp, random_state=42)
            return reducer.fit_transform(vectors).astype(np.float32)
        except ImportError:
            print("    scikit-learn not installed — using PCA fallback")

    # PCA via numpy SVD (always available)
    print("    Using PCA (pip install umap-learn or scikit-learn for better results)")
    centered = vectors - vectors.mean(axis=0)
    _, _, Vt = np.linalg.svd(centered, full_matrices=False)
    return (centered @ Vt[:2].T).astype(np.float32)


def _normalise(coords: "np.ndarray", margin: float = 0.04) -> "np.ndarray":
    """Normalise 2D coordinates to [margin, 1−margin]² for each axis."""
    out = coords.astype(np.float64).copy()
    for dim in range(2):
        lo, hi = out[:, dim].min(), out[:, dim].max()
        span = (hi - lo) if hi > lo else 1.0
        out[:, dim] = margin + (out[:, dim] - lo) / span * (1.0 - 2.0 * margin)
    return out


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Generate 2D latent-space map JSON for the PreenFM3 WebUI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument(
        "--patches",
        default="scripts/patch_library",
        help="Directory containing .jsonl / .json patches  [default: scripts/patch_library]",
    )
    ap.add_argument(
        "--checkpoints",
        default="checkpoints",
        help="Directory with *.weights.h5 files  [default: checkpoints]",
    )
    ap.add_argument(
        "--output",
        default="public/latent_map.json",
        help="Output JSON path  [default: public/latent_map.json]",
    )
    ap.add_argument(
        "--method",
        default="umap",
        choices=["umap", "tsne"],
        help="Dimensionality-reduction method  [default: umap]",
    )
    ap.add_argument(
        "--no-encoder",
        action="store_true",
        help="Skip CVAE encoder; use PCA on raw 37-dim params (no TensorFlow needed)",
    )
    args = ap.parse_args()

    root = Path.cwd()
    patch_dir = root / args.patches
    ckpt_dir = root / args.checkpoints
    out_path = root / args.output

    out_path.parent.mkdir(parents=True, exist_ok=True)

    # ── 1. Load patches ───────────────────────────────────────────────────────
    print(f"\n📂  Loading patches from {patch_dir} …")
    raw_patches = load_patches_from_dir(patch_dir)
    print(f"    {len(raw_patches)} patches found")
    if not raw_patches:
        sys.exit("No patches found. Check --patches argument.")

    param_list: list[np.ndarray] = []
    names: list[str] = []
    categories: list[str] = []
    spect_list: list[np.ndarray] = []

    for p in raw_patches:
        v = patch_to_param_vector(p)
        if v is None:
            continue
        name = (p.get("meta") or {}).get("patch_name") or p.get("name") or "Patch"
        cat = label_sound_category(name, p.get("spectrogram"))
        raw_s = p.get("spectrogram")
        spect = (
            _downsample_jsonl_spect(raw_s)
            if (isinstance(raw_s, list) and len(raw_s) == 128 * 1024)
            else np.zeros((SPEC_H, SPEC_W, 1), dtype=np.float32)
        )
        param_list.append(v)
        names.append(name)
        categories.append(cat)
        spect_list.append(spect)

    if not param_list:
        sys.exit("No valid patches after parameter extraction.")

    params = np.array(param_list, dtype=np.float32)  # (N, 37)
    spects = np.array(spect_list, dtype=np.float32)  # (N, 32, 128, 1)
    N = len(params)
    print(f"    {N} valid patches  •  {dict(Counter(categories))}")

    # ── 2. Encode → latent vectors ────────────────────────────────────────────
    has_z = False
    z_vecs: np.ndarray = params.copy()  # fallback: project in param space

    if not args.no_encoder:
        try:
            import tensorflow  # noqa: F401
        except ImportError:
            print("\n⚠️   TensorFlow not installed — using PCA on raw params.")
            print("     pip install tensorflow  to enable neural encoding.")
        else:
            print("\n🏗️   Building CVAE encoder …")
            # Build independent style_cnn instances so loading encoder weights
            # does not interfere with classifier weights (they share architecture
            # but must carry separate weight values after training).
            style_enc = build_style_cnn()
            encoder = build_encoder(style_enc)

            enc_ok = _load_weights(
                encoder, ckpt_dir / "encoder_best.weights.h5", "Encoder"
            )

            if enc_ok:
                print(f"\n🔢  Encoding {N} patches (batch=256) …")
                z_vecs = _encode_batched(params, spects, encoder)
                has_z = True
                print(f"    z_vectors shape: {z_vecs.shape}  dtype: {z_vecs.dtype}")
            else:
                print("    Encoder weights missing — projecting raw params instead.")
                print("    Train the model first:  python scripts/train_cvae.py")

    # ── 3. 2D projection ──────────────────────────────────────────────────────
    # Always compute a global 2D projection for the single-map fallback path.
    coords = _normalise(_reduce_2d(z_vecs, args.method))

    latent_dim = LATENT_DIM if has_z else PARAM_DIM

    # When we have real z-vectors we also project each structured head
    # separately so the React UI can render 3 independent mini-maps.
    structured = False
    coords_timbre = coords_dynamics = coords_modulation = None
    if has_z and latent_dim == Z_OSC_DIM + Z_ENV_DIM + Z_MATRIX_DIM:
        structured = True
        z_osc_vecs = z_vecs[:, :Z_OSC_DIM]                             # (N, 6)
        z_env_vecs = z_vecs[:, Z_OSC_DIM:Z_OSC_DIM + Z_ENV_DIM]       # (N, 4)
        z_mat_vecs = z_vecs[:, Z_OSC_DIM + Z_ENV_DIM:]                 # (N, 2)
        print("\n📐  Per-head 2D projections …")
        print("    Timbre  (z_osc  6D) …")
        coords_timbre     = _normalise(_reduce_2d(z_osc_vecs, args.method))
        print("    Dynamics (z_env  4D) …")
        coords_dynamics   = _normalise(_reduce_2d(z_env_vecs, args.method))
        # z_mat is already 2D — normalise directly, no dim-reduction needed
        print("    Modulation (z_mat 2D) — normalise only")
        coords_modulation = _normalise(z_mat_vecs)

    # ── 4. Assemble and write JSON ────────────────────────────────────────────
    def _pt(i: int) -> dict:
        pt: dict = {
            "name":     names[i],
            "x":        float(coords[i, 0]),
            "y":        float(coords[i, 1]),
            "z_vector": z_vecs[i].tolist() if has_z else [],
            "params":   params[i].tolist(),
            "category": categories[i],
        }
        if structured:
            pt["x_timbre"]     = float(coords_timbre[i, 0])
            pt["y_timbre"]     = float(coords_timbre[i, 1])
            pt["x_dynamics"]   = float(coords_dynamics[i, 0])
            pt["y_dynamics"]   = float(coords_dynamics[i, 1])
            pt["x_modulation"] = float(coords_modulation[i, 0])
            pt["y_modulation"] = float(coords_modulation[i, 1])
        return pt

    output: dict = {
        "has_z_vectors": has_z,
        "latent_dim":    latent_dim,
        "method":        args.method,
        "points":        [_pt(i) for i in range(N)],
    }
    if structured:
        output["structured"]    = True
        output["z_osc_dim"]     = Z_OSC_DIM
        output["z_env_dim"]     = Z_ENV_DIM
        output["z_matrix_dim"]  = Z_MATRIX_DIM

    print(f"\n💾  Writing {N} entries to {out_path} …")
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = out_path.stat().st_size // 1024
    dist = Counter(categories)
    print(f"\n✅  Done!  {out_path}  ({size_kb} KB)")
    print(f"    {N} points  •  has_z_vectors={has_z}  •  method={args.method}")
    print(
        "    Categories: "
        + "  ".join(f"{c}={dist.get(c, 0)}" for c in CATEGORIES)
    )
    print("\n    ➜  Navigate to the 'Map' tab in the WebUI to explore the space.")


if __name__ == "__main__":
    main()
