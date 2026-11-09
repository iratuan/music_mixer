# Etapa 1 — Descoberta da referência

**Fonte:** `backup/codigo-referencia/` (somente leitura). Nome interno: `baixolab`; título na janela: "AI Bass Studio".
**Objetivo:** listar comportamentos úteis, lacunas e divergências com o prompt. O desenho antigo não é arquitetura-alvo.

## 1. Inventário técnico

| Item | Valor observado |
|---|---|
| Linguagem / UI | Rust, egui/eframe 0.29 (interface imediata nativa) |
| Áudio | cpal 0.18 (entrada de baixa latência), decodificação via symphonia (MP3, FLAC, WAV, OGG, AAC, M4A) |
| DSP | rustfft, filtros biquad com filtfilt |
| Exportação | mp3lame-encoder, zip, serde_json |
| Tamanho | ~10.350 linhas em 24 módulos em `src/`; maiores: `app.rs` (1.235), `ui_misc.rs` (798), `ui_play.rs` (673) |
| Testes | 25 testes unitários em 9 módulos. Não há `tests/fixtures` com referências reais nem testes de integração. |
| Legado | `old/app_v1.rs.txt` (1.151 linhas) e scripts Python `tools/splice*.py`. Não portar. |
| Capturas | 18 PNGs em `shots/` (dashboard, musicstudio, stemstudio, bassanalyzer, tabeditor, fretboardstudio, basshero, practicelab, tuner, audiosettings, preferences, progress, library, editor, play, now, explore, settings) |
| Referências de design | `design_ref/ref1.jpg` e `ref2.jpg` (o mesmo arquivo de `prompt/ux_referencia_2.jpg`) |

## 2. Mapa de capacidades da referência

| Capacidade | Módulo(s) | Avaliação para o novo produto |
|---|---|---|
| Afinações e presets (4, 5 e 6 cordas, drop D, meio tom, um tom) | `instrument.rs` | **Manter o conteúdo.** Os valores MIDI estão corretos: 4 cordas `[28,33,38,43]`, 5 cordas `[23,28,33,38,43]`, 6 cordas `[23,28,33,38,43,48]`. Convenção de oitava científica (`note_name = m/12 − 1`) é a mesma do prompt. |
| Detecção de pitch por YIN | `pitch.rs`, `transcribe.rs` | **Reimplementar.** Algoritmo conhecido; precisa de fixtures para validar. |
| Transcrição: onsets, segmentação, correção de oitava, filtro de notas falsas, confiança por nota, BPM, tonalidade | `transcribe.rs`, `dsp.rs` | **Manter a ideia, validar com dados.** Confiança por nota já existe, o que atende ao prompt §5.3. |
| Mapeamento de corda/traste por Viterbi sobre a sequência inteira, com 7 estratégias | `mapping.rs`, `fretboard.rs` | **Melhor peça da referência.** Atende ao prompt §5.5 (otimização global). Estratégias: Auto, Econômica, Tradicional, Menor deslocamento, Cordas graves, Cordas agudas, Posição fixa. |
| Edição de notas | `ui_editor.rs`, `model.rs` (`edited: bool`) | Parcial. Falta registrar a origem (detectado/editado/importado) e a trilha de correções. |
| Exportação SMF, tablatura em texto, MusicXML, MP3/WAV de stems, ZIP | `export.rs` | **Manter a lista.** Precisa de testes de alinhamento (prompt §5.2). |
| Captura de entrada e sintetizador de baixo afinado | `audio.rs` | **Revisar.** Usa `Instant` para marcar ataques (ver §4, item 2). |
| Prática e jogo | `practice.rs`, `game.rs`, `ui_practice.rs`, `ui_play.rs` | **Reimplementar a partir do prompt §5.7.** Atualmente não há separação formal entre avaliação e interface. |
| Biblioteca e projetos | `songs.rs`, `ui_library.rs` | Parcial. Não há versionamento explícito de schema. |
| Tarefas longas com progresso e cancelamento | `job.rs` | **Manter o padrão.** Atende ao prompt §5.1. |

## 3. Telas da referência e correspondência com o prompt

