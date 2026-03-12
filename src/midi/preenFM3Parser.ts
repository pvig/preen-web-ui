/**
 * Parser for PreenFM3 NRPN messages
 * Converts NRPN stream into Patch object
 */

import type { Patch } from '../types/patch';
import { FILTER1_TYPE_LIST, NoteCurveUtils } from '../types/patch';
// import type { Filter1Type, Filter2Type } from '../types/patch';
import type { NRPNMessage } from './preenFM3MidiMap';
import { DEFAULT_ALGORITHMS, DEFAULT_LFO_ENVELOPE } from '../types/patch';
import type { 
  ArpClock,
  ArpDirection, 
  ArpPattern, 
  ArpDivision, 
  ArpDuration, 
  ArpLatch 
} from '../types/patch';
import { ALGO_DIAGRAMS } from '../algo/algorithms.static';
import { WaveformType } from '../types/waveform';
import { 
  nrpnToLfoFrequency, 
  parseLfoShape,
  parseLfoBias,
  parseLfoKeysync,
  LFO_BIAS_CENTER,
  // type LfoType
} from '../types/lfo';
import type { LFO } from '../types/patch';

/**
 * Conversion functions for Arpeggiator NRPN values
 * According to PreenFM2 official documentation: https://ixox.fr/preenfm2/preenfm/midi/
 * 
 * NRPN mapping (MSB=0):
 * - LSB=28: Clock (0=Off, 1=Internal, 2=External) 
 * - LSB=29: BPM (actual tempo value)
 * - LSB=30: Direction
 * - LSB=31: Octave  
 * - LSB=32: Pattern
 * - LSB=33: Division
 * - LSB=34: Duration
 * - LSB=35: Latch
 */
const ARP_CLOCKS: ArpClock[] = ['Off', 'Int', 'Ext'];

const ARP_DIRECTIONS: ArpDirection[] = [
  'Up', 'Down', 'UpDown', 'Played', 'Random', 'Chord', 'Rotate U', 'Rotate D', 'Shift U', 'Shift D'
];

const ARP_PATTERNS: ArpPattern[] = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',        // 0-9
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', // 10-19 
  '21', '22', 'Usr1', 'Usr2', 'Usr3', 'Usr4'                // 20-25
];

const ARP_DIVISIONS: ArpDivision[] = [
  '2/1',   // 0
  '3/2',   // 1
  '1/1',   // 2
  '3/4',   // 3
  '2/3',   // 4
  '1/2',   // 5
  '3/8',   // 6
  '1/3',   // 7
  '1/4',   // 8
  '1/6',   // 9
  '1/8',   // 10
  '1/12',  // 11
  '1/16',  // 12
  '1/24',  // 13
  '1/32',  // 14
  '1/48',  // 15
  '1/96'   // 16
];

const ARP_DURATIONS: ArpDuration[] = [
  '2/1',   // 0
  '3/2',   // 1
  '1/1',   // 2
  '3/4',   // 3
  '2/3',   // 4
  '1/2',   // 5
  '3/8',   // 6
  '1/3',   // 7
  '1/4',   // 8
  '1/6',   // 9
  '1/8',   // 10
  '1/12',  // 11
  '1/16',  // 12
  '1/24',  // 13
  '1/32',  // 14
  '1/48',  // 15
  '1/96'   // 16
];

const ARP_LATCH: ArpLatch[] = ['Off', 'On'];

function parseArpClock(value: number): ArpClock {
  return ARP_CLOCKS[Math.min(value, ARP_CLOCKS.length - 1)] || 'Off';
}

function parseArpDirection(value: number): ArpDirection {
  return ARP_DIRECTIONS[Math.min(value, ARP_DIRECTIONS.length - 1)] || 'Up';
}

function parseArpPattern(value: number): ArpPattern {
  return ARP_PATTERNS[Math.min(value, ARP_PATTERNS.length - 1)] || '1';
}

function parseArpDivision(value: number): ArpDivision {
  console.log(`[ARP DEBUG] Division NRPN value: ${value}`);
  const result = ARP_DIVISIONS[Math.min(value, ARP_DIVISIONS.length - 1)] || '1/16';
  console.log(`[ARP DEBUG] Division mapped to: ${result}`);
  return result;
}

function parseArpDuration(value: number): ArpDuration {
  return ARP_DURATIONS[Math.min(value, ARP_DURATIONS.length - 1)] || '1/16';
}

function parseArpLatch(value: number): ArpLatch {
  return ARP_LATCH[Math.min(value, ARP_LATCH.length - 1)] || 'Off';
}

/**
 * NRPN Parser pour PreenFM3
 * Accumule les NRPN et reconstruit un patch
 */
export class PreenFM3Parser {
  private nrpnData: Map<number, number> = new Map();
  private presetName: string[] = [];
  
  /**
   * Ajouter un message NRPN reçu
   */
  addNRPN(nrpn: NRPNMessage): void {
    // Calculer l'index NRPN (paramMSB << 7 | paramLSB)
    const paramIndex = (nrpn.paramMSB << 7) | nrpn.paramLSB;
    
    // Calculer la valeur (valueMSB << 7 | valueLSB)
    const value = (nrpn.valueMSB << 7) | nrpn.valueLSB;
    
    // Nom du preset (NRPN MSB=1, LSB=100-111)
    if (nrpn.paramMSB === 1 && nrpn.paramLSB >= 100 && nrpn.paramLSB <= 111) {
      const charIndex = nrpn.paramLSB - 100;
      const char = String.fromCharCode(value);
      this.presetName[charIndex] = char;
    } else {
      // Stocker le paramètre  
      this.nrpnData.set(paramIndex, value);
    }
  }
  
