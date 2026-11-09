"""
Baixaria Fina — ferramentas de análise que rodam no Python do separador.

  python bf_tools.py analyze <pasta-das-faixas> <saida.json>
  python bf_tools.py midi <faixa.wav> <nome-da-faixa> <saida.mid> [--transpose N] [--bpm X]

analyze: andamento, tempos, início do compasso (4/4), acorde por tempo/compasso, tom geral e tom de cada
compasso, a partir das faixas separadas pelo Demucs (htdemucs_6s).
  - Tempos: força de ataque da bateria (ou da mistura, se a bateria for fraca), beat tracking do librosa.
  - Compasso: das 4 fases possíveis, a que concentra bumbo, ataques do baixo e trocas de harmonia.
  - Harmonia: cromagrama CQT (com estimativa de afinação) das faixas harmônicas sem bateria; o cromagrama
    da faixa de baixo dá a fundamental. Acordes por tempo com suavização de Viterbi.
  - Tom: perfis de Krumhansl–Kessler; geral na música toda; por compasso numa janela de ±4 compassos,
    suavizada por Viterbi (trocar de tom custa caro: modulação, não acorde de passagem).
midi: Basic Pitch (Spotify, Apache 2.0) com modelo ONNX; ajustes por faixa (baixo e voz monofônicos).
stems: monta as faixas escolhidas pelo usuário a partir das 6 do Demucs. As não escolhidas viram
  "rest" (soma, nada se perde). Voz principal/backing: modelo de karaokê Mel-Roformer (audio-separator).

  python bf_tools.py stems <pasta-demucs> <pasta-saida> --keep bass,drums,lead,backing --models <pasta>

Saída de progresso em stderr: linhas "PROGRESS <0-100>".
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

import numpy as np  # noqa: E402

SR = 22050
HOP = 512
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def progress(p: float) -> None:
    print(f"PROGRESS {int(max(0, min(100, p)))}", file=sys.stderr, flush=True)


# ------------------------------------------------------------------ análise
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

QUALITIES = [
    ("", [0, 4, 7]),
    ("m", [0, 3, 7]),
    ("7", [0, 4, 7, 10]),
    ("m7", [0, 3, 7, 10]),
]


# Tipos refinados depois da sequência principal (que só decide entre maior, menor, 7 e m7).
EXTENDED = {
    "": ["", "maj7", "sus4", "sus2"],
    "m": ["m", "dim", "sus2", "sus4"],
    "7": ["7", "sus4"],
    "m7": ["m7", "m7b5"],
}
SHAPES = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10], "maj7": [0, 4, 7, 11], "sus2": [0, 2, 7], "sus4": [0, 5, 7], "dim": [0, 3, 6], "m7b5": [0, 3, 6, 10]}


def _refine_window(r, q, beats_h, b, margin=0.0):
    """Regras musicais (não "melhor encaixe"), para a melodia não inventar extensões:
    - sus2/sus4: a terça some (fraca) e a 2ª/4ª está presente;
    - maj7 (e a 7 menor que já vem da base): a sétima soa na maioria dos tempos da janela;
    - dim/m7b5: a quinta justa some e a quinta diminuta está presente.
    `beats_h`: perfil (12) de cada tempo da janela, só do acompanhamento (sem a voz)."""
    h = beats_h.sum(axis=0)
    if h.max() <= 0:
        return (r, q, r)
    v = h / h.max()
    pc = lambda k: (r + k) % 12  # noqa: E731
    vb = beats_h / (beats_h.max(axis=1, keepdims=True) + 1e-9)
    present = lambda k, thr=0.45: float(np.mean(vb[:, pc(k)] >= thr))  # noqa: E731 — fração dos tempos
    third = 3 if q.startswith("m") else 4
    core = (v[pc(0)] + v[pc(7)]) / 2
    out_q = q
    if q in ("", "m", "7") and v[pc(3)] < 0.22 * core and v[pc(4)] < 0.22 * core:
        # sem terça: sus4 ou sus2 (a que estiver mais forte e presente)
        if v[pc(5)] >= 0.5 * core and present(5) >= 0.6 and v[pc(5)] >= v[pc(2)]:
            out_q = "sus4"
        elif v[pc(2)] >= 0.5 * core and present(2) >= 0.6:
            out_q = "sus2"
    elif q == "" and v[pc(11)] >= 0.5 * core and present(11) >= 0.7 and v[pc(11)] > 1.6 * v[pc(10)] and v[pc(third)] >= 0.3 * core:
        out_q = "maj7"
    elif q in ("m", "m7") and v[pc(7)] < 0.3 * (v[pc(0)] + v[pc(3)]) / 2 and v[pc(6)] >= 0.5 * (v[pc(0)] + v[pc(3)]) / 2 and present(6) >= 0.6:
        out_q = "m7b5" if q == "m7" or (v[pc(10)] >= 0.5 * v[pc(0)] and present(10) >= 0.6) else "dim"
    tones = [pc(k) for k in SHAPES[out_q]]
    bass_pc = r
    if b.max() > 0:
        top = int(np.argmax(b))
        if top != r and top in tones and b[top] > 2.0 * b[r]:
            bass_pc = top
    return (r, out_q, bass_pc)


def refine_chords(path, labels, beat_r, beat_b, window=4):
    """Refina cada trecho contínuo do mesmo acorde, em janelas de `window` tempos a partir do
    começo do trecho (C → Cmaj7, G → Gsus4 dentro do mesmo trecho também aparecem):
    - tipo: maj7, sus2, sus4, dim, m7b5 quando o perfil casa melhor (por uma margem) que o tipo base;
    - inversão: o baixo numa nota do acorde que não é a fundamental (C/E).
    Onde cada acorde começa continua vindo da sequência principal; só se divide um trecho quando o
    tipo ou o baixo mudam de uma janela para outra.
    Devolve, por tempo, (fundamental, tipo, baixo) ou None."""
    out = [None] * len(path)
    i = 0
    n_none = len(labels)
    while i < len(path):
        j = i
        while j < len(path) and path[j] == path[i]:
            j += 1
        c = int(path[i])
        if c != n_none:
            r, q = labels[c]
            # Janelas curtas no fim do trecho juntam-se à anterior (pouca evidência).
            starts = list(range(i, j, window))
            if len(starts) > 1 and j - starts[-1] < window // 2 + 1:
                starts.pop()
            bounds = starts + [j]
            for w0, w1 in zip(bounds[:-1], bounds[1:]):
                lab = _refine_window(r, q, beat_r[w0:w1], beat_b[w0:w1].sum(axis=0))
                for k in range(w0, w1):
                    out[k] = lab
        i = j
    return out


def key_scores(chroma: np.ndarray) -> np.ndarray:
    """Correlação com os 24 perfis (0–11 maior, 12–23 menor)."""
    out = np.zeros(24)
    c = chroma - chroma.mean()
    cn = np.linalg.norm(c) + 1e-9
    for t in range(12):
        for m, prof in enumerate((KS_MAJOR, KS_MINOR)):
            p = np.roll(prof, t)
            p = p - p.mean()
            out[m * 12 + t] = float(np.dot(c, p) / (cn * np.linalg.norm(p)))
    return out


def viterbi(log_emit: np.ndarray, switch_cost: float) -> np.ndarray:
    """log_emit: (T, S). Custo fixo para trocar de estado."""
    T, S = log_emit.shape
    score = log_emit[0].copy()
    back = np.zeros((T, S), dtype=np.int32)
    for t in range(1, T):
        best_prev = int(np.argmax(score))
        stay = score
        move = score[best_prev] - switch_cost
        choose_move = move > stay
        back[t] = np.where(choose_move, best_prev, np.arange(S))
        score = np.where(choose_move, move, stay) + log_emit[t]
    path = np.zeros(T, dtype=np.int32)
    path[-1] = int(np.argmax(score))
    for t in range(T - 1, 0, -1):
        path[t - 1] = back[t, path[t]]
    return path


def stem_file(folder: str, name: str):
    """Faixa `name` na pasta, em FLAC (biblioteca compactada) ou WAV (antes de compactar)."""
    for ext in (".flac", ".wav"):
        p = os.path.join(folder, name + ext)
        if os.path.exists(p):
            return p
    return None


def load(path: str):
    import librosa

    y, _ = librosa.load(path, sr=SR, mono=True)
    return y


LOCAL_MIN, LOCAL_MAX = 0.85, 1.18
VARIABLE_TEMPO = 0.03  # variação (p5–p95 / mediana) a partir da qual o andamento é tratado como variável


def dp_beats(onset_env, period, tightness: float = 100.0):
    """Programação dinâmica de Ellis (2007) com período por quadro.

    cum[t] = local[t] + max_k ( cum[t-k] - tightness · log(k / período[t])² ), k entre ½ e 2 períodos.
    O período esperado muda com o andamento local: segue acelerações e mudanças de seção.
    """
    env = onset_env / max(1e-9, float(onset_env.std()))
    p_med = float(np.median(period))
    # Pontuação local: ataques suavizados por uma gaussiana estreita (~1/32 do período).
    half = int(round(p_med))
    win = np.exp(-0.5 * (np.arange(-half, half + 1) * 32.0 / p_med) ** 2)
    local = np.convolve(env, win, mode="same")
    n = len(local)
    cum = np.zeros(n)
    back = np.full(n, -1, dtype=int)
    for t in range(n):
        p = period[t]
        lo, hi = int(round(p / 2)), int(round(2 * p))
        if t - lo < 0:
            cum[t] = local[t]
            continue
        ks = np.arange(lo, min(hi, t) + 1)
        cand = cum[t - ks] - tightness * np.log(ks / p) ** 2
        j = int(np.argmax(cand))
        if cand[j] > 0:
            cum[t] = local[t] + cand[j]
            back[t] = t - ks[j]
        else:
            cum[t] = local[t]
    # Último tempo: o maior acumulado entre os máximos locais do fim (último período e meio).
    tail = int(round(1.5 * period[-1]))
    end = n - tail + int(np.argmax(cum[n - tail :]))
    beats = [end]
    while back[beats[-1]] >= 0:
        beats.append(back[beats[-1]])
    beats = np.array(beats[::-1], dtype=int)
    # Corta tempos fracos nas pontas (silêncio antes/depois da música).
    if len(beats) > 8:
        strength = local[beats]
        thr = 0.5 * float(np.sqrt(np.mean(strength**2)))
        keep = np.nonzero(strength >= thr)[0]
        if len(keep):
            beats = beats[keep[0] : keep[-1] + 1]
    return beats


def track_beats(onset_env, fixed: bool = False):
    """Tempos da música, aceitando andamento que muda (gravação ao vivo, acelerando, seções).

    1. Andamento global com prior de 0,7 oitava em torno de 110: fixa a "oitava" (sem travar no
       chimbal em colcheias nem na metade).
    2. Andamento local: autocorrelação em janelas de 6 s, na mesma oitava do global, entre −15% e
       +18% dele, e alisado (mediana de ~6 s) para não seguir cada virada da bateria.
    3. Se o local varia menos de 3%, é constante: beat tracking do librosa com um andamento só
       (o mais estável). Senão, programação dinâmica própria com o período seguindo a curva
       (o andamento por quadro do librosa, testado, não acompanha mudanças de seção).
    `fixed`: só o rastreador constante (escolha do usuário quando a grade variável não convence).
    Devolve os quadros dos tempos e um resumo do andamento.
    """
    import librosa
    from scipy.ndimage import median_filter

    glob = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=onset_env, sr=SR, hop_length=HOP, start_bpm=110, std_bpm=0.7))[0])
    _, const_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=SR, hop_length=HOP, start_bpm=glob, tightness=100)
    const_frames = np.asarray(const_frames, dtype=int)
    if len(const_frames) < 8:
        return const_frames, {"variable": False}
    # Referência: o andamento que o rastreador constante seguiu (mais firme que a estimativa global),
    # se concordar com ela; se não (travou em colcheias num trecho acelerando), vale a global.
    const_bpm = 60.0 * SR / HOP / float(np.median(np.diff(const_frames)))
    ref = const_bpm if abs(const_bpm / glob - 1) <= 0.2 else glob
    if fixed:
        return const_frames, {"variable": False, "mode": "fixed"}
    local = librosa.feature.tempo(onset_envelope=onset_env, sr=SR, hop_length=HOP, start_bpm=ref, std_bpm=1.0, ac_size=6.0, aggregate=None)
    local = np.asarray(local, dtype=float).reshape(-1)[: len(onset_env)]
    # Mesma oitava da referência: dobra/corta até ficar a menos de √2 dela.
    for _ in range(3):
        local = np.where(local > ref * 1.41, local / 2, local)
        local = np.where(local < ref / 1.41, local * 2, local)
    # Faixa de −15% a +18% da referência: deriva de show e aceleração gradual. Saltos maiores entre
    # seções não são seguidos: no áudio eles se confundem com relações métricas (3:4 = 0,75, síncope,
    # meio tempo) e a curva escorregaria para elas (medido em O Tempo, ao vivo: 117 → "86" na introdução).
    local = np.clip(local, ref * LOCAL_MIN, ref * LOCAL_MAX)
    win = max(3, int(6.0 * SR / HOP) | 1)
    local = median_filter(local, size=win, mode="nearest")
    p5, p50, p95 = np.percentile(local, [5, 50, 95])
    variable = (p95 - p5) / max(1e-6, p50) >= VARIABLE_TEMPO
    if not variable:
        return const_frames, {"variable": False}
    # Suspeita de andamento variável: a estimativa local é ruidosa (um passo de autocorrelação
    # já é ~5% a 120 BPM), então os dois rastreadores concorrem. Fica o variável só se cair
    # claramente mais em cima dos ataques (≥ 4% melhor); música de estúdio segue no constante.
    var_frames = dp_beats(onset_env, 60.0 * SR / HOP / local)
    if len(var_frames) < 8:
        return const_frames, {"variable": False}
    sc_const, sc_var = beat_fit(onset_env, const_frames), beat_fit(onset_env, var_frames)
    if sc_var >= 1.04 * sc_const:
        return var_frames, {"variable": True, "fit": [round(sc_const, 3), round(sc_var, 3)]}
    return const_frames, {"variable": False, "fit": [round(sc_const, 3), round(sc_var, 3)]}


def beat_fit(onset_env, frames):
    """Quão em cima dos ataques os tempos caem: média do maior ataque a ±2 quadros (±46 ms) de
    cada tempo, sobre a média geral."""
    env = onset_env / max(1e-9, float(onset_env.mean()))
    n = len(env)
    vals = [env[max(0, f - 2) : min(n, f + 3)].max() for f in frames if 0 <= f < n]
    return float(np.mean(vals)) if vals else 0.0


def tempo_summary(beat_times, variable: bool):
    """Andamento para mostrar: mediana, faixa (p5–p95) e curva por compasso de 4 tempos."""
    ibi = np.diff(beat_times)
    if len(ibi) < 4:
        return {"variable": False}
    inst = 60.0 / ibi
    k = max(3, min(9, len(inst) // 8) | 1)
    from scipy.ndimage import median_filter

    smooth = median_filter(inst, size=k, mode="nearest")
    lo, hi = np.percentile(smooth, [5, 95])
    variable = variable and (hi - lo) / np.median(smooth) >= VARIABLE_TEMPO
    out = {"variable": bool(variable), "range": [round(float(lo), 1), round(float(hi), 1)]}
    if variable:
        out["curve"] = [[round(float(beat_times[i]), 2), round(float(smooth[i]), 1)] for i in range(0, len(smooth), 4)]
    return out


def analyze(stems_dir: str, out_path: str, tempo_mode: str = "auto") -> None:
    import librosa

    progress(2)
    names = ["bass", "drums", "guitar", "piano", "vocals", "other"]
    ys = {}
    for i, n in enumerate(names):
        p = stem_file(stems_dir, n)
        if p:
            ys[n] = load(p)
        progress(2 + 3 * (i + 1))
    if not ys:
        raise SystemExit("nenhuma faixa encontrada")
    length = max(len(v) for v in ys.values())

    def get(n):
        v = ys.get(n)
        if v is None:
            return np.zeros(length, dtype=np.float32)
        return np.pad(v, (0, length - len(v)))

    bass, drums = get("bass"), get("drums")
    harm = get("guitar") + get("piano") + get("other") + 0.5 * get("vocals")
    mix = harm + bass + drums
    duration = length / SR

    # 1) Tempos
    rms = lambda v: float(np.sqrt(np.mean(v**2)) + 1e-12)  # noqa: E731
    drums_ok = rms(drums) > 0.15 * rms(mix)
    beat_src = drums if drums_ok else mix
    onset_env = librosa.onset.onset_strength(y=beat_src, sr=SR, hop_length=HOP, aggregate=np.median)
    progress(30)
    beat_frames, tempo_info = track_beats(onset_env, fixed=tempo_mode == "fixed")
    if len(beat_frames) < 8:
        raise SystemExit("não foi possível detectar os tempos da música")
    # Metade do andamento? Se os pontos entre os tempos têm ataques quase tão fortes quanto os tempos
    # (caixa no contratempo do rock lido pela metade), os tempos reais são o dobro: intercala os pontos
    # médios. Medido só abaixo de 4 kHz (bumbo e caixa): chimbal em colcheias numa balada não conta.
    if 60.0 * SR / HOP / np.median(np.diff(beat_frames)) < 96:
        low_env = librosa.onset.onset_strength(y=beat_src, sr=SR, hop_length=HOP, aggregate=np.median, fmax=4000)
        mids = ((beat_frames[:-1] + beat_frames[1:]) // 2).astype(int)
        on_beats = float(np.mean(low_env[beat_frames]))
        on_mids = float(np.mean(low_env[mids]))
        if on_mids > 0.8 * on_beats:
            beat_frames = np.sort(np.concatenate([beat_frames, mids]))
    beat_times = librosa.frames_to_time(beat_frames, sr=SR, hop_length=HOP)
    # Andamento pela mediana dos intervalos (mais estável que a estimativa global).
    ibi = np.diff(beat_times)
    bpm = float(60.0 / np.median(ibi))
    progress(40)

    # 2) Cromagramas (afinação estimada pelo próprio CQT)
    # Afinação em frações de semitom; o CQT com 36 bins por oitava espera frações do próprio bin (×3).
    tuning = float(librosa.estimate_tuning(y=harm + bass, sr=SR, bins_per_octave=12))
    chroma_h = librosa.feature.chroma_cqt(y=harm, sr=SR, hop_length=HOP, tuning=tuning * 3, bins_per_octave=36, n_octaves=6, fmin=librosa.note_to_hz("C2"))
    progress(60)
    chroma_b = librosa.feature.chroma_cqt(y=bass, sr=SR, hop_length=HOP, tuning=tuning * 3, bins_per_octave=36, n_octaves=3, fmin=librosa.note_to_hz("E1"))
    progress(72)
    energy_h = librosa.feature.rms(y=harm, hop_length=HOP)[0]
    energy_b = librosa.feature.rms(y=bass, hop_length=HOP)[0]
    n = min(chroma_h.shape[1], chroma_b.shape[1], len(energy_h), len(energy_b))
    chroma_h, chroma_b, energy_h, energy_b = chroma_h[:, :n], chroma_b[:, :n], energy_h[:n], energy_b[:n]

    bf = beat_frames[beat_frames < n]
    bounds = np.concatenate([bf, [n]])
    beat_h = np.zeros((len(bf), 12))
    beat_b = np.zeros((len(bf), 12))
    beat_e = np.zeros(len(bf))
    for i in range(len(bf)):
        a, b = int(bounds[i]), int(max(bounds[i] + 1, bounds[i + 1]))
        beat_h[i] = np.median(chroma_h[:, a:b], axis=1) * np.mean(energy_h[a:b])
        beat_b[i] = np.median(chroma_b[:, a:b], axis=1) * np.mean(energy_b[a:b])
        beat_e[i] = np.mean(energy_h[a:b]) + np.mean(energy_b[a:b])

    # 3) Acordes por tempo
    templates = []
    labels = []
    for root in range(12):
        for q, ints in QUALITIES:
            t = np.zeros(12)
            for k in ints:
                t[(root + k) % 12] = 1.0
            templates.append(t / np.linalg.norm(t))
            labels.append((root, q))
    templates = np.array(templates)
    silence = np.percentile(beat_e, 10) * 1.5 + 1e-9
    emit = np.zeros((len(bf), len(labels) + 1))
    for i in range(len(bf)):
        h = beat_h[i] + 0.6 * beat_b[i]
        hn = h / (np.linalg.norm(h) + 1e-9)
        bn = beat_b[i] / (beat_b[i].max() + 1e-9)
        cos = templates @ hn
        roots = np.array([r for r, _ in labels])
        sevenths = np.array([len(QUALITIES[[q for q, _ in QUALITIES].index(qq)][1]) == 4 for _, qq in labels])
        score = cos + 0.12 * bn[roots] - 0.05 * sevenths
        emit[i, :-1] = score
        emit[i, -1] = 0.55 if beat_e[i] < silence else 0.0  # "N": sem acorde (silêncio)
    chord_path = viterbi(emit * 12.0, switch_cost=2.2)
    # Refinamento (tipos e inversões) só com o acompanhamento: a voz traz notas de melodia que
    # parecem extensões (sus, maj7) sem ser.
    acc = get("guitar") + get("piano") + get("other")
    if rms(acc) > 0.05 * rms(harm):
        chroma_r = librosa.feature.chroma_cqt(y=acc, sr=SR, hop_length=HOP, tuning=tuning * 3, bins_per_octave=36, n_octaves=6, fmin=librosa.note_to_hz("C2"))[:, :n]
        energy_r = librosa.feature.rms(y=acc, hop_length=HOP)[0][:n]
        beat_r = np.zeros((len(bf), 12))
        for i in range(len(bf)):
            a_, b_ = int(bounds[i]), int(max(bounds[i] + 1, bounds[i + 1]))
            beat_r[i] = np.median(chroma_r[:, a_:b_], axis=1) * np.mean(energy_r[a_:b_])
    else:
        beat_r = beat_h
    beat_label = refine_chords(chord_path, labels, beat_r, beat_b)
    progress(80)

    # 4) Início do compasso (4/4): bumbo + ataques do baixo + trocas de acorde
    mel = librosa.feature.melspectrogram(y=drums if drums_ok else mix, sr=SR, hop_length=HOP, n_mels=64, fmax=8000)
    kick = librosa.onset.onset_strength(S=librosa.power_to_db(mel[:6]), sr=SR, hop_length=HOP)
    bass_on = librosa.onset.onset_strength(y=bass, sr=SR, hop_length=HOP)

    def at(env, frames):
        return np.array([env[min(len(env) - 1, f)] for f in frames])

    z = lambda v: (v - v.mean()) / (v.std() + 1e-9)  # noqa: E731
    change = np.concatenate([[1.0], np.array([beat_label[i] != beat_label[i - 1] for i in range(1, len(beat_label))], dtype=float)])
    strength = z(at(kick, bf)) + 0.7 * z(at(bass_on, bf)) + 1.0 * z(change)
    phase = int(np.argmax([strength[p::4].mean() for p in range(4)]))
    progress(85)

    # 5) Compassos
    def chord_label(lab):
        if lab is None:
            return None
        r, q, bass_pc = lab
        return {"root": r, "quality": q, **({"bass": bass_pc} if bass_pc != r else {})}

    bars = []
    starts = list(range(phase, len(bf), 4))
    if phase > 0:
        starts = [phase - 4] + starts  # anacruse: compasso incompleto no início
    for bi, s in enumerate(starts):
        idxs = [i for i in range(s, s + 4) if 0 <= i < len(bf)]
        if not idxs:
            continue
        t0 = float(beat_times[idxs[0]]) if s >= 0 else 0.0
        e = s + 4
        t1 = float(beat_times[e]) if e < len(beat_times) else duration
        chords = []
        for i in idxs:
            c = beat_label[i]
            if chords and chords[-1]["_id"] == c:
                chords[-1]["beats"] += 1
                continue
            chords.append({"_id": c, "beat": i - s, "start": float(beat_times[i]), "beats": 1})
        bars.append({"index": bi, "start": round(t0, 3), "end": round(t1, 3), "chords": [
            {"beat": c["beat"], "start": round(c["start"], 3), "beats": c["beats"], **({"chord": chord_label(c["_id"])} if chord_label(c["_id"]) else {"chord": None})}
            for c in chords
        ], "_beats": idxs})

    # 6) Tom geral e por compasso
    total = beat_h.sum(axis=0) + 0.8 * beat_b.sum(axis=0)

    # Peso harmônico: quanto do tempo cada tríade (raiz + maior/menor) ocupa. A tônica costuma ser o
    # acorde mais presente; isso desfaz a ambiguidade do perfil de notas (Ré maior com ♭VII e ♭VI
    # parece Ré menor só pelas notas).
    def triad_share(path_idx):
        share = np.zeros(24)
        for c in path_idx:
            if c == len(labels):
                continue
            r, q = labels[c]
            share[(12 if q.startswith("m") else 0) + r] += 1
        return share / max(1.0, share.sum())

    ks = key_scores(total) + 0.6 * triad_share(chord_path)
    gk = int(np.argmax(ks))
    second = float(np.sort(ks)[-2])
    bar_chroma = np.array([beat_h[b["_beats"]].sum(axis=0) + 0.8 * beat_b[b["_beats"]].sum(axis=0) for b in bars])
    local = np.zeros((len(bars), 24))
    for i in range(len(bars)):
        lo, hi = max(0, i - 4), min(len(bars), i + 5)
        w = np.array([1.0 - abs(j - i) / 6 for j in range(lo, hi)])
        beats_win = [k for b in bars[lo:hi] for k in b["_beats"]]
        local[i] = key_scores((bar_chroma[lo:hi] * w[:, None]).sum(axis=0)) + 0.4 * triad_share(chord_path[beats_win])
    # O tom geral é a hipótese padrão; mudar exige evidência sustentada.
    local[:, gk] += 0.05
    key_path = viterbi(local * 10.0, switch_cost=6.0)
    for i, b in enumerate(bars):
        k = int(key_path[i])
        b["key"] = {"tonic": k % 12, "mode": "major" if k < 12 else "minor"}
        del b["_beats"]

    result = {
        "version": 3,
        "duration": round(duration, 3),
        "bpm": round(bpm, 1),
        "tempo": {**tempo_summary(beat_times, tempo_info["variable"]), "mode": "fixed" if tempo_mode == "fixed" else "auto"},
        "beats": [round(float(t), 3) for t in beat_times],
        "firstDownbeat": phase,
        "tuningCents": round(tuning * 100, 1),
        "key": {"tonic": gk % 12, "mode": "major" if gk < 12 else "minor", "confidence": round(float(ks[gk] - second), 3)},
        "bars": bars,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f)
    progress(100)


# ------------------------------------------------------------------ MIDI
PROGRAMS = {"bass": 33, "guitar": 27, "piano": 0, "vocals": 53, "lead": 53, "backing": 52, "other": 48}
PRESETS = {
    # baixo: monofônico, sem harmônicos agudos, notas mais longas que ruído
    "bass": dict(onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=80, minimum_frequency=30.0, maximum_frequency=420.0, mono=True),
    "vocals": dict(onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=90, minimum_frequency=75.0, maximum_frequency=1200.0, mono=True),
    "lead": dict(onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=90, minimum_frequency=75.0, maximum_frequency=1200.0, mono=True),
    "backing": dict(onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=90, minimum_frequency=75.0, maximum_frequency=1400.0, mono=False),
    "guitar": dict(onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=58, minimum_frequency=70.0, maximum_frequency=1600.0, mono=False),
    "piano": dict(onset_threshold=0.5, frame_threshold=0.3, minimum_note_length=58, minimum_frequency=27.0, maximum_frequency=4200.0, mono=False),
    "other": dict(onset_threshold=0.55, frame_threshold=0.3, minimum_note_length=70, minimum_frequency=40.0, maximum_frequency=3000.0, mono=False),
}


def monophonic(notes):
    """Uma nota por vez: entre notas sobrepostas fica a mais forte; harmônicos (12ª, 19ª, 24ª acima)
    de uma nota mais grave simultânea são descartados; cada nota termina quando a próxima começa."""
    notes = sorted(notes, key=lambda n: (n[0], n[2]))
    keep = []
    for n in notes:
        s, e, p, a = n[0], n[1], n[2], n[3]
        drop = False
        for k in keep[-6:]:
            ks, ke, kp, ka = k[0], k[1], k[2], k[3]
            overlap = min(e, ke) - max(s, ks)
            if overlap <= 0.5 * min(e - s, ke - ks):
                continue
            if p - kp in (12, 19, 24) and a < 1.6 * ka:
                drop = True  # harmônico da nota grave
                break
            if kp - p in (12, 19, 24) and ka < 1.6 * a:
                keep.remove(k)  # a guardada era harmônico desta
                continue
            if a <= ka:
                drop = True
                break
            keep.remove(k)
        if not drop:
            keep.append(n)
    keep.sort(key=lambda n: n[0])
    out = []
    for i, n in enumerate(keep):
        end = n[1]
        if i + 1 < len(keep):
            end = min(end, keep[i + 1][0])
        if end - n[0] >= 0.04:
            out.append((n[0], end, n[2], n[3]))
    return out


MIN_PIECE = 0.09


def refine_onsets(notes, wav: str):
    """Corrige o tempo das notas de uma linha monofônica com os ataques do próprio áudio.

    O modelo de transcrição tem pouca resolução no grave: notas abaixo de ~60 Hz saem adiantadas,
    notas iguais repetidas rápido (semicolcheias) viram uma nota longa só, e ruído no silêncio
    vira nota fantasma. Aqui:
      1. cada nota começa no ataque detectado mais próximo (até 90 ms);
      2. um ataque forte no meio de uma nota a divide (nova palhetada na mesma altura);
      3. notas sem energia de verdade no áudio (< 4% do nível típico da faixa) saem (vazamento do
         bumbo na faixa do baixo, ruído no silêncio).
    Não corrige oitava: testado com o espectro (energia uma oitava abaixo + quinta), errou em música
    real (o bumbo e a harmonia imitam a nota grave).
    """
    import librosa

    sr = 22050
    hop = 128
    y, _ = librosa.load(wav, sr=sr, mono=True)
    if len(y) < sr // 4 or not notes:
        return notes
    # Fluxo espectral só abaixo de 1,2 kHz: ataques do baixo, sem chiado de palheta/trastes.
    # Janela de 1024 (46 ms): acha os ataques sem inventar outros; o pico do fluxo sai ~15 ms antes
    # do ataque real (medido em tooling/fixtures/eval-bass.py) e é compensado.
    S = np.abs(librosa.stft(y, n_fft=1024, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=1024)
    S = librosa.amplitude_to_db(S[freqs < 1200], ref=np.max)
    env = np.maximum(0.0, np.diff(S, axis=1)).mean(axis=0)
    env = np.concatenate([[0.0], env])
    env /= max(1e-9, np.percentile(env, 99.5))
    on_frames = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, backtrack=False, delta=0.08, wait=4, normalize=False)
    onsets = librosa.frames_to_time(on_frames, sr=sr, hop_length=hop) + 0.015
    strength = env[on_frames]
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=hop)[0]
    level = max(1e-9, float(np.percentile(rms[rms > 0], 90)) if np.any(rms > 0) else 1e-9)

    def rms_between(a, b):
        fa, fb = int(a * sr / hop), max(int(a * sr / hop) + 1, int(b * sr / hop))
        return float(rms[fa:fb].mean()) if fa < len(rms) else 0.0

    out = []
    for s, e, p, a in notes:
        # 1) ataque mais próximo (o modelo costuma adiantar no grave)
        if len(onsets):
            win = (onsets >= s - 0.09) & (onsets <= s + 0.15) & (onsets < e - 0.03)
            if np.any(win):
                cand = onsets[win]
                s = float(cand[int(np.argmin(np.abs(cand - s)))])
        # 2) ataques fortes dentro da nota: divide
        # (forte por si só, ou mais fraco mas com a energia subindo logo depois: nova palhetada)
        # Pedaços de pelo menos 90 ms (semicolcheia a 160 bpm): menos que isso é ruído de corda.
        cuts = []
        for t, st in zip(onsets, strength):
            t = float(t)
            if not (s + MIN_PIECE < t < e - MIN_PIECE) or (cuts and t - cuts[-1] < MIN_PIECE):
                continue
            if st >= 0.35 or (st >= 0.15 and rms_between(t, t + 0.04) >= 1.1 * rms_between(t - 0.04, t)):
                cuts.append(t)
        bounds = [s, *cuts, e]
        for i in range(len(bounds) - 1):
            a0, a1 = bounds[i], bounds[i + 1]
            # 3) energia real na nota
            if rms_between(a0, a1) < 0.04 * level:
                continue
            out.append((a0, a1, p, a))
    out.sort(key=lambda n: n[0])
    # Mesma altura começando a menos de 90 ms da anterior: é a mesma nota (duas leituras do mesmo ataque).
    merged = []
    for n in out:
        if merged and n[2] == merged[-1][2] and n[0] - merged[-1][0] < MIN_PIECE:
            m = merged[-1]
            merged[-1] = (m[0], max(m[1], n[1]), m[2], max(m[3], n[3]))
        else:
            merged.append(n)
    out = merged
    res = []
    for i, n in enumerate(out):
        end = n[1] if i + 1 >= len(out) else min(n[1], out[i + 1][0])
        if end - n[0] >= 0.04:
            res.append((n[0], end, n[2], n[3]))
    return res


PPQ = 480


def grid_ticks(beats, first_downbeat: int):
    """Mapa de andamento a partir dos tempos da análise: cada tempo vira uma semínima (480 ticks)
    e os compassos de 4/4 do MIDI caem nos inícios de compasso da análise.

    O trecho do instante 0 ao primeiro tempo 1 de compasso vira um compasso de entrada com quantos
    tempos cabem nele no andamento do começo (ex.: 2/4), em vez de espremer 4 tempos num instante.
    Devolve (tempos em s, ticks) a partir de (0 s, 0) e as fórmulas de compasso [(tick, n/4)].
    """
    b = [float(x) for x in beats]
    fd = int(first_downbeat)
    d = b[fd]
    ibi0 = b[fd + 1] - b[fd]
    n = int(round(d / ibi0)) if ibi0 > 0 else 0
    times, ticks = [0.0], [0]
    for k in range(fd if n else fd + 1, len(b)):
        times.append(b[k])
        ticks.append((n + k - fd) * PPQ)
    r = n % 4
    sigs = [(0, r), (r * PPQ, 4)] if r else [(0, 4)]
    return times, ticks, sigs


def midi_beats(beats, first_downbeat: int):
    """Tempos para o mapa do MIDI, sem o tremor do detector (~20 ms por tempo, que viraria uma
    mudança de andamento a cada tempo): cada início de compasso fica onde a análise pôs, e os 4
    tempos se distribuem por igual dentro do compasso (um andamento por compasso). Compassos nunca
    saem da grade, e o andamento variável é seguido compasso a compasso."""
    b = np.asarray(beats, dtype=float).copy()
    fd = int(first_downbeat)
    for k in range(fd, len(b) - 4, 4):
        b[k : k + 4] = b[k] + (b[k + 4] - b[k]) * np.arange(4) / 4
    return list(b)


def write_midi_grid(notes, out_path: str, program: int, name: str, beats, first_downbeat: int) -> int:
    """Grava o MIDI com o mapa de andamento da análise (mido): faixa 0 com tempos e 4/4, faixa 1
    com as notas. Notas em segundos são convertidas por interpolação no mapa (andamento variável
    continua certo)."""
    import mido

    times, ticks, sigs = grid_ticks(beats, first_downbeat)
    tarr = np.array(times)
    karr = np.array(ticks, dtype=float)
    last_ibi = times[-1] - times[-2] if len(times) > 1 else 0.5

    def to_tick(t: float) -> int:
        if t <= tarr[-1]:
            return int(round(float(np.interp(t, tarr, karr))))
        return int(round(karr[-1] + (t - tarr[-1]) / last_ibi * PPQ))

    meta = mido.MidiTrack()
    meta.append(mido.MetaMessage("track_name", name="Baixaria Fina", time=0))
    ev = [(tk, mido.MetaMessage("time_signature", numerator=num, denominator=4)) for tk, num in sigs]
    for i in range(len(times) - 1):
        dt = times[i + 1] - times[i]
        beats_in = (ticks[i + 1] - ticks[i]) / PPQ
        us = int(round(dt / max(beats_in, 1e-6) * 1e6))
        ev.append((ticks[i], mido.MetaMessage("set_tempo", tempo=max(1, min(us, 16_777_215)))))
    ev.append((ticks[-1], mido.MetaMessage("set_tempo", tempo=int(round(last_ibi * 1e6)))))
    ev.sort(key=lambda x: (x[0], x[1].type != "time_signature"))
    now = 0
    prev_tempo = None
    for tk, m in ev:
        if m.type == "set_tempo" and m.tempo == prev_tempo:
            continue
        m.time = tk - now
        now = tk
        if m.type == "set_tempo":
            prev_tempo = m.tempo
        meta.append(m)
    track = mido.MidiTrack()
    track.append(mido.MetaMessage("track_name", name=name, time=0))
    track.append(mido.Message("program_change", program=program, time=0))
    msgs = []
    for s, e, p, a in notes:
        t0, t1 = to_tick(s), to_tick(e)
        if t1 <= t0:
            t1 = t0 + 1
        vel = int(max(20, min(127, round(a * 127))))
        msgs.append((t0, 1, mido.Message("note_on", note=p, velocity=vel)))
        msgs.append((t1, 0, mido.Message("note_off", note=p, velocity=0)))
    msgs.sort(key=lambda x: (x[0], x[1]))
    now = 0
    for tk, _, m in msgs:
        m.time = tk - now
        now = tk
        track.append(m)
    mf = mido.MidiFile(ticks_per_beat=PPQ, type=1)
    mf.tracks.append(meta)
    mf.tracks.append(track)
    mf.save(out_path)
    return len(notes)


def to_midi(wav: str, stem: str, out_path: str, transpose: int, bpm: float | None, analysis_path: str | None = None) -> None:
    import pathlib

    import pretty_midi
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import Model, predict

    if stem not in PRESETS:
        raise SystemExit(f"faixa sem altura definida para MIDI: {stem}")
    preset = dict(PRESETS[stem])
    mono = preset.pop("mono")
    progress(5)
    model_path = pathlib.Path(ICASSP_2022_MODEL_PATH)
    onnx = model_path.with_suffix(".onnx") if model_path.suffix != ".onnx" else model_path
    if not onnx.exists():
        onnx = model_path.parent / "nmp.onnx"
    model = Model(str(onnx))
    progress(15)
    _, _, notes = predict(wav, model, multiple_pitch_bends=False, melodia_trick=True, **preset)
    progress(85)
    notes = [(float(n[0]), float(n[1]), int(n[2]), float(n[3])) for n in notes]
    if mono:
        notes = monophonic(notes)
        if stem == "bass":
            notes = refine_onsets(notes, wav)
    grid = None
    if analysis_path and os.path.exists(analysis_path):
        with open(analysis_path, encoding="utf-8") as f:
            an = json.load(f)
        if len(an.get("beats", [])) >= 8:
            fd = int(an.get("firstDownbeat", 0))
            grid = (midi_beats(an["beats"], fd), fd)
    if grid:
        kept = [(s, e, p + transpose, a) for s, e, p, a in notes if 0 <= p + transpose <= 127 and e > s]
        n = write_midi_grid(kept, out_path, PROGRAMS.get(stem, 0), stem, *grid)
        print(json.dumps({"notes": n, "tempoMap": True}))
        progress(100)
        return
    pm = pretty_midi.PrettyMIDI(initial_tempo=bpm if bpm and 30 <= bpm <= 300 else 120.0)
    inst = pretty_midi.Instrument(program=PROGRAMS.get(stem, 0), name=stem)
    for s, e, p, a in notes:
        pitch = p + transpose
        if 0 <= pitch <= 127 and e > s:
            inst.notes.append(pretty_midi.Note(velocity=int(max(20, min(127, round(a * 127)))), pitch=pitch, start=s, end=e))
    pm.instruments.append(inst)
    pm.write(out_path)
    print(json.dumps({"notes": len(inst.notes)}))
    progress(100)


# ------------------------------------------------------------------ compactação (FLAC)
def compress_stems(folders: list[str]) -> None:
    """Troca cada .wav das pastas por .flac de 24 bits (sem perda audível: o Demucs entrega as
    faixas em ponto flutuante abaixo de 0,99; 24 bits dão ~144 dB de faixa dinâmica).

    Segurança: o FLAC é gravado num temporário, relido e comparado (mesmo número de amostras,
    diferença máxima abaixo de 1e-6, um passo de 24 bits) antes de o WAV ser apagado. Uma faixa
    com pico acima de 1,0 (soma "Restante", por exemplo) continua em WAV, para não cortar o pico.
    Saída: JSON {wav: flac ou wav} com o caminho final de cada arquivo, e os bytes liberados.
    """
    import soundfile as sf

    files = []
    for d in folders:
        if os.path.isdir(d):
            files += [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.lower().endswith(".wav")]
    result: dict[str, str] = {}
    freed = 0
    progress(1)
    for i, wav in enumerate(files):
        data, sr = sf.read(wav, dtype="float32", always_2d=True)
        peak = float(np.abs(data).max()) if data.size else 0.0
        if peak > 0.9999:
            result[wav] = wav
            stale = wav[:-4] + ".flac"  # de uma separação anterior: não pode vencer o WAV novo
            if os.path.exists(stale):
                os.remove(stale)
        else:
            flac = wav[:-4] + ".flac"
            tmp = flac + ".tmp"
            sf.write(tmp, data, sr, format="FLAC", subtype="PCM_24")
            back, sr2 = sf.read(tmp, dtype="float32", always_2d=True)
            if sr2 != sr or back.shape != data.shape or float(np.abs(back - data).max()) > 1e-6:
                os.remove(tmp)
                raise SystemExit(f"verificação do FLAC falhou: {os.path.basename(wav)}")
            os.replace(tmp, flac)
            freed += os.path.getsize(wav) - os.path.getsize(flac)
            os.remove(wav)
            result[wav] = flac
        progress(1 + 98 * (i + 1) / max(1, len(files)))
    print(json.dumps({"files": result, "freed": freed}))
    progress(100)


# ------------------------------------------------------------------ escolha de faixas
DEMUCS = ["bass", "drums", "guitar", "piano", "vocals", "other"]
KARAOKE_MODEL = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt"


def split_voice(vocals_path: str, out_dir: str, models_dir: str, overlap: int | None = None) -> None:
    """Divide a voz em principal (lead.wav) e backing vocals (backing.wav) com o Mel-Band RoFormer
    de karaokê (aufr33/viperx), sem o pacote audio-separator: só a arquitetura (bf_roformer) e a
    mesma inferência por trechos dele (trecho = hop × (dim_t − 1), 4 sobreposições, janela de
    Hamming, média ponderada). Diferença de propósito: as duas saem no nível original da voz (o
    audio-separator normaliza cada uma a 0,9 de pico), então principal + backing = voz.
    Velocidade: trechos sem voz (pico < -60 dB) não passam pelo modelo (a voz principal ali é zero);
    na CPU, 2 sobreposições em vez de 4 (metade das contas; medido em tooling/fixtures).
    """
    import inspect

    import soundfile as sf
    import torch
    import yaml
    from scipy.signal.windows import hamming

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from bf_roformer import MelBandRoformer

    ckpt = os.path.join(models_dir, KARAOKE_MODEL)
    cfg_path = os.path.join(models_dir, KARAOKE_MODEL.replace(".ckpt", "_config.yaml"))
    if not os.path.exists(ckpt) or not os.path.exists(cfg_path):
        raise SystemExit("modelo de divisão da voz não instalado (baixe em Separar → Voz principal e backing)")
    with open(cfg_path, encoding="utf-8") as f:
        cfg = yaml.load(f, Loader=yaml.FullLoader)  # o arquivo usa !!python/tuple
    mcfg = dict(cfg["model"])
    accepted = set(inspect.signature(MelBandRoformer.__init__).parameters)
    model = MelBandRoformer(**{k: v for k, v in mcfg.items() if k in accepted})
    state = torch.load(ckpt, map_location="cpu", weights_only=True)
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    elif isinstance(state, dict) and "model" in state:
        state = state["model"]
    model.load_state_dict(state)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cpu":
        torch.set_num_threads(max(1, os.cpu_count() or 1))
    model.to(device).eval()
    progress(30)

    sr_model = int(mcfg.get("sample_rate", 44100))
    data, sr = sf.read(vocals_path, dtype="float32", always_2d=True)
    if sr != sr_model:
        import librosa

        data = librosa.resample(data.T, orig_sr=sr, target_sr=sr_model).T
        sr = sr_model
    mix = data.T.copy()  # (canais, amostras)
    if mix.shape[0] == 1:
        mix = np.repeat(mix, 2, axis=0)
    peak = float(np.abs(mix).max()) or 1.0
    gain = 0.9 / peak if peak > 0.9 else 1.0  # o modelo espera pico até 0,9 (como no audio-separator)
    x = torch.tensor(mix * gain, dtype=torch.float32)

    hop = int(mcfg.get("stft_hop_length", cfg["audio"]["hop_length"]))
    dim_t = int(cfg.get("inference", {}).get("dim_t", cfg["audio"].get("dim_t", 801)))
    if overlap is None:
        overlap = int(cfg.get("inference", {}).get("num_overlap", 4)) if device.type == "cuda" else 2
    chunk = hop * (dim_t - 1)
    step = max(1, chunk // overlap)
    n = x.shape[1]
    starts = []
    for off in range(0, n, step):
        if off + chunk >= n:
            tail = max(n - chunk, 0)
            if not starts or starts[-1] != tail:
                starts.append(tail)
            break
        starts.append(off)
    window = torch.tensor(hamming(chunk), dtype=torch.float32)
    result = torch.zeros_like(x)
    counter = torch.zeros_like(x)
    with torch.no_grad():
        for k, st in enumerate(starts):
            part = x[:, st : st + chunk]
            length = part.shape[-1]
            m = min(length, chunk)
            if float(part.abs().max()) >= 1e-3:  # trecho sem voz: principal = 0 (nada a somar)
                y = model(part.unsqueeze(0).to(device))[0].float().cpu()
                if y.dim() == 3:  # (stems, canais, amostras)
                    y = y[0]
                m = min(m, y.shape[-1])
                result[:, st : st + m] += y[:, :m] * window[:m]
            counter[:, st : st + m] += window[:m]
            progress(30 + 65 * (k + 1) / len(starts))
    lead = (result / counter.clamp(min=1e-10)).numpy()
    backing = mix * gain - lead
    sf.write(os.path.join(out_dir, "lead.wav"), (lead / gain).T, sr, subtype="FLOAT")
    sf.write(os.path.join(out_dir, "backing.wav"), (backing / gain).T, sr, subtype="FLOAT")
    progress(95)


def build_stems(demucs_dir: str, out_dir: str, keep: list[str], models_dir: str) -> None:
    import soundfile as sf

    os.makedirs(out_dir, exist_ok=True)
    split_vocals = "lead" in keep or "backing" in keep
    result: dict[str, str] = {}
    for n in DEMUCS:
        if n in keep:
            result[n] = os.path.join(demucs_dir, f"{n}.wav")
    # Restante: soma das faixas do Demucs que não foram escolhidas (a voz, se foi dividida, não entra).
    rest_names = [n for n in DEMUCS if n not in keep and not (n == "vocals" and split_vocals)]
    progress(5)
    if rest_names:
        acc = None
        sr = None
        for n in rest_names:
            data, sr = sf.read(os.path.join(demucs_dir, f"{n}.wav"), dtype="float32", always_2d=True)
            acc = data if acc is None else acc[: len(data)] + data[: len(acc)]
        path = os.path.join(out_dir, "rest.wav")
        sf.write(path, acc, sr, subtype="FLOAT")
        result["rest"] = path
    progress(15)
    if split_vocals:
        split_voice(os.path.join(demucs_dir, "vocals.wav"), out_dir, models_dir)
        for n in ("lead", "backing"):
            p = os.path.join(out_dir, f"{n}.wav")
            if not os.path.exists(p):
                raise SystemExit(f"separação de voz não gerou {n}.wav")
            if n in keep:
                result[n] = p
        # Uma das duas não escolhida: vai para o restante, para nada se perder.
        dropped = [n for n in ("lead", "backing") if n not in keep]
        if dropped:
            rest_path = os.path.join(out_dir, "rest.wav")
            data, sr = sf.read(os.path.join(out_dir, f"{dropped[0]}.wav"), dtype="float32", always_2d=True)
            if os.path.exists(rest_path):
                cur, _ = sf.read(rest_path, dtype="float32", always_2d=True)
                n_ = min(len(cur), len(data))
                data = cur[:n_] + data[:n_]
            sf.write(rest_path, data, sr, subtype="FLOAT")
            result["rest"] = rest_path
    print(json.dumps(result))
    progress(100)


def main() -> None:
    # O app roda o Python com -I (ignora PYTHONIOENCODING): sem isto, mensagens com acento saem
    # em cp1252 e o app (que lê UTF-8) mostra "divis�o".
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("analyze")
    a.add_argument("stems_dir")
    a.add_argument("out")
    a.add_argument("--tempo", choices=["auto", "fixed"], default="auto")
    m = sub.add_parser("midi")
    m.add_argument("wav")
    m.add_argument("stem")
    m.add_argument("out")
    m.add_argument("--transpose", type=int, default=0)
    m.add_argument("--bpm", type=float, default=None)
    m.add_argument("--analysis", default=None)
    cp = sub.add_parser("compress")
    cp.add_argument("folders", nargs="+")
    st = sub.add_parser("stems")
    st.add_argument("demucs_dir")
    st.add_argument("out_dir")
    st.add_argument("--keep", required=True)
    st.add_argument("--models", required=True)
    args = ap.parse_args()
    if args.cmd == "analyze":
        analyze(args.stems_dir, args.out, args.tempo)
    elif args.cmd == "compress":
        compress_stems(args.folders)
    elif args.cmd == "stems":
        build_stems(args.demucs_dir, args.out_dir, [k for k in args.keep.split(",") if k], args.models)
    else:
        to_midi(args.wav, args.stem, args.out, args.transpose, args.bpm, args.analysis)


if __name__ == "__main__":
    main()