| Tela do prompt (§7) | Equivalente na referência | Observação |
|---|---|---|
| Dashboard | `ui_dashboard.rs`, `dashboard.png` | Existe. |
| Music Studio | `musicstudio.png` | Existe (timeline e waveform). |
| Stem Studio | `ui_stems.rs`, `stemstudio.png` | Existe. |
| Bass Analyzer | `ui_analyzer.rs`, `bassanalyzer.png` | Existe. |
| Tab Editor | `ui_editor.rs`, `tabeditor.png` | Existe. |
| Fretboard Studio | `ui_fretstudio.rs`, `fretboardstudio.png` | Existe. |
| Bass Hero / Practice | `ui_practice.rs`, `basshero.png`, `practicelab.png` | Existe. |
| Audio Settings | `audiosettings.png` | Existe. |
| Biblioteca e preferências | `ui_library.rs`, `library.png`, `preferences.png` | Existe. |
| Afinador / diagnóstico | `ui_misc.rs`, `tuner.png` | Parcial. Prompt §5.8 pede área de diagnóstico de latência, que não aparece nas capturas. |

As capturas não foram abertas uma a uma nesta etapa. A correspondência é por nome de arquivo e de módulo. Antes do Gate 2, abrir as capturas de `dashboard`, `musicstudio`, `tabeditor` e `basshero` para confirmar.

## 4. Divergências e lacunas em relação ao prompt

1. **Modelo de evento (prompt §5.4).** `MusicalNote` tem `id`, `articulation`, `start`, `dur`, `midi`, `freq`, `vel`, `conf`, `string`, `fret`, `edited`. Faltam: posição métrica (compasso e subdivisão), andamento do evento, origem explícita (detectado, editado ou importado), versão ou dificuldade, identificador de faixa e de projeto. Também guarda **quatro dados derivados juntos** (`midi`, `freq`, `string`, `fret`), o que cria risco de divergência (R-02).
2. **Relógio de parede (prompt §6.5).** `audio.rs` guarda `onset_at: Option<Instant>` para "temporizar ataques com precisão". Se isso for usado para sincronizar com a reprodução, viola a regra. Se for só para medir latência de entrada, é aceitável, mas precisa de uma fonte única de tempo e de compensação registrada uma vez (prompt §5.8).
3. **Faixa de detecção fixa.** `yin(seg, fs, 28.0, 420.0)` aparece em três lugares. Para o baixo de 6 cordas, o traste 20 da corda C3 (MIDI 68) fica em ~415 Hz, quase no limite de 420 Hz. A faixa precisa ser derivada da afinação e do número de trastes.
4. **Dados replicados.** Nota de instrumento, frequência e corda/traste são calculados em módulos diferentes. O prompt pede uma única fonte (§5.4). Isso precisa virar função validada.
5. **Sem fixtures de referência.** `tests/fixtures` está vazio. O prompt §9 exige fixtures com notas e tempos conhecidos. Sem elas, nenhuma precisão pode ser declarada.
6. **Licença do código.** Não há `LICENSE` nem `README` no backup. Enquanto não houver permissão explícita, a reimplementação deve ser limpa: estudar comportamento e escrever código novo.
7. **Ferramentas de terceiros para MP3.** `mp3lame-encoder` usa LAME (LGPL). A decisão de distribuição depende do empacotamento Electron (ver `decisoes.md`).

## 5. Lições a preservar

- Mapeamento global (Viterbi) em vez de nota a nota.
- Confiança por nota e exibição de incerteza.
- Presets de afinação com nomes claros e valores MIDI corretos.
- Exportação por tarefa com progresso e cancelamento.
- Separação entre interface de áudio, DSP e domínio, já sugerida pela organização de módulos.

## 6. Lições a não preservar

- Interface imediata e estado global em `app.rs` (1.235 linhas) como ponto central.
- Faixas de frequência fixas no código.
- Relógio de parede para qualquer evento de tempo musical.
- Arquivos `.txt` de legado e scripts de remendo (`splice*.py`).
- Qualquer cópia de código: a reimplementação é a regra (R-01).

## 7. Critério de saída da Etapa 1

- [x] Inventário de módulos, telas, testes e dependências.
- [x] Correspondência entre telas do prompt e da referência.
- [x] Divergências e lacunas documentadas com evidência (arquivo e linha).
- [ ] Abertura individual das capturas-chave (pendente antes do Gate 2).
