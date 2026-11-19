#!/usr/bin/env node
// Testa a importação pelo link no app empacotado, FORA da pasta do projeto, com o yt-dlp e o ffmpeg
// embutidos e download REAL (precisa de internet): prévia, download, separação só de baixo e bateria
// pelo runtime de CPU, e o estado inicial com o baixo mudo.
// Uso: node tooling/screens/portable-url-check.mjs <pasta win-unpacked copiada> [link]
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

const [dir, link = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ'] = process.argv.slice(2);
if (!dir) throw new Error('uso: portable-url-check.mjs <pasta do app> [link]');
const userData = mkdtempSync(join(tmpdir(), 'bf-portable-url-'));
const app = await electron.launch({ executablePath: join(dir, 'Baixaria Fina.exe'), env: { ...process.env, BF_STEMS_PYTHON: '', BF_YTDLP: '', BF_USER_DATA: userData } });
try {
  const win = await app.firstWindow();
  await win.waitForTimeout(1500);
  const r = await win.evaluate(async (url) => {
    const b = window.baixaria;
    const version = await b.ytdlpVersion();
    const avail = await b.stemsAvailable();
    const t0 = performance.now();
    const preview = await b.videoInfo(url);
    const infoMs = Math.round(performance.now() - t0);
    const t1 = performance.now();
    const song = await b.importUrl(preview.url, 'flac', { bass: false, drums: true, rest: true });
    const dlMs = Math.round(performance.now() - t1);
    const t2 = performance.now();
    const sep = await b.separateStems(song.id, { quality: 'fast', stems: ['bass', 'drums'] });
    const sepMs = Math.round(performance.now() - t2);
    const rec = (await b.libraryList()).find((s) => s.id === song.id);
    return {
      version,
      runtime: avail.runtime,
      title: preview.title,
      site: preview.site,
      duration: preview.duration,
      thumb: !!preview.thumbnailData,
      infoMs,
      dlMs,
      stems: sep.stems,
      sepMs,
      origin: rec?.origin,
      startMix: rec?.startMix,
      cover: rec?.cover,
    };
  }, link);
  console.log(JSON.stringify(r, null, 1));
  const ok =
    r.version?.available === true &&
    r.runtime === 'cpu' &&
    r.origin?.kind === 'url' &&
    JSON.stringify(r.stems) === JSON.stringify(['bass', 'drums', 'rest']) &&
    r.startMix?.bass === false &&
    r.startMix?.drums === true;
  console.log(ok ? 'ok: app empacotado baixou pelo link (yt-dlp e ffmpeg embutidos), separou baixo e bateria na CPU, baixo começa mudo' : 'FALHOU');
  process.exitCode = ok ? 0 : 1;
} finally {
  await app.close();
}
