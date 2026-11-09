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
