import { AdsrState, AdsrPoint } from './adsr';
import { WaveformType } from './waveform.ts';
import { ALGO_DIAGRAMS, type AlgoDiagram } from '../algo/algorithms.static';
import { type LfoType, type MidiClockMode } from './lfo';
import { type LFOEnvelope, type StepSequencer } from './modulation';

// types/patch.ts

export interface ModulationTarget {
  operatorId: number;
  amount: number; // -1.0 à 1.0
}

export interface ModulationLink {
  id: number;      // ID de l'opérateur cible
  im: number;      // Index de Modulation (0-100)
  modulationIndexVelo: number; // Sensibilité à la vélocité (0-100)
}

export interface ModulationMatrixRow {
  source: string;        // Source de modulation (e.g., 'LFO 1', 'Aftertouch', etc.)
  destination1: string;  // Première destination
  destination2: string;  // Deuxième destination
  amount: number;        // Montant/Multiplier (-10.0 to 10.0)
}

export type LfoSyncMode = 'Int' | 'Ext';

export interface LFO {
  shape: LfoType;        // Type de forme d'onde (selon firmware PreenFM3)
  syncMode: LfoSyncMode; // Mode de synchronisation (Int = internal 0-99.9 Hz, Ext = MIDI Clock)
  frequency: number;     // Fréquence en Hz (0-99.9) si syncMode='Int'
  midiClockMode: MidiClockMode; // Mode MIDI Clock si syncMode='Ext'
  phase: number;         // Phase initiale (0-360)
  bias: number;          // Offset/Bias (-1.0 to +1.0)
  keysync: 'Off' | number; // Key sync: 'Off' ou 0.0-16.0 (délai de resync)
}

// Types de filtres basés sur le firmware PreenFM3
// Canonical list of Filter1Type values, in firmware order
export const FILTER1_TYPE_LIST = [
  'OFF', 'MIXER', 'LP', 'HP', 'BASS', 'BP', 'CRUSHER',
  'LP2', 'HP2', 'BP2', 'LP3', 'HP3', 'BP3',
  'PEAK', 'NOTCH', 'BELL', 'LOWSHELF', 'HIGHSHELF',
  'LPHP', 'BPds', 'LPWS', 'TILT', 'STEREO',
  'SAT', 'SIGMOID', 'FOLD', 'WRAP', 'XOR',
  'TEXTURE1', 'TEXTURE2', 'LPXOR', 'LPXOR2',
  'LPSIN', 'HPSIN', 'QUADNOTCH',
  'AP4', 'AP4B', 'AP4D',
  'ORYX', 'ORYX2', 'ORYX3',
  '18DB', 'LADDER', 'LADDER2', 'DIOD',
  'KRMG', 'TEEBEE', 'SVFLH', 'CRUSH2'
] as const;

export type Filter1Type = typeof FILTER1_TYPE_LIST[number];

// Canonical list of Filter1Type values, in firmware order
// ...FILTER1_TYPE_LIST is now defined above as const and exported, with type derived below...

// Canonical list of Filter2Type values, in firmware order
export const FILTER2_TYPE_LIST = [
  'OFF', 'FLANGE', 'DIMENSION', 'CHORUS', 'WIDE',
  'DOUBLER', 'TRIPLER', 'BODE', 'DELAYCRUNCH',
  'PINGPONG', 'DIFFUSER', 'GRAIN1', 'GRAIN2',
  'STEREO_BP', 'PLUCK', 'PLUCK2', 'RESONATORS'
] as const;

export type Filter2Type = typeof FILTER2_TYPE_LIST[number];

export interface Filter {
  type: Filter1Type | Filter2Type;
  param1: number;  // Frequency/Cutoff (0-1)
  param2: number;  // Resonance/Q (0-1)
  gain: number;    // Gain (0-2 for Filter1, 0-1 for Filter2)
}

