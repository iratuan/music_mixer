/**
 * Regras de segurança do processo principal. Módulo PURO: não importa 'electron',
 * para que possa ser testado sem abrir janela (ver tests/security.test.ts).
 */

/** Preferências obrigatórias de toda BrowserWindow (viabilidade §5, prompt §6.2). */
export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
} as const;

/** CSP restritiva: sem conteúdo remoto, sem objetos, sem formulários. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

/** Canais IPC permitidos. Qualquer outro nome é recusado. */
export const ALLOWED_CHANNELS = [
  'app:info',
  'app:open-folder',
  'dialog:pick-audio',
  'audio:read',
  'dialog:save',
  'file:write',
  'stems:available',
  'stems:separate',
  'stems:transpose',
  'stems:midi',
  'song:analyze',
  'library:list',
  'library:storage',
  'library:compact',
  'library:add',
  'library:read-original',
  'library:read-stem',
  'library:read-analysis',
  'library:remove',
  'library:set-start-mix',
  'library:set-sections',
  'library:collections',
  'library:collection-op',
  'export:map-pdf',
  'library:read-cover',
  'library:open-origin',
  'import:url-info',
  'import:url',
  'import:url-cancel',
  'grab:folder',
  'grab:pick-folder',
  'grab:info',
  'grab:fetch',
  'grab:cancel',
  'grab:reveal',
  'stems:cancel',
  'voice:status',
  'voice:download',
  'voice:cancel',
  'ytdlp:version',
  'ytdlp:update',
] as const;

/** Tipos de exportação permitidos e a extensão de cada um. */
export const EXPORT_KINDS = { midi: '.mid', wav: '.wav', pdf: '.pdf', txt: '.txt' } as const;
export type ExportKind = keyof typeof EXPORT_KINDS;
export const MAX_EXPORT_BYTES = 200 * 1024 * 1024;

export function isExportKind(v: unknown): v is ExportKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(EXPORT_KINDS, v);
}

/** Nome sugerido no diálogo: só o nome-base, sem separadores de caminho. */
export function sanitizeSuggestedName(input: unknown): string {
  if (typeof input !== 'string') return 'exportacao';
  const base = input.replace(/[\\/:*?"<>|\0]/g, '_').trim().slice(0, 120);
  return base.length > 0 ? base : 'exportacao';
}

/** Caminho de escrita: precisa ter a extensão do tipo escolhido. A concessão vem do diálogo. */
export function validateExportPathShape(input: unknown, kind: ExportKind): ValidationResult<string> {
  if (typeof input !== 'string') return { ok: false, reason: 'caminho não é texto' };
  if (input.length === 0 || input.length > 4096 || input.includes('\0')) return { ok: false, reason: 'caminho inválido' };
  if (!input.toLowerCase().endsWith(EXPORT_KINDS[kind])) return { ok: false, reason: `extensão deve ser ${EXPORT_KINDS[kind]}` };
  return { ok: true, value: input };
}

/** Escritas só em caminhos que o usuário escolheu no diálogo de salvar nesta sessão. */
export class GrantedWrites {
  private readonly granted = new Map<string, ExportKind>();

  grant(path: string, kind: ExportKind): void {
    this.granted.set(path, kind);
  }

  check(input: unknown): ValidationResult<string> {
    if (typeof input !== 'string') return { ok: false, reason: 'caminho não é texto' };
    const kind = this.granted.get(input);
    if (!kind) return { ok: false, reason: 'caminho não foi escolhido pelo usuário nesta sessão' };
    return validateExportPathShape(input, kind);
  }
}
export type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];

export function isAllowedChannel(name: unknown): name is AllowedChannel {
  return typeof name === 'string' && (ALLOWED_CHANNELS as readonly string[]).includes(name);
}

/** Formatos de áudio aceitos na importação (prompt §5.2). */
export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac'] as const;

/** Limite de tamanho de importação: arquivo não confiável não é lido sem limite. */
export const MAX_IMPORT_BYTES = 500 * 1024 * 1024;

export type ValidationResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/** Valida a forma de um caminho de áudio (não prova que ele foi concedido pelo usuário). */
export function validateAudioPathShape(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') return { ok: false, reason: 'caminho não é texto' };
  if (input.length === 0 || input.length > 4096) return { ok: false, reason: 'tamanho de caminho inválido' };
  if (input.includes('\0')) return { ok: false, reason: 'caminho contém byte nulo' };
  const lower = input.toLowerCase();
  if (!AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return { ok: false, reason: `extensão não suportada (use ${AUDIO_EXTENSIONS.join(', ')})` };
  }
  return { ok: true, value: input };
}

/**
 * Caminhos só são aceitos se foram escolhidos em um diálogo nativo nesta sessão.
 * O renderer nunca fornece caminho arbitrário.
 */
export class GrantedPaths {
  private readonly granted = new Set<string>();

  grant(path: string): void {
    this.granted.add(path);
  }

  check(input: unknown): ValidationResult<string> {
    const shape = validateAudioPathShape(input);
    if (!shape.ok) return shape;
    if (!this.granted.has(shape.value)) {
      return { ok: false, reason: 'caminho não foi escolhido pelo usuário nesta sessão' };
    }
    return shape;
  }
}

/** Navegação só para a origem do próprio app; todo o resto é bloqueado. */
export function isAllowedNavigation(url: string, appOrigin: string): boolean {
  try {
    const target = new URL(url);
    if (target.protocol === 'file:') return true;
    return target.origin === appOrigin;
  } catch {
    return false;
  }
}
