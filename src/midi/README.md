# PreenFM3 MIDI Integration

Ce dossier contient l'implémentation de la communication MIDI bidirectionnelle avec le PreenFM3.

## Fonctionnalités

### Lecture de patch (Pull)
- **Récupération complète du patch** depuis le PreenFM3 (algorithme, opérateurs, modulations, LFOs, enveloppes, matrice)
- **Parser NRPN** pour décoder les messages du hardware
- **Synchronisation automatique** de l'interface avec le patch hardware

### Édition en temps réel (Push)
- **Contrôle du volume des carriers** (opérateurs 1-4) via knobs interactifs
- **Modification de l'algorithme** et des indices de modulation
- **Changements instantanés** envoyés au PreenFM3 pendant que vous éditez

### Sources de modulation prises en charge
- ✅ **LFOs** (3 oscillateurs basse fréquence avec shapes, fréquence, bias, phase, key sync)
- ✅ **LFO Envelopes** (2 enveloppes libres : Env1 ADSR, Env2 Silence-Attack-Release avec modes de loop)
- ✅ **Matrice de modulation** (12 routages avec source, multiplicateur, destinations)
- ⏳ **Step Sequencers** (2 séquenceurs, 16 steps chacun) - à implémenter

## Architecture

### Fichiers principaux

- **`midiService.ts`** - Communication MIDI de bas niveau (envoi/réception de messages)
- **`preenFM3Parser.ts`** - Parser NRPN pour convertir les messages hardware en objets Patch
- **`usePreenFM3Midi.ts`** - Hook React pour intégrer MIDI dans les composants
- **`preenFM3MidiMap.ts`** - Constantes MIDI (pour référence technique)

## Utilisation

### 1. Configuration MIDI dans l'interface

Le composant `MidiMenu` permet de :
- Sélectionner les périphériques MIDI d'entrée/sortie
- Configurer le canal MIDI (1-16)
- **Pull Patch** : Récupérer le patch actuel depuis le PreenFM3
- Visualiser l'état des connexions

### 2. Utilisation dans un composant

```tsx
import { usePreenFM3Midi } from './midi/usePreenFM3Midi';

function MyEditor() {
  const midi = usePreenFM3Midi();

  const handlePullPatch = () => {
    // Demander le patch au PreenFM3
    midi.requestPatchDump();
    // Le parser se charge automatiquement de décoder et mettre à jour le store
  };

  const handleVolumeChange = (opNumber: number, volume: number) => {
    // Envoyer le nouveau volume au hardware
    midi.sendMix(opNumber, volume);
  };

  return <div>...</div>;
}
```

### 3. Synchronisation automatique du store

Le système MIDI est intégré au store Zustand :
- Les changements dans l'UI sont automatiquement envoyés au PreenFM3
- Les messages reçus du PreenFM3 mettent à jour le store
- Les composants se re-rendent automatiquement

## Configuration PreenFM3

Dans le menu du PreenFM3 (Menu → Midi) :

1. **USB MIDI** : In + Out
2. **Receives** : CC + NRPN
3. **Sends** : CC + NRPN
4. **MIDI Channel** : 1-16 (doit correspondre au canal dans l'UI)

## Prérequis navigateur

### Navigateurs compatibles

- ✅ **Chrome/Chromium** (version 43+) - Recommandé
- ✅ **Edge** (version 79+)
- ✅ **Brave** - Recommandé
- ✅ **Opera** (version 33+)
- ⚠️ **Firefox** : Nécessite l'activation du flag `dom.webmidi.enabled`
- ❌ **Safari** : Non supporté

### Permissions

Au premier accès MIDI :
1. Connectez le PreenFM3 via USB
2. Une popup de permission apparaîtra
3. Cliquez sur **Autoriser**

Si la popup n'apparaît pas, vérifiez les permissions du site dans les paramètres du navigateur.

## Limitations connues

### Patch Pull
- ✅ Algorithme, opérateurs, enveloppes des opérateurs
- ✅ Indices de modulation (IM1-IM6)
- ✅ LFOs (shape, fréquence, bias, phase, key sync)
- ✅ LFO Envelopes (Env1 et Env2 avec loop modes)
- ✅ Matrice de modulation (12 rows)
- ❌ **Volume/Pan des opérateurs** : Non transmis par le firmware (à éditer manuellement)
- ❌ **Step Sequencers** : Non implémenté (TODO)

### Patch Push
- ✅ Volume des carriers (opérateurs 1-4)
- ✅ Algorithme
- ✅ Indices de modulation
- ⏳ LFO Envelopes (lecture OK, envoi à implémenter)
- ⏳ Autres paramètres à implémenter au fur et à mesure des besoins

## Documentation technique

Pour les détails techniques du protocole MIDI (CC, NRPN, tables de mapping, implémentation du parser) : voir [TECHREADME.md](./TECHREADME.md)

## Développement

### Ajouter un nouveau paramètre MIDI

1. **Trouver le CC ou NRPN** dans `preenFM3MidiMap.ts` ou la documentation firmware
2. **Ajouter la fonction d'envoi** dans `midiService.ts`
3. **Exposer via le hook** dans `usePreenFM3Midi.ts`
4. **Parser la réception** dans `preenFM3Parser.ts` si nécessaire
5. **Intégrer dans les composants UI**

### Tester les messages MIDI

Utilisez les logs console du navigateur (F12) :
- Les messages NRPN reçus sont loggés par le parser
- Les erreurs de parsing sont affichées
- Les détails de chaque patch parsé sont disponibles

## Références

- [Firmware PreenFM3](https://github.com/Ixox/preenfm3) - Source de vérité pour le protocole MIDI
- [Éditeur officiel PreenFM2](https://github.com/Ixox/preenfm2Controller) - Référence d'implémentation
- [Web MIDI API](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API) - Documentation de l'API

