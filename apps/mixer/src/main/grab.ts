/**
 * Ferramenta "Baixar MP3": política de qualidade, escolha da fonte, nome do arquivo e
 * verificação do resultado. Módulo PURO (sem Electron, sem rede), testado em tests/grab.test.ts.
 *
 * Princípio: o MP3 nunca é melhor que a fonte. Então (1) escolhemos o melhor fluxo de áudio,
 * (2) não reamostramos sem necessidade, (3) codificamos uma vez com o preset transparente
 * (LAME V0) e (4) conferimos o arquivo contra a fonte antes de entregar.
 */
import { DEFAULT_MAX_DURATION_SEC, parseVideoInfo, type VideoInfo } from './video.js';

export const GRAB_QUALITIES = ['v0', 'cbr320'] as const;
/** V0 = VBR transparente (~245 kbps); cbr320 = taxa fixa, para quem exige bitrate constante. */
export type GrabQuality = (typeof GRAB_QUALITIES)[number];

export function isGrabQuality(v: unknown): v is GrabQuality {
  return typeof v === 'string' && (GRAB_QUALITIES as readonly string[]).includes(v);
}

/** Melhor fluxo só de áudio: Opus antes de AAC (mesma taxa, melhor qualidade), depois o que houver. */
export const AUDIO_FORMAT_SELECTOR = 'bestaudio[acodec=opus]/bestaudio[acodec=aac]/bestaudio/best';

export interface AudioSource {
  /** 'opus', 'aac', 'mp3', 'vorbis', 'flac' ou o nome cru do codec. */
  readonly codec: string;
  /** kbps, quando o site informa. */
  readonly bitrate: number | null;
  readonly sampleRate: number | null;
  readonly channels: number | null;
}

export interface GrabMeta {
  readonly info: VideoInfo;
  /** Id do vídeo (para desempatar nomes e compor tags). */
  readonly id: string | null;
  /** YYYY-MM-DD, quando o site informa. */
  readonly uploadDate: string | null;
  readonly source: AudioSource | null;
}

export type GrabMetaCheck = { readonly ok: true; readonly meta: GrabMeta } | { readonly ok: false; readonly reason: string };

type Json = Record<string, unknown>;

const asObj = (v: unknown): Json | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeCodec(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('opus')) return 'opus';
  if (s.includes('aac') || s.includes('mp4a')) return 'aac';
  if (s.includes('mp3')) return 'mp3';
  if (s.includes('vorbis')) return 'vorbis';
  if (s.includes('flac')) return 'flac';
  return s || 'desconhecido';
}

/** Fluxo de áudio de maior taxa entre os que não têm vídeo. */
function audioFormat(j: Json): Json | null {
  const arr = Array.isArray(j.formats) ? j.formats : [];
  const candidates = arr
    .map(asObj)
    .filter((f): f is Json => f !== null)
    .filter((f) => {
      const ac = str(f.acodec);
      const vc = str(f.vcodec);
      return ac !== '' && ac !== 'none' && (vc === '' || vc === 'none');
    });
  if (candidates.length === 0) return null;
  const score = (f: Json) => num(f.abr) ?? num(f.tbr) ?? 0;
  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0] ?? null;
}

/**
 * Lê a saída de `yt-dlp -J` e separa o que a ferramenta precisa: metadados para o nome/tags
 * e o formato do melhor fluxo de áudio (para avisar antes de baixar que a fonte é fraca).
 */
export function parseGrabMeta(json: string, maxDurationSec: number = DEFAULT_MAX_DURATION_SEC): GrabMetaCheck {
  const base = parseVideoInfo(json, maxDurationSec);
  if (!base.ok) return { ok: false, reason: base.reason };
  let j: Json;
  try {
    j = JSON.parse(json) as Json;
  } catch {
    return { ok: false, reason: 'resposta do baixador ilegível' };
  }
  const idRaw = str(j.id);
  const id = /^[A-Za-z0-9_-]{1,64}$/.test(idRaw) ? idRaw : null;
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(str(j.upload_date));
  const f = audioFormat(j);
  const source: AudioSource | null = f
    ? {
        codec: normalizeCodec(str(f.acodec)),
        bitrate: num(f.abr) ?? num(f.tbr),
        sampleRate: num(f.asr),
        channels: num(f.audio_channels),
      }
    : null;
  return {
    ok: true,
    meta: { info: base.info, id, uploadDate: date ? `${date[1]}-${date[2]}-${date[3]}` : null, source },
  };
}

/** Taxas que o MP3 aceita (ISO/IEC 11172-3). */
const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000] as const;

/** Reamostra só quando o MP3 não aceita a taxa da fonte; de resto, preserva. */
export function mp3SampleRate(sourceRate: number | null): number {
  if (sourceRate === null) return 48000;
  if ((MP3_RATES as readonly number[]).includes(sourceRate)) return sourceRate;
  if (sourceRate > 48000) return 48000;
  return MP3_RATES.find((r) => r >= sourceRate) ?? 44100;
}

