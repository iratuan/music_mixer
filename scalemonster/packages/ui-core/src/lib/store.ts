/**
 * Preferências da interface guardadas no computador (localStorage). Conveniência local: se falhar,
 * o app segue com o padrão. Um lugar só, para todas as telas lerem e gravarem do mesmo jeito.
 */
export function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) return { ...fallback, ...(parsed as object) } as T;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writeStore(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sem persistência */
  }
}
