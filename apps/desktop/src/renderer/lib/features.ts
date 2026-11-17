/**
 * Feature flags expostos no renderer baseado em PROFILE.
 *
 * Em build-time, Vite substitui process.env.PROFILE com o valor via define.
 * Este arquivo é tree-shaken: código dentro de `if (!FEATURES.FILE_IMPORT)` é removido para Academy.
 */

const PROFILE = (process.env.PROFILE || 'mixer') as 'mixer' | 'academy';

export const FEATURES = {
  // Mixer-only
  STEM_SEPARATION: PROFILE === 'mixer',
  FILE_IMPORT: PROFILE === 'mixer',
  YOUTUBE_IMPORT: PROFILE === 'mixer',
  GRAB_MP3: PROFILE === 'mixer',

  // Academy-only
  EXERCISES: PROFILE === 'academy',
  EAR_TRAINING: PROFILE === 'academy',
  GAMIFICATION: PROFILE === 'academy',

  // Shared
  PROFILES: true,
  ACHIEVEMENTS: true,
} as const;

export function requireFeature(feature: keyof typeof FEATURES): void {
  if (!FEATURES[feature]) {
    throw new Error(`Feature ${feature} is not available in ${PROFILE} profile`);
  }
}

export function isProfile(p: 'mixer' | 'academy'): boolean {
  return PROFILE === p;
}

export const isMixer = () => PROFILE === 'mixer';
export const isAcademy = () => PROFILE === 'academy';
