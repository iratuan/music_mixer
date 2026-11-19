# Protocolo de exercícios (`.mcraft-pack`, kind "exercise")

Este documento define como um exercício de baixo é **gerado**, como é **validado** e como o ScaleMonster o **lê**. A fonte de verdade do contrato é o código em `packages/exchange-contract/src/index.ts` (cópia idêntica em `mixermonster/` e `scalemonster/`). Se este texto e o código divergirem, vale o código, e este texto deve ser corrigido.

## 1. Visão geral

Um exercício tem duas origens, e as duas passam pelo mesmo validador:

| Origem | Quem gera | Ferramenta |
|---|---|---|
| `mixer` | MixerMonster, a partir de um trecho da linha do baixo de uma música | `mixermonster/tooling/make-exercise.mjs` |
| `authored` | Pessoa ou outra ferramenta, escrevendo o JSON à mão | editor de sua escolha, validado por `tooling/validate-pack.mjs` |

O arquivo é o mesmo `.mcraft-pack` das músicas, com o campo `kind` marcando o tipo. Um pacote sem `kind`, ou com `"song"`, é uma música (formato v1 de sempre, sem mudança).

## 2. Envelope

```json
{
  "format": "mcraft-pack",
  "version": 1,
  "kind": "exercise",
  "createdAt": "2026-11-19T10:00:00.000Z",
  "app": { "name": "MixerMonster", "version": "0.5.0-beta.3" },
  "exercise": { "...": "ver seção 3" }
}
```

- `format` deve ser `"mcraft-pack"`.
- `version` deve ser `1`. Uma versão maior é recusada com aviso para atualizar o ScaleMonster.
- `kind` deve ser `"exercise"` para exercício. Qualquer outro valor diferente de `"song"` é recusado.
- `createdAt` e `app` são informativos. `createdAt` inválido é descartado, sem recusar o arquivo.

Um importador de música antigo recusa um pacote de exercício com a mensagem "este arquivo é um exercício, não uma música". Nenhum pacote de um tipo vira outro.

## 3. Exercício

| Campo | Tipo | Regra |
|---|---|---|
| `title` | texto | obrigatório, até 200 caracteres |
| `description` | texto | opcional, até 1000 caracteres |
| `level` | inteiro | de 1 (iniciante) a 5 |
| `instrument` | texto | `"bass"` (único valor por enquanto) |
| `tuning` | lista de inteiros | de 4 a 6 cordas, MIDI das soltas, **da mais grave para a mais aguda**, sem repetir. Cada nota de 23 a 80. Ex.: `[28, 33, 38, 43]` (E A D G) |
| `key` | texto | até 40 caracteres, texto livre (ex.: "Lá menor"). Pode ficar vazio |
| `bpm` | inteiro | de 20 a 400 |
| `origin` | objeto | `{ "type": "mixer" \| "authored", "source": "texto obrigatório" }` |
| `steps` | lista | de 1 a 512 notas, **em ordem de `start`** |

### Nota (`steps[i]`)

| Campo | Tipo | Regra |
|---|---|---|
| `midi` | inteiro | 0 a 127 |
| `start` | número | início em **tempos**, contado do começo do exercício. De 0 a 512, em passos de 0,25 |
| `len` | número | duração em tempos. De 0,25 a 16, em passos de 0,25. `start + len` não pode passar de 512 |
| `string` | inteiro | opcional. Corda, sendo 0 a mais grave. Entre 0 e o número de cordas menos 1 |
| `fret` | inteiro | opcional. Casa de 0 a 24. Só existe junto com `string` |

Regras de corda e casa:

- Se só `string` for informado, a casa é derivada: `fret = midi − tuning[string]`. O validador confere se ela está entre 0 e 24.
- Se `string` e `fret` forem informados, `tuning[string] + fret` tem de ser igual a `midi`.
- `fret` sem `string` é recusado.
- Omitir os dois é válido. O ScaleMonster escolhe a posição.

### Tempo

Um tempo é uma batida da fórmula de compasso de 4 por 4. `start` 0 é o primeiro tempo do exercício, `start` 4 é o início do segundo compasso, e assim por diante. Só são aceitos múltiplos de 0,25 (uma semicolcheia), para evitar erros de ponto flutuante.

## 4. Validação

`validateExercise(objeto)` devolve **todos** os problemas, cada um com o caminho do campo (ex.: `steps[3].start`), não só o primeiro. A validação trata o arquivo como não confiável:

