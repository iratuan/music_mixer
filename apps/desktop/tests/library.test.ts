import { mkdtemp, rm as rmDir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Library } from '../src/main/library.js';

let root: string;
let lib: Library;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'bf-lib-'));
  lib = new Library(root);
});

afterEach(async () => {
  await rmDir(root, { recursive: true, force: true });
});

const SRC = path.resolve('/musica/faixa.wav');

describe('biblioteca de músicas', () => {
  it('adiciona, lista e recarrega do disco (sobrevive a reinício)', async () => {
    const rec = await lib.add('Faixa', SRC);
    expect(rec.stems).toBeNull();
    const again = new Library(root); // "reinício" do app
    const list = await again.list();
    expect(list.map((s) => s.name)).toEqual(['Faixa']);
    expect(list[0]!.id).toBe(rec.id);
  });

  it('não duplica a mesma origem', async () => {
    const a = await lib.add('Faixa', SRC);
    const b = await lib.add('Outro nome', SRC);
    expect(b.id).toBe(a.id);
    expect((await lib.list()).length).toBe(1);
  });

  it('recusa caminho relativo e nome vazio', async () => {
    await expect(lib.add('x', 'relativo/faixa.wav')).rejects.toThrow(/absoluto/);
    await expect(lib.add('   ', SRC)).rejects.toThrow(/nome/);
  });

  it('recusa id malicioso (traversal) em todas as operações', async () => {
    await expect(lib.get('../../etc')).rejects.toThrow(/inválido/);
    await expect(lib.remove('..\\..\\x')).rejects.toThrow(/inválido/);
    expect(() => lib.songDir('../x')).toThrow(/inválido/);
  });

  it('recusa nome de faixa que não seja palavra simples', async () => {
    const rec = await lib.add('F', SRC);
    await expect(lib.setStems(rec.id, { '../bass': path.resolve('/a.wav') })).rejects.toThrow(/inválido/);
    expect(() => lib.transposedPath(rec.id, '../x', 1)).toThrow(/inválido/);
    expect(() => lib.midiPath(rec.id, 'bass/..', 0)).toThrow(/inválido/);
  });

  it('guarda faixas separadas e devolve só as da música pedida', async () => {
    const a = await lib.add('A', SRC);
    const b = await lib.add('B', path.resolve('/musica/b.wav'));
    await lib.setStems(a.id, { bass: path.resolve('/dados/a/bass.wav'), vocals: path.resolve('/dados/a/vocals.wav') });
    expect(await lib.stemPath(a.id, 'bass')).toBe(path.resolve('/dados/a/bass.wav'));
    expect(await lib.stemPath(b.id, 'bass')).toBeNull();
    expect(await lib.stemPath(a.id, 'drums')).toBeNull();
  });

  it('caminhos de cache: tom e MIDI dentro da pasta da música, transposição limitada', async () => {
    const rec = await lib.add('A', SRC);
    const dir = lib.songDir(rec.id);
    expect(lib.transposedPath(rec.id, 'bass', 2)).toBe(path.join(dir, 'tom', 'bass_+2.flac'));
    expect(lib.transposedPath(rec.id, 'vocals', -3)).toBe(path.join(dir, 'tom', 'vocals_-3.flac'));
    expect(lib.midiPath(rec.id, 'bass', 0)).toBe(path.join(dir, 'midi', 'bass_0.v3.mid'));
    expect(lib.midiPath(rec.id, 'guitar', 0)).toBe(path.join(dir, 'midi', 'guitar_0.v2.mid'));
    expect(lib.oldMidiPaths(rec.id, 'bass', 0)).toEqual([path.join(dir, 'midi', 'bass_0.mid'), path.join(dir, 'midi', 'bass_0.v1.mid'), path.join(dir, 'midi', 'bass_0.v2.mid')]);
    expect(() => lib.transposedPath(rec.id, 'bass', 0)).toThrow(/inválida/);
    expect(() => lib.transposedPath(rec.id, 'bass', 7)).toThrow(/inválida/);
    expect(() => lib.midiPath(rec.id, 'bass', 1.5)).toThrow(/inválida/);
    expect(await lib.readAnalysis(rec.id)).toBeNull();
  });

  it('remove da lista e apaga só a pasta de dados', async () => {
    const rec = await lib.add('A', SRC);
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(lib.songDir(rec.id), { recursive: true });
    await writeFile(lib.analysisPath(rec.id), '{}', 'utf8');
    const dir = lib.songDir(rec.id);
    expect((await stat(dir)).isDirectory()).toBe(true);
    await lib.remove(rec.id);
    expect(await lib.list()).toEqual([]);
    await expect(stat(dir)).rejects.toThrow();
  });

  it('índice corrompido é recusado, não sobrescrito em silêncio', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(root, 'index.json'), '{"version":99,"songs":[]}', 'utf8');
    await expect(lib.list()).rejects.toThrow(/inválido/);
  });
});

