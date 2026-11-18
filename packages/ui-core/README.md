# packages/ui-core

Tokens de design, tema, componentes base (Knob, Icons, Progress) e visualizadores puros (braço, teclado, acordes, pauta, círculo das quintas, voice leading).

**Regras:** componentes controlados por props, sem acesso a IPC, banco ou bridge; alvos de toque ≥ 44 px.

**Status (E3):** `tokens.css` (importado como `@baixaria/ui-core/tokens.css`), `lib/` (store, theme, errors, harmonicSyncStore) e 12 componentes (Icons, Knob, Progress, Neck, BassNeck, PianoKeys, GuitarChord, Staff, CircleOfFifthsWheel, HarmonicGrid, HarmonicMapToolbar, VoiceLeadingInspector). As classes CSS dos componentes ainda vivem nas folhas globais do app. O `packages/ui/src/tokens/tokens.css` antigo (70 linhas, sem uso) não foi tocado.
