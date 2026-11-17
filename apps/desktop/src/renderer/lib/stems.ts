import type { IconName } from '../components/Icons.js';

/** Nome, ícone e ordem de exibição de cada faixa. A cor vem do token --stem-<chave>. */
export interface StemInfo {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
}

export const STEMS: readonly StemInfo[] = [
  { key: 'vocals', label: 'Voz', icon: 'vocals' },
  { key: 'lead', label: 'Voz principal', icon: 'vocals' },
  { key: 'backing', label: 'Backing vocals', icon: 'backing' },
  { key: 'guitar', label: 'Guitarra', icon: 'guitar' },
  { key: 'piano', label: 'Piano', icon: 'piano' },
  { key: 'bass', label: 'Baixo', icon: 'bass' },
  { key: 'drums', label: 'Bateria', icon: 'drums' },
  { key: 'other', label: 'Outros', icon: 'other' },
  { key: 'rest', label: 'Restante', icon: 'original' },
];

export function stemInfo(key: string): StemInfo {
  return STEMS.find((s) => s.key === key) ?? { key, label: key, icon: 'original' };
}

export function sortStems(keys: readonly string[]): string[] {
  const rank = (k: string) => {
    const i = STEMS.findIndex((s) => s.key === k);
    return i < 0 ? STEMS.length : i;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b));
}

/** Faixas com notas de altura definida (a bateria e o restante não viram MIDI). */
export const MIDI_STEMS = new Set(['bass', 'guitar', 'piano', 'vocals', 'other', 'lead', 'backing']);

/**
 * Montagens prontas do acompanhamento a partir das faixas separadas: quais faixas tocam.
 * Só aparecem as que fazem sentido com as faixas da música (ex.: "sem o baixo" exige baixo).
 */
export interface MixPreset {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  /** Faixa toca nesta montagem? */
  on(key: string): boolean;
  /** A montagem faz sentido com estas faixas? */
  fits(keys: readonly string[]): boolean;
}

const VOICE = new Set(['vocals', 'lead', 'backing']);
const RHYTHM = new Set(['bass', 'drums']);
const HARMONY = new Set(['guitar', 'piano', 'other', 'rest']);

export const MIX_PRESETS: readonly MixPreset[] = [
  { id: 'all', label: 'Música completa', hint: 'Todas as faixas tocando', on: () => true, fits: () => true },
  { id: 'no-bass', label: 'Sem o baixo', hint: 'Para tocar a linha de baixo junto com a banda', on: (k) => k !== 'bass', fits: (ks) => ks.includes('bass') && ks.length > 1 },
  { id: 'no-voice', label: 'Sem a voz', hint: 'Instrumental, como um karaokê', on: (k) => !VOICE.has(k), fits: (ks) => ks.some((k) => VOICE.has(k)) && ks.some((k) => !VOICE.has(k)) },
  { id: 'no-lead', label: 'Sem a voz principal', hint: 'Mantém os backing vocals', on: (k) => k !== 'lead', fits: (ks) => ks.includes('lead') && ks.length > 1 },
  { id: 'rhythm', label: 'Só a cozinha', hint: 'Baixo e bateria', on: (k) => RHYTHM.has(k), fits: (ks) => ks.includes('bass') && ks.includes('drums') },
  { id: 'drums', label: 'Só a bateria', hint: 'Bateria sozinha, para criar a linha de baixo', on: (k) => k === 'drums', fits: (ks) => ks.includes('drums') && ks.length > 1 },
  {
    id: 'harmony',
    label: 'Só a harmonia',
    hint: 'Guitarra, piano e outros: ouvir os acordes sem voz, baixo e bateria',
    on: (k) => HARMONY.has(k),
    fits: (ks) => ks.some((k) => HARMONY.has(k)) && ks.some((k) => !HARMONY.has(k)),
  },
  { id: 'bass', label: 'Só o baixo', hint: 'Ouvir a linha de baixo isolada', on: (k) => k === 'bass', fits: (ks) => ks.includes('bass') && ks.length > 1 },
];

/** Montagens que servem para estas faixas. */
export function presetsFor(keys: readonly string[]): MixPreset[] {
  return MIX_PRESETS.filter((p) => p.fits(keys));
}

/** Montagem que corresponde ao estado atual (faixas ligadas, sem solo), ou null se for personalizada. */
export function matchPreset(keys: readonly string[], isOn: (key: string) => boolean): MixPreset | null {
  return presetsFor(keys).find((p) => keys.every((k) => p.on(k) === isOn(k))) ?? null;
}
