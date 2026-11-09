#!/usr/bin/env bash
# Monta o runtime portátil (Python 3.11 + torch CPU + Demucs + htdemucs_6s + librosa + Basic Pitch ONNX) para o instalador.
# A divisão de voz (audio-separator + modelo de karaokê, 913 MB) não entra: na CPU seria ~5× a duração da música.
set -euo pipefail
cd "$(dirname "$0")"
BASE="/c/Users/iratu/AppData/Roaming/uv/python/cpython-3.11.18-windows-x86_64-none"
rm -rf python models
cp -rL "$BASE" python
rm -f python/Lib/EXTERNALLY-MANAGED
uv pip install --python python/python.exe --break-system-packages \
  --index-url https://download.pytorch.org/whl/cpu "torch==2.5.1+cpu" "torchaudio==2.5.1+cpu"
uv pip install --python python/python.exe --break-system-packages -r requirements-cpu.txt
# Análise (librosa) e MIDI (Basic Pitch via ONNX, sem TensorFlow). setuptools<81: o resampy usa pkg_resources.
uv pip install --python python/python.exe --break-system-packages librosa==0.11.0 mir-eval pretty-midi resampy scikit-learn scipy "setuptools<81" onnxruntime
uv pip install --python python/python.exe --break-system-packages --no-deps basic-pitch==0.4.0
mkdir -p models/huggingface/hub
cp -rL "/c/Users/iratu/.cache/huggingface/hub/models--adefossez--HTDemucs-6s" models/huggingface/hub/
python/python.exe -c "import torch, demucs, soundfile, librosa, onnxruntime; from basic_pitch.inference import Model; print('torch', torch.__version__, 'cuda', torch.cuda.is_available())"
du -sh python models
echo RUNTIME_OK
