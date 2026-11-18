import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { downloadVoiceModel, explainDownloadError, VOICE_MODEL, type ModelSpec } from '../src/main/voicemodel.js';

const data = new Uint8Array(200_000).map((_, i) => (i * 31) % 251);
const sha = createHash('sha256').update(data).digest('hex');
const spec = (urls = ['https://a/m.ckpt']): ModelSpec => ({ file: 'm.ckpt', bytes: data.length, sha256: sha, urls });

/** Servidor falso: entrega `body` (aceita Range) e pode cortar a conexão depois de `cutAt` bytes. */
function server(opts: { body?: Uint8Array; cutAt?: number; status?: number; ignoreRange?: boolean } = {}) {
  const calls: Array<{ url: string; range: string | null }> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const range = (init?.headers as Record<string, string> | undefined)?.Range ?? null;
    calls.push({ url, range });
    if (opts.status) return new Response(null, { status: opts.status });
    const body = opts.body ?? data;
    const from = range && !opts.ignoreRange ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
    const slice = body.slice(from, opts.cutAt !== undefined ? Math.min(body.length, opts.cutAt) : body.length);
    let pos = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (pos < slice.length) {
          c.enqueue(slice.slice(pos, pos + 16_384));
          pos += 16_384;
        } else if (opts.cutAt !== undefined && opts.cutAt < body.length) c.error(new Error('conexão caiu'));
        else c.close();
      },
    });
    return new Response(stream, { status: from ? 206 : 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('download do modelo de voz', () => {
  it('especificação do modelo real', () => {
    expect(VOICE_MODEL.bytes).toBe(913_096_801);
    expect(VOICE_MODEL.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(VOICE_MODEL.urls.every((u) => u.startsWith('https://github.com/'))).toBe(true);
  });

  it('baixa, confere o SHA-256 e grava o arquivo final', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bf-voice-'));
    const seen: number[] = [];
    const out = await downloadVoiceModel(dir, (p) => seen.push(p.received), new AbortController().signal, server().fetchImpl, spec());
    expect(readFileSync(out)).toEqual(Buffer.from(data));
    expect(existsSync(`${out}.part`)).toBe(false);
    expect(seen[seen.length - 1]).toBe(data.length);
  });

  it('conexão caiu: o próximo endereço retoma de onde parou (Range)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bf-voice-'));
    const first = server({ cutAt: 70_000 });
    await expect(downloadVoiceModel(dir, () => undefined, new AbortController().signal, first.fetchImpl, spec())).rejects.toThrow();
    const second = server();
    const out = await downloadVoiceModel(dir, () => undefined, new AbortController().signal, second.fetchImpl, spec());
    expect(second.calls[0]!.range).toMatch(/^bytes=\d+-$/);
    expect(readFileSync(out)).toEqual(Buffer.from(data));
  });

  it('servidor ignora a retomada: recomeça do zero sem corromper', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bf-voice-'));
    writeFileSync(path.join(dir, 'm.ckpt.part'), data.slice(0, 50_000));
    const out = await downloadVoiceModel(dir, () => undefined, new AbortController().signal, server({ ignoreRange: true }).fetchImpl, spec());
    expect(readFileSync(out)).toEqual(Buffer.from(data));
  });

  it('arquivo diferente do esperado: apaga e avisa', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bf-voice-'));
    const bad = data.slice().fill(7);
    await expect(downloadVoiceModel(dir, () => undefined, new AbortController().signal, server({ body: bad }).fetchImpl, spec())).rejects.toThrow(/não confere/);
    expect(existsSync(path.join(dir, 'm.ckpt'))).toBe(false);
    expect(existsSync(path.join(dir, 'm.ckpt.part'))).toBe(false);
  });

  it('primeiro endereço fora do ar: usa o espelho', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bf-voice-'));
    const down = server({ status: 404 });
    const ok = server();
    const fetchImpl = ((url: string, init?: RequestInit) => (url.includes('espelho') ? ok.fetchImpl(url, init) : down.fetchImpl(url, init))) as typeof fetch;
    const out = await downloadVoiceModel(dir, () => undefined, new AbortController().signal, fetchImpl, spec(['https://a/m.ckpt', 'https://espelho/m.ckpt']));
    expect(readFileSync(out)).toEqual(Buffer.from(data));
  });

  it('conexão que trava sem cair: desiste e avisa (o parcial fica para retomar)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bf-voice-'));
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      let sent = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(c) {
          if (!sent) {
            sent = true;
            c.enqueue(data.slice(0, 1000));
            return;
          }
          // nunca mais manda nada; só o abort encerra
          return new Promise<void>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('abortado'))));
        },
      });
      return new Response(stream);
    }) as unknown as typeof fetch;
    await expect(downloadVoiceModel(dir, () => undefined, new AbortController().signal, fetchImpl, spec(), 200)).rejects.toThrow(/parou de responder/);
    expect(existsSync(path.join(dir, 'm.ckpt.part'))).toBe(true);
  });

  it('erros de rede em português', () => {
    const offline = new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' }) });
    expect(explainDownloadError(offline)).toMatch(/sem conexão com a internet/);
    expect(explainDownloadError(new Error('servidor respondeu 503'))).toMatch(/não está disponível/);
  });

  it('cancelar interrompe com mensagem clara', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bf-voice-'));
    const ctrl = new AbortController();
    ctrl.abort();
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('abortado', 'AbortError');
      return new Response(data);
    }) as unknown as typeof fetch;
    await expect(downloadVoiceModel(dir, () => undefined, ctrl.signal, fetchImpl, spec())).rejects.toThrow('download cancelado');
  });
});
