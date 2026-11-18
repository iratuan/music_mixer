# packages/audio-synth

Síntese WebAudio pura: timbres, acordes/progressões, metrônomo, relógio master e codificação WAV.

**Regras:** só APIs WebAudio padrão; sem `electron`, `node:*`, sidecars ou entrada de microfone (captura e detecção de pitch pertencem ao Academy).

**Status (E3):** `context` (AudioContext único), `wav` (encodeWav/decodeWavPcm16), `voices` (pluck, distorção, barramento, clique), `synth` (vozes do acompanhamento) e `harmonyAudioEngine`. A captura de microfone/MIDI continua no app (Academy) e o player multipista no app (Mixer).
