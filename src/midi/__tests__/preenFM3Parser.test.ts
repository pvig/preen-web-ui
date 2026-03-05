/// <reference types="node" />
/**
 * Tests de non-régression du PreenFM3Parser
 *
 * Pour ajouter un test :
 *   1. Faire un Pull dans l'UI
 *   2. Copier le JSON depuis le log console "🧪 FIXTURE JSON ▼"
 *   3. Créer src/midi/__tests__/fixtures/mon-patch.fixture.json avec ce contenu
 *   4. `npm test`
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PreenFM3Parser } from '../preenFM3Parser';
import type { Patch } from '../../types/patch';

// ---------------------------------------------------------------------------
// Types fixtures
// ---------------------------------------------------------------------------

interface NRPNRaw {
  paramMSB: number;
  paramLSB: number;
  valueMSB: number;
  valueLSB: number;
}

// La section `expected` est un sous-ensemble libre du Patch + champs d'opérateur étendus
type ExpectedOperator = {
  id?: number;
  waveform?: string;
  frequency?: number;
  keyboardTracking?: number;
  amplitude?: number;
  pan?: number;
  detune?: number;
  adsr?: {
    attack?: { time?: number; level?: number };
    decay?: { time?: number; level?: number };
    sustain?: { time?: number; level?: number };
    release?: { time?: number; level?: number };
  };
  target?: Array<{ id?: number; im?: number; modulationIndexVelo?: number }>;
};

type ExpectedLFO = {
  shape?: string;
  syncMode?: string;
  frequency?: number;
  midiClockMode?: string;
  phase?: number;
  bias?: number;
  keysync?: number | string;
};

type ExpectedFilter = {
  type?: string;
  param1?: number;
  param2?: number;
  gain?: number;
};

type ExpectedNoteCurve = {
  before?: string;
  breakNote?: number;
  after?: string;
};

type ExpectedStepSequencer = {
  steps?: number[];
  gate?: number;
  bpm?: number;
};

type ExpectedLFOEnvelope = {
  silence?: number;
  loopMode?: string;
  adsr?: {
    attack?: { time?: number; level?: number };
    decay?: { time?: number; level?: number };
    sustain?: { time?: number; level?: number };
    release?: { time?: number; level?: number };
  };
};

interface FixtureExpected {
  name?: string;
  algorithm?: { id?: string | number; name?: string };
  operators?: ExpectedOperator[];
  modulationMatrix?: Array<{
    source?: string;
    destination1?: string;
    destination2?: string;
    amount?: number;
  }>;
  lfos?: ExpectedLFO[];
  lfoEnvelopes?: ExpectedLFOEnvelope[];
  stepSequencers?: ExpectedStepSequencer[];
  filters?: ExpectedFilter[];
  noteCurves?: ExpectedNoteCurve[];
  arpeggiator?: {
    clock?: number;
    direction?: string;
    octave?: number;
    pattern?: string;
    division?: string;
    duration?: string;
    latch?: string;
  };
  global?: {
    velocitySensitivity?: number;
    glideTime?: number;
    polyphony?: number;
  };
}

interface FixtureData {
  description?: string;
  nrpns: NRPNRaw[];
  expected: FixtureExpected | null;
}

// ---------------------------------------------------------------------------
// Chargement des fixtures
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

function loadFixtures(): Array<{ file: string; fixture: FixtureData }> {
  if (!existsSync(FIXTURES_DIR)) return [];
  return readdirSync(FIXTURES_DIR)
    .filter((f: string) => f.endsWith('.fixture.json'))
    .map((file: string) => ({
      file,
      fixture: JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8')) as FixtureData,
    }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PreenFM3Parser — non-regression', () => {
  const fixtures = loadFixtures();
  const activeFixtures = fixtures.filter(({ fixture }) => fixture.nrpns?.length > 0);

  if (activeFixtures.length === 0) {
    it('aucune fixture active — ajoutez des fichiers .fixture.json dans src/midi/__tests__/fixtures/', () => {
      console.info('📂 Fixture dir:', FIXTURES_DIR);
      console.info('   Faites un Pull depuis l\'UI, copiez le log 🧪 FIXTURE JSON ▼ dans un fichier .fixture.json');
      expect(true).toBe(true);
    });
    return;
  }

  for (const { file, fixture } of activeFixtures) {
    const label = fixture.description ?? file;
    const nrpns = fixture.nrpns;
    const expected = fixture.expected;

    describe(label, () => {
      // Parse une seule fois pour toute la suite
      let patch: Patch;
      beforeAll(() => {
        const parser = new PreenFM3Parser();
        for (const nrpn of nrpns) {
          parser.addNRPN(nrpn);
        }
        patch = parser.toPatch();
      });

      // ----------------------------------------------------------------
      it('parse sans erreur', () => {
        expect(patch).toBeDefined();
      });

      if (!expected) return;

      // ---- Nom ----------------------------------------------------------
      if (expected.name !== undefined) {
        it('nom du patch', () => {
          expect(patch.name).toBe(expected.name);
        });
      }

      // ---- Algorithme ---------------------------------------------------
      if (expected.algorithm !== undefined) {
        describe('algorithme', () => {
          if (expected.algorithm!.id !== undefined) {
            it('id', () => {
              expect(String(patch.algorithm.id)).toBe(String(expected.algorithm!.id));
            });
          }
          if (expected.algorithm!.name !== undefined) {
            it('name', () => {
              expect(String(patch.algorithm.name)).toBe(expected.algorithm!.name);
            });
          }
        });
      }

      // ---- Paramètres globaux ------------------------------------------
      if (expected.global !== undefined) {
        describe('global', () => {
          const g = expected.global!;
          if (g.velocitySensitivity !== undefined) {
            it('velocitySensitivity', () => {
              expect(patch.global.velocitySensitivity).toBeCloseTo(g.velocitySensitivity!, 1);
            });
          }
          if (g.glideTime !== undefined) {
            it('glideTime', () => {
              expect(patch.global.glideTime).toBeCloseTo(g.glideTime!, 2);
            });
          }
          if (g.polyphony !== undefined) {
            it('polyphony', () => {
              expect(patch.global.polyphony).toBe(g.polyphony);
            });
          }
        });
      }

      // ---- Opérateurs --------------------------------------------------
      if (expected.operators?.length) {
        describe('opérateurs', () => {
          for (let i = 0; i < expected.operators!.length; i++) {
            const expOp = expected.operators![i];
            const opLabel = `OP${expOp.id ?? i + 1}`;

            describe(opLabel, () => {
              if (expOp.waveform !== undefined) {
                it('waveform', () => {
                  expect(patch.operators[i].waveform).toBe(expOp.waveform);
                });
              }
              if (expOp.frequency !== undefined) {
                it('frequency', () => {
                  expect(patch.operators[i].frequency).toBeCloseTo(expOp.frequency!, 2);
                });
              }
              if (expOp.keyboardTracking !== undefined) {
                it('keyboardTracking', () => {
                  expect(patch.operators[i].keyboardTracking).toBe(expOp.keyboardTracking);
                });
              }
              if (expOp.amplitude !== undefined) {
                it('amplitude', () => {
                  expect(patch.operators[i].amplitude).toBeCloseTo(expOp.amplitude!, 2);
                });
              }
              if (expOp.pan !== undefined) {
                it('pan', () => {
                  expect(patch.operators[i].pan).toBeCloseTo(expOp.pan!, 2);
                });
              }
              if (expOp.detune !== undefined) {
                it('detune', () => {
                  expect(patch.operators[i].detune).toBeCloseTo(expOp.detune!, 2);
                });
              }

              // ADSR
              if (expOp.adsr !== undefined) {
                describe('adsr', () => {
                  const a = expOp.adsr!;
                  if (a.attack?.time !== undefined) it('attack.time', () => {
                    expect(patch.operators[i].adsr.attack.time).toBeCloseTo(a.attack!.time!, 2);
                  });
                  if (a.attack?.level !== undefined) it('attack.level', () => {
                    expect(patch.operators[i].adsr.attack.level).toBeCloseTo(a.attack!.level!, 1);
                  });
                  if (a.decay?.time !== undefined) it('decay.time', () => {
                    expect(patch.operators[i].adsr.decay.time).toBeCloseTo(a.decay!.time!, 2);
                  });
                  if (a.decay?.level !== undefined) it('decay.level', () => {
                    expect(patch.operators[i].adsr.decay.level).toBeCloseTo(a.decay!.level!, 1);
                  });
                  if (a.sustain?.level !== undefined) it('sustain.level', () => {
                    expect(patch.operators[i].adsr.sustain.level).toBeCloseTo(a.sustain!.level!, 1);
                  });
                  if (a.release?.time !== undefined) it('release.time', () => {
                    expect(patch.operators[i].adsr.release.time).toBeCloseTo(a.release!.time!, 2);
                  });
                });
              }

              // Targets (IM)
              if (expOp.target?.length) {
                describe('targets (IM)', () => {
                  for (let t = 0; t < expOp.target!.length; t++) {
                    const expTarget = expOp.target![t];
                    const actualTarget = patch.operators[i].target[t];
                    if (expTarget.im !== undefined) {
                      it(`target[${t}].im`, () => {
                        expect(actualTarget?.im).toBeCloseTo(expTarget.im!, 2);
                      });
                    }
                    if (expTarget.modulationIndexVelo !== undefined) {
                      it(`target[${t}].modulationIndexVelo`, () => {
                        expect(actualTarget?.modulationIndexVelo).toBeCloseTo(expTarget.modulationIndexVelo!, 2);
                      });
                    }
                  }
                });
              }
            });
          }
        });
      }

      // ---- Matrice de modulation ----------------------------------------
      if (expected.modulationMatrix?.length) {
        describe('matrice de modulation', () => {
          for (let i = 0; i < expected.modulationMatrix!.length; i++) {
            const expRow = expected.modulationMatrix![i];
            describe(`ligne ${i + 1}`, () => {
              if (expRow.source !== undefined) it('source', () => {
                expect(patch.modulationMatrix[i].source).toBe(expRow.source);
              });
              if (expRow.destination1 !== undefined) it('destination1', () => {
                expect(patch.modulationMatrix[i].destination1).toBe(expRow.destination1);
              });
              if (expRow.destination2 !== undefined) it('destination2', () => {
                expect(patch.modulationMatrix[i].destination2).toBe(expRow.destination2);
              });
              if (expRow.amount !== undefined) it('amount', () => {
                expect(patch.modulationMatrix[i].amount).toBeCloseTo(expRow.amount!, 2);
              });
            });
          }
        });
      }

      // ---- LFOs ---------------------------------------------------------
      if (expected.lfos?.length) {
        describe('LFOs', () => {
          for (let i = 0; i < expected.lfos!.length; i++) {
            const expLfo = expected.lfos![i];
            describe(`LFO ${i + 1}`, () => {
              const lfo = () => (patch.lfos ?? [])[i];
              if (expLfo.shape !== undefined) it('shape', () => {
                expect(lfo().shape).toBe(expLfo.shape);
              });
              if (expLfo.syncMode !== undefined) it('syncMode', () => {
                expect(lfo().syncMode).toBe(expLfo.syncMode);
              });
              if (expLfo.frequency !== undefined) it('frequency', () => {
                expect(lfo().frequency).toBeCloseTo(expLfo.frequency!, 2);
              });
              if (expLfo.bias !== undefined) it('bias', () => {
                expect(lfo().bias).toBeCloseTo(expLfo.bias!, 2);
              });
              if (expLfo.keysync !== undefined) it('keysync', () => {
                const v = lfo().keysync;
                if (typeof expLfo.keysync === 'number') {
                  expect(typeof v === 'number' ? v : -1).toBeCloseTo(expLfo.keysync, 2);
                } else {
                  expect(v).toBe(expLfo.keysync);
                }
              });
              if (expLfo.phase !== undefined) it('phase', () => {
                expect(lfo().phase).toBeCloseTo(expLfo.phase!, 3);
              });
              if (expLfo.midiClockMode !== undefined && expLfo.syncMode === 'Ext') {
                it('midiClockMode', () => {
                  expect(lfo().midiClockMode).toBe(expLfo.midiClockMode);
                });
              }
            });
          }
        });
      }

      // ---- LFO Envelopes -----------------------------------------------
      if (expected.lfoEnvelopes?.length) {
        describe('LFO envelopes', () => {
          for (let i = 0; i < expected.lfoEnvelopes!.length; i++) {
            const expEnv = expected.lfoEnvelopes![i];
            describe(`env ${i + 1}`, () => {
              const env = () => (patch.lfoEnvelopes ?? [])[i];
              if (expEnv.silence !== undefined) it('silence', () => {
                expect(env().silence).toBeCloseTo(expEnv.silence!, 2);
              });
              if (expEnv.loopMode !== undefined) it('loopMode', () => {
                expect(env().loopMode).toBe(expEnv.loopMode);
              });
              if (expEnv.adsr?.attack?.time !== undefined) it('adsr.attack.time', () => {
                expect(env().adsr.attack.time).toBeCloseTo(expEnv.adsr!.attack!.time!, 2);
              });
              if (expEnv.adsr?.decay?.time !== undefined) it('adsr.decay.time', () => {
                expect(env().adsr.decay.time).toBeCloseTo(expEnv.adsr!.decay!.time!, 2);
              });
            });
          }
        });
      }

      // ---- Step Sequencers ---------------------------------------------
      if (expected.stepSequencers?.length) {
        describe('step sequencers', () => {
          for (let i = 0; i < expected.stepSequencers!.length; i++) {
            const expSeq = expected.stepSequencers![i];
            describe(`seq ${i + 1}`, () => {
              const seq = () => (patch.stepSequencers ?? [])[i];
              if (expSeq.bpm !== undefined) it('bpm', () => {
                expect(seq().bpm).toBeCloseTo(expSeq.bpm!, 0);
              });
              if (expSeq.gate !== undefined) it('gate', () => {
                expect(seq().gate).toBeCloseTo(expSeq.gate!, 2);
              });
              if (expSeq.steps !== undefined) {
                it('steps (16 valeurs)', () => {
                  expect(seq().steps.length).toBe(16);
                });
                for (let s = 0; s < expSeq.steps.length; s++) {
                  it(`step[${s}]`, () => {
                    expect(seq().steps[s]).toBeCloseTo(expSeq.steps![s], 0);
                  });
                }
              }
            });
          }
        });
      }

      // ---- Filtres -----------------------------------------------------
      if (expected.filters?.length) {
        describe('filtres', () => {
          for (let i = 0; i < expected.filters!.length; i++) {
            const expFilter = expected.filters![i];
            describe(`filtre ${i + 1}`, () => {
              if (expFilter.type !== undefined) it('type', () => {
                expect(patch.filters[i].type).toBe(expFilter.type);
              });
              if (expFilter.param1 !== undefined) it('param1', () => {
                expect(patch.filters[i].param1).toBeCloseTo(expFilter.param1!, 2);
              });
              if (expFilter.param2 !== undefined) it('param2', () => {
                expect(patch.filters[i].param2).toBeCloseTo(expFilter.param2!, 2);
              });
              if (expFilter.gain !== undefined) it('gain', () => {
                expect(patch.filters[i].gain).toBeCloseTo(expFilter.gain!, 2);
              });
            });
          }
        });
      }

      // ---- Note Curves -------------------------------------------------
      if (expected.noteCurves?.length) {
        describe('note curves', () => {
          for (let i = 0; i < expected.noteCurves!.length; i++) {
            const expCurve = expected.noteCurves![i];
            describe(`curve ${i + 1}`, () => {
              const curve = () => (patch.noteCurves ?? [])[i];
              if (expCurve.before !== undefined) it('before', () => {
                expect(curve().before).toBe(expCurve.before);
              });
              if (expCurve.breakNote !== undefined) it('breakNote', () => {
                expect(curve().breakNote).toBe(expCurve.breakNote);
              });
              if (expCurve.after !== undefined) it('after', () => {
                expect(curve().after).toBe(expCurve.after);
              });
            });
          }
        });
      }

      // ---- Arpégiateur -------------------------------------------------
      if (expected.arpeggiator !== undefined) {
        describe('arpégiateur', () => {
          const arp = expected.arpeggiator!;
          if (arp.direction !== undefined) it('direction', () => {
            expect(patch.arpeggiator.direction).toBe(arp.direction);
          });
          if (arp.octave !== undefined) it('octave', () => {
            expect(patch.arpeggiator.octave).toBe(arp.octave);
          });
          if (arp.pattern !== undefined) it('pattern', () => {
            expect(patch.arpeggiator.pattern).toBe(arp.pattern);
          });
          if (arp.division !== undefined) it('division', () => {
            expect(patch.arpeggiator.division).toBe(arp.division);
          });
          if (arp.duration !== undefined) it('duration', () => {
            expect(patch.arpeggiator.duration).toBe(arp.duration);
          });
          if (arp.latch !== undefined) it('latch', () => {
            expect(patch.arpeggiator.latch).toBe(arp.latch);
          });
        });
      }
    });
  }
});

