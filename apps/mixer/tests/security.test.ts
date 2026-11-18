import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CHANNELS,
  CONTENT_SECURITY_POLICY,
  GrantedPaths,
  SECURE_WEB_PREFERENCES,
  isAllowedChannel,
  isAllowedNavigation,
  validateAudioPathShape,
} from '../src/main/security.js';

describe('preferências do BrowserWindow', () => {
  it('mantém isolamento, sandbox e sem integração Node', () => {
    expect(SECURE_WEB_PREFERENCES.contextIsolation).toBe(true);
    expect(SECURE_WEB_PREFERENCES.nodeIntegration).toBe(false);
    expect(SECURE_WEB_PREFERENCES.sandbox).toBe(true);
    expect(SECURE_WEB_PREFERENCES.webSecurity).toBe(true);
    expect(SECURE_WEB_PREFERENCES.allowRunningInsecureContent).toBe(false);
  });
});

describe('CSP', () => {
  it('não permite conteúdo remoto nem objetos', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/https?:/);
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-inline'");
  });
});

describe('canais IPC', () => {
  it('aceita apenas canais da allowlist', () => {
    for (const c of ALLOWED_CHANNELS) expect(isAllowedChannel(c)).toBe(true);
    expect(isAllowedChannel('fs:read')).toBe(false);
    expect(isAllowedChannel('shell:openExternal')).toBe(false);
    expect(isAllowedChannel(undefined)).toBe(false);
    expect(isAllowedChannel({ toString: () => 'app:info' })).toBe(false);
  });
});

describe('caminhos de áudio', () => {
  it('rejeita tipo, extensão, byte nulo e tamanho inválidos', () => {
    expect(validateAudioPathShape(42).ok).toBe(false);
    expect(validateAudioPathShape('/x/y.exe').ok).toBe(false);
    expect(validateAudioPathShape('/x/y.mp3\0.exe').ok).toBe(false);
    expect(validateAudioPathShape('').ok).toBe(false);
    expect(validateAudioPathShape('C:/musicas/Faixa.MP3').ok).toBe(true);
  });

  it('só aceita caminhos concedidos por diálogo nesta sessão', () => {
    const g = new GrantedPaths();
    expect(g.check('C:/m/a.wav').ok).toBe(false);
    g.grant('C:/m/a.wav');
    expect(g.check('C:/m/a.wav').ok).toBe(true);
    expect(g.check('C:/m/b.wav').ok).toBe(false);
    expect(g.check('C:/m/a.wav.exe').ok).toBe(false);
  });
});

describe('navegação', () => {
  it('bloqueia URLs externas e aceita file: do próprio app', () => {
    expect(isAllowedNavigation('file:///app/index.html', 'file://')).toBe(true);
    expect(isAllowedNavigation('https://exemplo.com/', 'file://')).toBe(false);
    expect(isAllowedNavigation('javascript:alert(1)', 'file://')).toBe(false);
    expect(isAllowedNavigation('não é url', 'file://')).toBe(false);
  });
});

import { GrantedWrites, sanitizeSuggestedName, validateExportPathShape } from '../src/main/security.js';

describe('escrita de exportação', () => {
  it('só escreve no caminho escolhido no diálogo, com a extensão do tipo', () => {
    const w = new GrantedWrites();
    expect(w.check('C:/x/saida.mid').ok).toBe(false); // não concedido
    w.grant('C:/x/saida.mid', 'midi');
    expect(w.check('C:/x/saida.mid').ok).toBe(true);
    expect(w.check('C:/x/outro.mid').ok).toBe(false);
  });

  it('recusa extensão que não bate com o tipo', () => {
    const w = new GrantedWrites();
    w.grant('C:/x/projeto.json', 'midi');
    expect(w.check('C:/x/projeto.json').ok).toBe(false);
    expect(validateExportPathShape('C:/x/a.exe', 'wav').ok).toBe(false);
  });

  it('sanitiza nome sugerido: sem separadores nem caracteres proibidos', () => {
    expect(sanitizeSuggestedName('../../etc/passwd')).not.toMatch(/[\/]/);
    expect(sanitizeSuggestedName('')).toBe('exportacao');
    expect(sanitizeSuggestedName(42)).toBe('exportacao');
    expect(sanitizeSuggestedName('Faixa: 01?')).toBe('Faixa_ 01_');
  });
});

import { parseStemChoice } from '../src/main/stems.js';

describe('escolha de faixas na separação', () => {
  it('sem escolha: as 6 do Demucs', () => {
    expect(parseStemChoice(undefined)).toEqual(['bass', 'drums', 'guitar', 'piano', 'vocals', 'other']);
  });
  it('aceita voz dividida e remove repetidas', () => {
    expect(parseStemChoice(['bass', 'lead', 'backing', 'bass'])).toEqual(['bass', 'lead', 'backing']);
  });
  it('recusa vazio, desconhecida e voz inteira junto com dividida', () => {
    expect(() => parseStemChoice([])).toThrow(/ao menos/);
    expect(() => parseStemChoice(['../x'])).toThrow(/desconhecida/);
    expect(() => parseStemChoice(['vocals', 'lead'])).toThrow(/não as duas/);
  });
});
