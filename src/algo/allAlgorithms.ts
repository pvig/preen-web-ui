// Ce fichier contient TOUS les algorithmes PreenFM3 extraits de Voice.cpp
// Total: 32 algorithmes standard + 4 windowed sync variants (ALG29-32)

import type { AlgoDiagram } from './algorithms.static';

export const ALL_PREENFM_ALGORITHMS: ReadonlyArray<AlgoDiagram> = Object.freeze([
  // ========== PREENFM ALGORITHMS (1-9) ==========
  
  // ALGO1: IM3<----, 2->1, 3*->1,2
  {
    id: "alg1",
    name: "Algo DX 1",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 2, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 1 },
      { id: "op3", type: "MODULATOR", label: "3", x: 3, y: 1 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op3", to: "op1" },
      { from: "op3", to: "op2" },
      { from: "op3", to: "op3" }, // OP3 feedback
    ],
  },

  // ALGO2: 3->1, 3->2
  {
    id: "alg2",
    name: "Algo DX 2",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 3, y: 3 },
      { id: "op3", type: "MODULATOR", label: "3", x: 2, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op1" },
      { from: "op3", to: "op2" },
    ],
  },

  // ALGO3: IM4<----, 2->1, 3->1, 4*->3
  {
    id: "alg3",
    name: "Algo DX 3",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 2, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 0, y: 2 },
      { id: "op3", type: "MODULATOR", label: "3", x: 2, y: 2 },
      { id: "op4", type: "MODULATOR", label: "4", x: 4, y: 1 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op3", to: "op1" },
      { from: "op4", to: "op3" },
      { from: "op4", to: "op4" },
    ],
  },

  // ALGO4: IM4<----, 3->1, 3->2, 4*->3
  {
    id: "alg4",
    name: "Algo DX 4",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 4, y: 3 },
      { id: "op3", type: "MODULATOR", label: "3", x: 1, y: 2 },
      { id: "op4", type: "MODULATOR", label: "4", x: 4, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op1" },
      { from: "op3", to: "op2" },
      { from: "op4", to: "op3" },
      { from: "op4", to: "op4" },
    ],
  },

  // ALGO5: 4*->3->2->1
  {
    id: "alg5",
    name: "Algo DX 5",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 2, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 2, y: 2 },
      { id: "op3", type: "MODULATOR", label: "3", x: 2, y: 1 },
      { id: "op4", type: "MODULATOR", label: "4", x: 2, y: 0 },
    ],
    edges: [
      { from: "op4", to: "op3" },
      { from: "op3", to: "op2" },
      { from: "op2", to: "op1" },
      { from: "op4", to: "op4" },
    ],
  },

  // ALGO6: 4*->1,2,3
  {
    id: "alg6",
    name: "Algo DX 6", 
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 2, y: 3 },
      { id: "op3", type: "CARRIER", label: "3", x: 4, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 2, y: 1 },
    ],
    edges: [
      { from: "op4", to: "op1" },
      { from: "op4", to: "op2" },
      { from: "op4", to: "op3" },
      { from: "op4", to: "op4" },
    ],
  },

  // ALGO7: 2->1, 4*->3, 6->5, 4<->6
  {
    id: "alg7",
    name: "Algo DX 7",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 0, y: 2 },
      { id: "op3", type: "CARRIER", label: "3", x: 2, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 2, y: 2 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 4, y: 2 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op4", to: "op3" },
      { from: "op6", to: "op5" },
      { from: "op4", to: "op4" },
      { from: "op6", to: "op4" },
    ],
  },

  // ALGO8: 2,3,4*->1, 6->5
  {
    id: "alg8",
    name: "Algo DX 8",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 0, y: 1 },
      { id: "op3", type: "MODULATOR", label: "3", x: 1, y: 1 },
      { id: "op4", type: "MODULATOR", label: "4", x: 2, y: 1 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 4, y: 1 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op3", to: "op1" },
      { from: "op4", to: "op1" },
      { from: "op4", to: "op4" },
      { from: "op6", to: "op5" },
    ],
  },

  // ALGO9: 2,3->1, 6*->5->4
  {
    id: "alg9",
    name: "Algo DX 9",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 0, y: 2 },
      { id: "op3", type: "MODULATOR", label: "3", x: 2, y: 2 },
      { id: "op4", type: "CARRIER", label: "4", x: 4, y: 3 },
      { id: "op5", type: "MODULATOR", label: "5", x: 4, y: 2 },
      { id: "op6", type: "MODULATOR", label: "6", x: 4, y: 1 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op3", to: "op1" },
      { from: "op5", to: "op4" },
      { from: "op6", to: "op5" },
      { from: "op6", to: "op6" },
    ],
  },

  {
    id: "alg10",
    name: "Algo DX 10",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "CARRIER", label: "3", x: 4, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 4, y: 2 },
      { id: "op5", type: "MODULATOR", label: "5", x: 4, y: 1 },
      { id: "op6", type: "MODULATOR", label: "6", x: 4, y: 0 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op2", to: "op2" },
      { from: "op6", to: "op5" },
      { from: "op5", to: "op4" },
      { from: "op4", to: "op3" },
    ],
  },

  // ALG11: DX7 Algo 3 & 4: 3->2->1, 6*->5->4
  {
    id: "alg11",
    name: "Algo DX 11",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "MODULATOR", label: "3", x: 1, y: 1 },
      { id: "op4", type: "CARRIER", label: "4", x: 4, y: 3 },
      { id: "op5", type: "MODULATOR", label: "5", x: 4, y: 2 },
      { id: "op6", type: "MODULATOR", label: "6", x: 4, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op2" },
      { from: "op2", to: "op1" },
      { from: "op6", to: "op5" },
      { from: "op5", to: "op4" },
      { from: "op6", to: "op6" },
    ],
  },

  // ALG12: DX7 Algo 5 & 6: 2->1, 4->3, 6*->5
  {
    id: "alg12",
    name: "Algo DX 12",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 0, y: 2 },
      { id: "op3", type: "CARRIER", label: "3", x: 2, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 2, y: 2 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 4, y: 2 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op4", to: "op3" },
      { from: "op6", to: "op5" },
      { from: "op6", to: "op6" },
    ],
  },

  // ALG13: DX7 Algo 7, 8, 9: 2->1, 4*,5->3
  {
    id: "alg13",
    name: "Algo DX 13",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "CARRIER", label: "3", x: 4, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 3, y: 1 },
      { id: "op5", type: "MODULATOR", label: "5", x: 5, y: 1 },
      { id: "op6", type: "MODULATOR", label: "6", x: 4, y: 0 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op4", to: "op3" },
      { from: "op5", to: "op3" },
      { from: "op6", to: "op5" },
      { from: "op4", to: "op4" },
    ],
  },

  // ALG14: DX7 Algo 10 & 11: 3->2->1, 5,6*->4
  {
    id: "alg14",
    name: "Algo DX 14",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "MODULATOR", label: "3", x: 1, y: 1 },
      { id: "op4", type: "CARRIER", label: "4", x: 4, y: 3 },
      { id: "op5", type: "MODULATOR", label: "5", x: 3, y: 1 },
      { id: "op6", type: "MODULATOR", label: "6", x: 5, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op2" },
      { from: "op2", to: "op1" },
      { from: "op5", to: "op4" },
      { from: "op6", to: "op4" },
      { from: "op6", to: "op6" },
    ],
  },

  // ALG15: DX7 Algo 12 & 13: 2->1, 4,5,6*->3
  {
    id: "alg15",
    name: "Algo DX 15",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "CARRIER", label: "3", x: 4, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 3, y: 1 },
      { id: "op5", type: "MODULATOR", label: "5", x: 4, y: 1 },
      { id: "op6", type: "MODULATOR", label: "6", x: 5, y: 1 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op4", to: "op3" },
      { from: "op5", to: "op3" },
      { from: "op6", to: "op3" },
      { from: "op6", to: "op6" },
    ],
  },

  // ALG16: DX7 Algo 14 & 15: 2*->1, 5,6->4->3
  {
    id: "alg16",
    name: "Algo DX 16",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "CARRIER", label: "3", x: 4, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 4, y: 2 },
      { id: "op5", type: "MODULATOR", label: "5", x: 3, y: 1 },
      { id: "op6", type: "MODULATOR", label: "6", x: 5, y: 1 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op2", to: "op2" },
      { from: "op5", to: "op4" },
      { from: "op6", to: "op4" },
      { from: "op4", to: "op3" },
    ],
  },

  // ALG17: DX7 Algo 16 & 17: 4->2*,3,5->1, 6->5
  {
    id: "alg17",
    name: "Algo DX 17",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 2, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "MODULATOR", label: "3", x: 2, y: 2 },
      { id: "op4", type: "MODULATOR", label: "4", x: 1, y: 1 },
      { id: "op5", type: "MODULATOR", label: "5", x: 3, y: 2 },
      { id: "op6", type: "MODULATOR", label: "6", x: 3, y: 1 },
    ],
    edges: [
      { from: "op4", to: "op2" },
      { from: "op2", to: "op1" },
      { from: "op2", to: "op2" },
      { from: "op3", to: "op1" },
      { from: "op5", to: "op1" },
      { from: "op6", to: "op5" },
    ],
  },

  // ALG18: DX7 Algo 18: 6->5->4,2,3*->1
  {
    id: "alg18",
    name: "Algo DX 18",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 2, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "MODULATOR", label: "3", x: 2, y: 2 },
      { id: "op4", type: "MODULATOR", label: "4", x: 3, y: 2 },
      { id: "op5", type: "MODULATOR", label: "5", x: 2, y: 1 },
      { id: "op6", type: "MODULATOR", label: "6", x: 2, y: 0 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op3", to: "op1" },
      { from: "op3", to: "op3" },
      { from: "op4", to: "op1" },
      { from: "op6", to: "op5" },
      { from: "op5", to: "op4" },
    ],
  },

  // ALG19: DX7 Algo 19: 3->2->1, 6*->4,5
  {
    id: "alg19",
    name: "Algo DX 19",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 0, y: 2 },
      { id: "op3", type: "MODULATOR", label: "3", x: 0, y: 1 },
      { id: "op4", type: "CARRIER", label: "4", x: 2, y: 3 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 3, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op2" },
      { from: "op2", to: "op1" },
      { from: "op6", to: "op4" },
      { from: "op6", to: "op5" },
      { from: "op6", to: "op6" },
    ],
  },

  // ALG20: DX7 Algo 20, 26, 27: 3*->1,2, 5,6->4
  {
    id: "alg20",
    name: "Algo DX 20",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 2, y: 3 },
      { id: "op3", type: "MODULATOR", label: "3", x: 1, y: 1 },
      { id: "op4", type: "CARRIER", label: "4", x: 4, y: 3 },
      { id: "op5", type: "MODULATOR", label: "5", x: 3, y: 1 },
      { id: "op6", type: "MODULATOR", label: "6", x: 5, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op1" },
      { from: "op3", to: "op2" },
      { from: "op3", to: "op3" },
      { from: "op5", to: "op4" },
      { from: "op6", to: "op4" },
    ],
  },

  // ALG21: DX7 Algo 21 & 23: 3*->1,2, 6->4,5
  {
    id: "alg21",
    name: "Algo DX 21",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 1, y: 3 },
      { id: "op3", type: "MODULATOR", label: "3", x: 0, y: 1 },
      { id: "op4", type: "CARRIER", label: "4", x: 3, y: 3 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 3, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op1" },
      { from: "op3", to: "op2" },
      { from: "op3", to: "op3" },
      { from: "op6", to: "op4" },
      { from: "op6", to: "op5" },
    ],
  },

  // ALG22: DX7 Algo 22: 2->1, 6*->3,4,5
  {
    id: "alg22",
    name: "Algo DX 22",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 0, y: 2 },
      { id: "op3", type: "CARRIER", label: "3", x: 2, y: 3 },
      { id: "op4", type: "CARRIER", label: "4", x: 3, y: 3 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 3, y: 1 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op6", to: "op3" },
      { from: "op6", to: "op4" },
      { from: "op6", to: "op5" },
      { from: "op6", to: "op6" },
    ],
  },

  // ALG23: DX7 Algo 24, 25, 31: 6*->1,2,3,4,5
  {
    id: "alg23",
    name: "Algo DX 23",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 1, y: 3 },
      { id: "op3", type: "CARRIER", label: "3", x: 2, y: 3 },
      { id: "op4", type: "CARRIER", label: "4", x: 3, y: 3 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 2, y: 1 },
    ],
    edges: [
      { from: "op6", to: "op1" },
      { from: "op6", to: "op2" },
      { from: "op6", to: "op3" },
      { from: "op6", to: "op4" },
      { from: "op6", to: "op5" },
      { from: "op6", to: "op6" },
    ],
  },

  // ALG24: DX7 Algo 28: 5*->4->2->1, 6
  {
    id: "alg24",
    name: "Algo DX 24",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 1, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 1, y: 2 },
      { id: "op3", type: "CARRIER", label: "3", x: 3, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 3, y: 2 },
      { id: "op5", type: "MODULATOR", label: "5", x: 3, y: 1 },
      { id: "op6", type: "CARRIER", label: "6", x: 5, y: 3 },
    ],
    edges: [
      { from: "op2", to: "op1" },
      { from: "op4", to: "op3" },
      { from: "op5", to: "op4" },
      { from: "op5", to: "op5" },
    ],
  },

  // ALG25: DX7 Algo 29: 4->1, 6*->5
  {
    id: "alg25",
    name: "Algo DX 25",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 1, y: 3 },
      { id: "op3", type: "CARRIER", label: "3", x: 2, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 0, y: 1 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 4, y: 1 },
    ],
    edges: [
      { from: "op4", to: "op1" },
      { from: "op6", to: "op5" },
      { from: "op6", to: "op6" },
    ],
  },

  // ALG26: DX7 Algo 30: 5*->4->1
  {
    id: "alg26",
    name: "Algo DX 26",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 1, y: 3 },
      { id: "op3", type: "CARRIER", label: "3", x: 2, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 0, y: 2 },
      { id: "op5", type: "MODULATOR", label: "5", x: 0, y: 1 },
      { id: "op6", type: "CARRIER", label: "6", x: 4, y: 3 },
    ],
    edges: [
      { from: "op5", to: "op4" },
      { from: "op4", to: "op1" },
      { from: "op5", to: "op5" },
    ],
  },

  // ALG27: DX7 Algo 32: All Carriers
  {
    id: "alg27",
    name: "Algo DX 27",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 1, y: 3 },
      { id: "op3", type: "CARRIER", label: "3", x: 2, y: 3 },
      { id: "op4", type: "CARRIER", label: "4", x: 3, y: 3 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "CARRIER", label: "6", x: 5, y: 3 },
    ],
    edges: [
      { from: "op6", to: "op6" },
    ],
  },

  // ALG28: DX7 Algo 31: 6*->1,2,3,4,5
  {
    id: "alg28",
    name: "Algo DX 28",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 1, y: 3 },
      { id: "op3", type: "CARRIER", label: "3", x: 2, y: 3 },
      { id: "op4", type: "CARRIER", label: "4", x: 3, y: 3 },
      { id: "op5", type: "CARRIER", label: "5", x: 4, y: 3 },
      { id: "op6", type: "MODULATOR", label: "6", x: 2, y: 1 },
    ],
    edges: [
      { from: "op6", to: "op1" },
      { from: "op6", to: "op2" },
      { from: "op6", to: "op3" },
      { from: "op6", to: "op4" },
      { from: "op6", to: "op5" },
      { from: "op6", to: "op6" },
    ],
  },

  // ========== WINDOWED SYNC AM ALGORITHMS (29-32) ==========

  // ALG29: Windowed sync AM: 1 synced by 3, 2 synced by 4
  {
    id: "alg29",
    name: "Sync AM 1",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 3, y: 3 },
      { id: "op3", type: "MODULATOR", label: "3", x: 0, y: 1 },
      { id: "op4", type: "MODULATOR", label: "4", x: 3, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op1", kind: "sync" },
      { from: "op4", to: "op3" },
      { from: "op4", to: "op2", kind: "modulation" },
      { from: "op4", to: "op4" },
    ],
  },

  // ALG30: Windowed sync AM: 1 synced by 3, 2 synced by 4
  {
    id: "alg30",
    name: "Sync AM 2",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 3, y: 3 },
      { id: "op3", type: "MODULATOR", label: "3", x: 1, y: 1 },
      { id: "op4", type: "MODULATOR", label: "4", x: 3, y: 1 },
    ],
    edges: [
      { from: "op3", to: "op1", kind: "sync" },
      { from: "op3", to: "op2", kind: "sync" },
      { from: "op4", to: "op1", kind: "modulation" },
      { from: "op4", to: "op2", kind: "modulation" },
      { from: "op4", to: "op4" },
    ],
  },

  // ALG31: Windowed sync AM: 1, 2, 3 all synced by 4
  {
    id: "alg31",
    name: "Sync AM 3",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 0, y: 3 },
      { id: "op2", type: "CARRIER", label: "2", x: 2, y: 3 },
      { id: "op3", type: "CARRIER", label: "3", x: 4, y: 3 },
      { id: "op4", type: "MODULATOR", label: "4", x: 2, y: 1 },
    ],
    edges: [
      { from: "op4", to: "op1", kind: "sync" }, // OP1 synced by OP4
      { from: "op4", to: "op2", kind: "sync" }, // OP2 synced by OP4
      { from: "op4", to: "op3", kind: "sync" }, // OP3 synced by OP4
    ],
  },

  // ALG32: Windowed sync AM: 1 synced by 2
  {
    id: "alg32",
    name: "Sync AM 4",
    nodes: [
      { id: "op1", type: "CARRIER", label: "1", x: 2, y: 3 },
      { id: "op2", type: "MODULATOR", label: "2", x: 0, y: 1 },
      { id: "op3", type: "MODULATOR", label: "3", x: 2, y: 1 },
      { id: "op4", type: "MODULATOR", label: "4", x: 4, y: 1 },
    ],
    edges: [
      { from: "op2", to: "op1", kind: "modulation" }, // OP1 synced by OP2
      { from: "op3", to: "op1", kind: "modulation" }, // OP3 modulates OP1
      { from: "op3", to: "op3" }, // OP3 feedback
      { from: "op4", to: "op1", kind: "sync" }, // OP4 modulates OP1
      { from: "op3", to: "op4", kind: "modulation" }, // OP4 modulates OP3
    ],
  },
]);