  /**
   * Parse Note Curve parameters from NRPN data
   */
  private parseNoteCurve(curveIndex: 0 | 1): import('../types/patch').NoteCurve {
    // ✅ SOLUTION CONFIRMÉE - NRPN Note Curves :
    // RÉCEPTION: MSB=0, LSB=200-206, indices 0-6 ✅
    // ENVOI: MSB=1, LSB=200-206, indices 0-6 ✅
    // Note1: MSB=0, LSB=200 (before), LSB=201 (breakNote), LSB=202 (after)
    // Note2: MSB=0, LSB=204 (before), LSB=205 (breakNote), LSB=206 (after)
    
    const baseLSB = 200 + (curveIndex * 4);
    const beforeRaw = this.getValue(0, baseLSB + 0);     // before type
    const breakNoteRaw = this.getValue(0, baseLSB + 1);  // break note  
    const afterRaw = this.getValue(0, baseLSB + 2);      // after type
    
    // ✅ Utiliser le système centralisé NoteCurveUtils (indices 0-6)
    const before = NoteCurveUtils.fromNrpnIndex(beforeRaw ?? 0);
    const after = NoteCurveUtils.fromNrpnIndex(afterRaw ?? 0);
    
    // ✅ Break note direct (pas de scaling nécessaire, déjà en 0-127)
    let breakNote = 60;
    if (breakNoteRaw !== undefined) {
      breakNote = Math.max(0, Math.min(127, breakNoteRaw));
    }
    
    return { before, breakNote, after };
  }

  /**
   * Obtenir le nom du preset
   */
  getPresetName(): string {
    const name = this.presetName.join('');
    // Arrêter au premier caractère nul (fin de chaîne C)
    const nullIndex = name.indexOf('\x00');
    return (nullIndex >= 0 ? name.substring(0, nullIndex) : name).trim();
  }
  
  /**
   * Obtenir une valeur NRPN brute (méthode publique)
   */
  public getValue(paramMSB: number, paramLSB: number): number | undefined {
    const index = (paramMSB << 7) | paramLSB;
    return this.nrpnData.get(index);
  }
  
  /**
   * Obtenir une valeur NRPN avec scaling
   */
  getScaledValue(paramMSB: number, paramLSB: number, min: number, max: number): number {
    const raw = this.getValue(paramMSB, paramLSB);
    if (raw === undefined) return min;
    let scaled;
    if (paramLSB === 68 || paramLSB === 69 || paramLSB === 70) {
      // LFO phase: NRPN/100 (0-127 → 0-1.27)
      scaled = raw / 100;
      console.log(`[LFO PHASE PARSE] paramMSB=${paramMSB} paramLSB=${paramLSB} NRPN=${raw} → float=${scaled}`);
    } else {
      // NRPN 14-bit: 0-16383
      scaled = (raw / 16383) * (max - min) + min;
    }
    return scaled;
  }
  
  /**
   * Exporter toutes les données NRPN brutes pour générer des fixtures de test.
   * Retourne un tableau de NRPNMessage qui peut être rejoué par le parser.
   */
  public getRawNRPNs(): Array<{ paramMSB: number; paramLSB: number; valueMSB: number; valueLSB: number }> {
    const result: Array<{ paramMSB: number; paramLSB: number; valueMSB: number; valueLSB: number }> = [];

    // Données NRPN
    this.nrpnData.forEach((value, index) => {
      const paramMSB = (index >> 7) & 0x7F;
      const paramLSB = index & 0x7F;
      const valueMSB = (value >> 7) & 0x7F;
      const valueLSB = value & 0x7F;
      result.push({ paramMSB, paramLSB, valueMSB, valueLSB });
    });

    // Nom du preset (NRPN MSB=1, LSB=100-111)
    this.presetName.forEach((char, i) => {
      if (char !== undefined) {
        const charCode = char.charCodeAt(0);
        result.push({
          paramMSB: 1,
          paramLSB: 100 + i,
          valueMSB: (charCode >> 7) & 0x7F,
          valueLSB: charCode & 0x7F,
        });
      }
    });

    // Trier par paramMSB puis paramLSB pour la lisibilité
    result.sort((a, b) => a.paramMSB !== b.paramMSB ? a.paramMSB - b.paramMSB : a.paramLSB - b.paramLSB);

    return result;
  }

  /**
   * Réinitialiser le parser
   */
  reset(): void {
    this.nrpnData.clear();
    this.presetName = [];
  }
  
  /**
   * Obtenir statistiques de réception
   */
  getStats(): { count: number; name: string } {
    return {
      count: this.nrpnData.size,
      name: this.getPresetName(),
    };
  }
  
  /**
   * Vérifier si les paramètres critiques ont été reçus
   */
  hasMinimalData(): boolean {
    const algorithm = this.getValue(0, 0);
    const hasAlgorithm = algorithm !== undefined;
    const hasEnoughParams = this.nrpnData.size >= 10;
    
    console.log(`[PreenFM3Parser] Vérification minimale: algorithme=${hasAlgorithm}, paramètres=${this.nrpnData.size}`);
    return hasAlgorithm && hasEnoughParams;
  }
  