export interface Operator {
  id: number;
  enabled: boolean;
  frequency: number;      // Fréquence en Hz ou ratio FM
  detune: number;      // [-16, +16] pour correspondre au PreenFM3
  keyboardTracking: number;
  frequencyType: 'FIXED' | 'KEYBOARD'; // Suivi du clavier ou fréquence fixe
  waveform: WaveformType;
  amplitude: number;      // 0.0 à 1.0
  pan: number;           // -1.0 (gauche) à 1.0 (droite)
  type: 'CARRIER' | 'MODULATOR'
  target: ModulationLink[];

  // Enveloppe ADSR
  adsr: AdsrState;

  // Paramètres spécifiques PreenFM
  feedbackAmount: number; // Auto-modulation
  velocitySensitivity: number;
}

export interface Algorithm {
  id: String;
  name: String;
  ops: Operator[]
}

export interface GlobalEffects {
  reverb: {
    enabled: boolean;
    room: number;
    damp: number;
    level: number;
  };
  delay: {
    enabled: boolean;
    time: number;
    feedback: number;
    level: number;
  };
  chorus: {
    enabled: boolean;
    rate: number;
    depth: number;
    level: number;
  };
}

export type ArpDirection = 'Up' | 'Down' | 'UpDown' | 'Played' | 'Random' | 'Chord' | 'Rotate U' | 'Rotate D' | 'Shift U' | 'Shift D';
export type ArpPattern = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | 'Usr1' | 'Usr2' | 'Usr3' | 'Usr4';
export type ArpDivision = '2/1' | '3/2' | '1/1' | '3/4' | '2/3' | '1/2' | '3/8' | '1/3' | '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32' | '1/48' | '1/96';
export type ArpDuration = '2/1' | '3/2' | '1/1' | '3/4' | '2/3' | '1/2' | '3/8' | '1/3' | '1/4' | '1/6' | '1/8' | '1/12' | '1/16' | '1/24' | '1/32' | '1/48' | '1/96';
export type ArpLatch = 'Off' | 'On';

export interface ArpeggiatorSettings {
  clock: number;         // BPM: NRPN 0 (0-240)
  direction: ArpDirection;  // NRPN 1 (0-9)
  octave: number;        // NRPN 2 (1-3)
  pattern: ArpPattern;   // NRPN 3 (0-7)
  division: ArpDivision; // NRPN 4 (0-14)
  duration: ArpDuration; // NRPN 5 (0-7)
  latch: ArpLatch;       // NRPN 6 (0-1)
}

// ===== NOTE CURVE SYSTEM CENTRALISÉ =====
// D'après le code officiel PreenFM2Controller: indices NRPN 1-7

export const NoteCurveType = {
  Flat: 'Flat',           // 1
  PlusLinear: '+Linear',  // 2  
  PlusLinearx8: '+Linear*8', // 3
  PlusExp: '+Exp',        // 4
  MinusLinear: '-Linear', // 5
  MinusLinearx8: '-Linear*8', // 6
  MinusExp: '-Exp'        // 7
} as const;

export type NoteCurveType = typeof NoteCurveType[keyof typeof NoteCurveType];

/**
 * Mapping officiel PreenFM2Controller : INDEX NRPN → TYPE
 * ✅ SOLUTION CONFIRMÉE: 
 * - RÉCEPTION (MSB=0): indices 0-6 
 * - ENVOI (MSB=1): indices 0-6 (même mapping, MSB différent)
 */
export const NOTE_CURVE_NRPN_MAPPING: Record<number, NoteCurveType> = {
  0: NoteCurveType.Flat,           // Index 0 = Flat
  1: NoteCurveType.PlusLinear,     // Index 1 = +Linear  
  2: NoteCurveType.PlusLinearx8,   // Index 2 = +Linear*8
  3: NoteCurveType.PlusExp,        // Index 3 = +Exp
  4: NoteCurveType.MinusLinear,    // Index 4 = -Linear
  5: NoteCurveType.MinusLinearx8,  // Index 5 = -Linear*8
  6: NoteCurveType.MinusExp        // Index 6 = -Exp
};

