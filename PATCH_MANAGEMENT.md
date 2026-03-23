# Patch Management — Architecture & Format Reference

> **Fichier de référence** pour le système de gestion des patches du PreenFM3 Web Editor.
> Contient les spécifications des formats binaires, l'architecture des fichiers source,
> et les décisions de conception importantes pour les futures sessions de développement.
>
> **Mots-clés** : patchSerializer, patchManager, ReorderingComponent, FlashSynthParams,
> .patch, .bnk, NRPN, firmware, binary format, preset, bank

---

## 1. Formats de fichiers

### `.patch` — Preset individuel (1024 octets)

Un fichier `.patch` contient exactement **1024 octets** correspondant à la struct C++ `FlashSynthParams`
du firmware PreenFM3. C'est le format d'échange pour un preset individuel.

- **Sérialisation** : `patchToFlashSynthParams(patch)` → `Uint8Array` (1024 bytes)
- **Désérialisation** : `flashSynthParamsToPatch(data)` → `Patch`
- **Sauvegarde** : `downloadPatchFile(patch)` — File System Access API ou `<a download>` fallback
- **Chargement** : `loadPatchFile(data)` — parse un `ArrayBuffer` en `Patch`
- **Extension** : `.patch` (`.syx` aussi accepté en import pour rétrocompatibilité)

### `.bnk` — Bank complète (131 072 octets)

Un fichier `.bnk` est une concaténation plate de **128 presets × 1024 octets**.

- **Taille totale** : 128 × 1024 = 131 072 octets
- **Lecture** : `ReorderingComponent` parse le buffer en 128 blocs de 1024 octets
- **Écriture** : `buildBankData(slots)` reconstruit le buffer complet
- **Compatibilité firmware** : le firmware PreenFM3 (`PatchBank.cpp`) vérifie :
  - Extension `.bnk` (obligatoire)
  - Taille ≥ 100 000 octets (obligatoire)
  - Lecture par `patchNumber * ALIGNED_PATCH_SIZE` (1024)

---

## 2. Layout binaire FlashSynthParams (1024 octets)

Toutes les valeurs sont en **float32 little-endian** (ARM) sauf indication contraire.

| Offset | Taille | Champ | Description |
|--------|--------|-------|-------------|
| 0 | 16 | `engine1` | algo, velocity, playMode, glideSpeed |
| 16 | 16 | `flashEngineIm1` | im1, im2, im3, im4 |
| 32 | 16 | `flashEngineIm2` | im5, im6, notUsed, notUsed |
| 48 | 16 | `engineMix1` | mixOsc1, panOsc1, mixOsc2, panOsc2 |
| 64 | 16 | `engineMix2` | mixOsc3, panOsc3, mixOsc4, panOsc4 |
| 80 | 16 | `engineMix3` | mixOsc5, panOsc5, mixOsc6, panOsc6 |
| 96 | 96 | `osc1-6` | 6 × (shape, freqType, freqMul, detune) |
| 192 | 192 | `env1a-6b` | 6 × (envA[4] + envB[4]) = 6 × 8 floats |
| 384 | 192 | `matrix1-12` | 12 × (source, multiplier, dest1, dest2) |
| 576 | 48 | `lfoOsc1-3` | 3 × (shape, freq, bias, keysync) |
| 624 | 16 | `lfoEnv1` | attack, decay, sustain, release |
| 640 | 16 | `lfoEnv2` | silence, attack, decay, loop |
| 656 | 16 | `lfoSeq1` | bpm, gate, unused, unused |
| 672 | 16 | `lfoSeq2` | bpm, gate, unused, unused |
| 688 | 16 | `lfoSteps1` | 16 × uint8 (valeurs 0-15) |
| 704 | 16 | `lfoSteps2` | 16 × uint8 (valeurs 0-15) |
| **720** | 16 | **`presetName`** | **13 chars ASCII + 3 padding** |
| 736 | 16 | `engineArp1` | clock, BPM, direction, octave |
| 752 | 16 | `engineArp2` | pattern, division, duration, latch |
| 768 | 16 | `flashEngineVeloIm1` | imVelo1-4 |
| 784 | 16 | `flashEngineVeloIm2` | imVelo5, imVelo6, unused, unused |
| 800 | 16 | `effect` (Filter 1) | type, param1, param2, gain |
| 816 | 16 | `arpUserPatterns` | 4 × uint32, réservé |
| 832 | 16 | `lfoPhases` | phase1, phase2, phase3, unused |
| 848 | 16 | `midiNote1Curve` | curveBefore, breakNote, curveAfter, unused |
| 864 | 16 | `midiNote2Curve` | idem |
| 880 | 16 | `engine2` | glideType, unisonSpread, unisonDetune, **pfm3Version** |
| 896 | 16 | `envCurves1To4` | 4 envelopes × 4 uint8 (attack/decay/sustain/release curve) |
| 912 | 8 | `envCurves5To6` | 2 envelopes × 4 uint8 |
| **920** | 16 | **`effect2` (Filter 2)** | **type, param1, param2, gain — PreenFM3 only** |
| 936 | 83 | padding | zeros |
| **1019** | 4 | **version tag** | **uint32 LE — PRESET_VERSION1 = 0** |

