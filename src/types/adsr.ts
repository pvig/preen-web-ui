import { CurveType } from './patch';

export interface AdsrPoint {
    level: number; // 0-100
    time: number;  // 0-100
  }
  
  export interface AdsrState {
    attack: AdsrPoint;
    decay: AdsrPoint;
    sustain: AdsrPoint;
    release: AdsrPoint;
    curves?: {
      attack: CurveType;
      decay: CurveType;
      sustain: CurveType;
      release: CurveType;
    };
  }

  export const initialAdsr: AdsrState = {
    attack: { time: 20, level: 100 },
    decay: { time: 40, level: 60 },
    sustain: { time: 70, level: 60 },
    release: { time: 100, level: 0 },
    curves: {
      attack: 'logarithmic',
      decay: 'logarithmic',
      sustain:'linear',
      release: 'logarithmic'
    }
  };