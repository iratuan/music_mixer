# @baixaria/exchange-contract

Contrato do arquivo `.mcraft-pack` (versão 1), a única ligação entre o **MixerMonster** e o **ScaleMonster**. Os dois apps funcionam sem o outro instalado. Este pacote existe em cópia idêntica em `mixermonster/packages/` e `scalemonster/packages/`: uma mudança aqui precisa ser copiada para as duas.

Há dois tipos de pacote, no mesmo envelope:

| Tipo | Campo `kind` | Conteúdo | Quem gera | Quem lê |
|---|---|---|---|---|
| Música | ausente ou `"song"` | a linha do baixo de uma música, compasso a compasso, com acordes e seções | MixerMonster (Tablatura → Enviar ao ScaleMonster) | ScaleMonster (Prática → Música) |
| Exercício | `"exercise"` | notas com início e duração em tempos, afinação, nível e origem | MixerMonster (`tooling/make-exercise.mjs`) ou escrito à mão | ScaleMonster (Prática → Música → Exercícios importados) |

O protocolo completo de geração e validação está em [`docs/06-protocolo-exercicios.md`](../../../docs/06-protocolo-exercicios.md).

## API

- **`parseExchange(bytes | texto)`**: lê qualquer um dos dois tipos. Devolve `{ ok, kind: 'song' | 'exercise', pack }` ou `{ ok: false, error, issues? }`. Nunca lança.
- **`parsePack(...)`**: lê só música. Recusa exercício com a mensagem "este arquivo é um exercício".
- **`validateExercise(objeto)`**: valida um exercício e devolve **todos** os problemas, cada um com o caminho do campo.
- **`songToExercise(musica, { title, level, fromBar, toBar, tuning?, description? })`**: gera um exercício a partir de um trecho. Lança erro se o trecho estiver fora da música.
- **`createExercisePack(exercicio, app)`** e **`encodeExercisePack(pack)`**: montam e gravam o arquivo.
- **`createPack`**, **`encodePack`**: mesmo para música.

## Limites do importador

Tamanho máximo de 2 MB. Música: 2000 compassos, 64 notas e 16 acordes por compasso, 200 partes. Exercício: 512 notas e 512 tempos. Texto sem caracteres de controle, com tamanho máximo. Arquivo não confiável: nada é usado antes de validar.

## Versões

Um pacote com `version` maior que a suportada é recusado com aviso para atualizar o ScaleMonster. Campos novos em versões compatíveis devem ser opcionais.

## Testes

- `tests/pack.test.ts`: música.
- `tests/exercise.test.ts`: exercício (validação, geração, envelope e recusas).
- `scalemonster/tests/fixtures/exchange/`: exemplos de música, exercício gerado, exercício manual e exercício inválido de propósito.
- Ferramentas de linha de comando: `node tooling/validate-pack.mjs <arquivo>` (nos dois) e `node tooling/make-exercise.mjs <música> --de N --ate M --titulo "..." --nivel K` (no MixerMonster).