### Champs critiques

- **`engine2.pfm3Version`** (offset 892, 4e float à offset 880) : `1.0f` = patch PreenFM3. Si `0`, le firmware traite le patch en mode compatibilité preenfm2.
- **`envCurves`** : si tout à zéro, le firmware applique des valeurs par défaut (attackCurve=1, decayCurve=0, sustainCurve=1, releaseCurve=0).
- **`effect2`** (Filter 2) : si tout à zéro, le firmware applique : type=OFF, param1=0.5, param2=0.5, gain=1.0.
- **Version tag** (offset 1019) : `PRESET_VERSION1 = 0` (version courante). `PRESET_VERSION2 = 292928062` (expérimental, non utilisé).

---

## 3. Architecture des fichiers source

### `src/midi/patchSerializer.ts` (~1036 lignes)

Sérialiseur/désérialiseur bidirectionnel Patch ↔ binaire + génération NRPN.

**Fonctions exportées :**
| Fonction | Description |
|----------|-------------|
| `patchToFlashSynthParams(patch)` | `Patch` → `Uint8Array` (1024 bytes) |
| `flashSynthParamsToPatch(data)` | `Uint8Array` → `Patch` (via PreenFM3Parser) |
| `downloadPatchFile(patch)` | Sauvegarde `.patch` (File System Access API + fallback) |
| `loadPatchFile(data)` | Parse `.patch` `ArrayBuffer` → `Patch` |
| `patchToNRPNMessages(patch)` | `Patch` → `NRPNMsg[]` pour envoi MIDI |

**Constantes clés :** `PRESET_SIZE = 1024`, offsets `OFF_ENGINE1` à `OFF_VERSION_TAG`.

**Particularité Filter 2** : Dans le binaire flash, Filter 2 est à l'offset 920 (`OFF_EFFECT2`).
En NRPN live, Filter 2 est aux adresses MSB=0 LSB=44-47, ce qui conflit avec les oscillateurs
(MSB=0 LSB=44-67). Le sérialiseur gère cette ambiguïté : en lecture flash, il lit directement
l'offset 920 pour corriger le Filter 2 après le parsing NRPN.

### `src/midi/preenFM3Parser.ts` (~980 lignes)

Parseur NRPN → `Patch`. Utilisé à la fois pour le MIDI live (Pull) et comme étape intermédiaire
de `flashSynthParamsToPatch()`.

- `addNRPN(msg)` : accumule les messages NRPN
- `toPatch()` : construit un objet `Patch` complet depuis les NRPN accumulés
- Filter 1 : MSB=0 LSB=40-43
- Filter 2 : MSB=0 LSB=44-47 (⚠ conflit avec osc1, corrigé dans patchSerializer)

### `src/midi/useMidiActions.ts`

Hook React pour les actions MIDI Push/Pull.

- `sendPatch()` : appelle `patchToNRPNMessages(patch)` puis envoie chaque NRPN avec 3ms de délai
- `receivePatch()` : collecte les NRPN reçus et parse via `PreenFM3Parser.toPatch()`

### `src/components/PatchManager.tsx` (~281 lignes)

Deux panneaux React :

- **`PatchSavePanel`** : sauvegarde/chargement de patches individuels `.patch`
  - Boutons : « Sauvegarder le patch en .patch » / « Charger un patch (.patch) »
  - Accepte aussi `.syx` en import (rétrocompatibilité)

- **`BankOrganizerPanel`** : ouvre un `.bnk` et lance le `ReorderingComponent` modal
  - Bouton : « Ouvrir un fichier .bnk »
  - Modale d'aide (?) décrivant le workflow et les prérequis navigateur

### `src/components/ReorderingComponent.tsx` (~711 lignes)

Organiseur de bank — grille 8 colonnes × 16 rangées (128 presets).

**Fonctionnalités :**
- **Drag-and-drop** : glisser un preset sur un autre pour échanger leurs positions
- **Double-clic** : renommer un preset (12 caractères max)
- **Clic-droit** → menu contextuel :
  - 📥 « Remplacer par un .patch… » — sélectionne un fichier `.patch` et remplace le slot
  - 📤 « Exporter en .patch » — télécharge le slot en tant que fichier `.patch`
- **Bouton « Importer .patch »** (footer) : sélection multiple, place les patches dans les premiers slots vides
- **Sauvegarder / Sauvegarder sous…** : écrit le `.bnk` via File System Access API

**Constants** : `PRESET_SIZE = 1024`, `PRESET_COUNT = 128`, `NAME_OFFSET = 720`, `NAME_MAX_LEN = 12`

---

## 4. Sources firmware de référence

Le format binaire a été vérifié contre le code source firmware PreenFM3 (branche master) :

