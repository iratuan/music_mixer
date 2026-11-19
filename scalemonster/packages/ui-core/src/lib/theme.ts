/**
 * Temas: Escuro (padrão), Claro, Madeira e Papel. A preferência fica em localStorage
 * (conveniência local, não estado crítico). Sem preferência salva, segue o sistema (claro/escuro).
 */
export type ThemeName = 'dark' | 'light' | 'wood' | 'paper';
export const THEMES: ReadonlyArray<{ id: ThemeName; label: string }> = [
  { id: 'dark', label: 'Escuro' },
  { id: 'light', label: 'Claro' },
  { id: 'wood', label: 'Madeira' },
  { id: 'paper', label: 'Papel' },
];
const KEY = 'bf-theme';

function systemTheme(): ThemeName {
  try {
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function readTheme(): ThemeName {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (THEMES.some((t) => t.id === saved)) return saved as ThemeName;
  } catch {
    /* armazenamento indisponível */
  }
  return systemTheme();
}

export function applyTheme(theme: ThemeName): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* sem persistência: o tema vale só nesta sessão */
  }
}