  /**
   * Logger tous les NRPN reçus (debug)
   */
  logAll(): void {
    console.log('=== NRPN Data Analysis ===');
    console.log('Preset Name:', this.getPresetName());
    console.log('Total parameters:', this.nrpnData.size);
    
    // Paramètres critiques
    const algorithm = this.getValue(0, 0);
    const velocity = this.getValue(0, 1);
    const voices = this.getValue(0, 2);
    
    console.log('--- Paramètres critiques ---');
    console.log(`Algorithm [0,0]: ${algorithm}`);
    console.log(`Velocity [0,1]: ${velocity}`);
    console.log(`Voices [0,2]: ${voices}`);
    
    // Grouper par MSB
    const byMSB = new Map<number, Array<{ lsb: number; value: number }>>();
    
    this.nrpnData.forEach((value, index) => {
      const msb = index >> 7;
      const lsb = index & 0x7F;
      
      if (!byMSB.has(msb)) {
        byMSB.set(msb, []);
      }
      byMSB.get(msb)!.push({ lsb, value });
    });
    
    // Afficher groupé (limité pour éviter le spam)
    console.log('--- Données NRPN par MSB (échantillon) ---');
    byMSB.forEach((params, msb) => {
      console.log(`MSB ${msb} (${params.length} paramètres):`);
      params.slice(0, 5).forEach(p => {
        console.log(`  LSB ${p.lsb}: ${p.value}`);
      });
      if (params.length > 5) {
        console.log(`  ... et ${params.length - 5} autres`);
      }
    });
  }
  
