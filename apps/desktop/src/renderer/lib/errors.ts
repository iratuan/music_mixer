/**
 * Mensagem de erro para mostrar na tela: tira o prefixo técnico do Electron
 * ("Error invoking remote method 'x': Error: motivo" → "motivo").
 */
export function errorText(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  const clean = m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '').trim();
  return clean || fallback;
}
