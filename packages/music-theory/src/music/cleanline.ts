/**
 * Limpeza da linha transcrita (Basic Pitch) antes de virar tablatura, braço e exercício:
 * 1. tira "fantasmas": notas muito curtas e fracas (vazamento do bumbo, ruído do ataque);
 * 2. junta a mesma nota partida em duas (o detector às vezes corta uma nota longa);
 * 3. corrige oitava isolada: uma nota exatamente uma oitava acima/abaixo das duas vizinhas, que
 *    estão na mesma região, é quase sempre erro de harmônico do detector;
 * 4. encaixa o começo de cada nota na grade de semicolcheias dos tempos detectados, quando está perto
 *    (até 30% da semicolcheia): a tablatura fica legível e o exercício toca no tempo certo.
 * Módulo puro.
 */
export interface LineNote {
  readonly midi: number;
  readonly startSec: number;
  readonly durSec: number;
  readonly velocity?: number;
}

export function cleanBassLine<T extends LineNote>(notes: readonly T[], beats: readonly number[]): T[] {
  if (!notes.length) return [];
  const sorted = [...notes].sort((a, b) => a.startSec - b.startSec);
  const beatLen = (t: number) => {
    let k = 0;
    while (k + 1 < beats.length && beats[k + 1]! <= t) k++;
    if (beats.length < 2) return 0.5;
    const a = Math.min(k, beats.length - 2);
    return beats[a + 1]! - beats[a]!;
  };
  // 1. fantasmas
  let out = sorted.filter((n) => !(n.durSec < beatLen(n.startSec) * 0.12 && (n.velocity ?? 100) < 70));
  // 2. mesma nota partida
  const merged: T[] = [];
  for (const n of out) {
    const p = merged[merged.length - 1];
    // Sem ataque novo (mais fraca que a anterior) e colada nela: é a mesma nota cortada pelo detector.
    if (p && p.midi === n.midi && n.startSec - (p.startSec + p.durSec) < 0.03 && (n.velocity ?? 100) <= (p.velocity ?? 100) * 0.8) {
      merged[merged.length - 1] = { ...p, durSec: Math.max(p.durSec, n.startSec + n.durSec - p.startSec) };
    } else merged.push(n);
  }
  out = merged;
  // 3. oitava isolada
  out = out.map((n, i) => {
    const a = out[i - 1];
    const b = out[i + 1];
    if (!a || !b) return n;
    for (const d of [12, -12]) {
      const m = n.midi - d;
      if (Math.abs(m - a.midi) <= 7 && Math.abs(m - b.midi) <= 7 && Math.abs(n.midi - a.midi) > 9 && Math.abs(n.midi - b.midi) > 9) return { ...n, midi: m };
    }
    return n;
  });
  // 4. grade de semicolcheias
  if (beats.length >= 2) {
    out = out.map((n) => {
      let k = 0;
      while (k + 1 < beats.length && beats[k + 1]! <= n.startSec) k++;
      const a = Math.min(k, beats.length - 2);
      const step = (beats[a + 1]! - beats[a]!) / 4;
      const q = beats[a]! + Math.round((n.startSec - beats[a]!) / step) * step;
      return Math.abs(q - n.startSec) <= step * 0.3 ? { ...n, startSec: q, durSec: Math.max(0.03, n.durSec + (n.startSec - q)) } : n;
    });
  }
  return out;
}
