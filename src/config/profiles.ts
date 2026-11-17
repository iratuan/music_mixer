/**
 * Profile Configuration — Mixer vs Academy
 *
 * Determina quais features estão habilitadas no build.
 * Lido em tempo de build (Vite, esbuild) e em tempo de execução.
 *
 * Uso:
 *   PROFILE=mixer npm run build:mixer
 *   PROFILE=academy npm run build:academy:desktop
 */

export type Profile = 'mixer' | 'academy';

/**
 * Profile atual, lido de process.env.PROFILE ou padrão.
 * Em tempo de build, Vite substitui todas as referências (tree-shaking).
 */
export const PROFILE: Profile = (process.env.PROFILE || 'mixer') as Profile;

/** Features habilitadas por profile */
export const FEATURES = {
  // Mixer-specific: separação de stems, processamento pesado
  STEM_SEPARATION: PROFILE === 'mixer',
  FILE_IMPORT: PROFILE === 'mixer',
  YOUTUBE_IMPORT: PROFILE === 'mixer',
  GRAB_MP3: PROFILE === 'mixer',
  EXPORT_MAP_PDF: PROFILE === 'mixer',
  EXPORT_WAV: PROFILE === 'mixer',
  EXPORT_MIDI: PROFILE === 'mixer',
  STEM_TRANSPOSE: PROFILE === 'mixer',
  STEM_ANALYZE: PROFILE === 'mixer',
  LIBRARY_MANAGER: PROFILE === 'mixer',

  // Academy-specific: educacional, gamificação
  EXERCISES: PROFILE === 'academy',
  EAR_TRAINING: PROFILE === 'academy',
  THEORY_TOPICS: PROFILE === 'academy',
  GAMIFICATION: PROFILE === 'academy',
  ACHIEVEMENTS: PROFILE === 'academy',
  CURRICULUM: PROFILE === 'academy',
  MULTI_USER: PROFILE === 'academy',

  // Shared: ambos usam
  DATABASE: true,
  WEB_AUDIO: true,
  LOCAL_STORAGE: true,
  PREFERENCES: true,
} as const;

/** Descrição legível do profile */
export const PROFILE_NAME: Record<Profile, string> = {
  mixer: 'mixerCraft — Importar, Separar e Mixar',
  academy: 'Baixaria Academy — Exercícios e Aprendizado',
};

/** Verificação de feature em tempo de execução (com aviso em dev) */
export function requireFeature(feature: keyof typeof FEATURES, context?: string): boolean {
  const enabled = FEATURES[feature];
  if (!enabled && process.env.NODE_ENV === 'development') {
    console.warn(
      `Feature ${feature} is not available in ${PROFILE} profile${context ? ` (${context})` : ''}`
    );
  }
  return enabled;
}

/**
 * Verificação de profile em tempo de build (Vite pode usar isso para condicionar imports).
 * Exemplo em App.tsx:
 *   if (PROFILE === 'mixer') {
 *     // import Mixer screens
 *   } else {
 *     // import Academy screens
 *   }
 *
 * Vite tree-shakes o branch não utilizado.
 */
export function isProfile(p: Profile): boolean {
  return PROFILE === p;
}

export const isAcademy = () => PROFILE === 'academy';
export const isMixer = () => PROFILE === 'mixer';