  /**
   * Convertir les données NRPN en objet Patch
   */
  toPatch(): Patch {
    // DEBUG: Log NRPN Mix1-6 values reçues lors du patch pull
    const mixDebug: number[] = [];
    for (let i = 0; i < 6; i++) {
      const mixLsb = 16 + i * 2;
      const mixValue = this.getValue(0, mixLsb);
      mixDebug.push(mixValue ?? -1);
    }
    console.log('[PreenFM3Parser] NRPN Mix1-6 (LSB 16,18,20,22,24,26) values:', mixDebug);
    
    // Récupérer l'algorithme (index 0, valeur 0-31)
    const algoIndex = this.getValue(0, 0);
    console.log(`[PreenFM3Parser] Algorithme NRPN value: ${algoIndex}`);
    
    if (algoIndex === undefined) {
      throw new Error('Algorithme non reçu (NRPN [0,0] manquant). Le patch ne peut pas être chargé.');
    }
    
    if (algoIndex < 0 || algoIndex >= DEFAULT_ALGORITHMS.length) {
      console.warn(`[PreenFM3Parser] Index d'algorithme invalide: ${algoIndex}, utilisation de l'algorithme 0`);
    }
    
    const algorithm = DEFAULT_ALGORITHMS[algoIndex] || DEFAULT_ALGORITHMS[0];
    console.log(`[PreenFM3Parser] Algorithme sélectionné: ${algorithm.id} (${algorithm.name})`);
    
    // Nom du preset
    const name = this.getPresetName() || 'MIDI Patch';
    
    // Créer les opérateurs depuis l'algorithme, puis appliquer les valeurs NRPN d'amplitude dans l'ordre OP1-6
    let operators = algorithm.ops.map((op) => {
      const opIndex = op.id - 1; // 0-5 pour les calculs d'offset
      // Base index pour ROW_OSCx (ROW_OSC1=44, ROW_OSC2=48, etc.)
      // Chaque ROW_OSC a 4 encoders: shape, frequencyType, frequencyMul, detune
      const oscRowBase = 44 + opIndex * 4;
      // Waveform (encoder 0: shape) - correspond aux 14 types du firmware
      const waveformValue = this.getValue(0, oscRowBase) ?? 0;
      const waveforms: WaveformType[] = [
        'SINE', 'SAW', 'SQUARE', 'SIN_SQUARED', 'SIN_ZERO', 'SIN_POS', 
        'RAND', 'OFF', 'USER1', 'USER2', 'USER3', 'USER4', 'USER5', 'USER6'
      ];
      const waveform = waveforms[Math.min(waveformValue, 13)] || 'SINE';
      // Frequency Type / Keyboard Tracking (encoder 1: frequencyType)
      // PreenFM3 firmware: 0=Keyboard, 1=Fixed, 2=Finetune
      // UI expects: 0=Fixed, 1=Keyboard, 2=Finetune
      // Need to swap 0 and 1 when reading
      const freqTypeValue = this.getValue(0, oscRowBase + 1) ?? 0;
      let keyboardTracking: number;
      if (freqTypeValue === 0) {
        keyboardTracking = 1; // Keyboard in firmware -> 1 in UI
      } else if (freqTypeValue === 1) {
        keyboardTracking = 0; // Fixed in firmware -> 0 in UI
      } else {
        keyboardTracking = 2; // Finetune stays 2
      }
      // Fréquence (encoder 2: frequencyMul)
      const freqValue = this.getValue(0, oscRowBase + 2) ?? 1600;
      const frequency = freqValue / 100; // PreenFM3 stocke freq * 100
      // Détune (encoder 3: detune)
      const detuneValue = this.getValue(0, oscRowBase + 3) ?? 1600;
      const detune = (detuneValue - 1600) / 100; // Centré sur 1600 pour 0
      // ROW_ENV1: indices 68-75 (Attack T/L, Decay T/L, Sustain T/L, Release T/L)
      // ROW_ENV2: indices 76-83, etc.
      const envRowBase = 68 + opIndex * 8; // 8 valeurs par envelope (4 temps + 4 niveaux entrelacés)
      // Les temps sont RELATIFS et en centièmes, les niveaux sont déjà en pourcentage (0-100)
      // Il faut les cumuler pour obtenir les positions absolues pour l'UI
      const attackTimeRel = (this.getValue(0, envRowBase + 0) ?? 0) / 100;
      const attackLevel = this.getValue(0, envRowBase + 1) ?? 100;
      const decayTimeRel = (this.getValue(0, envRowBase + 2) ?? 9000) / 100;
      const decayLevel = this.getValue(0, envRowBase + 3) ?? 100;
      const sustainTimeRel = (this.getValue(0, envRowBase + 4) ?? 10000) / 100;
      const sustainLevel = this.getValue(0, envRowBase + 5) ?? 100;
      const releaseTimeRel = (this.getValue(0, envRowBase + 6) ?? 0) / 100;
      const releaseLevel = (this.getValue(0, envRowBase + 7) ?? 0);
      // Conversion en positions absolues (cumulatives)
      const attackTime = attackTimeRel;
      const decayTime = attackTime + decayTimeRel;
      const sustainTime = decayTime + sustainTimeRel;
      const releaseTime = sustainTime + releaseTimeRel;
      // Note: Les courbes ADSR (ROW_ENV1_CURVE) ne sont pas transmises via NRPN par le firmware
      // On utilise donc les valeurs par défaut de l'algorithme
      return {
        ...op,
        waveform,
        keyboardTracking,
        frequency,
        detune,
        // amplitude sera patchée après
        pan: 0, // sera patché après aussi si besoin
        target: op.target.map(t => ({ ...t })),
        adsr: {
          attack: { time: attackTime, level: attackLevel },
          decay: { time: decayTime, level: decayLevel },
          sustain: { time: sustainTime, level: sustainLevel },
          release: { time: releaseTime, level: releaseLevel },
          curves: op.adsr.curves,
        },
      };
    });

    // Factorisation de l'assignation Mix/Pan pour chaque opérateur
    // Mix : carriers dans l'ordre de l'algo, modulateurs OP5-6 par id
    // Pan : OP1-6 par id
    const carriers = algorithm.ops.filter(op => op.type === 'CARRIER');
    for (let i = 0; i < 6; i++) {
      // --- Mix (amplitude) ---
      const mixLsb = 16 + i * 2;
      const mixValue = this.getValue(0, mixLsb);
      if (i < carriers.length) {
        // Carriers : Mix1-4 dans l'ordre de l'algo
        const amplitude = Math.max(0, Math.min(1, (mixValue ?? 100) / 100));
        const carrierOp = operators.find(o => o.id === carriers[i].id);
        if (carrierOp) carrierOp.amplitude = amplitude;
      } else {
        // Modulateurs OP5-6 : mapping direct par id
        const amplitude = Math.max(0, Math.min(1, (mixValue ?? 100) / 100));
        const op = operators.find(o => o.id === i + 1 && o.type !== 'CARRIER');
        if (op) op.amplitude = amplitude;
      }
      // --- Pan ---
      const panLsb = 17 + i * 2;
      const panValue = this.getValue(0, panLsb);
      console.log(`[PreenFM3Parser] PAN NRPN LSB=${panLsb} value=${panValue}`);
      if (typeof panValue === 'number') {
        // PreenFM3: 0 = -1, 100 = 0, 200 = 1 (plage -1 à 1)
        const pan = (panValue - 100) / 100;
        if (i < carriers.length) {
          const carrierOp = operators.find(o => o.id === carriers[i].id);
          if (carrierOp) carrierOp.pan = pan;
          console.log(`[PreenFM3Parser] PAN converted for Carrier OP${carriers[i].id}: NRPN=${panValue} → pan=${pan}`);
        } else {
          const op = operators.find(o => o.id === i + 1 && o.type !== 'CARRIER');
          if (op) op.pan = pan;
          console.log(`[PreenFM3Parser] PAN converted for Modulator OP${i+1}: NRPN=${panValue} → pan=${pan}`);
        }
      }
    }
    
    // Modulation Indexes (IM1-IM6): indices 4, 6, 8, 10, 12, 14
    // Modulation Velo (IMVelo1-6): indices 5, 7, 9, 11, 13, 15
    // Conversion NRPN (0-1600) → float 0-16 pour l'UI (IM1-5: 0-1600, IM6: 0-1600 feedback)
    const im1 = (this.getValue(0, 4) ?? 0) / 100;
    const im2 = (this.getValue(0, 6) ?? 0) / 100;
    const im3 = (this.getValue(0, 8) ?? 0) / 100;
    const im4 = (this.getValue(0, 10) ?? 0) / 100;
    const im5 = (this.getValue(0, 12) ?? 0) / 100;
    const im6 = (this.getValue(0, 14) ?? 0) / 100;

    const imVelo1 = (this.getValue(0, 5) ?? 0) / 100;
    const imVelo2 = (this.getValue(0, 7) ?? 0) / 100;
    const imVelo3 = (this.getValue(0, 9) ?? 0) / 100;
    const imVelo4 = (this.getValue(0, 11) ?? 0) / 100;
    const imVelo5 = (this.getValue(0, 13) ?? 0) / 100;
    const imVelo6 = (this.getValue(0, 15) ?? 0) / 100;

    const ims = [im1, im2, im3, im4, im5, im6];
    const imVelos = [imVelo1, imVelo2, imVelo3, imVelo4, imVelo5, imVelo6];
    
    // Appliquer les IMs aux targets selon l'ORDER des edges dans la définition de l'algo.
    // Le firmware PreenFM3 assigne IM1-IM5 dans l'ordre d'apparition des edges (hors feedback),
    // pas en itérant les opérateurs par ID.
    const algoDiagram = ALGO_DIAGRAMS[algoIndex];
    if (algoDiagram) {
      let imIdx = 0;
      for (const edge of algoDiagram.edges) {
        const srcId = parseInt(edge.from.replace(/\D/g, ''));
        const tgtId = parseInt(edge.to.replace(/\D/g, ''));
        const isFeedback = srcId === tgtId;
        const op = operators.find(o => o.id === srcId);
        if (op) {
          const target = op.target.find(t => t.id === tgtId);
          if (target) {
            if (isFeedback) {
              target.im = ims[5];
              target.modulationIndexVelo = imVelos[5] ?? 0;
            } else if (imIdx < 5) {
              target.im = ims[imIdx];
              target.modulationIndexVelo = imVelos[imIdx] ?? 0;
              imIdx++;
            }
          }
        }
      }
    } else {
    // Fallback: iterate operators by id (should not happen)
    let imIndex = 0;
    operators.forEach(op => {
      op.target.forEach(target => {
        const isFeedback = target.id === op.id;
        if (isFeedback) {
          target.im = ims[5];
          target.modulationIndexVelo = imVelos[5] ?? 0;
        } else if (imIndex < 5) {
          // Regular modulation uses sequential IM1-5
          target.im = ims[imIndex];
          target.modulationIndexVelo = imVelos[imIndex] ?? 0;
          imIndex++;
        }
      });
    });
    } // end else fallback
    
    // Paramètres globaux (NRPN MSB=0)
    const velocity = this.getValue(0, 1) ?? 8; // Index 1: Velocity (0-16)
    const glide = this.getValue(0, 3) ?? 0; // Index 3: Glide (0-10)
    
    // NOTE IMPORTANTE: Le nombre de voix n'est PAS transmis lors du patch dump sur PreenfM3
    // - Sur PreenfM2: NRPN [0,2] = numberOfVoices (1-16)
    // - Sur PreenfM3: Le MÊME NRPN est réutilisé pour Play Mode (Poly/Mono/Unison)
    // - Le patch dump (NRPN [127,127]) N'INCLUT PAS le Mixer State (volume, pan, voices)
    // - L'éditeur officiel ne récupère pas non plus ce paramètre
    // Solution: Valeur par défaut 8 voix (à ajuster manuellement dans l'UI)
    const voices = this.getValue(0, 2) ?? 8;
    
    // Créer le patch complet
    const patch: Patch = {
      name,
      bank: 0,
      program: 0,
      algorithm,
      operators,
      modulationMatrix: this.parseModulationMatrix(),
      
      // LFO parsing from NRPN
      // Based on firmware: ROW_LFOOSC1/2/3 (indices 42-44) and ROW_LFOPHASES (45)
      // After getMidiIndexFromMemory() transformation:
      // - LFO1: MSB=1, LSB 40-43 (shape, freq, bias, keysync)
      // - LFO2: MSB=1, LSB 44-47 (shape, freq, bias, keysync)
      // - LFO3: MSB=1, LSB 48-51 (shape, freq, bias, keysync)
      // - Phases: MSB=1, LSB 68-70 (phase1, phase2, phase3)
      lfos: [0, 1, 2].map(lfoIndex => {
        const lfoBase = 40 + lfoIndex * 4; // 40, 44, 48
        
        // Shape (0-7 → LfoType)
        const shapeRaw = this.getValue(1, lfoBase) ?? 0;
        const shape = parseLfoShape(shapeRaw);
        
        // Frequency: detect sync mode based on NRPN value
        const freqRaw = this.getValue(1, lfoBase + 1) ?? 0;
        const freqParsed = nrpnToLfoFrequency(freqRaw);
        
        let syncMode: 'Int' | 'Ext';
        let frequency: number;
        let midiClockMode: any;
        
        if (typeof freqParsed === 'string') {
          // External MIDI Clock mode
          syncMode = 'Ext';
          frequency = 5.0; // Default frequency (not used in Ext mode)
          midiClockMode = freqParsed;
        } else {
          // Internal frequency mode
          syncMode = 'Int';
          frequency = freqParsed;
          midiClockMode = 'MC'; // Default MIDI clock mode (not used in Int mode)
        }
        
        // Bias (0-200 → -1.0 to +1.0)
        const biasRaw = this.getValue(1, lfoBase + 2) ?? LFO_BIAS_CENTER;
        const bias = parseLfoBias(biasRaw);
        
        // Keysync (0 = 'Off', 1-1601 = 0.0-16.0)
        const keysyncRaw = this.getValue(1, lfoBase + 3) ?? 0;
        const keysync = parseLfoKeysync(keysyncRaw);
        
        // Phase (0-16383 → 0-1) - stored separately at LSB 68-70
        const phase = this.getScaledValue(1, 68 + lfoIndex, 0, 1);
        
        return {
          shape,
          syncMode,
          frequency,
          midiClockMode,
          phase,
          bias,
          keysync
        };
      }) as [LFO, LFO, LFO],
      
      // LFO Envelopes (2 enveloppes)
      // Free Envelopes since official editor source:
      // PREENFM2_NRPN_FREE_ENV1_ATTK = 180 (MSB=1, LSB=52)
      // PREENFM2_NRPN_FREE_ENV1_DECAY = 181 (MSB=1, LSB=53)
      // PREENFM2_NRPN_FREE_ENV1_SUSTAIN = 182 (MSB=1, LSB=54)
      // PREENFM2_NRPN_FREE_ENV1_RELEASE = 183 (MSB=1, LSB=55)
      // PREENFM2_NRPN_FREE_ENV2_SILENCE = 184 (MSB=1, LSB=56)
      // PREENFM2_NRPN_FREE_ENV2_ATTK = 185 (MSB=1, LSB=57)
      // PREENFM2_NRPN_FREE_ENV2_DECAY = 186 (MSB=1, LSB=58)
      // PREENFM2_NRPN_FREE_ENV2_LOOP = 187 (MSB=1, LSB=59)
      // Values are in centièmes (multiplier = 100, range 0-16s -> 0-1600)
      lfoEnvelopes: [
        // Env1: ADSR structure
        {
          adsr: {
            attack: { 
              time: (this.getValue(1, 52) ?? 100) / 100,  // Default 1s
              level: 100  // Level not transmitted, always 100
            },
            decay: { 
              time: (this.getValue(1, 53) ?? 200) / 100,  // Default 2s
              level: 50   // Level not transmitted, default 50%
            },
            sustain: { 
              time: (this.getValue(1, 54) ?? 300) / 100,  // Default 3s
              level: 50   // Sustain level = decay level
            },
            release: { 
              time: (this.getValue(1, 55) ?? 100) / 100,  // Default 1s
              level: 0    // Level not transmitted, always 0
            },
          },
          loopMode: 'Off' as const,
          silence: 0,
        },
        // Env2: Silence-Attack-Release structure  
        {
          adsr: {
            attack: { 
              time: (this.getValue(1, 57) ?? 200) / 100,  // Attack time, default 2s
              level: 100  // Attack level always 100
            },
            decay: { 
              time: (this.getValue(1, 58) ?? 100) / 100,  // Release time (stored in decay), default 1s
              level: 0    // Release level always 0
            },
            sustain: { time: 0, level: 0 },  // Not used
            release: { time: 0, level: 0 },  // Not used
          },
          loopMode: (() => {
            const loopValue = this.getValue(1, 59) ?? 0;  // Loop mode
            // Firmware enum: LFO_ENV2_NOLOOP=0, LFO_ENV2_LOOP_SILENCE=1, LFO_ENV2_LOOP_ATTACK=2
            // - Off: No loop
            // - Silence: Loop all (silence + attack + release) - "Sile" on PreenFM3
            // - Attack: Loop from end of silence (attack + release) - "Attk" on PreenFM3
            const modes: Array<'Off' | 'Silence' | 'Attack'> = ['Off', 'Silence', 'Attack'];
            return modes[loopValue] || 'Off';
          })(),
          silence: (this.getValue(1, 56) ?? 0) / 100,  // Silence time, default 0s
        },
      ] as [typeof DEFAULT_LFO_ENVELOPE, typeof DEFAULT_LFO_ENVELOPE],
      
      // Step Sequencers: parser les steps à partir des NRPN reçus (MSB=2/3, LSB=0-15)
      stepSequencers: (() => {
        const arr = [0, 1].map(seqIdx => {
          const steps: number[] = [];
          for (let i = 0; i < 16; i++) {
            // NRPN: MSB=2 (Seq1) ou 3 (Seq2), LSB=0-15
            const value = this.getValue(seqIdx + 2, i);
            // Sur le PreenFM3, la valeur brute va de 0 à 15, il faut la remapper sur 0-100
            if (typeof value === 'number') {
              steps.push(Math.round((value * 100) / 15));
            } else {
              steps.push(50);
            }
          }
          // Gate et BPM (MSB=1, LSB=61/62 et 60/64)
          const gate = (this.getValue(1, seqIdx === 0 ? 61 : 62) ?? 50) / 100;
          const bpm = this.getValue(1, seqIdx === 0 ? 60 : 64) ?? 120;
          // SyncMode et midiClockMode non parsés ici (à compléter si besoin)
          return {
            steps,
            gate,
            bpm,
            syncMode: 'Int', // valeur par défaut, à parser si possible
            midiClockMode: 'Ck/4', // valeur par défaut, à parser si besoin
          };
        });
        return [arr[0], arr[1]] as [import('../types/modulation').StepSequencer, import('../types/modulation').StepSequencer];
      })(),
      filters: ([0, 1].map(i => {
        // Filter1: MSB=0, LSB=40-43 | Filter2: MSB=0, LSB=44-47
        const baseLsb = 40 + i * 4;
        let typeRaw = this.getValue(0, baseLsb);
        // Firmware: type = valeur NRPN brute (0=Off, 1=Mix, ...), clamp à la plage supportée (0-48)
        const MAX_FILTER_TYPE = 48;
        let typeIndex = 0;
        if (typeof typeRaw === 'number') {
          typeIndex = Math.max(0, Math.min(MAX_FILTER_TYPE, typeRaw));
        }
        // Use canonical Filter1Type list for mapping
        const type = FILTER1_TYPE_LIST[typeIndex] || 'OFF';
        if (i === 0) {
          console.log('🔎 Filter1 NRPN:', {
            typeRaw,
            type,
            param1Raw: this.getValue(0, baseLsb + 1),
            param2Raw: this.getValue(0, baseLsb + 2),
            gainRaw: this.getValue(0, baseLsb + 3)
          });
        }
        const param1Raw = this.getValue(0, baseLsb + 1);
        const param2Raw = this.getValue(0, baseLsb + 2);
        const gainRaw = this.getValue(0, baseLsb + 3);
        // Firmware: param1/2 = valeur NRPN * 0.01 (0-1), gain = NRPN * 0.01 (0-2 for Filter1, 0-1 for Filter2)
        const param1 = typeof param1Raw === 'number' ? Math.max(0, Math.min(1, param1Raw * 0.01)) : 0.5;
        const param2 = typeof param2Raw === 'number' ? Math.max(0, Math.min(1, param2Raw * 0.01)) : 0.5;
        let gain;
        if (i === 0) {
          // Filter1: gain can go up to 2.0
          gain = typeof gainRaw === 'number' ? Math.max(0, Math.min(2, gainRaw * 0.01)) : 0.5;
        } else {
          // Filter2: gain/mix is 0-1
          gain = typeof gainRaw === 'number' ? Math.max(0, Math.min(1, gainRaw * 0.01)) : 0.5;
        }
        return { type, param1, param2, gain };
      }) as unknown as [import('../types/patch').Filter, import('../types/patch').Filter]),
        noteCurves: [
          this.parseNoteCurve(0), // Note1  
          this.parseNoteCurve(1)  // Note2
        ],
      // import type { Filter1Type, Filter2Type } from '../types/patch';
      global: {
        volume: 0.8,
        transpose: 0,
        fineTune: 0,
        polyphony: voices,
        glideTime: glide,
        bendRange: 2,
        velocitySensitivity: velocity,
      },
      effects: {
        reverb: { enabled: false, room: 0.5, damp: 0.5, level: 0.3 },
        delay: { enabled: false, time: 0.5, feedback: 0.3, level: 0.3 },
        chorus: { enabled: false, rate: 0.5, depth: 0.3, level: 0.3 },
      },
      arpeggiator: {
        clockSource: parseArpClock(this.getValue(0, 28) ?? 0), // NRPN LSB=28 = Clock source
        clock: this.getValue(0, 29) ?? 120, // NRPN LSB=29 = BPM
        direction: parseArpDirection(this.getValue(0, 30) ?? 0), // NRPN LSB=30 
        octave: Math.max(1, Math.min(3, this.getValue(0, 31) ?? 1)), // NRPN LSB=31 (pas de +1)
        pattern: parseArpPattern(this.getValue(0, 32) ?? 0), // NRPN LSB=32
        division: parseArpDivision(this.getValue(0, 33) ?? 12), // NRPN LSB=33, Default to 1/16 (index 12)
        duration: parseArpDuration(this.getValue(0, 34) ?? 12), // NRPN LSB=34, Default to 1/16 (index 12)
        latch: parseArpLatch(this.getValue(0, 35) ?? 0), // NRPN LSB=35
      },
      midi: {
        channel: 1,
        velocityCurve: 'LINEAR',
        pitchBendRange: 2,
        modulationWheelTarget: 'LFO1_AMOUNT',
        sustainPedalBehavior: 'STANDARD',
      },
      editorMetadata: {
        lastModified: new Date(),
        version: '1.0.0',
      },
    };
    
    return patch;
  }

