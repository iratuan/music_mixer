/**
 * Esqueleto do músico do Palco: cinemática inversa de dois ossos (braço = ombro → cotovelo → mão),
 * molas para o movimento secundário (cabelo, correia, tronco) e o humor do personagem pelo desempenho.
 * Puro (sem desenho): o Palco só chama estas funções a cada quadro.
 */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

/**
 * IK de dois ossos: dado o ombro, o alvo da mão e os comprimentos, devolve cotovelo e mão. Se o alvo
 * está longe demais, a mão para na distância máxima (braço esticado); se está perto demais, o braço dobra.
 * `bend` = +1 / −1 escolhe para que lado o cotovelo aponta.
 */
export function twoBoneIK(shoulder: Vec, target: Vec, l1: number, l2: number, bend: 1 | -1 = 1): { elbow: Vec; hand: Vec; reach: number } {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const raw = Math.hypot(dx, dy) || 1e-6;
  const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, raw));
  // Lei dos cossenos: distância do ombro até a projeção do cotovelo na linha ombro→mão.
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / raw;
  const uy = dy / raw;
  const elbow = { x: shoulder.x + ux * a - uy * h * bend, y: shoulder.y + uy * a + ux * h * bend };
  const hand = { x: shoulder.x + ux * d, y: shoulder.y + uy * d };
  return { elbow, hand, reach: d / (l1 + l2) };
}

/** Mola amortecida (movimento secundário e interpolação suave). */
export class Spring {
  v = 0;
  constructor(
    public x = 0,
    private readonly k = 140,
    private readonly c = 16,
  ) {}
  step(target: number, dt: number): number {
    // Passos curtos mantêm a integração estável mesmo com quadros lentos.
    const n = Math.max(1, Math.ceil(dt / 0.008));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.k * (target - this.x) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

export type Mood = 'normal' | 'hot' | 'error';

/** Humor: empolgado com combo 4x (30+ seguidas) ou energia cheia; retraído após 3 erros em pouco tempo. */
export function moodFor(streak: number, recentMisses: number, overdrive = false): Mood {
  if (recentMisses >= 3) return 'error';
  if (streak >= 30 || overdrive) return 'hot';
  return 'normal';
}

/** Intensidade do movimento do corpo por humor: amplitude do balanço, da cabeça e da palhetada. */
export const MOOD_GAIN: Record<Mood, { bob: number; head: number; pick: number; lean: number }> = {
  normal: { bob: 1, head: 0.35, pick: 1, lean: 0 },
  hot: { bob: 2.2, head: 1, pick: 1.25, lean: 0.12 },
  error: { bob: 0.4, head: 0.1, pick: 0.45, lean: -0.1 },
};

export type AvatarInstrument = 'bass' | 'guitar' | 'keys';

/** Quanto do braço (0 = pestana, 1 = ponte) a mão esquerda alcança para uma casa (suaviza o deslizar). */
export function fretToNeck(fret: number, frets = 20): number {
  if (fret <= 0) return 0.04;
  // Casas reais ficam mais juntas perto da ponte: posição = 1 − 2^(−fret/12).
  const full = 1 - 2 ** (-frets / 12);
  return Math.min(1, (1 - 2 ** (-fret / 12)) / full) * 0.92;
}

/** Ponto do teclado (−1 grave … +1 agudo) para uma altura MIDI (4 oitavas centradas no Dó 3). */
export function midiToKeyPos(midi: number): number {
  return Math.max(-1, Math.min(1, (midi - 48) / 24));
}