/**
 * Mapping inverse : TYPE → INDEX NRPN (pour l'envoi MIDI)
 * ✅ SOLUTION CONFIRMÉE: Indices 0-6 pour MSB=1 (envoi), MSB=0 (réception)
 */
export const NOTE_CURVE_TYPE_TO_NRPN: Record<NoteCurveType, number> = {
  [NoteCurveType.Flat]: 0,           // ENVOI & RÉCEPTION: index 0
  [NoteCurveType.PlusLinear]: 1,     // ENVOI & RÉCEPTION: index 1
  [NoteCurveType.PlusLinearx8]: 2,   // ENVOI & RÉCEPTION: index 2
  [NoteCurveType.PlusExp]: 3,        // ENVOI & RÉCEPTION: index 3
  [NoteCurveType.MinusLinear]: 4,    // ENVOI & RÉCEPTION: index 4
  [NoteCurveType.MinusLinearx8]: 5,  // ENVOI & RÉCEPTION: index 5
  [NoteCurveType.MinusExp]: 6        // ENVOI & RÉCEPTION: index 6
};

/**
 * Liste des types pour les interfaces (sélecteurs, etc.)
 */
export const NOTE_CURVE_TYPES_LIST: NoteCurveType[] = [
  NoteCurveType.Flat,
  NoteCurveType.PlusLinear,
  NoteCurveType.PlusLinearx8,
  NoteCurveType.PlusExp,
  NoteCurveType.MinusLinear,
  NoteCurveType.MinusLinearx8,
  NoteCurveType.MinusExp
];

/**
 * Fonctions utilitaires pour les Note Curves
 */
export const NoteCurveUtils = {
  /**
   * Convertir un index NRPN en type de courbe
   * ✅ RÉCEPTION: indices 0-6 avec MSB=0
   */
  fromNrpnIndex: (index: number): NoteCurveType => {
    return NOTE_CURVE_NRPN_MAPPING[index] || NoteCurveType.Flat;
  },

  /**
   * Convertir un type de courbe en index NRPN
   * ✅ ENVOI: indices 0-6 avec MSB=1
   */
  toNrpnIndex: (type: NoteCurveType): number => {
    return NOTE_CURVE_TYPE_TO_NRPN[type] ?? 0;
  },

  /**
   * Vérifier si un type de courbe est valide
   */
  isValidType: (type: string): type is NoteCurveType => {
    return Object.values(NoteCurveType).includes(type as NoteCurveType);
  },

  /**
   * Obtenir tous les types disponibles
   */
  getAllTypes: (): NoteCurveType[] => {
    return NOTE_CURVE_TYPES_LIST;
  }
};

export interface NoteCurve {
  before: NoteCurveType;  // Courbe avant le breakpoint
  breakNote: number;      // Note de breakpoint (0-127)
  after: NoteCurveType;   // Courbe après le breakpoint
}

export interface MIDISettings {
  channel: number;        // 1-16
  velocityCurve: 'LINEAR' | 'LOG' | 'EXP' | 'FIXED';
  pitchBendRange: number; // En demi-tons
  modulationWheelTarget: string;
  sustainPedalBehavior: 'STANDARD' | 'SOSTENUTO';
}

export interface Patch {
  // Métadonnées
  name: string;
  bank: number;
  program: number;
  author?: string;
  description?: string;
  tags?: string[];

  algorithm: Algorithm;

  // Oscillateurs (généralement 4 ou 6 selon le modèle PreenFM)
  operators: Operator[];

  // Matrice de modulation globale (12 lignes)
  modulationMatrix: ModulationMatrixRow[];

  // LFOs (3 LFOs selon le PreenFM3) - optionnel pour compatibilité avec anciens patches
  lfos?: [LFO, LFO, LFO];

