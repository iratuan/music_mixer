/**
 * Importação pela URL de um vídeo (yt-dlp). Módulo PURO: validação da URL, leitura dos
 * metadados, do progresso e das mensagens de erro do yt-dlp. Testado em tests/video.test.ts.
 */

export const MAX_URL_LENGTH = 2048;
/** Limite de duração padrão: 20 minutos. */
export const DEFAULT_MAX_DURATION_SEC = 20 * 60;
export const AUDIO_FORMATS = ['mp3', 'flac', 'wav'] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

export function isAudioFormat(v: unknown): v is AudioFormat {
  return typeof v === 'string' && (AUDIO_FORMATS as readonly string[]).includes(v);
}

export type UrlCheck = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: string };

/** IPv4 em notação de pontos: loopback, rede privada, link-local, CGNAT, multicast e reservados. */
function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

/**
 * Aceita só `https://` para um nome de site público: sem espaços, sem usuário e senha na URL,
 * sem IP local ou de rede privada, sem nomes de rede local. O texto nunca começa com "-",
 * e o yt-dlp ainda o recebe depois de `--`.
 */
export function validateVideoUrl(input: unknown): UrlCheck {
  if (typeof input !== 'string') return { ok: false, reason: 'o link não é texto' };
  const raw = input.trim();
  if (raw.length === 0) return { ok: false, reason: 'cole o link de um vídeo' };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'link longo demais' };
  if (/[\s\0]/.test(raw)) return { ok: false, reason: 'o link não pode ter espaços' };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'isto não é um link' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'use um link que comece com https://' };
  if (u.username || u.password) return { ok: false, reason: 'links com usuário e senha não são aceitos' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host.startsWith('[') || host.includes(':')) return { ok: false, reason: 'links com endereço IP não são aceitos' };
  if (/^\d+$/.test(host) || /^0x/i.test(host) || isPrivateIPv4(host) || /^[\d.]+$/.test(host)) {
    return { ok: false, reason: 'links com endereço IP não são aceitos' };
  }
  if (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|lan|home|intranet|corp)$/.test(host)) {
    return { ok: false, reason: 'o link precisa ser de um site público' };
  }
  return { ok: true, url: u.href };
}

export interface VideoInfo {
  readonly url: string;
  readonly title: string;
  readonly channel: string;
  /** Segundos; 0 quando o site não informa. */
  readonly duration: number;
  readonly site: string;
  readonly thumbnail: string | null;
}

export type InfoCheck = { readonly ok: true; readonly info: VideoInfo } | { readonly ok: false; readonly reason: string };

/** Lê a saída de `yt-dlp -J` e recusa playlist, transmissão ao vivo e vídeo longo demais. */
export function parseVideoInfo(json: string, maxDurationSec: number = DEFAULT_MAX_DURATION_SEC): InfoCheck {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'resposta do baixador ilegível' };
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  if (j._type === 'playlist' || j._type === 'multi_video') {
    return { ok: false, reason: 'isto é uma playlist. Cole o link de um vídeo só' };
  }
  const live = j.is_live === true || j.live_status === 'is_live' || j.live_status === 'is_upcoming' || j.live_status === 'post_live';
  if (live) return { ok: false, reason: 'transmissões ao vivo não podem ser importadas' };
  const duration = typeof j.duration === 'number' && Number.isFinite(j.duration) && j.duration > 0 ? j.duration : 0;
  if (duration > maxDurationSec) {
    return { ok: false, reason: `o vídeo tem ${Math.round(duration / 60)} min; o limite é ${Math.round(maxDurationSec / 60)} min` };
  }
  const page = validateVideoUrl(str(j.webpage_url) || str(j.original_url));
  if (!page.ok) return { ok: false, reason: 'o site devolveu um endereço de página inválido' };
  const thumb = validateVideoUrl(str(j.thumbnail));
  const domain = str(j.webpage_url_domain) || new URL(page.url).hostname.replace(/^www\./, '');
  return {
    ok: true,
    info: {
      url: page.url,
      title: (str(j.title) || 'vídeo sem título').slice(0, 200),
      channel: (str(j.channel) || str(j.uploader) || str(j.artist)).slice(0, 120),
      duration,
      site: domain.slice(0, 80),
      thumbnail: thumb.ok ? thumb.url : null,
    },
  };
}

