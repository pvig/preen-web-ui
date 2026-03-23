# PreenFM3 Web Editor

Éditeur web moderne pour le synthétiseur PreenFM3, avec communication MIDI bidirectionnelle et interface graphique interactive.

![React](https://img.shields.io/badge/React-18-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Vite](https://img.shields.io/badge/Vite-5-purple) ![Web MIDI](https://img.shields.io/badge/Web%20MIDI-API-green)

## ✨ Fonctionnalités

### 🎹 Édition de patches
- **32 algorithmes FM** avec visualisation graphique du routage
- **6 opérateurs** configurables (forme d'onde, fréquence, détune, enveloppe ADSR)
- **Indices de modulation** (IM1-IM6) avec contrôle de vélocité
- **Carriers** avec contrôles de volume et panoramique

### 🔊 Sources de modulation
- **3 LFOs** (oscillateurs basse fréquence)
  - Shapes : Sin, Saw, Triangle, Square, Random, Brownian, Wandering, Flow
  - Fréquence : 0-99.9 Hz ou synchronisation MIDI Clock
  - Bias, Phase, Key Sync
- **2 LFO Envelopes** (enveloppes libres)
  - Env1 : ADSR classique
  - Env2 : Silence-Attack-Release avec modes de loop
  - Visualisation interactive avec drag & drop
- **Matrice de modulation** : 12 routages configurables
- **Step Sequencers** : 2 séquenceurs, 16 steps chacun *(à venir)*

### 🔌 Communication MIDI
- **Connexion USB** directe avec le PreenFM3 (Web MIDI API)
- **Patch Pull** : récupération complète du patch depuis le hardware
- **Édition temps réel** : changements envoyés instantanément au synthé
- **Sync bidirectionnelle** : UI ↔ Hardware

### 📊 Visualisations
- **Graphe d'algorithme SVG** : visualisation du routage FM
- **Enveloppes interactives** : drag & drop pour éditer les points
- **Knobs réalistes** : contrôles rotatifs avec feedback visuel

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+ et npm
- Navigateur compatible Web MIDI (Chrome, Edge, Brave, Opera)
- PreenFM3 connecté via USB

### Installation

```bash
# Cloner le repository
git clone https://github.com/pvig/preen-web-ui.git
cd preen-web-ui

# Installer les dépendances
npm install

# Lancer en mode développement
npm run dev
```

L'application sera accessible sur `http://localhost:5173`

### Build pour production

```bash
npm run build
npm run preview  # Prévisualiser le build
```

## 📖 Utilisation

### 1. Connexion MIDI

1. Branchez votre PreenFM3 en USB
2. Ouvrez l'application web
3. Cliquez sur le menu **MIDI** en haut à droite
4. Sélectionnez votre PreenFM3 dans les listes (Input et Output)
5. Autorisez l'accès MIDI si demandé par le navigateur

### 2. Charger un patch

**Option A : Pull depuis le hardware**
1. Dans le menu MIDI, cliquez sur **Pull Patch**
2. Le patch actuel du PreenFM3 est chargé dans l'éditeur

**Option B : Créer un nouveau patch**
1. Sélectionnez un algorithme dans la liste
2. Configurez les opérateurs et les modulations
3. Les changements sont envoyés en temps réel au PreenFM3

### 3. Éditer le patch

**Page Patch Editor**
- Sélectionnez l'algorithme FM
- Visualisez le routage des opérateurs
- Ajustez les indices de modulation

**Page Operators**
- Configurez chaque opérateur (forme d'onde, fréquence, détune)
- Éditez les enveloppes ADSR de chaque opérateur
- Contrôlez le volume et le pan des carriers

**Page Modulations**
- Configurez les 3 LFOs (shape, fréquence, bias)
- Éditez visuellement les 2 LFO Envelopes
- Configurez la matrice de modulation (12 routages)

### 4. Sauvegarder

Les patches sont automatiquement sauvegardés dans le store local. Pour sauvegarder sur le PreenFM3 :
1. Éditez votre patch dans l'interface
2. Sur le PreenFM3 : Menu → Save → sélectionnez un slot

## 🛠️ Architecture technique

### Stack
- **React 18** : Interface utilisateur
- **TypeScript** : Typage statique
- **Vite** : Build tool et dev server
- **Zustand** : State management
- **styled-components** : Styling

### Structure du projet

```
src/
├── components/          # Composants React
│   ├── fmEngine/       # Éditeur d'algorithmes et opérateurs
│   ├── modulations/    # LFOs, enveloppes, matrice, séquenceurs
│   └── knobs/          # Contrôles rotatifs (knobs)
├── stores/             # Store Zustand (patchStore)
├── types/              # Types TypeScript
├── midi/               # Communication MIDI
│   ├── midiService.ts  # Service MIDI bas niveau
│   ├── preenFM3Parser.ts  # Parser NRPN
│   └── README.md       # Documentation MIDI
├── algo/               # Définitions des algorithmes FM
└── screens/            # Pages principales
```

### Documentation technique

- **[MIDI Integration](src/midi/README.md)** : Usage fonctionnel MIDI
- **[MIDI Technical](src/midi/TECHREADME.md)** : Protocole MIDI détaillé (CC, NRPN, mapping)

## 🌐 Compatibilité navigateur

| Navigateur | Support | Notes |
|------------|---------|-------|
| Chrome / Chromium | ✅ | Recommandé |
| Edge | ✅ | Recommandé |
| Brave | ✅ | Recommandé |
| Opera | ✅ | |
| Firefox | ⚠️ | Nécessite activation du flag `dom.webmidi.enabled` |
| Safari | ❌ | Web MIDI non supporté |

## 🎯 Roadmap

### Implémenté
- ✅ Éditeur d'algorithmes et opérateurs
- ✅ LFOs avec MIDI Clock sync
- ✅ LFO Envelopes interactives
- ✅ Matrice de modulation
- ✅ Patch Pull complet (NRPN parser)
- ✅ Patch Push complet (envoi NRPN de tous les paramètres)
- ✅ Édition temps réel (volume carriers, algorithme, IM)
- ✅ Sauvegarde/chargement de patches (`.patch`, 1024 bytes FlashSynthParams)
- ✅ Organisation de banks (`.bnk`, 128 × 1024 bytes) — drag-and-drop, renommage, import/export de patches
- ✅ Compatibilité firmware PreenFM3 (format binaire vérifié contre le code source firmware)

### En cours / À venir
- ⏳ Step Sequencers (UI + MIDI)
- ⏳ Undo/Redo
- ⏳ Éditeur d'effets (filtres, reverb, etc.)

> 📖 Voir [PATCH_MANAGEMENT.md](PATCH_MANAGEMENT.md) pour la documentation technique détaillée
> du système de gestion des patches (format binaire, architecture, NRPN, firmware).

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :
- Ouvrir des issues pour rapporter des bugs ou suggérer des fonctionnalités
- Soumettre des pull requests
- Améliorer la documentation

## 📄 License

Ce projet est sous licence MIT. Voir le fichier LICENSE pour plus de détails.

## 🙏 Remerciements

- [Xavier Hosxe](https://github.com/Ixox) pour le PreenFM3 et son firmware open source
- La communauté PreenFM pour le support et les feedbacks
- [Web MIDI API](https://www.w3.org/TR/webmidi/) pour rendre la communication MIDI possible dans le navigateur

## 🔗 Liens utiles

- [PreenFM3 Firmware](https://github.com/Ixox/preenfm3)
- [PreenFM3 Website](https://ixox.fr/preenfm2/)
- [PreenFM2 Official Editor](https://github.com/Ixox/preenfm2Controller)
- [Web MIDI API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)

---

**Développé avec ❤️ pour la communauté PreenFM**