import { sanitizeMeta } from '../src/main/library.js';

describe('resumo da análise na biblioteca', () => {
  it('aceita valores em faixa e descarta o resto', () => {
    expect(sanitizeMeta({ bpm: 109.84, key: 'F menor', extra: 'x' })).toEqual({ bpm: 109.8, key: 'F menor' });
    expect(sanitizeMeta({ bpm: 9999, key: '<script>' })).toEqual({});
    expect(sanitizeMeta(null)).toEqual({});
  });
});

describe('coleções', () => {
  it('cria vazia, põe e tira músicas, renomeia e exclui sem apagar músicas', async () => {
    const a = await lib.add('A', path.resolve('/musica/a.wav'));
    const b = await lib.add('B', path.resolve('/musica/b.wav'));
    expect(await lib.collectionOp('create', 'Queen')).toEqual(['Queen']);
    expect(await new Library(root).collections()).toEqual(['Queen']); // vazia sobrevive
    await lib.collectionOp('add', 'queen', { ids: [a.id, b.id] }); // sem diferenciar maiúsculas
    await lib.collectionOp('add', 'Rock 80', { ids: [a.id] });
    let list = await lib.list();
    expect(list.find((s) => s.id === a.id)!.collections).toEqual(['Queen', 'Rock 80']);
    await lib.collectionOp('remove', 'Queen', { ids: [b.id] });
    list = await lib.list();
    expect(list.find((s) => s.id === b.id)!.collections).toBeUndefined();
    expect(await lib.collectionOp('rename', 'Rock 80', { to: 'Rock anos 80' })).toEqual(['Queen', 'Rock anos 80']);
    await expect(lib.collectionOp('rename', 'Queen', { to: 'rock anos 80' })).rejects.toThrow(/já existe/);
    expect(await lib.collectionOp('delete', 'Queen')).toEqual(['Rock anos 80']);
    list = await lib.list();
    expect(list).toHaveLength(2);
    expect(list.find((s) => s.id === a.id)!.collections).toEqual(['Rock anos 80']);
  });

  it('recusa nome vazio, longo ou ids inválidos', async () => {
    await expect(lib.collectionOp('create', '   ')).rejects.toThrow(/inválido/);
    await expect(lib.collectionOp('create', 'x'.repeat(41))).rejects.toThrow(/inválido/);
    await expect(lib.collectionOp('add', 'Ok', { ids: ['../../etc'] })).rejects.toThrow(/nenhuma música/);
    expect(await lib.collectionOp('create', 'a\u0000b')).toEqual(['a b']);
  });
});

describe('metadados: faixa de andamento', () => {
  it('grava a faixa e apaga com null (andamento fixado)', () => {
    expect(sanitizeMeta({ bpm: 112, bpmRange: [86.1, 123] })).toEqual({ bpm: 112, bpmRange: [86.1, 123] });
    const cleared = sanitizeMeta({ bpm: 117.5, bpmRange: null });
    expect('bpmRange' in cleared && cleared.bpmRange === undefined).toBe(true);
    expect(JSON.parse(JSON.stringify({ ...{ bpmRange: [86, 123] }, ...cleared }))).toEqual({ bpm: 117.5 });
    expect(sanitizeMeta({ bpm: 100 })).not.toHaveProperty('bpmRange');
  });
});