  /**
   * Parser la matrice de modulation depuis les données NRPN
   * Structure documentée: 3 paramètres par ligne (Source, Multiplier, Destination)
   * MAIS le preenfm2Controller montre 2 destinations, donc il y a probablement un 4ème paramètre
   * Lignes 1-3: MSB=0, LSB=116 + (ligne-1)*4
   * Lignes 4-12: MSB=1, LSB=(ligne-4)*4
   */
  private parseModulationMatrix(): Array<{
    source: string;
    destination1: string;
    destination2: string;
    amount: number;
  }> {
    const matrix: Array<{
      source: string;
      destination1: string;
      destination2: string;
      amount: number;
    }> = [];

    // Mapping des sources (SourceEnum du firmware PreenFM3)
    const sourceNames = [
      'None',          // 0 - MATRIX_SOURCE_NONE
      'LFO 1',         // 1 - MATRIX_SOURCE_LFO1
      'LFO 2',         // 2 - MATRIX_SOURCE_LFO2
      'LFO 3',         // 3 - MATRIX_SOURCE_LFO3
      'LFOEnv1',       // 4 - MATRIX_SOURCE_LFOENV1
      'LFOEnv2',       // 5 - MATRIX_SOURCE_LFOENV2
      'LFOSeq1',       // 6 - MATRIX_SOURCE_LFOSEQ1
      'LFOSeq2',       // 7 - MATRIX_SOURCE_LFOSEQ2
      'Modwheel',      // 8 - MATRIX_SOURCE_MODWHEEL
      'Pitchbend',     // 9 - MATRIX_SOURCE_PITCHBEND
      'Aftertouch',    // 10 - MATRIX_SOURCE_AFTERTOUCH
      'Velocity',      // 11 - MATRIX_SOURCE_VELOCITY
      'Note1',         // 12 - MATRIX_SOURCE_NOTE1
      'CC1',           // 13 - MATRIX_SOURCE_CC1
      'CC2',           // 14 - MATRIX_SOURCE_CC2
      'CC3',           // 15 - MATRIX_SOURCE_CC3
      'CC4',           // 16 - MATRIX_SOURCE_CC4
      'Note2',         // 17 - MATRIX_SOURCE_NOTE2
      'Breath',        // 18 - MATRIX_SOURCE_BREATH
      'MPE Slide',     // 19 - MATRIX_SOURCE_MPESLIDE
      'Random',        // 20 - MATRIX_SOURCE_RANDOM
      'Poly AT',       // 21 - MATRIX_SOURCE_POLYPHONIC_AFTERTOUCH
      'User CC1',      // 22 - MATRIX_SOURCE_USER_CC1
      'User CC2',      // 23 - MATRIX_SOURCE_USER_CC2
      'User CC3',      // 24 - MATRIX_SOURCE_USER_CC3
      'User CC4',      // 25 - MATRIX_SOURCE_USER_CC4
      'PB MPE',        // 26 - MATRIX_SOURCE_PITCHBEND_MPE
      'AT MPE',        // 27 - MATRIX_SOURCE_AFTERTOUCH_MPE
    ];

    // Mapping des destinations (DestinationEnum du firmware PreenFM3)
    const destNames = [
      'None',          // 0 - DESTINATION_NONE
      'Gate',          // 1 - MAIN_GATE
      'IM1',           // 2 - INDEX_MODULATION1
      'IM2',           // 3 - INDEX_MODULATION2
      'IM3',           // 4 - INDEX_MODULATION3
      'IM4',           // 5 - INDEX_MODULATION4
      'IM*',           // 6 - INDEX_ALL_MODULATION
      'Mix1',          // 7 - MIX_OSC1
      'Pan1',          // 8 - PAN_OSC1
      'Mix2',          // 9 - MIX_OSC2
      'Pan2',          // 10 - PAN_OSC2
      'Mix3',          // 11 - MIX_OSC3
      'Pan3',          // 12 - PAN_OSC3
      'Mix4',          // 13 - MIX_OSC4
      'Pan4',          // 14 - PAN_OSC4
      'Mix*',          // 15 - ALL_MIX
      'Pan*',          // 16 - ALL_PAN
      'o1 Fq',         // 17 - OSC1_FREQ
      'o2 Fq',         // 18 - OSC2_FREQ
      'o3 Fq',         // 19 - OSC3_FREQ
      'o4 Fq',         // 20 - OSC4_FREQ
      'o5 Fq',         // 21 - OSC5_FREQ
      'o6 Fq',         // 22 - OSC6_FREQ
      'o* Fq',         // 23 - ALL_OSC_FREQ
      'Env1 A',        // 24 - ENV1_ATTACK
      'Env2 A',        // 25 - ENV2_ATTACK
      'Env3 A',        // 26 - ENV3_ATTACK
      'Env4 A',        // 27 - ENV4_ATTACK
      'Env5 A',        // 28 - ENV5_ATTACK
      'Env6 A',        // 29 - ENV6_ATTACK
      'Env* A',        // 30 - ALL_ENV_ATTACK
      'Env* R',        // 31 - ALL_ENV_RELEASE
      'Mtx1 x',        // 32 - MTX1_MUL
      'Mtx2 x',        // 33 - MTX2_MUL
      'Mtx3 x',        // 34 - MTX3_MUL
      'Mtx4 x',        // 35 - MTX4_MUL
      'Lfo1 F',        // 36 - LFO1_FREQ
      'Lfo2 F',        // 37 - LFO2_FREQ
      'Lfo3 F',        // 38 - LFO3_FREQ
      'Env2 S',        // 39 - LFOENV2_SILENCE
      'Seq1 G',        // 40 - LFOSEQ1_GATE
      'Seq2 G',        // 41 - LFOSEQ2_GATE
      'Flt1 P1',       // 42 - FILTER1_PARAM1
      'o* FqH',        // 43 - ALL_OSC_FREQ_HARM
      'Env* D',        // 44 - ALL_ENV_DECAY
      'EnvM A',        // 45 - ALL_ENV_ATTACK_MODULATOR
      'EnvM D',        // 46 - ALL_ENV_DECAY_MODULATOR
      'EnvM R',        // 47 - ALL_ENV_RELEASE_MODULATOR
      'Mtx FB',        // 48 - MTX_DEST_FEEDBACK
      'Flt1 P2',       // 49 - FILTER1_PARAM2
      'Flt1 G',        // 50 - FILTER1_AMP
      'Flt2 P1',       // 51 - FILTER2_PARAM1
      'Flt2 P2',       // 52 - FILTER2_PARAM2
      'Flt2 G',        // 53 - FILTER2_AMP
    ];

    for (let row = 0; row < 12; row++) {
      let msb: number, lsbBase: number;

      if (row < 3) {
        // Lignes 1-3: MSB=0, LSB=116 + row*4
        msb = 0;
        lsbBase = 116 + row * 4;
      } else {
        // Lignes 4-12: MSB=1, LSB=(row-3)*4
        msb = 1;
        lsbBase = (row - 3) * 4;
      }

      // Lire les 4 paramètres possibles de la ligne
      const sourceValue = this.getValue(msb, lsbBase) ?? 0;
      const multiplierValue = this.getValue(msb, lsbBase + 1) ?? 1000; // 1000 = 0.0
      const dest1Value = this.getValue(msb, lsbBase + 2) ?? 0;
      const dest2Value = this.getValue(msb, lsbBase + 3) ?? 0; // Peut-être non transmis

      // Debug
      if (row === 0 && (sourceValue !== 0 || multiplierValue !== 1000 || dest1Value !== 0)) {
        console.log(`Matrix Row 1 NRPN: MSB=${msb}, LSB=${lsbBase}`);
        console.log(`  Source=${sourceValue}, Mult=${multiplierValue}, Dest1=${dest1Value}, Dest2=${dest2Value}`);
      }

      // Convertir les valeurs
      const source = sourceNames[sourceValue] || `Unknown(${sourceValue})`;
      const destination1 = destNames[dest1Value] || `Unknown(${dest1Value})`;
      const destination2 = destNames[dest2Value] || 'None';
      
      // Multiplier: 0=-10.0, 1000=0.0, 2000=10.0
      const amount = (multiplierValue - 1000) / 100;

      matrix.push({
        source,
        destination1,
        destination2,
        amount,
      });
    }

    return matrix;
  }
}

