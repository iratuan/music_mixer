/**
 * Juiz da pista de notas: janela de acerto, pontuação (50 por nota × multiplicador), sequência,
 * multiplicador 1x–4x (a cada 10 acertos seguidos), barra de energia que dobra o multiplicador
 * (até 8x), pontos de sustentação e precisão. Puro: o relógio vem de fora (AudioContext.currentTime).
 *
 * Três jeitos de entrar com as notas, sem mudar a pista:
 * - `verdict(id, …)`: o juiz de áudio (YIN) já decidiu a nota;
 * - `strike(lane, at)` / `tap(lane, at)`: teclado (casa + palhetada; ligados só com a casa);
 * - `midiOn(midi, at)`: instrumento MIDI.
 */
import { fofHitWindow, type FofNoteEvent } from './fofChartTypes.js';

/** Perfect até ±45 ms, Great até ±90 ms, Good no resto da janela. */
export const PERFECT_SEC = 0.045;
export const GREAT_SEC = 0.09;

export type HighwayNoteState = 'pending' | 'hit' | 'octave' | 'miss';

export interface HighwayNote extends FofNoteEvent {
  state: HighwayNoteState;
  /** Desvio do acerto (s; negativo = adiantado). */
  offset?: number;
  /** Afinação da nota tocada (cents; + acima, − abaixo), quando o juiz de áudio informou. */
  cents?: number;
  perfect?: boolean;
  /** A cauda ainda está sendo sustentada (perde ao soltar). */
  holding?: boolean;
}

export interface HighwayEvent {
  readonly kind: 'hit' | 'octave' | 'miss' | 'overstrum' | 'overdrive';
  readonly lane: number;
  readonly at: number;
  readonly perfect?: boolean;
  /** Classe do acerto (só em 'hit'). */
  readonly grade?: 'perfect' | 'great' | 'good';
}

export interface HighwayStats {
  score: number;
  streak: number;
  maxStreak: number;
  hits: number;
  perfect: number;
  great: number;
  good: number;
  octave: number;
  misses: number;
  overstrums: number;
  hopoHits: number;
  hopoTotal: number;
  /** Barra de energia, 0–1. */
  energy: number;
  /** Energia ativa (multiplicador dobrado). */
  overdrive: boolean;
}

export const POINTS_PER_NOTE = 50;
/** Pontos de cauda por tempo sustentado (antes do multiplicador). */
export const SUSTAIN_POINTS_PER_BEAT = 25;
/** Energia ganha por acerto (25 acertos limpos enchem a barra). */
export const ENERGY_PER_HIT = 0.04;
/** Duração da energia cheia (s). */
export const OVERDRIVE_SEC = 10;

export function baseMultiplier(streak: number): number {
  return Math.min(4, 1 + Math.floor(streak / 10));
}

export interface EngineOptions {
  /** Erro automático quando a nota passa da janela (desligado no áudio: o juiz de áudio decide). */
  autoMiss?: boolean;
  /** Janela de acerto fixa (s); sem ela, depende do andamento da nota. */
  window?: number;
}

export class FofHighwayEngine {
  readonly notes: HighwayNote[] = [];
  readonly stats: HighwayStats = { score: 0, streak: 0, maxStreak: 0, hits: 0, perfect: 0, great: 0, good: 0, octave: 0, misses: 0, overstrums: 0, hopoHits: 0, hopoTotal: 0, energy: 0, overdrive: false };
  /** Avisa cada nota julgada (para a tela marcar a nota no braço e na sequência). */
  onJudged: ((n: HighwayNote) => void) | null = null;
  private events: HighwayEvent[] = [];
  private byId = new Map<number, HighwayNote>();
  private lastSustainAt: number | null = null;
  private readonly autoMiss: boolean;
  private readonly fixedWindow: number | undefined;

  constructor(opts: EngineOptions = {}) {
    this.autoMiss = opts.autoMiss ?? true;
    this.fixedWindow = opts.window;
  }

  windowFor(n: FofNoteEvent): number {
    return this.fixedWindow ?? fofHitWindow(n.bpm);
  }

  multiplier(): number {
    return baseMultiplier(this.stats.streak) * (this.stats.overdrive ? 2 : 1);
  }

  /** Acrescenta uma nota (as notas chegam em ordem de tempo; repetidas são ignoradas). */
  add(n: FofNoteEvent): void {
    if (this.byId.has(n.id)) return;
    const note: HighwayNote = { ...n, state: 'pending' };
    this.byId.set(n.id, note);
    this.notes.push(note);
    if (n.hopo) this.stats.hopoTotal++;
    // Guarda só o necessário para desenhar (as notas antigas saem).
    if (this.notes.length > 600) {
      const old = this.notes.splice(0, this.notes.length - 400);
      for (const o of old) this.byId.delete(o.id);
    }
  }

  get judged(): number {
    return this.stats.hits + this.stats.octave + this.stats.misses;
  }

  /** Precisão 0–100 (oitava vale meio acerto), ou null sem notas julgadas. */
  accuracy(): number | null {
    const t = this.judged;
    return t ? Math.round(((this.stats.hits + this.stats.octave * 0.5) / t) * 100) : null;
  }

  /** Eventos novos desde a última leitura (para partículas e brilhos). */
  drain(): HighwayEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Veredito do juiz de áudio para a nota `id`. */
  verdict(id: number, v: 'hit' | 'octave' | 'miss', at: number, cents?: number): void {
    const n = this.byId.get(id);
    if (!n || n.state !== 'pending') return;
    if (cents !== undefined) n.cents = cents;
    if (v === 'miss') this.miss(n, at);
    else this.resolve(n, v, at);
  }

