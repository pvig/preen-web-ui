# Entraînement du CVAE PreenFM3

`scripts/train_cvae.py` entraîne le **Conditional VAE** décrit dans
`src/ml/patchVariator.ts` et exporte encoder + decoder au format
**TF.js LayersModel** utilisable directement dans le navigateur.

---

## Prérequis

### Python ≥ 3.10

```bash
# Ubuntu/Debian — installer le support venv si absent
sudo apt-get install python3.12-venv

# Créer l'environnement et installer les dépendances
python3 -m venv .venv2
source .venv2/bin/activate
pip install tensorflow tensorflowjs tqdm numpy
```

> Le package `tensorflowjs` n'est **pas** indispensable à l'export : le script
> inclut un sérialiseur intégré. Si `tensorflowjs` est installé, il sera
> préféré.

---

## Préparer les données

Le script accepte un dossier contenant des fichiers `.json` dans l'un
de ces formats :

| Format | Description |
|---|---|
| `{"operators": […], "algorithm": {…}, …}` | Un fichier = un patch |
| `[{…}, {…}, …]` | Un fichier = tableau de patches |
| `{"patches": [{…}, …]}` | Wrapper avec clé `patches` |

Les exports de la **PatchLibrary** de l'UI sont déjà au bon format.
Plus le dataset est grand (≥ 500 patches idéalement), meilleure sera la
qualité des variations.

---

## Lancer l'entraînement

```bash
source .venv2/bin/activate

# Entraînement minimal (rapide, style non conditionné)
python scripts/train_cvae.py \
  --patches ./scripts/patch_library/

# Avec synthèse FM pour le conditionnement de style (+ lent, + qualitatif)
python scripts/train_cvae.py \
  --patches ./scripts/patch_library/ \
  --synth-spect

# Toutes les options
python scripts/train_cvae.py \
  --patches     ./scripts/patch_library/  # dossier sources              (requis)
  --output      public/models/     # destination TF.js            (défaut)
  --checkpoints checkpoints/       # poids intermédiaires         (défaut)
  --epochs      200                # nombre d'epochs max          (défaut)
  --batch-size  64                 # taille du mini-batch         (défaut)
  --lr          0.001              # learning rate Adam           (défaut)
  --beta        0.5                # poids KL final               (défaut)
  --warmup      67                 # epochs de warmup KL          (epochs/3)
  --augment     3                  # facteur d'augmentation       (défaut)
  --val-split   0.1                # fraction de validation       (défaut)
  --seed        42                 # seed aléatoire               (défaut)
```

### Reprendre après interruption

```bash
python scripts/train_cvae.py \
  --patches ./scripts/patch_library/ \
  --resume  checkpoints/
```

### Exporter des poids déjà entraînés

```bash
python scripts/train_cvae.py \
  --patches     ./scripts/patch_library/ \
  --export-only checkpoints/
```

---

## Résultats

Après l'entraînement, les fichiers suivants sont créés :

```
public/models/
  encoder/
    model.json             ← topologie + manifeste des poids
    group1-shard1of1.bin   ← poids float32 concaténés
  decoder/
    model.json
    group1-shard1of1.bin

checkpoints/
  encoder_best.weights.h5  ← meilleur checkpoint encoder
  decoder_best.weights.h5  ← meilleur checkpoint decoder
  training_log.csv         ← courbes loss/val_loss par epoch
```

---

## Activer les poids dans l'UI

Dans `src/ml/patchVariator.ts` (ou au démarrage de l'app) :

```typescript
import { variator } from './ml/patchVariator';

await variator.loadWeights(
  '/models/encoder/model.json',
  '/models/decoder/model.json',
);
// Le variateur utilise désormais l'inférence neurale
// au lieu de la perturbation gaussienne.
```

Sans appel à `loadWeights()`, le Variateur fonctionne immédiatement en
mode **perturbation structurée** (bruitage gaussien dans l'espace des
paramètres FM) — résultat musical sans aucun modèle.

---

## Architecture

```
ENCODER  (16 496 paramètres)
  Content branch : params(37) → Dense(32) → Dense(64)
  Style branch   : spect(32×128×1) → Conv2D×3 → GlobalAvgPool → Dense(32)
  Combined       : concat(96) → Dense(48) → [μ(16), log_σ(16)]

DECODER  (10 021 paramètres)
  [z(16) ‖ src_params(37)] → Dense(64) → Dense(64) → Dense(37, sigmoid)

Total : 26 517 paramètres
Loss  : MSE_reconstruction + β · KL(q(z|x) ‖ N(0,I))
β     : anneal de 0 → 0.5 sur les premières epochs/3 epochs (warmup)
```

### Vecteur de paramètres (37 dimensions, normalisé [0, 1])

| Indice | Paramètre | Dénormalisation |
|--------|-----------|-----------------|
| `p[0]` | Algorithme | `idx = round(p[0] × 31)` |
| `p[1..6]` | Fréquences opérateurs | `× 16 Hz/ratio` |
| `p[7..12]` | Amplitudes opérateurs | direct |
| `p[13..18]` | Temps d'attaque ADSR | `× 100 ms` |
| `p[19..24]` | Temps de decay ADSR | `× 100 ms` |
| `p[25..30]` | Niveaux de sustain ADSR | `× 100` |
| `p[31..36]` | Temps de release ADSR | `× 100 ms` |

---

## Notes

- **GPU** : si CUDA est disponible, TensorFlow l'utilisera automatiquement.
  Sur CPU, 200 epochs sur ~500 patches prend environ 5–15 minutes.
- **Qualité sans spectrogrammes** (`--synth-spect` absent) : le branche
  style reçoit des zéros, le modèle apprend uniquement depuis les
  vecteurs de paramètres. Résultat déjà utile.
- **Qualité avec spectrogrammes** : la synthèse FM intégrée est
  approximative (6 oscillateurs sinusoïdaux, pas d'algorithme exact).
  Un vrai moteur FM (ex. Surge XT en headless) donnera de meilleurs
  spectrogrammes.
- **Commits** : ne pas commiter `checkpoints/` ni `.venv2/` (déjà dans
  `.gitignore`). Les fichiers `public/models/` peuvent être commités
  après un entraînement satisfaisant.
