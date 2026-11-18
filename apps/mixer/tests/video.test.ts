import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { explainYtdlpError, parseProgressLine, parseVideoInfo, sanitizeStartMix, validateVideoUrl } from '../src/main/video.js';
import { Library } from '../src/main/library.js';
import { ALLOWED_CHANNELS } from '../src/main/security.js';

describe('validação do link do vídeo', () => {
  it.each([
    'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    'https://youtu.be/aqz-KE-bpKQ',
    'https://vimeo.com/1084537',
    'https://soundcloud.com/artista/musica',
    '  https://www.youtube.com/watch?v=abc  ',
  ])('aceita %s', (url) => {
    const r = validateVideoUrl(url);
    expect(r.ok).toBe(true);
  });

  it.each([
    ['file:///C:/Windows/win.ini', /https/],
    ['http://www.youtube.com/watch?v=abc', /https/],
    ['javascript:alert(1)', /https/],
    ['ftp://example.com/a', /https/],
    ['https://127.0.0.1/x', /IP/],
    ['https://192.168.0.10/video', /IP/],
    ['https://10.0.0.1/', /IP/],
    ['https://[::1]/', /IP/],
    ['https://2130706433/', /IP/],
    ['https://0x7f000001/', /IP/],
    ['https://localhost/a', /público/],
    ['https://nas.local/a', /público/],
    ['https://intranet/a', /público/],
    ['https://user:senha@site.com/v', /usuário/],
    ['https://site.com/a b', /espaços/],
    ['--exec calc.exe', /espaços/],
    ['--exec=calc', /link/],
    ['https://site.com/' + 'a'.repeat(2100), /longo/],
    ['', /cole/],
  ])('recusa %s', (url, reason) => {
    const r = validateVideoUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(reason);
  });

  it('recusa o que não é texto', () => {
    expect(validateVideoUrl(42).ok).toBe(false);
    expect(validateVideoUrl({ url: 'https://a.com' }).ok).toBe(false);
  });

  it('o link normalizado nunca começa com "-"', () => {
    const r = validateVideoUrl('https://site.com/-x');
    expect(r.ok && r.url.startsWith('https://')).toBe(true);
  });
});

describe('metadados do yt-dlp', () => {
  const base = {
    title: 'Big Buck Bunny',
    channel: 'Blender',
    duration: 635,
    live_status: 'not_live',
    webpage_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    webpage_url_domain: 'youtube.com',
    thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg',
  };

  it('lê título, canal, duração, site e miniatura', () => {
    const r = parseVideoInfo(JSON.stringify(base));
    expect(r).toEqual({ ok: true, info: { url: base.webpage_url, title: 'Big Buck Bunny', channel: 'Blender', duration: 635, site: 'youtube.com', thumbnail: base.thumbnail } });
  });

  it('recusa ao vivo, playlist e vídeo acima do limite', () => {
    expect(parseVideoInfo(JSON.stringify({ ...base, live_status: 'is_live' })).ok).toBe(false);
    expect(parseVideoInfo(JSON.stringify({ ...base, is_live: true })).ok).toBe(false);
    expect(parseVideoInfo(JSON.stringify({ _type: 'playlist', entries: [] })).ok).toBe(false);
    const long = parseVideoInfo(JSON.stringify({ ...base, duration: 21 * 60 }));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.reason).toMatch(/limite é de? 20 min|limite é 20 min/);
    expect(parseVideoInfo(JSON.stringify({ ...base, duration: 30 * 60 }), 40 * 60).ok).toBe(true);
  });

  it('miniatura que não é https some; página inválida é recusada', () => {
    const r = parseVideoInfo(JSON.stringify({ ...base, thumbnail: 'http://127.0.0.1/x.jpg' }));
    expect(r.ok && r.info.thumbnail).toBe(null);
    expect(parseVideoInfo(JSON.stringify({ ...base, webpage_url: 'file:///etc/passwd' })).ok).toBe(false);
    expect(parseVideoInfo('não é json').ok).toBe(false);
  });
});

describe('progresso do yt-dlp', () => {
  it('lê baixados, total, velocidade e tempo restante', () => {
    expect(parseProgressLine('BFP 7168 10202210 NA 4886991.396618986 2')).toEqual({ percent: 0.1, downloadedBytes: 7168, speed: 4886991.396618986, eta: 2 });
    expect(parseProgressLine('BFP 10202210 10202210 NA 83760876.4 NA')?.percent).toBe(100);
  });
  it('usa o total estimado quando falta o total', () => {
    expect(parseProgressLine('BFP 500 NA 1000 NA NA')?.percent).toBe(50);
    expect(parseProgressLine('BFP 500 NA NA NA NA')?.percent).toBe(null);
  });
  it('ignora outras linhas', () => {
    expect(parseProgressLine('[download] Destination: x.webm')).toBe(null);
    expect(parseProgressLine('BFP NA NA NA NA NA')).toBe(null);
  });
});