  /** Teclado: casa (trilha) + palhetada. Sem nota na janela, quebra a sequência. */
  strike(lane: number, at: number): boolean {
    const n = this.nearest(at, (x) => x.lane === lane);
    if (n) {
      this.resolve(n, 'hit', at);
      return true;
    }
    this.overstrum(lane, at);
    return false;
  }

  /** Teclado: só a casa (sem palhetar). Vale para ligados com a sequência ativa; não pune. */
  tap(lane: number, at: number): boolean {
    if (this.stats.streak <= 0) return false;
    const n = this.nearest(at, (x) => x.lane === lane && x.hopo);
    if (!n) return false;
    const before = this.notes[this.notes.indexOf(n) - 1];
    if (before && before.state !== 'hit') return false;
    this.resolve(n, 'hit', at);
    return true;
  }

  /** Instrumento MIDI: mesma nota = acerto; mesma nota em outra oitava = oitava. */
  midiOn(midi: number, at: number): boolean {
    const exact = this.nearest(at, (x) => x.midi === midi);
    if (exact) {
      this.resolve(exact, 'hit', at);
      return true;
    }
    const oct = this.nearest(at, (x) => x.midi >= 0 && (x.midi - midi) % 12 === 0);
    if (oct) {
      this.resolve(oct, 'octave', at);
      return true;
    }
    this.overstrum(-1, at);
    return false;
  }

  /**
   * Avança o relógio: erra as notas vencidas (com `autoMiss`), soma os pontos das caudas
   * sustentadas (`holding(n)` diz se a nota ainda soa) e gasta a energia ativa.
   */
  update(now: number, holding?: (n: HighwayNote) => boolean): void {
    if (this.autoMiss) {
      for (const n of this.notes) {
        if (n.state === 'pending' && now > n.time + this.windowFor(n)) this.miss(n, now);
      }
    }
    const last = this.lastSustainAt ?? now;
    const dt = Math.max(0, Math.min(0.25, now - last));
    this.lastSustainAt = now;
    if (dt > 0) {
      for (const n of this.notes) {
        if (!n.holding || n.sustain <= 0) continue;
        const end = n.time + n.sustain;
        if (now > end) {
          n.holding = false;
          continue;
        }
        if (holding && !holding(n)) {
          n.holding = false;
          continue;
        }
        const span = Math.min(now, end) - Math.max(last, n.time);
        if (span > 0) this.stats.score += Math.round(span * (n.bpm / 60) * SUSTAIN_POINTS_PER_BEAT * this.multiplier());
      }
      if (this.stats.overdrive) {
        this.stats.energy = Math.max(0, this.stats.energy - dt / OVERDRIVE_SEC);
        if (this.stats.energy <= 0) this.stats.overdrive = false;
      }
    }
  }

  private nearest(at: number, ok: (n: HighwayNote) => boolean): HighwayNote | null {
    let best: HighwayNote | null = null;
    let bestD = Infinity;
    for (const n of this.notes) {
      if (n.state !== 'pending' || !ok(n)) continue;
      const d = Math.abs(n.time - at);
      if (d <= this.windowFor(n) && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  private resolve(n: HighwayNote, v: 'hit' | 'octave', at: number): void {
    const s = this.stats;
    n.state = v;
    n.offset = at - n.time;
    n.perfect = v === 'hit' && Math.abs(n.offset) <= PERFECT_SEC;
    n.holding = n.sustain > 0;
    if (v === 'octave') {
      // Meio acerto: meia pontuação, sem somar à sequência (nem quebrá-la).
      s.octave++;
      s.score += Math.round((POINTS_PER_NOTE / 2) * this.multiplier());
      this.events.push({ kind: 'octave', lane: n.lane, at });
      this.onJudged?.(n);
      return;
    }
    s.hits++;
    if (n.perfect) s.perfect++;
    else if (Math.abs(n.offset) <= GREAT_SEC) s.great++;
    else s.good++;
    if (n.hopo) s.hopoHits++;
    // O multiplicador vale pelos acertos seguidos ANTES desta nota (0–9 = 1x, 10–19 = 2x…).
    s.score += POINTS_PER_NOTE * this.multiplier();
    s.streak++;
    s.maxStreak = Math.max(s.maxStreak, s.streak);
    this.events.push({ kind: 'hit', lane: n.lane, at, perfect: n.perfect, grade: n.perfect ? 'perfect' : Math.abs(n.offset) <= GREAT_SEC ? 'great' : 'good' });
    this.onJudged?.(n);
    if (!s.overdrive) {
      s.energy = Math.min(1, s.energy + ENERGY_PER_HIT);
      if (s.energy >= 1) {
        s.overdrive = true;
        this.events.push({ kind: 'overdrive', lane: -1, at });
      }
    }
  }

  private miss(n: HighwayNote, at: number): void {
    n.state = 'miss';
    this.stats.misses++;
    this.stats.streak = 0;
    this.events.push({ kind: 'miss', lane: n.lane, at });
    this.onJudged?.(n);
  }

  private overstrum(lane: number, at: number): void {
    this.stats.overstrums++;
    this.stats.streak = 0;
    this.events.push({ kind: 'overstrum', lane, at });
  }
}
