/**
 * Relógio musical compartilhado: um AudioContext único (monotônico), nunca Date.now() nem
 * requestAnimationFrame. Extraído de apps/desktop/src/renderer/lib/audio.ts (hoje apps/mixer) na Etapa E3.
 */

let context: AudioContext | null = null;

/** Criado dentro de um gesto do usuário (clique), para não ficar suspenso. */
export function getAudioContext(): AudioContext {
  if (!context) {
    // Testes automatizados (?audio=none): relógio sem dispositivo de saída, determinístico.
    const silent = new URLSearchParams(window.location.search).get('audio') === 'none';
    const options = silent ? ({ latencyHint: 'interactive', sinkId: { type: 'none' } } as AudioContextOptions) : { latencyHint: 'interactive' as const };
    context = new AudioContext(options);
  }
  return context;
}

export async function decodeAudio(bytes: Uint8Array): Promise<AudioBuffer> {
  const copy = bytes.slice().buffer; // decodeAudioData desanexa o buffer
  return getAudioContext().decodeAudioData(copy);
}
