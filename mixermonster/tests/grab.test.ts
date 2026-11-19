import { describe, expect, it } from 'vitest';
import {
  AUDIO_FORMAT_SELECTOR,
  buildFfmpegArgs,
  cleanTag,
  grabFileName,
  isGrabQuality,
  mp3Channels,
  mp3SampleRate,
  parseGrabMeta,
  parseProbe,
  sanitizeFileName,
  sourceLabel,
  sourceWarnings,
  uniqueBaseName,
  verifyGrab,
  type ProbeInfo,
} from '../src/main/grab.js';

const video = {
  title: 'Música: ao vivo/2026',
  channel: 'Canal',
  duration: 123,
  live_status: 'not_live',
  webpage_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  webpage_url_domain: 'youtube.com',
  thumbnail: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg',
  id: 'aqz-KE-bpKQ',
  upload_date: '20261112',
  formats: [
    { format_id: 'video', acodec: 'opus', vcodec: 'av01', abr: 256 },
    { format_id: 'aac', acodec: 'mp4a.40.2', vcodec: 'none', abr: 128, asr: 44100, audio_channels: 2 },
    { format_id: 'opus', acodec: 'opus', vcodec: 'none', abr: 160, asr: 48000, audio_channels: 2 },
  ],
};

describe('opções do download MP3', () => {
  it('aceita somente os perfis de qualidade suportados', () => {
    expect(isGrabQuality('v0')).toBe(true);
    expect(isGrabQuality('cbr320')).toBe(true);
    expect(isGrabQuality('320')).toBe(false);
    expect(isGrabQuality(null)).toBe(false);
    expect(AUDIO_FORMAT_SELECTOR).toContain('bestaudio');
  });

  it('lê metadados e o melhor formato de áudio sem confundir a faixa de vídeo', () => {
    expect(parseGrabMeta(JSON.stringify(video))).toEqual({
      ok: true,
      meta: {
        info: {
          url: video.webpage_url,
          title: video.title,
          channel: video.channel,
          duration: video.duration,
          site: 'youtube.com',
          thumbnail: video.thumbnail,
        },
        id: video.id,
        uploadDate: '2026-11-12',
        source: { codec: 'opus', bitrate: 160, sampleRate: 48000, channels: 2 },
      },
    });
  });

  it('recusa JSON inválido e preserva as validações de vídeos', () => {
    expect(parseGrabMeta('{').ok).toBe(false);
    expect(parseGrabMeta(JSON.stringify({ ...video, duration: 30 * 60 })).ok).toBe(false);
  });

  it('escolhe uma taxa MP3 suportada e limita a saída a mono ou estéreo', () => {
    expect(mp3SampleRate(null)).toBe(48000);
    expect(mp3SampleRate(44100)).toBe(44100);
    expect(mp3SampleRate(22050)).toBe(22050);
    expect(mp3SampleRate(5000)).toBe(8000);
    expect(mp3SampleRate(96000)).toBe(48000);
    expect(mp3Channels(1)).toBe(1);
    expect(mp3Channels(6)).toBe(2);
  });
});

describe('arquivo e tags', () => {
  it('sanitiza nomes para Windows sem remover acentos', () => {
    expect(sanitizeFileName('  Música: Ao vivo/2026.  ')).toBe('Música_ Ao vivo_2026');
    expect(sanitizeFileName('CON')).toBe('_CON');
    expect(sanitizeFileName('')).toBe('audio');
    expect(sanitizeFileName('Título'.repeat(30), 20)).toHaveLength(20);
    const parsed = parseGrabMeta(JSON.stringify(video));
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(grabFileName(parsed.meta)).toBe('Música_ ao vivo_2026 [aqz-KE-bpKQ].mp3');
  });

  it('gera um nome livre sem sobrescrever arquivos existentes', () => {
    const taken = new Set(['faixa', 'faixa (2)']);
    expect(uniqueBaseName('faixa', (candidate) => taken.has(candidate))).toBe('faixa (3)');
    expect(uniqueBaseName('nova', (candidate) => taken.has(candidate))).toBe('nova');
  });

  it('limpa controles de metadados e monta uma codificação única', () => {
    expect(cleanTag('  título\nseguro\u0000  ')).toBe('título seguro');
    const args = buildFfmpegArgs({
      input: 'source.webm',
      output: 'out.mp3',
      cover: 'cover.jpg',
      quality: 'cbr320',
      sampleRate: 48000,
      channels: 2,
      tags: { title: 'Faixa', artist: 'Canal', date: null, comment: 'https://example.com/v' },
    });
    expect(args).toContain('libmp3lame');
    expect(args).toContain('320k');
    expect(args).toContain('attached_pic');
    expect(args).toContain('3');
    expect(args).toContain('title=Faixa');
    expect(args).toContain('artist=Canal');
    expect(args).toContain('comment=https://example.com/v');
    expect(args.at(-1)).toBe('out.mp3');
  });
});

describe('verificação do MP3', () => {
  const output: ProbeInfo = {
    codec: 'mp3',
    sampleRate: 48000,
    channels: 2,
    durationSec: 123.04,
    bitrate: 320000,
    tags: { title: 'Faixa' },
  };

  it('interpreta a saída do ffprobe', () => {
    expect(parseProbe(JSON.stringify({
      streams: [{ codec_type: 'audio', codec_name: 'mp3', sample_rate: '48000', channels: 2 }],
      format: { duration: '123.04', bit_rate: '320000', tags: { title: 'Faixa' } },
    }))).toEqual(output);
    expect(parseProbe('não-json')).toBeNull();
    expect(parseProbe(JSON.stringify({ streams: [], format: {} }))).toBeNull();
  });

  it('compara codec, parâmetros, duração, decodificação e tags', () => {
    const checks = verifyGrab({
      source: { ...output, codec: 'opus', durationSec: 123 },
      output,
      decoded: true,
      expectedSampleRate: 48000,
      expectedChannels: 2,
    });
    expect(checks.every((check) => check.level === 'ok')).toBe(true);
    expect(verifyGrab({
      source: null,
      output: { ...output, codec: 'aac', tags: {} },
      decoded: false,
      expectedSampleRate: 44100,
      expectedChannels: 1,
    }).map((check) => check.level)).toContain('fail');
    expect(verifyGrab({
      source: null,
      output: null,
      decoded: false,
      expectedSampleRate: 48000,
      expectedChannels: 2,
    })[0]?.level).toBe('fail');
  });

  it('explica limitações da fonte antes de baixar', () => {
    const source = { codec: 'opus', bitrate: 80, sampleRate: 32000, channels: 1 };
    expect(sourceWarnings(source)).toHaveLength(3);
    expect(sourceWarnings(null)).toHaveLength(1);
    expect(sourceLabel(source)).toBe('Opus · 80 kbps · 32 kHz · mono');
  });
});
