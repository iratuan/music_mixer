"""
Avaliação da transcrição do baixo (bf_tools.py midi) com verdade conhecida.

Gera uma linha de baixo sintética (timbre de corda dedilhada, do Mi grave E1 ao Sol G3, com notas
repetidas, saltos de oitava estilo funk, notas curtas e longas), roda a transcrição de verdade e
compara nota a nota (critério do mir_eval): ataque a até 50 ms e altura exata.
  - precisão: das notas detectadas, quantas existem;
  - revocação: das notas tocadas, quantas foram achadas;
  - erros de oitava e de altura (ataque certo, nota errada).
Uso: tooling/stems/.venv/Scripts/python.exe -I tooling/fixtures/eval-bass.py [pasta] [semente]
"""
import json
import os
import sys
import tempfile

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "stems"))
import bf_tools  # noqa: E402

SR = 44100
BPM = 104.0
BEAT = 60.0 / BPM


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pluck(m, dur, vel, rng):
    """Corda dedilhada: fundamental fraca no grave, harmônicos fortes, decaimento por parcial."""
    f = hz(m)
    n = int((dur + 0.08) * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k in range(1, 12):
        fk = f * k * (1 + 0.0004 * k * k)  # leve inarmonicidade
        if fk > 5000:
            break
        amp = (1.0 / k) * (0.55 if k == 1 and m < 36 else 1.0)
        y += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t * (1.2 + 0.9 * k))
    att = np.minimum(1, t / 0.004)
    rel = np.clip((dur + 0.08 - t) / 0.08, 0, 1)  # abafa no fim da nota
    return (y * att * rel * vel).astype(np.float32)


def line(rng):
    """(início em tempos, duração em tempos, midi). Frases variadas, 2 compassos cada."""
    phrases = [
        # Mi grave, oitavas (funk)
        [(0, 0.5, 28), (0.5, 0.5, 40), (1, 0.5, 28), (1.5, 0.5, 40), (2, 0.5, 31), (2.5, 0.5, 33), (3, 1, 35)],
        # Lá: semínimas repetidas
        [(0, 1, 33), (1, 1, 33), (2, 1, 33), (3, 1, 33)],
        # escala de Dó subindo, colcheias
        [(i * 0.5, 0.5, m) for i, m in enumerate([36, 38, 40, 41, 43, 45, 47, 48])],
        # Ré: notas longas e agudas
        [(0, 2, 38), (2, 1, 50), (3, 1, 55)],
        # semicolcheias repetidas em Sol (galope)
        [(i * 0.25, 0.25, 31) for i in range(8)] + [(2, 0.5, 43), (2.5, 0.5, 41), (3, 1, 38)],
        # cromático descendo
        [(i * 0.5, 0.5, m) for i, m in enumerate([45, 44, 43, 42, 41, 40, 39, 38])],
        # Si bemol / Fá (grave, longas)
        [(0, 1.5, 34), (1.5, 0.5, 34), (2, 1.5, 29), (3.5, 0.5, 41)],
        # mistura com pausas
        [(0, 0.5, 40), (1, 0.5, 43), (1.5, 0.5, 45), (2.5, 0.5, 47), (3, 0.75, 52)],
    ]
    out = []
    beat = 4.0
    for rep in range(2):
        for ph in phrases:
            for s, d, m in ph:
                out.append((beat + s, d * 0.92, m))
            beat += 4
    return out


def render(seed):
    rng = np.random.default_rng(seed)
    notes = line(rng)
    total = (notes[-1][0] + 4) * BEAT
    y = np.zeros(int(total * SR) + SR, np.float32)
    truth = []
    for s, d, m in notes:
        t0 = s * BEAT + rng.normal(0, 0.006)
        dur = d * BEAT
        v = rng.uniform(0.5, 0.9)
        p = pluck(m, dur, v, rng)
        i = int(t0 * SR)
        y[i : i + len(p)] += p[: len(y) - i]
        truth.append((t0, t0 + dur, m))
    y += rng.normal(0, 0.002, len(y)).astype(np.float32)  # resíduo de separação
    y /= max(1e-6, np.abs(y).max()) / 0.8
    return np.stack([y, y], axis=1), truth


def score(truth, det, tol=0.05):
    used = set()
    tp = octave = wrong = 0
    for s, _, m in truth:
        best = None
        for j, (ds, _, dm) in enumerate(det):
            if j in used or abs(ds - s) > tol:
                continue
            if best is None or abs(ds - s) < abs(det[best][0] - s) or (dm == m and det[best][2] != m):
                best = j
        if best is None:
            continue
        used.add(best)
        dm = det[best][2]
        if dm == m:
            tp += 1
        elif (dm - m) % 12 == 0:
            octave += 1
        else:
            wrong += 1
    return {
        "precisao": round(tp / max(1, len(det)), 3),
        "revocacao": round(tp / max(1, len(truth)), 3),
        "f1": round(2 * tp / max(1, len(det) + len(truth)), 3),
        "notas": f"{len(det)} detectadas / {len(truth)} tocadas",
        "oitava_errada": octave,
        "altura_errada": wrong,
        "perdidas_ou_ataque_fora": len(truth) - tp - octave - wrong,
        "sobrando": len(det) - len(used),
    }


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix="bf-bass-")
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    os.makedirs(out_dir, exist_ok=True)
    y, truth = render(seed)
    wav = os.path.join(out_dir, "bass.wav")
    sf.write(wav, y, SR, subtype="FLOAT")
    mid = os.path.join(out_dir, "bass.mid")
    bf_tools.progress = lambda p: None
    bf_tools.to_midi(wav, "bass", mid, 0, BPM)
    import pretty_midi

    det = sorted((n.start, n.end, n.pitch) for n in pretty_midi.PrettyMIDI(mid).instruments[0].notes)
    print(json.dumps(score(truth, det), ensure_ascii=False))


if __name__ == "__main__":
    main()
