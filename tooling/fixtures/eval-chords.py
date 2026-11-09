"""
Avaliação dos acordes da análise (bf_tools.py analyze) com verdade conhecida.

Gera faixas sintéticas de uma progressão com tipos variados de acorde (maior, menor, 7, m7, maj7,
sus2, sus4, dim, m7b5 e inversões), roda a análise de verdade e compara, tempo a tempo:
  - fundamental certa;
  - acorde certo (fundamental + tipo);
  - baixo certo nas inversões.
Uso: tooling/runtime/python/python.exe -I tooling/fixtures/eval-chords.py [pasta de saída]
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

SR = 22050
BPM = 100.0
BEAT = 60.0 / BPM
NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
SHAPES = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11], "sus2": [0, 2, 7], "sus4": [0, 5, 7], "dim": [0, 3, 6], "m7b5": [0, 3, 6, 10]}

# (fundamental, tipo, baixo ou None) — 2 compassos cada
PROG = [
    (0, "", None), (0, "maj7", None), (9, "m", None), (5, "maj7", None),
    (7, "7", None), (7, "sus4", None), (7, "", None), (0, "", 4),
    (2, "m7", None), (11, "m7b5", None), (4, "7", None), (9, "m", None),
    (9, "sus2", None), (5, "", 9), (7, "", 11), (11, "dim", None),
    (0, "", None), (2, "m", None), (2, "sus4", None), (7, "7", None),
]
BARS_PER = 2


def tone(f, dur, sr, partials=6, decay=1.8):
    t = np.arange(int(dur * sr)) / sr
    y = sum((0.6 ** k) * np.sin(2 * np.pi * f * (k + 1) * t) for k in range(partials))
    return (y * np.exp(-decay * t)).astype(np.float32)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def render(seed=0):
    rng = np.random.default_rng(seed)
    total_beats = len(PROG) * BARS_PER * 4 + 4
    n = int((total_beats * BEAT + 1) * SR)
    piano = np.zeros(n, np.float32)
    bass = np.zeros(n, np.float32)
    drums = np.zeros(n, np.float32)
    truth = []
    beat = 4  # um compasso de contagem antes
    for root, q, b in PROG:
        tones = [(root + k) % 12 for k in SHAPES[q]]
        bass_pc = root if b is None else b
        for k in range(BARS_PER * 4):
            t0 = int((beat + k) * BEAT * SR)
            # piano: acorde fechado em torno de Dó 4, reataca a cada tempo
            for pc in tones:
                m = 60 + pc if pc >= 0 else 60
                if m > 71:
                    m -= 12
                y = tone(hz(m), BEAT * 1.2, SR) * 0.18
                piano[t0 : t0 + len(y)] += y[: max(0, n - t0)]
            # baixo: nota no 1 e no 3 (oitava 2)
            if k % 2 == 0:
                y = tone(hz(36 + bass_pc if bass_pc >= 4 else 48 + bass_pc), BEAT * 2, SR, partials=4, decay=1.2) * 0.5
                bass[t0 : t0 + len(y)] += y[: max(0, n - t0)]
            truth.append({"t": (beat + k) * BEAT, "root": root, "quality": q, "bass": bass_pc})
        beat += BARS_PER * 4
    # bateria: bumbo no 1 e 3, caixa no 2 e 4 (ruído curto), em todos os tempos desde o início
    for k in range(total_beats):
        t0 = int(k * BEAT * SR)
        if k % 2 == 0:
            y = tone(55, 0.15, SR, partials=2, decay=25) * 0.9
        else:
            y = (rng.standard_normal(int(0.08 * SR)) * np.exp(-np.arange(int(0.08 * SR)) / (0.02 * SR))).astype(np.float32) * 0.4
        drums[t0 : t0 + len(y)] += y[: max(0, n - t0)]
    return {"piano": piano, "bass": bass, "drums": drums}, truth


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix="bf-chords-")
    os.makedirs(out_dir, exist_ok=True)
    stems, truth = render()
    for name, y in stems.items():
        sf.write(os.path.join(out_dir, f"{name}.wav"), y, SR, subtype="FLOAT")
    out = os.path.join(out_dir, "analise.json")
    bf_tools.progress = lambda p: None
    bf_tools.analyze(out_dir, out)
    a = json.load(open(out, encoding="utf-8"))
    tuning_shift = 0
    # rótulo detectado em cada instante de verdade
    flat = []
    for b in a["bars"]:
        for c in b["chords"]:
            flat.append((c["start"], c.get("chord")))
    flat.sort(key=lambda x: x[0])

    def at(t):
        cur = None
        for s, c in flat:
            if s <= t + 0.05:
                cur = c
            else:
                break
        return cur

    ok_root = ok_full = n = 0
    inv_total = inv_ok = 0
    per_q = {}
    for tr in truth:
        c = at(tr["t"] + BEAT * 0.5)
        n += 1
        q = tr["quality"]
        per_q.setdefault(q, [0, 0])
        per_q[q][1] += 1
        if c and c["root"] == tr["root"]:
            ok_root += 1
            if c["quality"] == q:
                ok_full += 1
                per_q[q][0] += 1
        if tr["bass"] != tr["root"]:
            inv_total += 1
            if c and c.get("bass", c["root"]) == tr["bass"] and c["root"] == tr["root"]:
                inv_ok += 1
    print(json.dumps({
        "bpm": a["bpm"],
        "fundamental": round(ok_root / n, 3),
        "acorde_completo": round(ok_full / n, 3),
        "inversoes": f"{inv_ok}/{inv_total} tempos",
        "por_tipo": {k or "maior": f"{v[0]}/{v[1]}" for k, v in per_q.items()},
    }, ensure_ascii=False))
    seq = []
    for s, c in flat:
        lab = "N" if not c else NAMES[c["root"]] + c["quality"] + (f"/{NAMES[c['bass']]}" if c.get("bass") is not None and c.get("bass") != c["root"] else "")
        if not seq or seq[-1] != lab:
            seq.append(lab)
    print("detectado:", " ".join(seq))
    print("verdade:  ", " ".join(NAMES[r] + q + (f"/{NAMES[b]}" if b is not None else "") for r, q, b in PROG))


if __name__ == "__main__":
    main()