- tipos e faixas de cada campo;
- texto limpo de caracteres de controle e com tamanho máximo;
- ordem das cordas e das notas;
- corda e casa coerentes com a nota;
- tamanho do arquivo: 2 MB no máximo.

Para checar um arquivo antes de importar:

```powershell
cd mixermonster
node tooling/validate-pack.mjs ..\meu-exercicio.mcraft-pack
```

A saída é `OK exercício "…"` (código 0) ou `INVÁLIDO` com a lista de problemas (código 1). O mesmo script funciona para música. Também existe em `scalemonster/tooling/validate-pack.mjs`.

## 5. Geração a partir de uma música (MixerMonster)

1. No MixerMonster, exporte a música com **Tablatura → Enviar ao ScaleMonster**. Isso gera um `.mcraft-pack` de música.
2. Gere o exercício de um trecho, em compassos que começam em 1:

```powershell
cd mixermonster
node tooling/make-exercise.mjs ..\minha-musica.mcraft-pack --de 1 --ate 4 --titulo "Lá menor, 4 compassos" --nivel 2 --descricao "Primeira estrofe"
```

- `--de` e `--ate` são compassos inclusivos.
- Sem `--saida`, o arquivo sai ao lado da música, com `-exercicio` no nome.
- A afinação padrão é `[28, 33, 38, 43]`. A geração recebe outra afinação só por código (`songToExercise`, opção `tuning`).
- O exercício gerado já é validado antes de ser gravado. Se o trecho estiver fora da música, o comando termina com código 1.

O que o gerador faz com as notas: cada nota vira `start = (compasso − primeiro) × 4 + tempo`, e a duração é arredondada para o passo de 0,25. Notas são ordenadas por `start`. **Não grava corda e casa**: o ScaleMonster as deriva quando precisar.

## 6. Importação no ScaleMonster

Em **Prática → Música**, o botão de importação aceita os dois tipos:

- **Música:** abre no treino, como antes.
- **Exercício:** validado e guardado na lista **Exercícios importados**. Cada item tem "Tocar" (abre no treino) e "Remover".
- **Erro:** a mensagem traz o motivo e até 5 problemas do validador. Nada muda.

A lista fica no navegador do aparelho (`localStorage`, até 50 itens). Ao ser lida, cada item é validado de novo, porque o armazenamento pode ter sido alterado por fora. Esse armazenamento **não entra** no backup do banco do ScaleMonster. Se a biblioteca precisar sobreviver a uma troca de aparelho, o próximo passo é gravá-la no banco.

## 7. Como escrever um exercício à mão (origem `authored`)

Exemplo mínimo válido, com escala de Lá menor em quatro notas:

```json
{
  "format": "mcraft-pack",
  "version": 1,
  "kind": "exercise",
  "createdAt": "2026-11-19T10:00:00.000Z",
  "app": { "name": "Meu editor", "version": "1" },
  "exercise": {
    "title": "Lá menor, quatro notas",
    "description": "Sobe e desce uma vez",
    "level": 1,
    "instrument": "bass",
    "tuning": [28, 33, 38, 43],
    "key": "Lá menor",
    "bpm": 80,
    "origin": { "type": "authored", "source": "Eu" },
    "steps": [
      { "midi": 33, "start": 0, "len": 1, "string": 1, "fret": 0 },
      { "midi": 36, "start": 1, "len": 1, "string": 1, "fret": 3 },
      { "midi": 38, "start": 2, "len": 1, "string": 2, "fret": 0 },
      { "midi": 40, "start": 3, "len": 1, "string": 2, "fret": 2 }
    ]
  }
}
```

Salve como `.mcraft-pack` e rode `node tooling/validate-pack.mjs arquivo.mcraft-pack`. Se houver erro, a saída diz o campo.

## 8. Versões e compatibilidade

- Campos novos em versão compatível devem ser **opcionais**, e o validador deve ignorá-los sem recusar o arquivo.
- Um `kind` ou uma `version` novos exigem atualizar o validador e a versão do contrato neste documento antes de publicar qualquer pacote.
- Mudança que quebre leitura exige `version: 2`. Os importadores atuais recusam versões maiores com aviso.

## 9. Testes

- `packages/exchange-contract/tests/exercise.test.ts` (nas duas pastas): validação, geração, envelope e recusas.
- `tests/fixtures/exchange/` (nas duas pastas): exemplo de música, exemplo de exercício gerado e exercício inválido de propósito.
- `tests/exerciseLibrary.test.ts` (ScaleMonster): conversão para o treino e limite da biblioteca.