  // LFO Envelopes (2 enveloppes libres) - optionnel pour compatibilité
  lfoEnvelopes?: [LFOEnvelope, LFOEnvelope];

  // Step Sequencers (2 séquenceurs de pas) - optionnel pour compatibilité
  stepSequencers?: [StepSequencer, StepSequencer];

  // Paramètres globaux
  global: {
    volume: number;           // Volume général
    transpose: number;        // Transposition en demi-tons
    fineTune: number;         // Accord fin en cents
    polyphony: number;        // Nombre de voix de polyphonie
    glideTime: number;        // Portamento
    bendRange: number;        // Plage de pitch bend
    velocitySensitivity: number; // Sensibilité globale à la vélocité (0-16)
  };

  // Effets globaux
  effects: GlobalEffects;

  // Filtres (2 filtres indépendants)
  filters: [Filter, Filter];

  // Arpégiateur
  arpeggiator: ArpeggiatorSettings;

  // Note Curves (2 courbes de scaling des notes)
  noteCurves: [NoteCurve, NoteCurve];

  // Paramètres MIDI
  midi: MIDISettings;

  // Données brutes PreenFM (pour compatibilité)
  rawData?: Uint8Array;

  // Métadonnées de l'éditeur
  editorMetadata?: {
    lastModified: Date;
    version: string;
    checksum?: string;
  };
}

// Types pour l'état de l'éditeur
export interface EditorState {
  currentPatch: Patch;
  selectedOperator: number;
  selectedParameter: string | null;
  isModified: boolean;
  clipboard: Partial<Patch> | null;

  // État de l'interface
  ui: {
    activeTab: 'OPERATORS' | 'MATRIX' | 'EFFECTS' | 'ARPEGGIATOR' | 'GLOBAL';
    zoomLevel: number;
    showGrid: boolean;
    showValues: boolean;
  };
}

// Types pour les actions du store
export type PatchAction =
  | { type: 'LOAD_PATCH'; payload: Patch }
  | { type: 'UPDATE_OPERATOR'; payload: { id: number; changes: Partial<Operator> } }
  | { type: 'UPDATE_ADSR'; payload: { operatorId: number; envelope: Partial<AdsrState> } }
  | { type: 'UPDATE_ADSR_POINT'; payload: { operatorId: number; point: keyof AdsrState; values: Partial<AdsrPoint> } }
  | { type: 'SET_OPERATOR_WAVEFORM'; payload: { id: number; waveform: WaveformType } }
  | { type: 'UPDATE_GLOBAL'; payload: Partial<Patch['global']> }
  | { type: 'UPDATE_EFFECTS'; payload: Partial<GlobalEffects> }
  | { type: 'ADD_MODULATION'; payload: { sourceId: number; targetId: number; amount: number } }
  | { type: 'REMOVE_MODULATION'; payload: { sourceId: number; targetId: number } }
  | { type: 'SELECT_OPERATOR'; payload: number }
  | { type: 'SET_ACTIVE_TAB'; payload: EditorState['ui']['activeTab'] }
  | { type: 'COPY_OPERATOR'; payload: number }
  | { type: 'PASTE_OPERATOR'; payload: number }
  | { type: 'RESET_PATCH' }
  | { type: 'MARK_MODIFIED'; payload: boolean };

// Utilitaires de type
export type OperatorParameter = keyof Omit<Operator, 'id' | 'adsr' | 'target'>;
export type ADSRParameter = keyof AdsrState;
export type GlobalParameter = keyof Patch['global'];

// Constantes

export const DEFAULT_ADSR: AdsrState = {
  attack: { time: 0, level: 0 },
  decay: { time: 1, level: 100 },
  sustain: { time: 5, level: 30 },
  release: { time: 10, level: 0 }
};

