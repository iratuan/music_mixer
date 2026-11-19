# packages/audio-synth

Síntese com Web Audio: timbres, acordes e progressões, metrônomo, relógio master e codificação/decodificação WAV.

**Regras:** só APIs padrão do Web Audio; sem `electron`, `node:*`, processos auxiliares ou entrada de microfone. Captura de microfone e detecção de altura ficam no ScaleMonster; o player multipista fica no MixerMonster.

**Módulos:** `context` (AudioContext único), `wav` (codificação e decodificação PCM16), `voices` (pluck, distorção, barramento, clique), `synth` (vozes do acompanhamento) e `harmonyAudioEngine`.
