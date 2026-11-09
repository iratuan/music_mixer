# Etapa 0 — Escopo, riscos e forma de trabalho

**Data:** 7 de novembro de 2026
**Base:** `prompt/MESTRE.md` (especificação), `docs/viabilidade-seguranca.md` (viabilidade), `backup/codigo-referencia/` (referência somente leitura).
**Autorização registrada:** o usuário aprovou o plano em etapas (0 a 3), com gates. Código de produto só começa após o Gate 2 e o aceite do usuário.

## 1. Forma de trabalho (orientação GOD)

O usuário definiu a persona **GOD** como orientadora do trabalho. Na prática, isso significa:

- decompor o trabalho em etapas com entregáveis verificáveis;
- ficar com as decisões que afetam escopo, arquitetura, segurança e aceite;
- não tratar um documento como concluído sem evidência;
- registrar conflitos e pendências em vez de resolvê-los silenciosamente.

O estado de `prompt/agents/agents/god/` (`handoff.md`, `memory.md`) pertence ao projeto **Agent Office**, não a este. Não foi importado para cá. O arquivo `identity.md` descreve GOD como orquestradora que delega execução. Nesta sessão, a execução foi feita diretamente, sem subagentes, porque as regras de ambiente só autorizam delegação quando o usuário pede explicitamente.

## 2. Escopo desta fase

Dentro do escopo:

- Etapa 0: organização e especificação (este documento).
- Etapa 1: descoberta da referência (`01-descoberta-referencia.md`).
- Etapa 2: arquitetura e UX em nível de proposta (`02-arquitetura-e-ux.md`).
- Registro de decisões (`decisoes.md`).

Fora do escopo até o Gate 2:

- código de aplicação, dependências de produção e configuração de build;
- download de modelos de separação ou de transcrição;
- qualquer análise de binários de terceiros, incluindo o Rocksmith.

## 3. Estado do projeto

| Item | Situação |
|---|---|
| `baixaria-fina/` | Só estrutura de pastas e `README.md`. Sem código nem build. |
| `docs/viabilidade-seguranca.md` | Relatório existente. Veredito: viável com condições e por etapas. |
| Referência (`backup/codigo-referencia/`) | Aplicação Rust (egui 0.29, cpal, symphonia, mp3lame-encoder). Lida, não modificada. |
| Ferramentas locais | Node 24.16.0, npm 11.13.0, Python 3.14.3, cargo presente. |

## 4. Itens do prompt que dependem de ação do usuário

1. **Duplicata em `prompt/MESTRE.md`:** a linha "Validar codecs, áudio, modelos, caminhos, permissões e empacotamento em cada plataforma." aparece duas vezes (linhas 227 e 228). A remoção da linha 228 foi proposta e aprovada, mas a edição foi bloqueada pelo classificador de permissões. Pode ser feita manualmente ou com uma permissão de edição para este arquivo.
2. **Imagens de referência:** foram lidas nesta etapa. Principais observações estão em `01-descoberta-referencia.md`.
3. **`prompt/agents/`:** 97 arquivos de personas e estados de outros projetos. Não fazem parte da especificação do produto.

## 5. Riscos registrados nesta etapa

| ID | Risco | Origem | Tratamento |
|---|---|---|---|
| R-01 | Copiar arquitetura ou código da referência Rust em vez de reimplementar. | Prompt §1 e §5; referência | Reimplementação limpa. Referência só para comportamento. Licença da referência não encontrada no backup; tratar como não redistribuível até verificação. |
| R-02 | Modelo de evento com dados derivados duplicados (`midi`, `freq`, `string`, `fret` guardados juntos). | `src/model.rs` da referência | Definir MIDI como fonte única. Corda/traste derivados e validados (ver `02-arquitetura-e-ux.md`). |
| R-03 | Relógio de parede (`Instant`) usado no caminho de captura. | `src/audio.rs:61` (`onset_at`) | Verificar se é só para latência de entrada. Proibido como relógio musical (prompt §6.5). |
| R-04 | Faixa de detecção fixa (28–420 Hz) no código. | `src/transcribe.rs`, `src/app.rs` | Tornar a faixa função do instrumento e da afinação. Confirmar margem para o traste mais agudo do baixo de 6 cordas. |
| R-05 | Configuração padrão do Electron copiada de outro produto. | `viabilidade-seguranca.md` §9.2 | Revisar explicitamente cada fuse e preference de segurança. |
| R-06 | Licença de encoder MP3 (LAME, LGPL) e de modelos de separação. | Referência usa `mp3lame-encoder` | Decisão pendente antes da Etapa 3 (ver `decisoes.md`). |
| R-07 | Análise de Rocksmith. | `viabilidade-seguranca.md` §9.3 | Não avançar. Projeto não usa código, assets ou fluxos do Rocksmith. Análise limitada já feita pelo usuário não é base para o produto. |
| R-08 | Afirmar precisão musical sem medição. | Prompt §9 | Nenhuma métrica será reportada como resultado até a Etapa 3. |

## 6. Critério de saída da Etapa 0

- [x] Prompt, referências visuais e código arquivado lidos.
- [x] Escopo, riscos e decisões pendentes registrados.
- [x] Forma de trabalho definida.
- [ ] Remoção da duplicata em `prompt/MESTRE.md` (bloqueada por permissão).