export const DEFAULT_LFO: LFO = {
  shape: 'LFO_SIN',
  syncMode: 'Int',
  frequency: 5.0,
  midiClockMode: 'MC',
  phase: 0,
  bias: 0,
  keysync: 'Off'
};

// By default, gain for Filter1 should be 1
export const DEFAULT_FILTER: Filter = {
  type: 'OFF',
  param1: 0.5,
  param2: 0.0,
  gain: 1.0
};

export const DEFAULT_ARPEGGIATOR: ArpeggiatorSettings = {
  clock: 120,
  direction: 'Up',
  octave: 1,
  pattern: '1',
  division: '1/16',
  duration: '1/16',
  latch: 'Off'
};

export const DEFAULT_NOTE_CURVE: NoteCurve = {
  before: NoteCurveType.Flat,
  breakNote: 60,
  after: NoteCurveType.Flat
};

export const DEFAULT_MIDI_SETTINGS: MIDISettings = {
  channel: 1,
  velocityCurve: 'LINEAR',
  pitchBendRange: 2,
  modulationWheelTarget: 'None',
  sustainPedalBehavior: 'STANDARD'
};

// Ré-exporter les constantes de modulation
export { DEFAULT_LFO_ENVELOPE, DEFAULT_STEP_SEQUENCER } from './modulation';

export const DEFAULT_OPERATOR: Omit<Operator, 'id'> = {
  enabled: true,
  type: 'CARRIER',
  frequency: 440,
  detune: 0,
  keyboardTracking: 1,
  frequencyType: 'KEYBOARD',
  waveform: 'SINE',
  amplitude: 1.0, // 0-1 float for PreenFM
  pan: 0,
  adsr: DEFAULT_ADSR,
  target: [],
  feedbackAmount: 0,
  velocitySensitivity: 0.5
};

function createOperator(
  id: number,
  type: "CARRIER" | "MODULATOR",
  overrides: Partial<Operator> = {}
): Operator {
  return {
    ...DEFAULT_OPERATOR,
    ...overrides,
    id,
    type
  };
}

/**
 * Convertit un AlgoDiagram (définition visuelle) en Algorithm (définition fonctionnelle)
 * @param diagram - Diagramme de l'algorithme avec nodes et edges
 * @returns Algorithm complet avec opérateurs configurés
 */
function diagramToAlgorithm(diagram: AlgoDiagram): Algorithm {
  // Construire la structure des edges : source -> targets[]
  const edgeMap = new Map<string, string[]>();
  
  diagram.edges.forEach(edge => {
    if (!edgeMap.has(edge.from)) {
      edgeMap.set(edge.from, []);
    }
    edgeMap.get(edge.from)!.push(edge.to);
  });
  
  // Créer les opérateurs
  const ops = diagram.nodes.map(node => {
    const opId = parseInt(node.id.replace(/\D/g, '')); // "op1" -> 1
    const targets = edgeMap.get(node.id) || [];
    
    // Construire la liste des targets (INCLURE les self-loops pour le feedback)
    // Les self-loops (feedback) sont traités comme des targets normaux avec un IM dédié
    const targetLinks: ModulationLink[] = targets.map(targetId => ({
      id: parseInt(targetId.replace(/\D/g, '')),
      im: 0, // Valeur initiale de modulation (IM)
      modulationIndexVelo: 0 // Sensibilité à la vélocité
    }));
    
    return createOperator(opId, node.type, {
      target: targetLinks,
    });
  });
  
  // Trier les opérateurs par ID
  ops.sort((a, b) => a.id - b.id);
  
  return {
    id: diagram.id,
    name: diagram.name,
    ops
  };
}

// Générer automatiquement les 32 algorithmes PreenFM3 à partir des diagrammes visuels
// Cette approche élimine la redondance et garantit la cohérence entre la visualisation et la logique
export const DEFAULT_ALGORITHMS: Algorithm[] = ALGO_DIAGRAMS.map(diagramToAlgorithm);