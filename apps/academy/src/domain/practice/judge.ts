/**
 * Julgamento de notas tocadas (portado do ScaleMonster, com relógio do motor de áudio e oitava).
 * Acerto exige um ATAQUE novo (a energia sobe) e a altura certa (±60 cents) em quadros seguidos,
 * dentro da janela da nota. Oitava errada (mesma nota, outra oitava) conta como "oitava".
 */
export const TOLERANCE_CENTS = 60;
export const STABLE_FRAMES = 2;
export const ATTACK_RATIO = 1.25;

/** Janela para tocar a nota: até 450 ms, mas no máximo 90% do tempo entre notas. */
export function hitWindowSec(bpm: number): number {
  return Math.min(0.45, (60 / bpm) * 0.9);
}

export function centsBetween(detectedHz: number, expectedHz: number): number {
  return 1200 * Math.log2(detectedHz / expectedHz);
}

export const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

export type Verdict = 'hit' | 'octave' | 'miss';

interface Target<T> {
  id: T;
  hz: number;
  deadline: number;
  attacked: boolean;
  stable: number;
  octaveStable: number;
}

export class NoteJudge<T> {
  private target: Target<T> | null = null;
  private prevRms = 0;

  /** Registra a próxima nota. Se a anterior ainda não foi resolvida, ela volta como erro. */
  expect(id: T, midi: number, deadline: number): { verdict: Verdict; id: T } | null {
    const dropped = this.target ? { verdict: 'miss' as const, id: this.target.id } : null;
    this.target = { id, hz: midiToHz(midi), deadline, attacked: false, stable: 0, octaveStable: 0 };
    return dropped;
  }

  /** Avalia um quadro (Hz detectado ou ≤ 0, energia, ruído de fundo, instante em segundos). */
  feed(detectedHz: number, now: number, rms: number, noiseFloor: number): { verdict: Verdict; id: T } | null {
    const attack = rms > noiseFloor && rms > this.prevRms * ATTACK_RATIO;
    this.prevRms = rms;
    const t = this.target;
    if (!t) return null;
    if (attack) t.attacked = true;
    if (t.attacked && detectedHz > 0) {
      const c = centsBetween(detectedHz, t.hz);
      const exact = Math.abs(c) <= TOLERANCE_CENTS;
      const oct = !exact && [1200, -1200, 2400, -2400].some((o) => Math.abs(c - o) <= TOLERANCE_CENTS);
      t.stable = exact ? t.stable + 1 : 0;
      t.octaveStable = oct ? t.octaveStable + 1 : 0;
      if (t.stable >= STABLE_FRAMES) {
        this.target = null;
        return { verdict: 'hit', id: t.id };
      }
      if (t.octaveStable >= STABLE_FRAMES + 1) {
        this.target = null;
        return { verdict: 'octave', id: t.id };
      }
    } else {
      t.stable = 0;
      t.octaveStable = 0;
    }
    if (now > t.deadline) {
      this.target = null;
      return { verdict: 'miss', id: t.id };
    }
    return null;
  }

  clear(): void {
    this.target = null;
    this.prevRms = 0;
  }
}

/**
 * YIN (de Cheveigné e Kawahara, 2002): frequência fundamental de um bloco, ou −1 sem altura clara.
 * Faixa do baixo por padrão (B0 ≈ 31 Hz a ~ 400 Hz). O bloco precisa cobrir 2 períodos do grave:
 * para 31 Hz a 48 kHz, 4096 amostras.
 */
export function yinPitch(buf: Float32Array, sampleRate: number, fmin = 30, fmax = 420, threshold = 0.15): { hz: number; clarity: number } | null {
  const maxTau = Math.min(Math.floor(sampleRate / fmin), Math.floor(buf.length / 2));
  const minTau = Math.max(2, Math.floor(sampleRate / fmax));
  if (maxTau <= minTau) return null;
  const W = buf.length - maxTau;
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) {
      const x = buf[j]! - buf[j + tau]!;
      s += x * x;
    }
    d[tau] = s;
  }
  // Diferença cumulativa normalizada.
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    run += d[tau]!;
    cmnd[tau] = run > 0 ? (d[tau]! * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (cmnd[t]! < threshold) {
      while (t + 1 <= maxTau && cmnd[t + 1]! < cmnd[t]!) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;
  // Interpolação parabólica.
  const a = cmnd[tau - 1] ?? cmnd[tau]!;
  const b = cmnd[tau]!;
  const c = cmnd[tau + 1] ?? cmnd[tau]!;
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  return { hz: sampleRate / (tau + shift), clarity: 1 - b };
}
