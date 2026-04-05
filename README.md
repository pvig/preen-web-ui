# PreenFM3 Web Editor

A modern web editor for the PreenFM3 synthesizer with bidirectional MIDI communication, interactive graphical interface, patch management, and genetic patch breeding.

![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Vite](https://img.shields.io/badge/Vite-6-purple) ![Web MIDI](https://img.shields.io/badge/Web%20MIDI-API-green)

## ✨ Features

### 🎹 FM Patch Editing
- **32 FM algorithms** with interactive SVG routing graph (D3-powered)
- **6 operators** — waveform, frequency ratio, detune, ADSR envelope, operator curves (7 shapes per segment), keyboard tracking
- **Modulation indexes** (IM1–IM6) with velocity control
- **Carrier controls** — individual volume and pan knobs per carrier

### 🔊 Modulation Sources
- **3 LFOs** — 8 shapes (Sin, Saw, Ramp, Square, Random, Noise, Wandering, Flow), frequency 0–99.9 Hz or 9 MIDI Clock divisions (MC/16 to MC×8), bias, phase, key sync
- **2 LFO Envelopes** — Env1: classic ADSR; Env2: Silence-Attack-Release with loop modes (Off / Silence / Attack loop); interactive visualizer
- **Modulation Matrix** — 12 configurable routings (source, destination 1, destination 2, amount)
- **2 Step Sequencers** — 16 steps each, BPM, gate, Internal/External sync, MIDI clock division

### 🎛️ Filters, Arpeggiator & Note Curves
- **Filter 1** — type, param1, param2, gain
- **Filter 2** — conditionally displayed for firmware version > 100
- **Arpeggiator** — clock (Off / Internal / External), BPM, direction, octave, pattern, division, duration, latch
- **2 Note Curves** — before/break/after scaling with curve type selector and SVG visualizer

### 🔌 MIDI Communication
- **Direct USB connection** to the PreenFM3 (Web MIDI API)
- **Patch Pull** — full patch retrieval from hardware via NRPN stream
- **Real-time editing** — every parameter change is sent immediately to the synth
- **Bidirectional sync** — UI ↔ Hardware
- **NRPN pacing queue** — prevents buffer overflow on data-heavy sends
- **Corrected CC mapping** — Mix/Pan CC numbers empirically verified against firmware (22–29, interleaved)

### 📦 Patch Management
- **Save/Load `.patch` files** — 1024-byte binary (`FlashSynthParams` format, verified against firmware source)
- **Bank organizer `.bnk`** — 128-preset banks (128 × 1024 bytes), drag-and-drop reordering, double-click rename, import/export individual patches
- **4-slot patch memory rack** — quick temporary storage slots; capture current patch, recall or send to Breeder parents

### 🧬 Genetic Patch Breeder
- **Two parent slots** — load a patch from file or pull from hardware
- **Genetic crossover** — 6 DNA blocks (ALGO, OSC, ENV, MATRIX, FILTER1, FILTER2), each inherited from one parent
- **Smart matrix merging** — tracks modulation role dominance (TIMBRE / PITCH / AMP_PAN) across parents
- **Gaussian mutation** — Box-Muller noise per parameter, controlled by a mutation rate slider, clamped to firmware limits
- **Generates 4 children** — each child shows block provenance; per-child actions: Listen (MIDI preview), promote to Parent A/B, Load into editor, Save as `.patch`

### 🔀 Patch Mutation / Interpolation
- **Continuous mix** between two source patches (factor 0–1)
- **Harmonic quantization** — frequency crossfades snap through the harmonic grid [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16] when both values are on-grid
- **Discrete parameter threshold** — algorithm, waveform, filter type use 0.5 threshold pick

### 📊 Visualizations & UI
- **D3 algorithm graph** — real-time FM routing visualization
- **Interactive envelopes** — drag & drop to edit ADSR points
- **Realistic knobs** — rotary controls with visual feedback (custom `KnobBase` component)
- **Real-time spectrogram** — microphone input, FFT 2048, Magma colormap LUT (128 frames rolling buffer; also provides normalized buffer for future ML style-conditioning)
- **Dark / Light theme** toggle
- **EN / FR internationalization** — `i18next` with 12 translation namespaces; auto-detects browser language

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- A Web MIDI compatible browser (Chrome, Edge, Brave, Opera)
- PreenFM3 connected via USB

### Installation

```bash
git clone https://github.com/pvig/preen-web-ui.git
cd preen-web-ui
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Production Build

```bash
npm run build
npm run preview   # Preview the build locally
```

## 📖 Usage

### 1. MIDI Connection

1. Plug your PreenFM3 in via USB
2. Open the web app
3. Click the **MIDI** menu (top right)
4. Select your PreenFM3 in both the Input and Output lists
5. Grant MIDI access when prompted by the browser

### 2. Loading a Patch

**Option A — Pull from hardware**
1. In the MIDI menu, click **Pull Patch**
2. The current PreenFM3 patch is loaded into the editor

**Option B — Load from file**
1. Go to the **Library** tab
2. Use **Load Patch** to open a `.patch` file

**Option C — From a bank**
1. Load a `.bnk` file in the Bank Organizer
2. Drag, rename or export any of the 128 presets

### 3. Editing a Patch

| Tab | What you can do |
|-----|-----------------|
| **Patch Editor** | Select FM algorithm, visualize operator routing, adjust modulation indexes, configure all 6 operators |
| **Modulations** | Configure LFOs (shape, frequency, bias, phase), LFO Envelopes, Step Sequencers, Modulation Matrix |
| **Arp / Filter** | Arpeggiator, Filters 1 & 2, Note Curves |
| **Effects** | *(coming soon)* |
| **Library** | Save/load patches and banks, 4-slot memory rack, Breeder editor |

### 4. Saving

Changes are sent live to the PreenFM3. To save on the hardware itself:
1. Edit your patch in the editor
2. On the PreenFM3: Menu → Save → select a slot

To save to disk, use **Save Patch** in the Library tab (exports a `.patch` file).

## 🛠️ Technical Architecture

### Stack

| Technology | Version | Role |
|------------|---------|------|
| React | 19 | UI framework |
| TypeScript | 5.8 | Static typing |
| Vite | 6 | Build tool & dev server |
| Zustand + Immer | 5 | State management |
| styled-components | 6 | CSS-in-JS theming |
| MUI | 7 | UI component library |
| D3 | 7 | SVG algorithm visualization |
| webmidi | 3 | Web MIDI API wrapper |
| i18next | 25 | Internationalization |
| Vitest | 2 | Unit testing |

### Project Structure

```
src/
├── screens/             # Top-level pages (PatchEditor, Modulations, ArpFilter, Effects, Library)
├── components/
│   ├── fmEngine/        # Algorithm selector, operator panels, carrier controls, IM matrix
│   ├── modulations/     # LFOs, LFO envelopes, step sequencers, matrix, filters, arp, note curves
│   ├── mutation/        # Patch slot for interpolation source A/B
│   └── knobs/           # Reusable rotary knob component
├── stores/              # Zustand stores: patchStore, workspaceStore, mutationStore, synthStore
├── midi/                # MIDI service, NRPN parser, patch serializer, CC/NRPN map, hooks
├── utils/               # geneticAlgorithm.ts (Breeder engine)
├── algo/                # 32 FM algorithm definitions
├── types/               # TypeScript types
└── locales/             # en/ and fr/ translation JSON files
```

### Technical Documentation

- [src/midi/README.md](src/midi/README.md) — MIDI functional usage
- [src/midi/TECHREADME.md](src/midi/TECHREADME.md) — Detailed MIDI protocol (CC, NRPN, mapping)
- [PATCH_MANAGEMENT.md](PATCH_MANAGEMENT.md) — Binary format, NRPN, firmware compatibility
- [copilot/ARCHITECTURE.md](copilot/ARCHITECTURE.md) — Full architecture reference

### Binary Patch Format

- `.patch` = exactly **1024 bytes** (`FlashSynthParams` struct, float32 little-endian), verified against PreenFM3 firmware source
- `.bnk` = **128 × 1024 = 131 072 bytes** (flat concatenation of 128 patches)
- Filter 2 is encoded at binary offset 920; the serializer handles the NRPN address collision with oscillator parameters

## 🌐 Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome / Chromium | ✅ | Recommended |
| Edge | ✅ | Recommended |
| Brave | ✅ | Recommended |
| Opera | ✅ | |
| Firefox | ⚠️ | Requires enabling `dom.webmidi.enabled` flag |
| Safari | ❌ | Web MIDI not supported |

## 🎯 Roadmap

### Implemented
- ✅ Full FM patch editor — 32 algorithms, 6 operators, IM matrix, carrier controls
- ✅ 3 LFOs with MIDI Clock sync (9 clock modes), bias, phase, key sync
- ✅ 2 LFO Envelopes (ADSR + loop modes) with interactive visualizer
- ✅ 2 Step Sequencers (16 steps, BPM, gate, MIDI clock division)
- ✅ Filters 1 & 2 (Filter 2 conditional on firmware version)
- ✅ Arpeggiator (full control set)
- ✅ 2 Note Curves with SVG visualizer
- ✅ Modulation Matrix (12 rows, source × 2 destinations × amount)
- ✅ Full NRPN Pull (complete bidirectional sync with hardware)
- ✅ Full NRPN Push (all parameters sent live on change)
- ✅ `.patch` file save/load (1024-byte `FlashSynthParams`)
- ✅ `.bnk` bank organizer (drag-and-drop, rename, import/export)
- ✅ 4-slot patch memory rack
- ✅ Genetic Patch Breeder (6-block DNA, Gaussian mutation, 4 children)
- ✅ Patch mutation/interpolation with harmonic quantization
- ✅ Real-time audio spectrogram (microphone, Magma LUT)
- ✅ EN/FR internationalization (12 namespaces, auto language detection)
- ✅ Dark/Light theme toggle
- ✅ Corrected MIDI CC Mix/Pan mapping (empirically verified)

### In Progress / Coming Soon
- ⏳ Effects editor (filters, reverb, chorus...)
- ⏳ Undo / Redo
- ⏳ ML-assisted patch variation (CVAE latent space, style conditioning from spectrogram)

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Open issues to report bugs or suggest features
- Submit pull requests
- Improve documentation

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- [Xavier Hosxe](https://github.com/Ixox) for the PreenFM3 and its open-source firmware
- The PreenFM community for support and feedback
- [Web MIDI API](https://www.w3.org/TR/webmidi/) for making browser-based MIDI communication possible

## 🔗 Useful Links

- [PreenFM3 Firmware](https://github.com/Ixox/preenfm3)
- [PreenFM3 Website](https://ixox.fr/preenfm2/)
- [PreenFM2 Official Editor](https://github.com/Ixox/preenfm2Controller)
- [Web MIDI API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)

---

**Developed with ❤️ for the PreenFM community**