/**
 * Helper pour décoder un paramètre depuis l'index mémoire PreenFM3
 * Basé sur getMidiIndexFromMemory() du firmware
 */
export function getMemoryIndexFromMidi(midiIndex: number): number {
  const paramRow = (midiIndex >> 2) & 0xFF;
  const encoder = midiIndex & 0x03;
  
  // Appliquer les transformations inverses du firmware
  // Ces valeurs correspondent aux ROW_ constants du firmware
  let adjustedRow = paramRow;
  
  // Ajustements basés sur MidiDecoder.cpp
  if (paramRow >= 24) { // Après ROW_LFOPHASES
    adjustedRow -= 4;
  } else if (paramRow >= 20 && paramRow < 24) { // ROW_LFOENV1, LFOENV2, LFOSEQ1, LFOSEQ2
    adjustedRow += 1;
  }
  
  return (adjustedRow << 2) | encoder;
}

/**
 * Noms des paramètres pour debug (partiel)
 */
export const PARAM_NAMES: Record<number, string> = {
  // Engine (MSB 0, LSB 0-15)
  0: 'Algorithm',
  1: 'Velocity',
  2: 'Voices',
  3: 'Glide',
  
  // Modulation (MSB 0, LSB 16-31)
  16: 'IM1',
  17: 'IM2',
  18: 'IM3',
  19: 'IM4',
  20: 'IM5',
  21: 'IM6 (FB)',
  
  // Mix (MSB 0, LSB 32-47)
  32: 'Mix1',
  33: 'Mix2',
  34: 'Mix3',
  35: 'Mix4',
  36: 'Pan1',
  37: 'Pan2',
  38: 'Pan3',
  39: 'Pan4',
  
  // Etc...
};
