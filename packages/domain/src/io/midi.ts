/**
 * Leitura de Standard MIDI File (tipos 0 e 1): notas com início e duração em segundos,
 * respeitando o mapa de andamento (meta-evento 0x51). Usado para as notas extraídas pelo
 * Basic Pitch. Running status, eventos de sistema e meta-eventos são tratados; o resto é ignorado.
 */
export interface MidiNote {
  readonly midi: number;
  readonly startSec: number;
  readonly durSec: number;
  /** 0–1. */
  readonly velocity: number;
  readonly channel: number;
}

class Reader {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}
  get done(): boolean {
    return this.pos >= this.b.length;
  }
  u8(): number {
    if (this.pos >= this.b.length) throw new Error('MIDI truncado');
    return this.b[this.pos++]!;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u32(): number {
    return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
  }
  str(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
  vlq(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const c = this.u8();
      v = (v << 7) | (c & 0x7f);
      if (!(c & 0x80)) return v;
    }
    throw new Error('número de tamanho variável inválido');
  }
  skip(n: number): void {
    this.pos += n;
    if (this.pos > this.b.length) throw new Error('MIDI truncado');
  }
}

interface RawEvent {
  tick: number;
  kind: 'on' | 'off' | 'tempo';
  note?: number;
  vel?: number;
  ch?: number;
  usPerQuarter?: number;
}

export function readMidi(bytes: Uint8Array): MidiNote[] {
  const r = new Reader(bytes);
  if (r.str(4) !== 'MThd') throw new Error('não é um arquivo MIDI');
  const hlen = r.u32();
  const format = r.u16();
  const ntrks = r.u16();
  const division = r.u16();
  r.skip(hlen - 6);
  if (format > 1) throw new Error('MIDI tipo 2 não suportado');
  if (division & 0x8000) throw new Error('divisão SMPTE não suportada');
  const ppq = division;

  const events: RawEvent[] = [];
  for (let t = 0; t < ntrks && !r.done; t++) {
    const id = r.str(4);
    const len = r.u32();
    const end = r.pos + len;
    if (id !== 'MTrk') {
      r.skip(len);
      continue;
    }
    let tick = 0;
    let status = 0;
    while (r.pos < end) {
      tick += r.vlq();
      let b = r.u8();
      if (b === 0xff) {
        const type = r.u8();
        const l = r.vlq();
        if (type === 0x51 && l === 3) events.push({ tick, kind: 'tempo', usPerQuarter: (r.u8() << 16) | (r.u8() << 8) | r.u8() });
        else r.skip(l);
        continue;
      }
      if (b === 0xf0 || b === 0xf7) {
        r.skip(r.vlq());
        continue;
      }
      let d1: number;
      if (b & 0x80) {
        status = b;
        d1 = r.u8();
      } else {
        if (!status) throw new Error('running status sem status anterior');
        d1 = b;
        b = status;
      }
      const type = status & 0xf0;
      const ch = status & 0x0f;
      if (type === 0xc0 || type === 0xd0) continue; // um byte de dados
      const d2 = r.u8();
      if (type === 0x90 && d2 > 0) events.push({ tick, kind: 'on', note: d1, vel: d2, ch });
      else if (type === 0x80 || (type === 0x90 && d2 === 0)) events.push({ tick, kind: 'off', note: d1, ch });
    }
    r.pos = end;
  }

  // Ticks → segundos pelo mapa de andamento (padrão 120 BPM).
  const tempos = events.filter((e) => e.kind === 'tempo').sort((a, b) => a.tick - b.tick);
  const secOf = (tick: number): number => {
    let sec = 0;
    let lastTick = 0;
    let us = 500000;
    for (const tp of tempos) {
      if (tp.tick >= tick) break;
      sec += ((tp.tick - lastTick) * us) / ppq / 1e6;
      lastTick = tp.tick;
      us = tp.usPerQuarter!;
    }
    return sec + ((tick - lastTick) * us) / ppq / 1e6;
  };

  const notes: MidiNote[] = [];
  const open = new Map<string, RawEvent[]>();
  const sorted = events.filter((e) => e.kind !== 'tempo').sort((a, b) => a.tick - b.tick || (a.kind === 'off' ? -1 : 1));
  for (const e of sorted) {
    const k = `${e.ch}:${e.note}`;
    if (e.kind === 'on') {
      const list = open.get(k) ?? [];
      list.push(e);
      open.set(k, list);
    } else {
      const on = open.get(k)?.shift();
      if (!on) continue;
      const s = secOf(on.tick);
      notes.push({ midi: on.note!, startSec: s, durSec: Math.max(0.001, secOf(e.tick) - s), velocity: (on.vel ?? 64) / 127, channel: on.ch ?? 0 });
    }
  }
  return notes.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
}
