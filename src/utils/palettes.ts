export interface Palette {
  id: string;
  name: string;
  /** Full-poster background */
  bg: string;
  /** GPX track stroke */
  track: string;
  /** Title text */
  title: string;
  /** Bottom profile zone background */
  profileBg: string;
  /** Elevation silhouette fill */
  profileFill: string;
  /** Stats text */
  statsText: string;
  /** true = light bg (Belle Île style), false = dark bg (Écrins style) */
  isLight: boolean;
}

export const PALETTES: Palette[] = [
  {
    id: 'blue-light',
    name: 'Bleu pâle',
    bg: '#EBF0FA',
    track: '#5B9BD5',
    title: '#1A2B6E',
    profileBg: '#3D6CB5',
    profileFill: '#7BAEE0',
    statsText: '#FFFFFF',
    isLight: true,
  },
  {
    id: 'dark-teal',
    name: 'Montagne',
    bg: '#264653',
    track: '#2a9d8f',
    title: '#e9c46a',
    profileBg: '#1a2f39',
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
    profileBg: '#1e2a50',
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
    profileBg: '#1a1d1e',
    profileFill: '#e94f37',
    statsText: '#f6f7eb',
    isLight: false,
  },
  {
    id: 'coral',
    name: 'Corail',
    bg: '#bfdbf7',
    track: '#f87060',
    title: '#102542',
    profileBg: '#3a6fa0',
    profileFill: '#f87060',
    statsText: '#ffffff',
    isLight: true,
  },
];

export const DEFAULT_PALETTE = PALETTES[0];
