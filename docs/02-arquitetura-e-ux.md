# Etapa 2 — Arquitetura e UX (proposta para o Gate 2)

**Status:** proposta. Nada aqui está aprovado nem implementado. Decisões marcadas como **pendentes** estão em `decisoes.md`.

## 1. Princípios aplicados

0. **Direção de UX (decidida pelo usuário):** layout minimalista. O foco é a execução do exercício, depois a importação e a separação de stems. Telas e controles que não servem a esses três fluxos ficam em segundo plano. As imagens de `prompt/` são referências de layout e design system, não telas a copiar.

1. Uma nota, um evento, uma referência temporal (prompt §1, §3).
2. Domínio sem dependências de Electron, React, Capacitor ou codecs (`README.md`).
3. Renderer sem autoridade: só pede operações tipadas ao processo principal.
4. Processamento pesado fora da UI e fora do processo principal.
5. Falha explícita: sem resultado simulado.

## 2. Módulos (complementa `README.md`)

| Pacote | Responsabilidade | Depende de |
|---|---|---|
| `packages/domain` | Notas, afinação, mapeamento corda/traste, eventos, compasso, conversões de tempo | nada externo |
| `packages/application` | Casos de uso: importar, analisar, revisar, exportar, praticar | `domain` e contratos |
| `packages/persistence` | Projetos versionados, índice da biblioteca, cache | `domain` (tipos) |
| `packages/audio/contracts` | Interfaces de transporte, captura, reprodução, análise | `domain` |
| `packages/audio/web` | Reprodução e captura com Web Audio, quando suficiente | contratos |
| `packages/audio/native` | Adaptadores de áudio de baixa latência, se a prova técnica exigir | contratos |
| `packages/platform/desktop` | Diálogos, caminhos autorizados, processo de análise | contratos |
| `packages/ui` | Componentes, tokens, temas | nada de domínio |
| `apps/desktop/src/main` | Ciclo de vida, janelas, IPC validado, `utilityProcess` para DSP | `application`, `platform` |
| `apps/desktop/src/preload` | API mínima tipada | contratos IPC |
| `apps/desktop/src/renderer` | Telas React | `ui`, `application` (pela API do preload) |

## 3. Modelo musical compartilhado

Uma nota musical é um **evento**. Todas as telas (áudio, tablatura, braço, pista, avaliação) leem o mesmo tipo.

```ts
// Proposta. Nomes e tipos sujeitos a revisão na Etapa 3.
type EventOrigin = 'detected' | 'edited' | 'imported';

interface MusicalEvent {
  id: string;                 // único no projeto
  trackId: string;            // faixa de origem (stem ou transcrição)
  midi: number;               // FONTE ÚNICA da altura (inteiro)
  startSec: number;           // tempo no áudio original, fonte: relógio do motor
  durSec: number;
  bar?: number;               // posição métrica, quando houver grade
  beat?: number;
  velocity: number;           // 0..1
  articulation: 'normal' | 'slide' | 'hammer' | 'pull' | 'vibrato' | 'ghost' | 'mute' | 'unknown';
  confidence: number;         // 0..1, exibida como número e texto, não só cor
  origin: EventOrigin;
  position?: {                // derivada do MIDI + instrumento; validada ao carregar
    string: number;           // índice da corda, 0 = mais grave
    fret: number;             // 0 = solta
    chosenBy: 'auto' | 'manual';
  };
  schemaVersion: number;
}
```

Regras:

- `freq`, nome da nota e oitava são **derivados** de `midi` por `domain/pitch` (convenção científica: E1 = MIDI 28).
- `position` nunca é fonte de verdade. A função `isConsistent(event, instrument)` confirma que `tuning[string] + fret === midi`. Se falhar, o evento é marcado como inválido, não corrigido em silêncio.
- Correção manual cria novo `origin: 'edited'`. A estimativa original fica preservada no projeto (prompt §5.6).

## 4. Tempo e sincronização

- Referência única: relógio do motor de áudio (`AudioContext.currentTime` ou equivalente nativo), em segundos, monotônico durante a reprodução.
- A UI consulta o transporte e interpola para desenhar a cada frame. `setInterval`, `requestAnimationFrame` e `Date.now()` não definem o tempo musical (prompt §6.5).
- Eventos guardam `startSec` e `durSec` do modelo. Tablatura, braço e pista leem esses valores.
- A avaliação de prática associa execução e evento por janela de tempo, altura, duração e ordem (prompt §6.5). Esse algoritmo fica no domínio, testável sem áudio.
- Latência de entrada é medida uma vez por dispositivo, guardada na calibração e aplicada uma vez no caminho de captura (prompt §5.8).

## 5. Processamento e processos

| Tarefa | Onde roda | Motivo |
|---|---|---|
| Interface, navegação | Renderer (React) | Apresentação |
| Mapeamento corda/traste, transcrição a partir de eventos, avaliação | `domain`/`application` no renderer ou em `utilityProcess` | Puro, testável |
| Decodificação, separação de fontes, análise de pitch sobre áudio longo | `utilityProcess` do Electron, com cancelamento | Não bloquear a UI |
| Reprodução de stems | Motor de áudio (Web Audio ou nativo, decisão da Etapa 3) | Relógio e latência |
| Captura de instrumento | Motor de áudio, a definir | Latência medida |
| Persistência | Processo principal, com caminhos autorizados | Segurança |

## 6. Persistência

Estrutura proposta por projeto:

```text
<pasta-do-projeto>/
  project.json          # metadados, versão do schema, referências
  media/                # original e stems (referenciados, não duplicados sem necessidade)
  analysis/             # resultados da análise, com chave de cache (hash + versão do algoritmo)
  events/
    estimate.json       # eventos originais da transcrição (somente leitura)
    corrections.json    # alterações manuais, com origem e data
  exports/
```

- Biblioteca: índice de metadados em SQLite (**pendente**, decisão D-06). Mídia nunca entra no banco.
- Validação de schema ao abrir e importar. Migrações por `schemaVersion`.
- Cache invalidado explicitamente quando o algoritmo ou os parâmetros mudam.

## 7. Segurança (resumo para a Etapa 3)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Preload com API mínima. Canais IPC em lista fixa, com validação de payload em runtime (tipos não bastam).
- Renderer não recebe caminhos arbitrários: o processo principal entrega apenas os caminhos escolhidos em diálogo ou importados.
- Revisar fuses do Electron explicitamente. Não copiar configuração de nenhum produto de terceiros (R-05).
- Arquivos importados tratados como entrada não confiável: limite de tamanho e duração, cancelamento, sem escrita fora da pasta do projeto.

## 8. Mapa de telas

Navegação lateral fixa, tema escuro como padrão (prompt §7). Contexto transitório (música ativa, trecho, zoom, seleção) fica em um estado de workspace separado do estado persistente do projeto.

| Tela | Função principal |
|---|---|
| Dashboard | Projetos recentes, progresso de análises, atalhos |
| Music Studio | Timeline, waveform do original, faixas com volume, mute, solo |
| Stem Studio | Separação, seleção de fonte de baixo, exportação de stems |
| Bass Analyzer | Análise da linha de baixo, confiança e regiões incertas |
| Tab Editor | Tablatura e lista de eventos sincronizadas, edição |
| Fretboard Studio | Braço virtual, modos de mapeamento, próximas notas |
| Bass Hero / Practice | Pista visual, velocidade, loop, avaliação |
| Audio Settings | Dispositivos, calibração, latência, diagnóstico |
| Biblioteca | Projetos, pastas, importação |
| Preferências | Tema, idioma, limites de recursos |

## 9. Esboço das três telas centrais

**Music Studio**

```text
+--------+-----------------------------------------------------------+
| Nav    | Transporte: play  stop  loop  tempo  posição (motor)      |
|        +-----------------------------------------------------------+
| Dash   | Faixas        | Waveform / timeline (zoom, seleção)       |
| Music  | [Original] ▶  |▁▃▅█▇▅▃▁▂▄▆█▇▅▃▁   (playhead do motor)      |
| Stem   | [Baixo]    ▶  |  ...                                       |
| Bass   | [Bateria]  ▶  |                                           |
| Tab    +-----------------------------------------------------------+
| Fret   | Detalhes do trecho: nota, corda, traste, confiança        |
| Hero   +-----------------------------------------------------------+
| Prefs  | Estado: transcrição 82% · confiança média 0,71            |
+--------+-----------------------------------------------------------+
```

**Tab Editor**

```text
+-------------------------------------------------------------------+
| Compasso 1  2  3  4        [Estratégia: Economia v] [Zoom]        |
| Tablatura   E|--3--|--5-----|                                     |
|             A|-----|--7-----|  (mesmo evento, mesma posição)      |
|             D|-----|--------|                                     |
|             G|-----|--------|                                     |
| Evento sel. id 128 · G#1 · corda G · traste 4 · conf 0,92 · auto  |
| [Ouvir trecho] [Corrigir] [Desfazer]     Origem: detectado        |
+-------------------------------------------------------------------+
```

**Fretboard Studio**

```text
+-------------------------------------------------------------------+
| Corda  0   1   2   3   4   5   6   7   8   9  10  11  12          |
| G (3)  ----●---●---------------●-------------------------------    |
| D (2)  -------------●--------------------●----------------------    |
| A (1)  ●----------------------------------------------------- ...   |
| E (0)  ...                                                        |
| Próximas: G#1 (corda G, 4) → A#1 (corda D, 6)                     |
+-------------------------------------------------------------------+
```

Os esboços mostram hierarquia, não estilo visual. A paleta e os componentes serão definidos depois do Gate 2.

## 10. Referências visuais: princípios aplicáveis

- `referencia.png` (DAW): arranjo em faixas, waveform e mixer como estrutura de Music Studio. Não reproduzir identidade visual de terceiros.
- `tablatura.png`: notação e tablatura alinhadas por compasso. Mostra que o Tab Editor precisa de notação musical além da tablatura.
- `ux_referencia.jpg` e `ux_referencia_2.jpg`: navegação lateral, superfícies escuras, cartões compactos e hierarquia por tamanho de número. Usar esses princípios, sem conteúdo ou marca.

## 11. Acessibilidade

- Confiança e erro: ícone e texto, não só cor (prompt §7).
- Contraste mínimo WCAG AA para texto e controles.
- Navegação por teclado nas telas de edição de eventos.
- Feedback de prática não cobre waveform nem tablatura (prompt §3.9).

## 12. O que fica para depois do Gate 2

- Escolha de bibliotecas (validação de schema, estado de UI, motor de áudio nativo).
- Modelos de separação e transcrição.
- Paleta, tipografia e componentes.
- Android (Capacitor), que segue escopo separado (ver `decisoes.md`).
