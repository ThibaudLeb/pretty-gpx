export interface Palette {
  id: string;
  name: string;
  bg: string;
  track: string;
  title: string;
  profileFill: string;
  statsText: string;
  isLight: boolean;
}

export interface FontDef {
  id: string;
  name: string;
  /** CSS font-family string used in canvas ctx.font */
  family: string;
  /** Prefix added before size + family (e.g. "italic bold") */
  style: string;
}

// ── 8 palettes (pretty-gpx inspired) ──────────────────────────────────────

export const PALETTES: Palette[] = [
  {
    id: 'blue-light',
    name: 'Bleu pâle',
    bg: '#EBF0FA',
    track: '#5B9BD5',
    title: '#1A2B6E',
    profileFill: '#4A8FC7',
    statsText: '#FFFFFF',
    isLight: true,
  },
  {
    id: 'dark-teal',
    name: 'Montagne',
    bg: '#264653',
    track: '#2a9d8f',
    title: '#e9c46a',
    profileFill: '#2a9d8f',
    statsText: '#e9c46a',
    isLight: false,
  },
  {
    id: 'dark-navy',
    name: 'Nuit étoilée',
    bg: '#34447d',
    track: '#8390fa',
    title: '#fac748',
    profileFill: '#8390fa',
    statsText: '#fac748',
    isLight: false,
  },
  {
    id: 'dark-red',
    name: 'Volcan',
    bg: '#393e41',
    track: '#e94f37',
    title: '#f6f7eb',
    profileFill: '#e94f37',
    statsText: '#f6f7eb',
    isLight: false,
  },
  {
    id: 'coral',
    name: 'Corail',
    bg: '#bfdbf7',
    track: '#e85040',
    title: '#102542',
    profileFill: '#e85040',
    statsText: '#ffffff',
    isLight: true,
  },
  {
    id: 'forest',
    name: 'Forêt',
    bg: '#1b4332',
    track: '#40916c',
    title: '#d8f3dc',
    profileFill: '#40916c',
    statsText: '#d8f3dc',
    isLight: false,
  },
  {
    id: 'desert',
    name: 'Désert',
    bg: '#d4a373',
    track: '#8b3a3a',
    title: '#2d1215',
    profileFill: '#8b3a3a',
    statsText: '#ffffff',
    isLight: true,
  },
  {
    id: 'aurora',
    name: 'Aurore',
    bg: '#2d1b69',
    track: '#c084fc',
    title: '#ede9fe',
    profileFill: '#c084fc',
    statsText: '#ede9fe',
    isLight: false,
  },
];

export const DEFAULT_PALETTE = PALETTES[0];

// ── 3 font options ────────────────────────────────────────────────────────

export const FONTS: FontDef[] = [
  {
    id: 'lobster',
    name: 'Lobster',
    family: "'Lobster', cursive",
    style: 'italic bold',
  },
  {
    id: 'playfair',
    name: 'Playfair',
    family: "'Playfair Display', Georgia, serif",
    style: 'italic bold',
  },
  {
    id: 'oswald',
    name: 'Oswald',
    family: "'Oswald', Arial, sans-serif",
    style: 'bold',
  },
];

export const DEFAULT_FONT = FONTS[0];
