import { getAudioContext } from './context.js';
import { CABINET_IR_BASE64 } from './cabinetsData.js';

export type CabinetId = 'direct' | 'ampeg-svt' | 'ampeg-b15' | 'hartke-410' | 'sunn-200s' | 'tc-410';

export interface CabinetDefinition {
  readonly id: CabinetId;
  readonly label: string;
  readonly description: string;
  readonly gainCompensation: number;
}

export const CABINETS: readonly CabinetDefinition[] = [
  { id: 'direct', label: 'Direto (DI Limpo)', description: 'Sinal direto de linha sem simulação de caixa acústica', gainCompensation: 1.0 },
  { id: 'ampeg-svt', label: 'Ampeg SVT-810E', description: 'A clássica "Geladeira" 8x10: graves firmes, médios presentes e pegada de palco', gainCompensation: 1.45 },
  { id: 'ampeg-b15', label: 'Ampeg Heritage B-15', description: 'Portaflex B-15 vintage: som aveludado lendário de Motown e estúdios dos anos 60', gainCompensation: 1.4 },
  { id: 'hartke-410', label: 'Hartke XL410', description: 'Cones de alumínio: ataque rápido, agudos brilhantes e presença no slap', gainCompensation: 1.35 },
  { id: 'sunn-200s', label: 'Sunn 200s', description: 'Gabinete 2x15 valvulado clássico: graves profundos e calor vintage', gainCompensation: 1.5 },
  { id: 'tc-410', label: 'TC Electronic BC410', description: 'Caixa moderna 4x10 com soco definido e resposta uniforme em todas as frequências', gainCompensation: 1.4 },
];

/** Cache de AudioBuffers decodificados indexados por (AudioContext, CabinetId) */
const bufferCache = new WeakMap<BaseAudioContext, Map<CabinetId, AudioBuffer>>();

function decodeBase64ToArrayBuffer(b64: string): ArrayBuffer {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
  }
  // Node / ambiente de teste
  const buf = Buffer.from(b64, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/** Decodifica e retorna o AudioBuffer da resposta de impulso para o contexto. */
export async function getCabinetBuffer(ctx: BaseAudioContext, id: CabinetId): Promise<AudioBuffer | null> {
  if (id === 'direct') return null;
  const b64 = CABINET_IR_BASE64[id];
  if (!b64) return null;

  let ctxMap = bufferCache.get(ctx);
  if (!ctxMap) {
    ctxMap = new Map();
    bufferCache.set(ctx, ctxMap);
  }

  const cached = ctxMap.get(id);
  if (cached) return cached;

  try {
    const arrayBuf = decodeBase64ToArrayBuffer(b64);
    // decodeAudioData consome o ArrayBuffer, então fazemos slice para segurança se necessário
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    ctxMap.set(id, decoded);
    return decoded;
  } catch (err) {
    console.warn(`[audio-synth] Falha ao decodificar IR ${id}:`, err);
    return null;
  }
}

/**
 * Cria ou atualiza um estágio de convolução para simular a resposta de um gabinete.
 * Retorna os nós de entrada e saída e uma função para alterar o gabinete dinamicamente.
 */
export function createCabinetStage(ctx: BaseAudioContext, initialCabinet: CabinetId = 'direct'): {
  readonly input: GainNode;
  readonly output: GainNode;
  setCabinet(id: CabinetId): Promise<void>;
  getCabinet(): CabinetId;
} {
  const input = ctx.createGain();
  const output = ctx.createGain();

  // Ramo direto (dry / bypass)
  const dryGain = ctx.createGain();
  input.connect(dryGain).connect(output);

  // Ramo com Convolver (wet)
  const wetGain = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  convolver.connect(wetGain).connect(output);

  let currentId: CabinetId = 'direct';

  async function applyCabinet(id: CabinetId) {
    currentId = id;
    if (id === 'direct') {
      dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
      wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
      try {
        input.disconnect(convolver);
      } catch {
        /* noop */
      }
      return;
    }

    const buf = await getCabinetBuffer(ctx, id);
    if (!buf) {
      dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
      wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
      return;
    }

    convolver.buffer = buf;
    try {
      input.connect(convolver);
    } catch {
      /* já conectado */
    }

    const def = CABINETS.find((c) => c.id === id);
    const comp = def ? def.gainCompensation : 1.4;

    // Crossfade suave para evitar estalos
    const now = ctx.currentTime;
    dryGain.gain.setValueAtTime(0.0, now);
    wetGain.gain.setValueAtTime(comp, now);
  }

  void applyCabinet(initialCabinet);

  return {
    input,
    output,
    async setCabinet(id: CabinetId) {
      await applyCabinet(id);
    },
    getCabinet() {
      return currentId;
    },
  };
}

let activeCabinet: CabinetId = 'direct';

export function getGlobalCabinet(): CabinetId {
  return activeCabinet;
}

export function setGlobalCabinet(id: CabinetId): void {
  activeCabinet = id;
}