| Fichier firmware | Rôle | URL |
|-----------------|------|-----|
| `PatchBank.cpp` | Lecture/écriture/création de banks sur SD | `firmware/Src/filesystem/PatchBank.cpp` |
| `PatchBank.h` | Constantes PRESET_VERSION1/2 | `firmware/Inc/filesystem/PatchBank.h` |
| `PreenFMFileType.h` | Struct `FlashSynthParams`, `ALIGNED_PATCH_SIZE=1024` | `firmware/Inc/filesystem/PreenFMFileType.h` |
| `PreenFMFileType.cpp` | `convertParamsToFlash()` / `convertFlashToParams()` | `firmware/Src/filesystem/PreenFMFileType.cpp` |

Repo : `https://github.com/Ixox/preenfm3/tree/master/firmware`

### Points clés du firmware

- `isCorrectFile()` dans `PatchBank.cpp` : vérifie extension `.bnk` ET taille ≥ 100 000 octets
- `loadPatch()` : lit `patchNumber * ALIGNED_PATCH_SIZE` octets, vérifie version à offset 1019
- `savePatch()` : zero-init buffer, `convertParamsToFlash()`, écrit version à offset 1019
- `convertFlashToParams()` : gère gracieusement les zéros pour `envCurves` et `effect2` (applique des défauts)
- `engine2.pfm3Version = 1.0f` marque un patch PreenFM3 vs mode pfm2

---

## 5. NRPN Address Space

Mapping NRPN utilisé pour la communication MIDI live et la sérialisation flash :

| MSB | LSB | Contenu |
|-----|-----|---------|
| 0 | 0-3 | Engine1 (algo, velocity, playMode, glide) |
| 0 | 4-15 | IM/Velo interleaved (im1, velo1, im2, velo2, …, im6, velo6) |
| 0 | 16-27 | Mix/Pan (mix1, pan1, …, mix6, pan6) |
| 0 | 28-35 | Arpeggiator (clock, BPM, direction, octave, pattern, division, duration, latch) |
| 0 | 40-43 | Filter 1 (type, param1, param2, gain) |
| 0 | 44-67 | Oscillators 1-6 (shape, freqType, freq, detune × 6) |
| 0 | 68-115 | Envelopes 1-6 (atkT, atkL, decT, decL, susT, susL, relT, relL × 6) |
| 0 | 116-127 | Matrix rows 1-3 |
| 0 | 200-207 | Note curves 1-2 |
| 1 | 0-35 | Matrix rows 4-12 |
| 1 | 40-51 | LFOs 1-3 |
| 1 | 52-55 | LFO Env1 |
| 1 | 56-59 | LFO Env2 |
| 1 | 60-67 | Step Seq 1-2 params |
| 1 | 68-70 | LFO Phases |
| 1 | 100-111 | Preset name (12 chars) |
| 2 | 0-15 | Step Seq 1 steps |
| 3 | 0-15 | Step Seq 2 steps |

⚠ **Conflit LSB 44-47** : Filter 2 (NRPN) et Osc 1 (NRPN) partagent les mêmes adresses.
En MIDI live cela fonctionne car le firmware distingue les contextes. En lecture flash, le
sérialiseur lit Filter 2 directement depuis l'offset 920 pour lever l'ambiguïté.

---

## 6. Prérequis navigateur

La sauvegarde de fichiers utilise la **File System Access API** :

| Navigateur | Support | Note |
|-----------|---------|------|
| Chrome/Edge | ✅ Natif | — |
| Brave | ⚠ Flag | `brave://flags/#file-system-access-api` → Enabled |
| Firefox/Safari | ❌ | Fallback `<a download>` (pas de choix d'emplacement) |

---

## 7. Types TypeScript importants

- **`Patch`** (`src/types/patch.ts`) : objet principal, contient `operators[]`, `algorithm`, `filters[]`, `lfos[]`, `modulationMatrix[]`, etc.
- **`Filter`** (`src/types/patch.ts`) : `{ type, param1, param2, gain }` — type issu de `FILTER1_TYPE_LIST` ou `FILTER2_TYPE_LIST`
- **`FILTER1_TYPE_LIST`** : 48 types (OFF, MIXER, LP, HP, … TEEBEE, SVFLH, CRUSH2)
- **`FILTER2_TYPE_LIST`** : 17 types (OFF, FLANGE, DIMENSION, CHORUS, … RESONATORS)
- **`NRPNMsg`** : `{ paramMSB, paramLSB, valueMSB, valueLSB }`

---

## 8. Workflow utilisateur

```
┌───────────────────────────────────────────────────────────────┐
│  PatchEditor (édition live)                                   │
│    ↓ sendPatch() ──→ MIDI NRPN Push                          │
│    ↓ downloadPatchFile() ──→ fichier .patch (1024 bytes)      │
└───────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────────┐
│  ReorderingComponent (organisation de bank)                   │
│    • Ouvrir un .bnk existant                                  │
│    • Importer des .patch dans les slots vides                 │
│    • Clic-droit → remplacer un slot par un .patch             │
│    • Clic-droit → exporter un slot en .patch                  │
│    • Drag-and-drop pour réorganiser                           │
│    • Sauvegarder en .bnk                                      │
└───────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────────────┐
│  Carte SD du PreenFM3                                         │
│    0:/pfm3/  ← copier le .bnk ici                             │
│    Firmware charge via PatchBank.cpp                           │
└───────────────────────────────────────────────────────────────┘
```
