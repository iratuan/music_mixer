/**
 * Escolha de faixas na separação. Módulo puro (testável sem Electron).
 */

/** As 6 faixas do Demucs htdemucs_6s. */
export const DEMUCS_STEMS = ['bass', 'drums', 'guitar', 'piano', 'vocals', 'other'];
/** Faixas que o usuário pode pedir: as 6 do Demucs e a voz dividida (principal e backing). */
export const CHOOSABLE_STEMS = [...DEMUCS_STEMS, 'lead', 'backing'];

/** Valida a escolha de faixas; sem escolha, as 6 do Demucs. Voz inteira e voz dividida são exclusivas. */
export function parseStemChoice(input: unknown): string[] {
  if (input === undefined || input === null) return [...DEMUCS_STEMS];
  if (!Array.isArray(input) || input.length === 0) throw new Error('escolha ao menos uma faixa');
  const out = [...new Set(input.map(String))];
  for (const s of out) if (!CHOOSABLE_STEMS.includes(s)) throw new Error(`faixa desconhecida: ${s}`);
  if (out.includes('vocals') && (out.includes('lead') || out.includes('backing'))) {
    throw new Error('escolha voz inteira ou voz dividida, não as duas');
  }
  return out;
}
