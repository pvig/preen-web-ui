/**
 * Thèmes clair et sombre pour l'application
 */

export interface Theme {
  name: 'light' | 'dark';
  colors: {
    // Arrière-plans
    background: string;
    backgroundSecondary: string;
    panel: string;
    panelHover: string;
    
    // Textes
    text: string;
    textSecondary: string;
    textMuted: string;
    textNotice: string;    // boutons d'aide / info discrets
    
    // Bordures
    border: string;
    borderHover: string;
    
    // Accents / Primaires
    primary: string;
    primaryHover: string;
    accent: string;
    
    // Boutons
    button: string;
    buttonHover: string;
    buttonActive: string;
    
    // Navigation
    nav: string;
    navActive: string;
    
    // Knobs et contrôles
    knobBackground: string;
    knobStroke: string;
    knobLabel: string;
    knobTick: string;
    
    // Couleurs spécifiques de knobs
    knobVolume: string;       // Vert pour volume/amplitude
    knobFrequency: string;    // Bleu pour fréquence/pitch
    knobPhase: string;        // Vert clair pour phase
    knobBias: string;         // Orange pour bias/offset
    knobFilter: string;       // Rouge pour filtres
    knobLfo: string;          // Violet pour LFO
    knobModulation: string;   // Bleu clair pour IM/modulation
    knobVelocity: string;     // Violet foncé pour vélocité
    knobArp: string;          // Rouge pour arpeggiator
    knobSeq: string;          // Violet pour séquenceur
    
    // Highlights
    highlight: string;
    highlightGlow: string;
    
    // ADSR colors
    adsrAttack: string;
    adsrDecay: string;
    adsrSustain: string;
    adsrRelease: string;

    // Spectrogram LUT — 6 color stops (silence → peak)
    spectro1: string;   // silence / near-black
    spectro2: string;   // very low — deep space
    spectro3: string;   // low — nebula blue
    spectro4: string;   // mid — primary
    spectro5: string;   // high — accent / violet
    spectro6: string;   // peak — bright white-hot
  };
}

export const darkTheme: Theme = {
  name: 'dark',
  colors: {
    background: '#1a202c',
    backgroundSecondary: '#1a1a1a',
    panel: '#2d3748',
    panelHover: '#374151',
    
    text: '#e2e8f0',
    textSecondary: '#cbd5e0',
    textMuted: '#a0aec0',
    textNotice: '#f29e17',  // même bleu que primary — discret mais identifiable
    
    border: '#4a5568',
    borderHover: '#63b3ed',
    
    primary: '#63b3ed',
    primaryHover: '#4299e1',
    accent: '#9F7AEA',
    
    button: '#4a5568',
    buttonHover: '#718096',
    buttonActive: '#63b3ed',
    
    nav: '#2d3748',
    navActive: '#4a5568',
    
    knobBackground: '#2d3748',
    knobStroke: '#4a5568',
    knobLabel: '#a0aec0',
    knobTick: '#718096',
    
    knobVolume: '#68D391',
    knobFrequency: '#63B3ED',
    knobPhase: '#48BB78',
    knobBias: '#F6AD55',
    knobFilter: '#F56565',
    knobLfo: '#9F7AEA',
    knobModulation: '#0ea5e9',
    knobVelocity: '#7c3aed',
    knobArp: '#E53E3E',
    knobSeq: '#9CA3AF',
    
    highlight: '#fbbf24',
    highlightGlow: 'rgba(251, 191, 36, 0.5)',
    
    adsrAttack: '#FF6B6B',
    adsrDecay: '#48BB78',
    adsrSustain: '#4299E1',
    adsrRelease: '#F6AD55',

    // Spectrogram LUT — 6 color stops (silence → peak)
    spectro1: '#000004',   // silence — near-black
    spectro2: '#0d1b4b',   // deep space blue
    spectro3: '#284d96',   // nebula blue
    spectro4: '#8c94c0',   // mid — muted primary
    spectro5: '#9F7AEA',   // violet — accent
    spectro6: '#f0d0ff',   // peak — bright lavender-white
  },
};

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: '#f7fafc',
    backgroundSecondary: '#ffffff',
    panel: '#ffffff',
    panelHover: '#f7fafc',
    
    text: '#1a202c',
    textSecondary: '#2d3748',
    textMuted: '#718096',
    textNotice: '#c27c0b',  // même bleu que primary en mode clair
    
    border: '#e2e8f0',
    borderHover: '#3182ce',
    
    primary: '#3182ce',
    primaryHover: '#2c5282',
    accent: '#805ad5',
    
    button: '#e2e8f0',
    buttonHover: '#cbd5e0',
    buttonActive: '#3182ce',
    
    nav: '#e2e8f0',
    navActive: '#ffffff',
    
    knobBackground: '#ffffff',
    knobStroke: '#e2e8f0',
    knobLabel: '#718096',
    knobTick: '#a0aec0',
    
    knobVolume: '#38a169',
    knobFrequency: '#3182ce',
    knobPhase: '#2f855a',
    knobBias: '#dd6b20',
    knobFilter: '#e53e3e',
    knobLfo: '#805ad5',
    knobModulation: '#0ea5e9',
    knobVelocity: '#6b46c1',
    knobArp: '#c53030',
    knobSeq: '#718096',
    
    highlight: '#d69e2e',
    highlightGlow: 'rgba(214, 158, 46, 0.5)',
    
    adsrAttack: '#e53e3e',
    adsrDecay: '#38a169',
    adsrSustain: '#3182ce',
    adsrRelease: '#dd6b20',

    // Spectrogram LUT — 6 color stops (silence → peak)
    spectro1: '#000004',   // silence — near-black
    spectro2: '#0a132e',   // deep space blue
    spectro3: '#0f1f3d',   // nebula blue
    spectro4: '#3182ce',   // mid — primary
    spectro5: '#805ad5',   // violet — accent
    spectro6: '#e9d5ff',   // peak — bright lavender-white
  },
};
