/**
 * Modelo de divisão da voz (voz principal × backing vocals): Mel-Band RoFormer de karaokê
 * (aufr33/viperx), 913 MB. Não vai no instalador; é baixado uma vez, quando o usuário pede.
 *
 * - Endereços fixos (sem entrada do usuário): espelho do audio-separator e o repositório do UVR.
 * - Gravado em <destino>/<arquivo>.part, com retomada (Range) se a conexão cair, e SHA-256
 *   conferido antes de virar o arquivo final. Hash errado: o parcial é apagado.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const VOICE_MODEL = {
  file: 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt',
  config: 'mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956_config.yaml',
  bytes: 913_096_801,
  sha256: '1de20d459332fe8869aeb01327a31df0032262706e1365114e852dc271779813',
  urls: [
    'https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt',
    'https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt',
  ],
} as const;

export interface DownloadProgress {
  received: number;
  total: number;
  /** bytes/s na última janela */
  speed: number;
}

async function sha256Of(file: string): Promise<string> {
  const h = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => resolve())
      .on('error', reject);
  });
  return h.digest('hex');
}

/**
 * Baixa o modelo para `dir`. Retoma um .part existente. Lança erro claro em falha de rede,
 * cancelamento (signal) ou hash diferente.
 */
export interface ModelSpec {
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly urls: readonly string[];
}

export async function downloadVoiceModel(
  dir: string,
  onProgress: (p: DownloadProgress) => void,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  spec: ModelSpec = VOICE_MODEL,
  stallMs = STALL_MS,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const final = path.join(dir, spec.file);
  if (existsSync(final)) return final;
  const part = `${final}.part`;
  let lastErr: unknown = null;
  for (const url of spec.urls) {
    try {
      let have = existsSync(part) ? (await stat(part)).size : 0;
      if (have > spec.bytes) {
        await rm(part, { force: true });
        have = 0;
      }
      if (have < spec.bytes) {
        // Conexão que para de mandar dados sem cair: aborta depois de `stallMs` sem nada chegar.
        const stall = new AbortController();
        const onOuter = () => stall.abort();
        if (signal.aborted) stall.abort();
        signal.addEventListener('abort', onOuter);
        let timer = setTimeout(() => stall.abort(), stallMs);
        const kick = () => {
          clearTimeout(timer);
          timer = setTimeout(() => stall.abort(), stallMs);
        };
        try {
          const res = await fetchImpl(url, {
            redirect: 'follow',
            signal: stall.signal,
            headers: have ? { Range: `bytes=${have}-` } : {},
          });
          if (res.status === 200 && have) {
            // O servidor ignorou a retomada: recomeça do zero.
            have = 0;
            await rm(part, { force: true });
          } else if (!(res.status === 200 || res.status === 206)) {
            throw new Error(`servidor respondeu ${res.status}`);
          }
          if (!res.body) throw new Error('resposta sem conteúdo');
          const out = createWriteStream(part, { flags: have ? 'a' : 'w' });
          let received = have;
          let winStart = Date.now();
          let winBytes = 0;
          let speed = 0;
          try {
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              kick();
              if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
              received += value.byteLength;
              winBytes += value.byteLength;
              const now = Date.now();
              if (now - winStart >= 500) {
                speed = (winBytes * 1000) / (now - winStart);
                winStart = now;
                winBytes = 0;
                onProgress({ received, total: spec.bytes, speed });
              }
            }
          } finally {
            await new Promise<void>((r) => out.end(() => r()));
          }
          onProgress({ received, total: spec.bytes, speed });
        } catch (e) {
          if (stall.signal.aborted && !signal.aborted) throw new Error('a conexão parou de responder');
          throw e;
        } finally {
          clearTimeout(timer);
          signal.removeEventListener('abort', onOuter);
        }
      }
      if ((await stat(part)).size !== spec.bytes) throw new Error('download incompleto');
      const hash = await sha256Of(part);
      if (hash !== spec.sha256) {
        await rm(part, { force: true });
        throw new Error('arquivo baixado não confere (SHA-256); tente de novo');
      }
      await rename(part, final);
      return final;
    } catch (e) {
      if (signal.aborted) throw new Error('download cancelado');
      lastErr = e;
    }
  }
  throw new Error(explainDownloadError(lastErr));
}

/** Sem dados por este tempo, a conexão é dada como travada (o parcial fica para retomar). */
const STALL_MS = 60_000;

/** Mensagem em português para falhas de rede (o fetch do Node diz só "fetch failed"). */
export function explainDownloadError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  const cause = e instanceof Error && e.cause instanceof Error ? `${e.cause.message} ${(e.cause as { code?: string }).code ?? ''}` : '';
  if (/ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|network/i.test(`${msg} ${cause}`))
    return 'sem conexão com a internet (ou o servidor não respondeu). Tente de novo: o download continua de onde parou';
  if (/parou de responder/.test(msg)) return 'a conexão parou de responder. Tente de novo: o download continua de onde parou';
  if (/servidor respondeu (\d+)/.test(msg)) return `o servidor do modelo não está disponível (${msg}). Tente mais tarde`;
  return msg || 'falha ao baixar o modelo';
}
