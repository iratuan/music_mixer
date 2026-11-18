import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Library } from '../src/main/library.js';
import { MANIFEST, exportLibrary, importLibrary, readManifest, safeName } from '../src/main/libtransfer.js';

let base: string;
let libA: Library;
let libB: Library;
let out: string;

/** Música com faixas em FLAC (bytes falsos), análise e mapa, numa coleção. */
async function songWithStems(lib: Library, name: string): Promise<string> {
  const src = path.join(base, `${name.replace(/[^a-z0-9]/gi, '_')}.wav`);
  await writeFile(src, 'original');
  const rec = await lib.add(name, src);
  const dir = path.join(lib.songDir(rec.id), 'faixas');
  await mkdir(dir, { recursive: true });
  const stems: Record<string, string> = {};
  for (const k of ['bass', 'drums', 'vocals']) {
    stems[k] = path.join(dir, `${k}.flac`);
    await writeFile(stems[k]!, `audio ${k}`);
  }
  await lib.setStems(rec.id, stems);
  await writeFile(lib.analysisPath(rec.id), JSON.stringify({ version: 3, bpm: 100 }));
  await lib.setSections(rec.id, [{ startBar: 0, name: 'Intro' }]);
  await lib.setStartMix(rec.id, { bass: false, drums: true, vocals: true });
  return rec.id;
}

beforeEach(async () => {
  base = await mkdtemp(path.join(tmpdir(), 'bf-transfer-'));
  libA = new Library(path.join(base, 'A'));
  libB = new Library(path.join(base, 'B'));
  out = path.join(base, 'export');
  await mkdir(out);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('exportar e reimportar a biblioteca', () => {
  it('exporta as faixas com nomes legíveis, a análise e o manifesto', async () => {
    const id = await songWithStems(libA, 'Groove: teste?');
    await libA.collectionOp('add', 'Ensaios', { ids: [id] });
    const r = await exportLibrary(libA, out, { includeOriginal: true, now: new Date('2026-11-15T12:00:00Z') });
    expect(r.songs).toBe(1);
    expect(r.stems).toBe(3);
    expect(path.basename(r.folder)).toBe('MixerMonster - biblioteca 2026-11-15');
    const songDir = path.join(r.folder, 'Groove teste');
    expect((await readdir(songDir)).sort()).toEqual(['Baixo.flac', 'Bateria.flac', 'Original.wav', 'Voz.flac', 'analise.json'].sort());
    expect(existsSync(path.join(r.folder, 'LEIA-ME.txt'))).toBe(true);
    const { manifest } = await readManifest(r.folder);
    expect(manifest.collections).toEqual(['Ensaios']);
    expect(manifest.songs[0]!.stems).toEqual({ bass: 'Baixo.flac', drums: 'Bateria.flac', vocals: 'Voz.flac' });
  });

  it('não sobrescreve uma exportação anterior do mesmo dia', async () => {
    await songWithStems(libA, 'Uma');
    const a = await exportLibrary(libA, out, { includeOriginal: false });
    const b = await exportLibrary(libA, out, { includeOriginal: false });
    expect(a.folder).not.toBe(b.folder);
  });

  it('reimporta em outra biblioteca com faixas, análise, mapa, mixer e coleções; repetir não duplica', async () => {
    const id = await songWithStems(libA, 'Groove');
    await libA.collectionOp('add', 'Ensaios', { ids: [id] });
    await libA.collectionOp('create', 'Vazia');
    const r = await exportLibrary(libA, out, { includeOriginal: false });
    const res = await importLibrary(libB, r.folder);
    expect(res).toEqual({ added: 1, existing: [], failed: [] });
    const [song] = await libB.list();
    expect(song!.name).toBe('Groove');
    expect(Object.keys(song!.stems!).sort()).toEqual(['bass', 'drums', 'vocals']);
    expect(await readFile(song!.stems!.bass!, 'utf8')).toBe('audio bass');
    expect(song!.stems!.bass!.startsWith(libB.songDir(id))).toBe(true);
    expect(song!.sections).toEqual([{ startBar: 0, name: 'Intro' }]);
    expect(song!.startMix).toEqual({ bass: false, drums: true, vocals: true });
    expect(JSON.parse(await readFile(libB.analysisPath(id), 'utf8'))).toMatchObject({ bpm: 100 });
    expect(await libB.collections()).toEqual(['Ensaios', 'Vazia']);
    const again = await importLibrary(libB, r.folder);
    expect(again).toEqual({ added: 0, existing: ['Groove'], failed: [] });
    expect(await libB.list()).toHaveLength(1);
  });

  it('aceita a pasta onde a exportação foi salva (procura dentro)', async () => {
    await songWithStems(libA, 'Groove');
    await exportLibrary(libA, out, { includeOriginal: false });
    expect((await importLibrary(libB, out)).added).toBe(1);
  });

  it('recusa manifesto com caminhos fora da pasta e pasta sem biblioteca', async () => {
    await expect(importLibrary(libB, base)).rejects.toThrow(/biblioteca.json/);
    const evil = path.join(base, 'evil');
    await mkdir(evil);
    await writeFile(
      path.join(evil, MANIFEST),
      JSON.stringify({ format: 'mixercraft-biblioteca', version: 1, collections: [], songs: [{ id: 'aaaaaaaaaaaaaaaa', name: 'x', folder: '..', stems: { bass: '../../segredo.flac' } }] }),
    );
    const { manifest } = await readManifest(evil);
    expect(manifest.songs).toHaveLength(0);
  });

  it('nome seguro para pastas do Windows', () => {
    expect(safeName('AC/DC: Back <in> Black?.')).toBe('AC DC Back in Black');
    expect(safeName('CON')).toBe('musica');
  });
});