/** MP3 é mono ou estéreo; acima de dois canais, downmix para estéreo. */
export function mp3Channels(sourceChannels: number | null): 1 | 2 {
  return sourceChannels === 1 ? 1 : 2;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])$/i;

/**
 * Nome seguro para Windows, preservando acentos e maiúsculas (o nome é do usuário, não do código):
 * troca só o que o sistema proíbe, remove controles e marcas de direção (truque de nome),
 * evita nomes reservados e termina sem ponto/espaço.
 */
export function sanitizeFileName(input: string, maxLength = 150): string {
  let s = input
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > maxLength) s = s.slice(0, maxLength);
  s = s.replace(/[. ]+$/, '').trim();
  if (s.length === 0) s = 'audio';
  if (WINDOWS_RESERVED.test(s)) s = `_${s}`;
  return s;
}

/** "Canal - Título [id].mp3" não é preciso: o canal já é tag. Nome = título + id do vídeo. */
export function grabFileName(meta: Pick<GrabMeta, 'info' | 'id'>): string {
  const suffix = meta.id ? ` [${meta.id}]` : '';
  return `${sanitizeFileName(`${meta.info.title}${suffix}`)}.mp3`;
}

/** Nome livre na pasta: "Título (2).mp3" etc. `taken` recebe o nome-base, sem extensão. */
export function uniqueBaseName(stem: string, taken: (candidate: string) => boolean): string {
  if (!taken(stem)) return stem;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${stem} (${i})`;
    if (!taken(candidate)) return candidate;
  }
  return `${stem} (${Date.now().toString(36)})`;
}

/** Tag de texto: sem controles, sem quebras, tamanho limitado. */
export function cleanTag(value: string | null | undefined, max = 240): string | null {
  if (!value) return null;
  const s = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length === 0 ? null : s.slice(0, max);
}

export interface GrabTags {
  readonly title: string;
  readonly artist: string;
  readonly date: string | null;
  readonly comment: string | null;
}

export interface FfmpegPlan {
  readonly input: string;
  readonly output: string;
  /** Miniatura já gravada em disco; null quando o site não tem ou a rede falhou. */
  readonly cover: string | null;
  readonly quality: GrabQuality;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  readonly tags: GrabTags;
}

/**
 * Conversão explícita (o yt-dlp só baixa; quem codifica somos nós):
 * - V0 (`-q:a 0`) ou CBR 320, uma única codificação;
 * - taxa de amostra preservada quando possível; downmix só acima de 2 canais;
 * - capa quadrada 600×600 embutida como imagem anexa (capa de álbum);
 * - ID3v2.3 (mais compatível que 2.4 em carros e no Explorer), sem capítulos.
 */
export function buildFfmpegArgs(plan: FfmpegPlan): string[] {
  const args = ['-hide_banner', '-nostdin', '-y', '-i', plan.input];
  if (plan.cover) args.push('-i', plan.cover);
  args.push('-map', '0:a:0');
  if (plan.cover) {
    args.push(
      '-map', '1:v:0',
      '-c:v', 'mjpeg',
      '-vf', 'scale=600:600:force_original_aspect_ratio=increase,crop=600:600',
      '-disposition:v', 'attached_pic',
      '-metadata:s:v', 'title=Album cover',
      '-metadata:s:v', 'comment=Cover (front)',
    );
  }
  args.push(
    '-map_metadata', '0',
    '-map_chapters', '-1',
    '-c:a', 'libmp3lame',
    ...(plan.quality === 'v0' ? ['-q:a', '0'] : ['-b:a', '320k']),
    '-ar', String(plan.sampleRate),
    '-ac', String(plan.channels),
    '-id3v2_version', '3',
  );
  const tag = (key: string, value: string | null) => {
    const text = cleanTag(value);
    if (text) args.push('-metadata', `${key}=${text}`);
  };
  tag('title', plan.tags.title);
  tag('artist', plan.tags.artist);
  tag('date', plan.tags.date);
  tag('comment', plan.tags.comment);
  args.push('-f', 'mp3', plan.output);
  return args;
}

export interface ProbeInfo {
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly durationSec: number;
  /** Bits por segundo, como o ffprobe informa. */
  readonly bitrate: number | null;
  readonly tags: Readonly<Record<string, string>>;
}

/** Lê o JSON de `ffprobe -show_format -show_streams`. */
export function parseProbe(json: string): ProbeInfo | null {
  let j: Json;
  try {
    j = JSON.parse(json) as Json;
  } catch {
    return null;
  }
  const streams = Array.isArray(j.streams) ? j.streams : [];
  const audio = streams.map(asObj).find((s): s is Json => s !== null && str(s.codec_type) === 'audio') ?? null;
  const format = asObj(j.format);
  const codec = str(audio?.codec_name);
  const sampleRate = num(audio?.sample_rate);
  const channels = num(audio?.channels);
  const durationSec = num(format?.duration);
  if (!codec || sampleRate === null || channels === null || durationSec === null) return null;
  const tags: Record<string, string> = {};
  const raw = asObj(format?.tags);
  if (raw) for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') tags[k.toLowerCase()] = v;
  return { codec, sampleRate, channels, durationSec, bitrate: num(format?.bit_rate), tags };
}

export type CheckLevel = 'ok' | 'warn' | 'fail';

export interface GrabCheck {
  readonly id: string;
  readonly level: CheckLevel;
  readonly detail: string;
}

export interface VerifyInput {
  /** null quando o ffprobe não está disponível: aí só o decode é conferido. */
  readonly source: ProbeInfo | null;
  readonly output: ProbeInfo | null;
  readonly decoded: boolean;
  readonly expectedSampleRate: number;
  readonly expectedChannels: number;
}

/** Tolerância de duração: o MP3 tem atraso de codificador (~26 ms) e padding de quadro. */
const DURATION_OK = 0.15;
const DURATION_FAIL = 0.5;

export function fmtSeconds(seconds: number): string {
  const total = Math.round(seconds * 10) / 10;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** Confere o MP3 contra a fonte: codec, taxa, canais, duração, decode e tags. */
export function verifyGrab(v: VerifyInput): GrabCheck[] {
  const out = v.output;
  if (!out) return [{ id: 'leitura', level: 'fail', detail: 'o arquivo gerado não pôde ser lido' }];
  const checks: GrabCheck[] = [
    { id: 'codec', level: out.codec === 'mp3' ? 'ok' : 'fail', detail: out.codec === 'mp3' ? 'MP3 válido' : `codec ${out.codec}` },
    {
      id: 'taxa',
      level: out.sampleRate === v.expectedSampleRate ? 'ok' : 'warn',
      detail: `${out.sampleRate} Hz (esperado ${v.expectedSampleRate})`,
    },
    {
      id: 'canais',
      level: out.channels === v.expectedChannels ? 'ok' : 'warn',
      detail: `${out.channels} canal(is)`,
    },
    {
      id: 'decode',
      level: v.decoded ? 'ok' : 'fail',
      detail: v.decoded ? 'decodifica por inteiro' : 'há trechos corrompidos',
    },
  ];
  if (v.source && v.source.durationSec > 0) {
    const delta = Math.abs(out.durationSec - v.source.durationSec);
    const level: CheckLevel = delta <= DURATION_OK ? 'ok' : delta <= DURATION_FAIL ? 'warn' : 'fail';
    checks.push({ id: 'duracao', level, detail: `${fmtSeconds(out.durationSec)} (Δ ${delta.toFixed(2)} s)` });
  }
  checks.push({
    id: 'tags',
    level: out.tags['title'] ? 'ok' : 'warn',
    detail: out.tags['title'] ? 'título e capa nas tags' : 'sem título nas tags',
  });
  return checks;
}

/** Avisos que devem aparecer antes de baixar: o MP3 não conserta uma fonte ruim. */
export function sourceWarnings(source: AudioSource | null): string[] {
  if (!source) return ['não foi possível identificar o formato do áudio na fonte'];
  const out: string[] = [];
  if (source.bitrate !== null && source.bitrate < 96) {
    out.push(`a fonte tem cerca de ${Math.round(source.bitrate)} kbps; o MP3 não melhora isso`);
  }
  if (source.channels === 1) out.push('a fonte é mono');
  if (source.sampleRate !== null && source.sampleRate !== 44100 && source.sampleRate !== 48000) {
    out.push(`a fonte está em ${source.sampleRate} Hz e será reamostrada`);
  }
  if (source.codec === 'desconhecido') out.push('codec da fonte não identificado');
  return out;
}

/** "Opus · 160 kbps · 48 kHz · estéreo" para a prévia. */
export function sourceLabel(source: AudioSource | null): string {
  if (!source) return 'fonte desconhecida';
  const codec = source.codec === 'aac' ? 'AAC' : source.codec === 'opus' ? 'Opus' : source.codec.toUpperCase();
  const bitrate = source.bitrate !== null ? ` · ${Math.round(source.bitrate)} kbps` : '';
  const rate = source.sampleRate !== null ? ` · ${(source.sampleRate / 1000).toFixed(source.sampleRate % 1000 === 0 ? 0 : 1)} kHz` : '';
  const channels = source.channels === 1 ? ' · mono' : source.channels !== null && source.channels >= 2 ? ' · estéreo' : '';
  return `${codec}${bitrate}${rate}${channels}`;
}
