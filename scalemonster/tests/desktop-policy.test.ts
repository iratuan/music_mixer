import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_ORIGIN,
  CONTENT_SECURITY_POLICY,
  SECURE_WEB_PREFERENCES,
  backupName,
  backupsToPrune,
  isAppUrl,
  isSaveKind,
  isSqliteFile,
  mimeOf,
  resolveAppAsset,
  saveFileName,
} from '../shells/desktop/src/policy.js';

describe('shell desktop do Academy: regras puras', () => {
  it('janela endurecida e CSP sem conteúdo remoto (com WebAssembly)', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true });
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("'wasm-unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:|unsafe-inline|'unsafe-eval'/);
  });

  it('só a origem do app é confiável', () => {
    expect(isAppUrl(`${APP_ORIGIN}/index.html`)).toBe(true);
    expect(isAppUrl('academy://outro/index.html')).toBe(false);
    expect(isAppUrl('file:///C:/x.html')).toBe(false);
    expect(isAppUrl('https://example.com')).toBe(false);
    expect(isAppUrl('lixo')).toBe(false);
  });

  it('recursos do app não escapam da pasta do renderer', () => {
    const root = path.resolve('/app/dist/renderer');
    expect(resolveAppAsset(root, `${APP_ORIGIN}/`)).toBe(path.join(root, 'index.html'));
    expect(resolveAppAsset(root, `${APP_ORIGIN}/assets/a.js?x=1`)).toBe(path.join(root, 'assets', 'a.js'));
    expect(resolveAppAsset(root, `${APP_ORIGIN}/../../segredo.txt`)).toBe(path.join(root, 'segredo.txt')); // URL normaliza o ..
    expect(resolveAppAsset(root, `${APP_ORIGIN}/%2e%2e/%2e%2e/segredo.txt`)).toBe(path.join(root, 'segredo.txt')); // idem, preso na raiz
    expect(resolveAppAsset(root, `${APP_ORIGIN}/..%5c..%5csegredo.txt`)).toBeNull();
    expect(resolveAppAsset(root, 'academy://outro/index.html')).toBeNull();
    expect(resolveAppAsset(root, 'file:///etc/passwd')).toBeNull();
  });

  it('tipos MIME, inclusive o do WebAssembly', () => {
    expect(mimeOf('a.wasm')).toBe('application/wasm');
    expect(mimeOf('index.HTML')).toContain('text/html');
    expect(mimeOf('x.bin')).toBe('application/octet-stream');
  });

  it('salvar: só tipos conhecidos e nome seguro com extensão', () => {
    expect(isSaveKind('json')).toBe(true);
    expect(isSaveKind('exe')).toBe(false);
    expect(isSaveKind('toString')).toBe(false);
    expect(saveFileName('mapa: C/G?', 'txt')).toBe('mapa_ C_G_.txt');
    expect(saveFileName('historico.json', 'json')).toBe('historico.json');
    expect(saveFileName('', 'pdf')).toBe('exportacao.pdf');
    expect(saveFileName(42, 'midi')).toBe('exportacao.mid');
    expect(saveFileName('x'.repeat(300), 'wav')).toHaveLength(124);
  });

  it('só aceita gravar arquivos SQLite', () => {
    const ok = new Uint8Array(4096);
    ok.set(new TextEncoder().encode('SQLite format 3\u0000'));
    expect(isSqliteFile(ok)).toBe(true);
    expect(isSqliteFile(new Uint8Array(4096))).toBe(false);
    expect(isSqliteFile(ok.slice(0, 50))).toBe(false);
  });

  it('backups: nome ordenável e só os 3 mais recentes ficam', () => {
    expect(backupName(new Date('2026-11-18T10:09:10.407Z'))).toBe('academy-20261118-100910-inicio.sqlite');
    const names = [
      'academy-20261101-000000-inicio.sqlite',
      'academy-20261103-000000-antes-importar.sqlite',
      'academy-20261102-000000-inicio.sqlite',
      'academy-20261104-000000-inicio.sqlite',
      'nao-mexer.txt',
    ];
    expect(backupsToPrune(names)).toEqual(['academy-20261101-000000-inicio.sqlite']);
    expect(backupsToPrune(names.slice(0, 2))).toEqual([]);
  });
});