describe('mensagens de erro do yt-dlp', () => {
  it.each([
    ['ERROR: [youtube] abc: Video unavailable', /indisponível/, false],
    ['ERROR: [youtube] abc: Sign in to confirm your age', /idade/, false],
    ['ERROR: [youtube] abc: Private video. Sign in if you have access', /privado/, false],
    ['ERROR: Unsupported URL: https://exemplo.com/x', /não suportado/, false],
    ['ERROR: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>', /internet/, false],
    ['ERROR: [youtube] abc: Unable to extract nsig function', /desatualizado/, true],
    ['ERROR: unable to download video data: HTTP Error 403: Forbidden', /desatualizado/, true],
  ])('%s', (stderr, reason, outdated) => {
    const r = explainYtdlpError(stderr);
    expect(r.reason).toMatch(reason);
    expect(r.outdated).toBe(outdated);
  });
  it('não repete links do erro', () => {
    expect(explainYtdlpError('ERROR: algo estranho em https://site.com/?token=segredo').reason).not.toMatch(/segredo/);
  });
});

describe('estado inicial do mixer', () => {
  it('aceita faixa → booleano', () => {
    expect(sanitizeStartMix({ bass: false, drums: true, rest: true })).toEqual({ bass: false, drums: true, rest: true });
  });
  it('recusa nomes e valores inválidos', () => {
    expect(() => sanitizeStartMix({ '../x': true })).toThrow();
    expect(() => sanitizeStartMix({ bass: 'sim' })).toThrow();
    expect(() => sanitizeStartMix([true])).toThrow();
    expect(() => sanitizeStartMix(null)).toThrow();
  });
});

describe('biblioteca: músicas baixadas', () => {
  let root: string;
  let lib: Library;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'bf-video-'));
    lib = new Library(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const origin = { kind: 'url' as const, url: 'https://www.youtube.com/watch?v=x', site: 'youtube.com', title: 'Vídeo', channel: 'Canal', downloadedAt: '2026-11-08T10:00:00.000Z' };

  it('registro antigo, sem origem, vira origem "arquivo"', async () => {
    await mkdir(root, { recursive: true });
    const old = { version: 1, songs: [{ id: '0123456789abcdef', name: 'Antiga', addedAt: '2026-01-01T00:00:00.000Z', sourcePath: path.resolve('/m/a.wav'), stems: null }] };
    await writeFile(path.join(root, 'index.json'), JSON.stringify(old));
    const [s] = await lib.list();
    expect(s!.origin).toEqual({ kind: 'file' });
    expect((await lib.add('Nova', path.resolve('/m/b.wav'))).origin).toEqual({ kind: 'file' });
  });

  it('guarda origem e estado inicial; acha pelo link; remover apaga o áudio baixado', async () => {
    const id = lib.newId();
    const dir = lib.songDir(id);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, 'original.flac');
    await writeFile(file, 'x'.repeat(2000));
    await lib.addDownloaded(id, 'Vídeo', file, origin, { bass: false, drums: true });
    const again = new Library(root);
    const rec = (await again.findByUrl(origin.url))!;
    expect(rec.id).toBe(id);
    expect(rec.origin).toEqual(origin);
    expect(rec.startMix).toEqual({ bass: false, drums: true });
    await again.setStartMix(id, { bass: true });
    expect((await again.get(id))!.startMix).toEqual({ bass: true });
    await again.remove(id);
    expect(existsSync(file)).toBe(false);
    expect(JSON.parse(await readFile(path.join(root, 'index.json'), 'utf8')).songs).toEqual([]);
  });

  it('recusa áudio baixado fora da pasta da música', async () => {
    const id = lib.newId();
    await expect(lib.addDownloaded(id, 'x', path.resolve('/outro/original.flac'), origin)).rejects.toThrow(/fora da pasta/);
  });

  it('canais novos estão na lista permitida', () => {
    for (const c of ['import:url-info', 'import:url', 'import:url-cancel', 'ytdlp:version', 'ytdlp:update', 'library:set-start-mix', 'library:read-cover', 'library:open-origin']) {
      expect(ALLOWED_CHANNELS).toContain(c);
    }
  });
});