export interface DownloadProgress {
  /** 0–100, ou null quando o tamanho total é desconhecido. */
  readonly percent: number | null;
  readonly downloadedBytes: number;
  /** Bytes por segundo, ou null. */
  readonly speed: number | null;
  /** Segundos restantes, ou null. */
  readonly eta: number | null;
}

/** Modelo passado em --progress-template: "BFP baixados total total_estimado velocidade eta". */
export const PROGRESS_TEMPLATE = 'download:BFP %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s';

export function parseProgressLine(line: string): DownloadProgress | null {
  const m = /^BFP (\S+) (\S+) (\S+) (\S+) (\S+)\s*$/.exec(line.trim());
  if (!m) return null;
  const num = (s: string) => {
    const n = Number(s);
    return s !== 'NA' && s !== 'None' && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const done = num(m[1]!);
  if (done === null) return null;
  const total = num(m[2]!) ?? num(m[3]!);
  return {
    percent: total && total > 0 ? Math.min(100, Math.round((done / total) * 1000) / 10) : null,
    downloadedBytes: done,
    speed: num(m[4]!),
    eta: num(m[5]!),
  };
}

/** Motivo legível a partir do stderr do yt-dlp. Nunca repassa cookies, tokens ou a linha de comando. */
export function explainYtdlpError(stderr: string): { reason: string; outdated: boolean } {
  const s = stderr.toLowerCase();
  const has = (...k: string[]) => k.some((x) => s.includes(x));
  if (has('getaddrinfo', 'failed to resolve', 'name or service not known', 'temporary failure in name resolution', 'no address associated', 'network is unreachable', '[winerror 10051]', '[winerror 11001]')) {
    return { reason: 'sem conexão com a internet (ou o site não respondeu)', outdated: false };
  }
  if (has('sign in to confirm your age', 'age-restricted', 'inappropriate for some users')) return { reason: 'o vídeo tem restrição de idade e exige login', outdated: false };
  if (has('private video', 'members-only', 'join this channel', 'requires payment', 'premium', 'this video is private')) {
    return { reason: 'o vídeo é privado, pago ou só para membros', outdated: false };
  }
  if (has('sign in', 'login required', 'log in', 'requires authentication', 'cookies')) return { reason: 'o site exige login; o app não usa contas nem cookies', outdated: false };
  if (has('drm')) return { reason: 'o conteúdo é protegido (DRM) e não pode ser baixado', outdated: false };
  if (has('unsupported url')) return { reason: 'site não suportado pelo baixador', outdated: false };
  if (has('video unavailable', 'not available', 'has been removed', 'does not exist', 'http error 404', 'this video has been')) {
    return { reason: 'vídeo indisponível ou removido', outdated: false };
  }
  if (has('http error 403', 'unable to extract', 'signature', 'nsig', 'requested format is not available', 'please report this issue')) {
    return { reason: 'o site mudou e o baixador pode estar desatualizado', outdated: true };
  }
  if (has('file is larger than max-filesize')) return { reason: 'o arquivo de áudio passa do limite de tamanho', outdated: false };
  const last = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('ERROR:'))
    .pop();
  return { reason: last ? last.replace(/^ERROR:\s*/, '').replace(/https?:\/\/\S+/g, '<link>').slice(0, 200) : 'o download falhou', outdated: false };
}

/** Estado inicial do mixer gravado na música: faixa → começa tocando (true) ou muda (false). */
export function sanitizeStartMix(input: unknown): Record<string, boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('estado inicial inválido');
  const out: Record<string, boolean> = {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > 12) throw new Error('faixas demais');
  for (const [k, v] of entries) {
    if (!/^[a-z]{3,12}$/.test(k)) throw new Error(`nome de faixa inválido: ${k}`);
    if (typeof v !== 'boolean') throw new Error('estado de faixa inválido');
    out[k] = v;
  }
  return out;
}
