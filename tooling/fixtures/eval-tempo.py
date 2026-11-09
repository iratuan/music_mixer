"""
Avaliação dos tempos e compassos (bf_tools.py analyze) com andamento variável e verdade conhecida.

Gera bateria (bumbo no 1 e 3, caixa no 2 e 4, chimbal em colcheias) e baixo (fundamental no 1 e 3)
seguindo uma curva de andamento, roda a análise de verdade e mede:
  - tempos: F1 com tolerância de 70 ms (padrão MIREX);
  - compassos: % dos inícios de compasso verdadeiros com um compasso detectado a até 70 ms;
  - deriva: maior distância entre um tempo verdadeiro e o detectado mais próximo (pior caso).
Perfis: constante, acelerando (96 → 120), ao vivo (oscila ±4%), mudança de seção (100 → 112 → 100).
Saltos maiores que ~15% entre seções não são seguidos (ver track_beats em bf_tools.py).
Uso: tooling/stems/.venv/Scripts/python.exe -I tooling/fixtures/eval-tempo.py [perfil|todos] [semente]
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
BARS = 48


def tempo_curve(profile, n_beats, rng):
    k = np.arange(n_beats)
    if profile == "constante":
        return np.full(n_beats, 120.0)
    if profile == "acelerando":
        return 96 + 24 * k / (n_beats - 1)
    if profile == "ao-vivo":
        walk = np.cumsum(rng.normal(0, 0.6, n_beats))
        walk -= np.linspace(walk[0], walk[-1], n_beats)  # sem tendência
        return 108 * (1 + np.clip(walk, -4, 4) / 100)
    if profile == "secoes":
        bar = k // 4
        return np.where((bar >= 16) & (bar < 32), 112.0, 100.0)
    raise SystemExit(f"perfil desconhecido: {profile}")


def hit(kind, rng):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    if kind == "kick":
        f = 50 + 90 * np.exp(-t * 40)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18)
    if kind == "snare":
        return rng.standard_normal(n) * np.exp(-t * 28) * 0.6 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.4
    return rng.standard_normal(n) * np.exp(-t * 90) * 0.18  # chimbal


def render(profile, seed):
    rng = np.random.default_rng(seed)
    n_beats = BARS * 4
    bpm = tempo_curve(profile, n_beats, rng)
    beats = 1.0 + np.concatenate([[0], np.cumsum(60.0 / bpm[:-1])])
    total = beats[-1] + 3
    drums = np.zeros(int(total * SR), np.float32)
    bass = np.zeros_like(drums)
    roots = [33, 33, 38, 40, 36, 31, 33, 40]  # A D E C G… por compasso
    for i, t0 in enumerate(beats):
        j = int(t0 * SR)
        parts = ["kick" if i % 2 == 0 else "snare"]
        for p in parts:
            h = hit(p, rng)
            drums[j : j + len(h)] += h[: len(drums) - j]
        # chimbal em colcheias
        half = (beats[i + 1] - t0) / 2 if i + 1 < len(beats) else 60 / bpm[i] / 2
        for off in (0, half):
            jj = int((t0 + off) * SR)
            h = hit("hat", rng)
            drums[jj : jj + len(h)] += h[: len(drums) - jj]
        if i % 2 == 0:
            m = roots[(i // 4) % len(roots)]
            f = 440 * 2 ** ((m - 69) / 12)
            dur = 60 / bpm[i] * 1.8
            tt = np.arange(int(dur * SR)) / SR
            y = sum((0.6**k) * np.sin(2 * np.pi * f * (k + 1) * tt) for k in range(4)) * np.exp(-tt * 1.5) * 0.4
            bass[j : j + len(y)] += y[: len(bass) - j].astype(np.float32)
    return {"drums": drums, "bass": bass}, beats, bpm


def f1(truth, det, tol=0.07):
    det = np.asarray(det)
    used = set()
    hits = 0
    for t in truth:
        if not len(det):
            break
        k = int(np.argmin(np.abs(det - t)))
        if abs(det[k] - t) <= tol and k not in used:
            used.add(k)
            hits += 1
    p = hits / max(1, len(det))
    r = hits / max(1, len(truth))
    return 2 * p * r / max(1e-9, p + r)


def run(profile, seed, out_root):
    out_dir = os.path.join(out_root, profile)
    os.makedirs(out_dir, exist_ok=True)
    stems, beats, bpm = render(profile, seed)
    for k, v in stems.items():
        sf.write(os.path.join(out_dir, f"{k}.wav"), v / max(1e-6, np.abs(v).max()) * 0.8, SR, subtype="FLOAT")
    out = os.path.join(out_dir, "analise.json")
    bf_tools.progress = lambda p: None
    bf_tools.analyze(out_dir, out)
    a = json.load(open(out, encoding="utf-8"))
    det = np.array(a["beats"])
    downs = np.array([b["start"] for b in a["bars"]])
    true_downs = beats[::4]
    bar_ok = np.mean([np.min(np.abs(downs - t)) <= 0.07 for t in true_downs]) if len(downs) else 0.0
    drift = max(float(np.min(np.abs(det - t))) for t in beats) if len(det) else 99.0
    return {
        "perfil": profile,
        "andamento": f"{bpm.min():.0f}–{bpm.max():.0f}",
        "bpm_detectado": a["bpm"],
        "faixa_detectada": a.get("tempo", {}).get("range"),
        "tempos_f1": round(f1(beats, det), 3),
        "compassos": round(float(bar_ok), 3),
        "pior_desvio_ms": round(drift * 1000),
    }


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "todos"
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    out_root = tempfile.mkdtemp(prefix="bf-tempo-")
    profiles = ["constante", "acelerando", "ao-vivo", "secoes"] if which == "todos" else [which]
    for p in profiles:
        print(json.dumps(run(p, seed, out_root), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
