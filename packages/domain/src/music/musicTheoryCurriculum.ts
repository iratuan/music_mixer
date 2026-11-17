/**
 * Academia · Teoria musical e leitura: 7 módulos, 21 tópicos. Cada tópico traz a ideia central, até 3 pontos
 * curtos, exemplo tocável e escrito em pauta, aplicação em cada instrumento, erros comuns, uma pergunta de
 * fixação e a fonte bibliográfica (obrigatória). Os textos são resumos didáticos; a obra citada é a referência
 * para aprofundar.
 */
export type TheorySource = 'guest1' | 'guest2' | 'chediak' | 'med' | 'levine' | 'schoenberg' | 'berklee';

export const THEORY_SOURCES: Readonly<Record<TheorySource, string>> = {
  guest1: 'Guest, Ian. Harmonia: Método Prático, Vol. 1',
  guest2: 'Guest, Ian. Harmonia: Método Prático, Vol. 2',
  chediak: 'Chediak, Almir. Harmonia & Improvisação, Vol. 1',
  med: 'Med, Bohumil. Teoria da Música, 4ª ed.',
  levine: 'Levine, Mark. The Jazz Theory Book',
  schoenberg: 'Schoenberg, Arnold. Harmonia',
  berklee: 'Berklee College of Music. Harmony 1–4 / Music Theory Curriculum',
};

export interface TheoryExample {
  /** Semitons acima da tônica (Dó). */
  readonly semitones: readonly number[];
  /** Em sequência, juntas (acorde/intervalo) ou ritmo (tônica repetida com as durações em tempos). */
  readonly play: 'melodic' | 'harmonic' | 'rhythm';
  /** Durações em tempos (4 = semibreve, 2 = mínima, 1 = semínima, 0,5 = colcheia, 0,25 = semicolcheia, 1,5 = semínima pontuada). */
  readonly rhythm?: readonly number[];
  /** Escrever com bemóis (Mib, Sib) em vez de sustenidos. */
  readonly flats?: boolean;
  /** Armadura de clave em sustenidos (1 = Fá#). */
  readonly keySharps?: number;
  readonly caption: string;
}
export interface TheoryQuiz {
  readonly question: string;
  readonly options: readonly [string, string, string];
  readonly answer: 0 | 1 | 2;
  readonly why: string;
}
export interface TheoryTopic {
  readonly id: string;
  readonly module: number;
  readonly title: string;
  readonly keyIdea: string;
  /** No máximo 3 pontos curtos. */
  readonly points: readonly string[];
  readonly example: TheoryExample;
  readonly inPractice: { readonly bass: string; readonly guitar: string; readonly keyboard: string };
  readonly mistakes: readonly string[];
  readonly quiz: TheoryQuiz;
  readonly source: TheorySource;
  /** Treino correspondente (SCALE_BANK e padrão de exercício). */
  readonly practice?: { readonly family: string; readonly mode: string; readonly pattern: number };
}
export interface TheoryModule {
  readonly id: number;
  readonly title: string;
  readonly topics: readonly TheoryTopic[];
}

export const THEORY_XP_PER_TOPIC = 40;

const MAJ = [0, 2, 4, 5, 7, 9, 11, 12];
type Raw = Omit<TheoryTopic, 'module'>;
const Q = (question: string, options: [string, string, string], answer: 0 | 1 | 2, why: string): TheoryQuiz => ({ question, options, answer, why });

const RAW: ReadonlyArray<{ title: string; topics: readonly Raw[] }> = [
  {
    title: 'Fundamentos do som & leitura básica',
    topics: [
      {
        id: '1.1', title: 'Propriedades do som & notação', source: 'med',
        keyIdea: 'Todo som se descreve por quatro propriedades, e a partitura registra três delas: altura, duração e intensidade.',
        points: ['Altura (grave–agudo), duração, intensidade (forte–fraco) e timbre (a "cor" do instrumento).', 'Clave de Sol para guitarra e teclado (mão direita); clave de Fá para contrabaixo e mão esquerda.', 'A tablatura mostra corda e casa, mas não a duração: combine-a com a pauta.'],
        example: { semitones: [0, 7, 12], play: 'melodic', caption: 'Dó, Sol, Dó: o mesmo timbre em três alturas' },
        inPractice: { bass: 'A música do baixo é escrita em clave de Fá, uma oitava acima do som real.', guitar: 'A guitarra lê em clave de Sol e soa uma oitava abaixo do escrito.', keyboard: 'Mão direita em Sol, mão esquerda em Fá: a pauta dupla (grand staff).' },
        mistakes: ['Confundir intensidade (volume) com altura (grave/agudo).', 'Ler só a tablatura e ignorar a duração das notas.'],
        quiz: Q('Qual propriedade do som diferencia um violão de um piano tocando a mesma nota?', ['Altura', 'Timbre', 'Duração'], 1, 'Com a mesma altura, duração e intensidade, o que muda é o timbre.'),
      },
      {
        id: '1.2', title: 'Figuras rítmicas, compassos & pulsação', source: 'med', practice: { family: 'Pentatônica', mode: 'Menor', pattern: 2 },
        keyIdea: 'O ritmo é o desenho das durações sobre a pulsação constante; o compasso agrupa os tempos.',
        points: ['Da semibreve (4 tempos) à semicolcheia (¼ de tempo); o ponto soma metade do valor.', 'Compasso simples: 4/4, 3/4, 2/4. Composto: 6/8, dois grupos de três colcheias.', 'A ligadura une durações de notas iguais em uma só.'],
        example: { semitones: [0], play: 'rhythm', rhythm: [1, 0.5, 0.5, 1, 1], caption: 'Compasso 4/4: semínima, 2 colcheias, 2 semínimas' },
        inPractice: { bass: 'O baixo é o elo entre bateria e harmonia: cravar o tempo 1 de cada compasso.', guitar: 'Conte em voz alta ("1 e 2 e") enquanto palheta alternado.', keyboard: 'A mão esquerda marca a pulsação enquanto a direita faz o desenho rítmico.' },
        mistakes: ['Acelerar nas colcheias: use o metrônomo.', 'Ler o ponto de aumento como pausa.'],
        quiz: Q('Quantos tempos tem uma semínima pontuada?', ['1', '1,5', '2'], 1, 'A semínima vale 1 e o ponto soma a metade: 1 + 0,5 = 1,5.'),
      },
      {
        id: '1.3', title: 'Tons, semitons & acidentes', source: 'chediak', practice: { family: 'Escalas Simétricas', mode: 'Cromática', pattern: 1 },
        keyIdea: 'O semitom é a menor distância da música ocidental; o tom equivale a dois semitons.',
        points: ['A escala cromática tem 12 semitons por oitava.', 'Sustenido (#) sobe um semitom; bemol (b) desce um semitom.', 'Enarmonia: Dó# e Réb são a mesma tecla ou casa com nomes diferentes.'],
        example: { semitones: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], play: 'melodic', caption: 'Escala cromática, de semitom em semitom' },
        inPractice: { bass: 'Cada casa é um semitom: quatro casas = dois tons (quatro semitons).', guitar: 'Mesma regra em todas as cordas; a casa 12 repete a corda solta uma oitava acima.', keyboard: 'Teclas vizinhas (brancas ou pretas) estão a um semitom; Mi–Fá e Si–Dó não têm tecla preta entre elas.' },
        mistakes: ['Achar que todo intervalo entre teclas brancas é um tom (Mi–Fá é semitom).', 'Escrever Mib como Ré#: o contexto define o nome.'],
        quiz: Q('Quantos semitons há entre Mi e Fá?', ['1', '2', '0'], 0, 'Mi e Fá são vizinhas sem tecla preta no meio: um semitom.'),
      },
    ],
  },
  {
    title: 'Intervalos: a base da harmonia',
    topics: [
      {
        id: '2.1', title: 'Classificação numérica e qualitativa', source: 'guest1', practice: { family: 'Modos Gregos', mode: 'Jônio (Maior)', pattern: 6 },
        keyIdea: 'O número conta as notas envolvidas; a qualidade diz o tamanho exato em semitons.',
        points: ['Dó–Sol é uma 5ª (cinco notas); Dó–Mi, uma 3ª.', 'Justos: 1ª, 4ª, 5ª e 8ª. Os demais são maiores ou menores.', 'Aumentado é um semitom acima do justo/maior; diminuto, um abaixo do justo/menor.'],
        example: { semitones: [0, 4], play: 'harmonic', caption: 'Terça maior: 4 semitons' },
        inPractice: { bass: 'Tônica + quinta justa (duas casas acima, uma corda acima) é o intervalo clássico do baixo.', guitar: 'Power chord = quinta justa; terça maior e menor diferem por uma casa.', keyboard: 'Terça maior = 4 teclas de distância; menor = 3.' },
        mistakes: ['Contar o intervalo a partir de 0 em vez de 1.', 'Chamar a 5ª diminuta de "quinta menor": quintas são justas, aumentadas ou diminutas.'],
        quiz: Q('Quantos semitons tem uma terça menor?', ['3', '4', '5'], 0, 'Terça menor = 3 semitons (Ré–Fá); a maior tem 4.'),
      },
      {
        id: '2.2', title: 'Inversão, consonância & dissonância', source: 'schoenberg',
        keyIdea: 'Inverter um intervalo troca o grave pelo agudo; a estabilidade do som explica por que umas combinações repousam e outras pedem resolução.',
        points: ['Regra dos 9: intervalo + inversão = 9 (3ª maior vira 6ª menor; maior ↔ menor, justo ↔ justo).', 'Consonantes: 3ªs, 6ªs, 5ª e 8ª justas. Dissonantes: 2ªs, 7ªs e o trítono.', 'A dissonância cria tensão e dá movimento à harmonia.'],
        example: { semitones: [0, 6], play: 'harmonic', caption: 'Trítono (4ª aumentada): o intervalo mais tenso' },
        inPractice: { bass: 'Notas guia (3ª e 7ª) formam um trítono no acorde dominante: toque-as com clareza.', guitar: 'Double stops em 6ªs soam doces; em 2ªs, tensos.', keyboard: 'Toque a 7ª e a 3ª do acorde G7 (Fá e Si) e ouça o pedido de resolução.' },
        mistakes: ['Achar que dissonante é "feio": é uma ferramenta de tensão.', 'Esquecer que a 4ª justa inverte em 5ª justa.'],
        quiz: Q('A inversão de uma terça maior é uma...', ['sexta menor', 'sexta maior', 'quinta justa'], 0, '3 + 6 = 9 e maior vira menor: sexta menor.'),
      },
      {
        id: '2.3', title: 'Intervalos no instrumento', source: 'berklee', practice: { family: 'Modos Gregos', mode: 'Jônio (Maior)', pattern: 8 },
        keyIdea: 'No braço, cada intervalo é um desenho fixo que se desloca pelo instrumento inteiro.',
        points: ['Terça maior: uma corda acima, uma casa atrás; quinta justa: uma corda acima, duas casas à frente.', 'Oitava: duas cordas acima, duas casas à frente (no baixo).', 'No teclado, conte as teclas brancas e pretas a partir da tônica.'],
        example: { semitones: [0, 4, 7, 11], play: 'melodic', caption: 'Tônica, 3ª, 5ª e 7ª maiores' },
        inPractice: { bass: 'Decore o desenho 1–5–8 (tônica, quinta, oitava): é a base das linhas de baixo.', guitar: 'Mude de corda mantendo o mesmo desenho; exceto entre a 2ª e a 3ª corda (uma casa de diferença).', keyboard: 'Treine a mão em "arco": polegar na tônica, 3º dedo na terça, 5º na quinta.' },
        mistakes: ['Esquecer a exceção da afinação da guitarra (corda Sol–Si).', 'Contar casas em vez de ouvir o intervalo.'],
        quiz: Q('No baixo, a quinta justa de uma nota fica...', ['na corda de cima, 2 casas à frente', 'na mesma corda, 5 casas à frente', 'na corda de baixo, 1 casa atrás'], 0, 'O desenho clássico: uma corda acima e duas casas à frente.'),
      },
    ],
  },
  {
    title: 'Escalas maiores, menores & pentatônicas',
    topics: [
      {
        id: '3.1', title: 'Escala maior & ciclo das quintas', source: 'med', practice: { family: 'Modos Gregos', mode: 'Jônio (Maior)', pattern: 1 },
        keyIdea: 'A escala maior é a régua da harmonia tonal: todas as outras são comparadas com ela.',
        points: ['Estrutura: tom, tom, semitom, tom, tom, tom, semitom.', 'Ciclo das quintas: cada quinta acima acrescenta um sustenido; cada quinta abaixo, um bemol.', 'A armadura de clave indica as notas alteradas da tonalidade.'],
        example: { semitones: MAJ, play: 'melodic', caption: 'Escala de Dó maior' },
        inPractice: { bass: 'Toque a escala em uma posição (4 casas) e depois pelo braço todo.', guitar: 'Use 3 notas por corda; o desenho se repete com a mesma digitação em qualquer tom.', keyboard: 'Digitação clássica: polegar passa por baixo após o 3º dedo (Dó maior: 1-2-3-1-2-3-4-5).' },
        mistakes: ['Esquecer o semitom entre o 3º–4º e o 7º–8º graus.', 'Decorar tons sem entender o ciclo das quintas.'],
        quiz: Q('Qual tonalidade tem um sustenido na armadura?', ['Fá maior', 'Sol maior', 'Ré maior'], 1, 'Sol maior tem Fá# (a quinta acima de Dó).'),
      },
      {
        id: '3.2', title: 'Escalas menores: natural, harmônica e melódica', source: 'guest1', practice: { family: 'Menor Harmônica', mode: 'Padrão', pattern: 1 },
        keyIdea: 'As três menores diferem só no 6º e 7º graus; cada uma resolve um problema melódico ou harmônico.',
        points: ['Natural: 6º e 7º graus abaixados (b6 e b7).', 'Harmônica: 7º grau elevado, criando a sensível que resolve na tônica.', 'Melódica: sobe com 6º e 7º maiores; na descida, volta à natural.'],
        example: { semitones: [0, 2, 3, 5, 7, 8, 11, 12], play: 'melodic', flats: true, caption: 'Dó menor harmônica (note o Si natural)' },
        inPractice: { bass: 'A sensível em linhas de baixo cria um salto característico (Láb–Si).', guitar: 'A harmônica dá o som "oriental/clássico" em solos neoclássicos.', keyboard: 'Mantenha a armadura da natural e acrescente o acidente do 7º grau.' },
        mistakes: ['Tratar a menor natural como "a" menor: a harmônica é a base da harmonia funcional.', 'Esquecer que a melódica clássica desce como natural.'],
        quiz: Q('O que a escala menor harmônica altera em relação à natural?', ['O 3º grau', 'O 7º grau', 'O 5º grau'], 1, 'Eleva o 7º grau, formando a sensível.'),
      },
      {
        id: '3.3', title: 'Pentatônicas & blue note', source: 'chediak', practice: { family: 'Escala Blues', mode: 'Menor', pattern: 1 },
        keyIdea: 'Cinco notas e nenhum semitom: a escala que "não erra" e sustenta o rock, o blues e o groove.',
        points: ['Maior: 1-2-3-5-6. Menor: 1-b3-4-5-b7.', 'Sem semitons, não há trítono: soa bem sobre quase tudo.', 'Blue note: o b5 acrescentado à pentatônica menor dá o som do blues.'],
        example: { semitones: [0, 3, 5, 6, 7, 10, 12], play: 'melodic', flats: true, caption: 'Pentatônica menor com blue note (Solb)' },
        inPractice: { bass: 'Ótima para improvisar linhas de groove sobre um acorde só.', guitar: 'Os 5 shapes (CAGED) cobrem o braço todo; comece pelo shape 1.', keyboard: 'Toque a pentatônica na mão direita sobre acordes na esquerda.' },
        mistakes: ['Usar a pentatônica menor sobre acorde maior sem cuidado com a terça.', 'Esquecer que a blue note passa rápido; não é para ficar parado nela.'],
        quiz: Q('Quantas notas tem uma pentatônica?', ['5', '6', '7'], 0, 'Penta = cinco.'),
      },
    ],
  },
  {
    title: 'Formação de acordes: tríades & tétrades',
    topics: [
      {
        id: '4.1', title: 'Tríades fundamentais', source: 'guest1', practice: { family: 'Modos Gregos', mode: 'Jônio (Maior)', pattern: 7 },
        keyIdea: 'Um acorde é feito de terças sobrepostas: a qualidade da tríade depende do tamanho dessas terças.',
        points: ['Maior: 1-3-5. Menor: 1-b3-5.', 'Diminuta: 1-b3-b5. Aumentada: 1-3-#5.', 'Toda tríade é uma terça sobre outra terça.'],
        example: { semitones: [0, 4, 7], play: 'harmonic', caption: 'Dó maior (1-3-5)' },
        inPractice: { bass: 'Arpejar a tríade (1-3-5-3) já forma uma linha de baixo completa.', guitar: 'Tríades em 3 cordas adjacentes são a base dos voicings.', keyboard: 'Mão direita: 1-3-5 com polegar, terceiro e quinto dedos.' },
        mistakes: ['Confundir a diminuta (b3 e b5) com a menor (b3 e 5).', 'Esquecer o contexto de tonalidade: o nome vem da qualidade.'],
        quiz: Q('Qual é a fórmula de uma tríade menor?', ['1-3-5', '1-b3-5', '1-b3-b5'], 1, 'Menor tem terça menor e quinta justa.'),
      },
      {
        id: '4.2', title: 'Tétrades & cifras', source: 'chediak', practice: { family: 'Modos Gregos', mode: 'Mixolídio', pattern: 8 },
        keyIdea: 'A sétima dá cor ao acorde e define a sua função: repouso, afastamento ou tensão.',
        points: ['7M (1-3-5-7), 7 (1-3-5-b7), m7 (1-b3-5-b7), m7(b5) e dim7.', 'Cifra: letra da tônica + qualidade (C7M, Dm7, G7, Bm7(b5)).', 'Só o acorde com 7ª menor e terça maior é "dominante".'],
        example: { semitones: [0, 4, 7, 10], play: 'harmonic', flats: true, caption: 'Dó com sétima (C7)' },
        inPractice: { bass: 'Notas-guia: 3ª e 7ª definem a cor; toque-as em tempos fortes.', guitar: 'Voicings de 4 notas em cordas adjacentes; priorize 3ª e 7ª.', keyboard: 'A mão esquerda faz tônica e quinta; a direita, terça e sétima.' },
        mistakes: ['Cifrar C7M como C7: um é maior sete, o outro é dominante.', 'Esquecer o b5 no m7(b5) (meio-diminuto).'],
        quiz: Q('Qual acorde tem terça maior e sétima menor?', ['C7M', 'Cm7', 'C7'], 2, 'O dominante (C7) tem 1-3-5-b7.'),
      },
      {
        id: '4.3', title: 'Inversões & baixo cifrado', source: 'levine',
        keyIdea: 'Mudar a nota do baixo muda o caráter do acorde e permite linhas de baixo que caminham em grau conjunto.',
        points: ['Estado fundamental: tônica no baixo. 1ª inversão (/3) e 2ª inversão (/5) trocam a nota grave.', 'Slash chord: C/E é Dó maior com Mi no baixo.', 'Baixos que caminham por grau conjunto soam como melodia.'],
        example: { semitones: [-8, 0, 7], play: 'harmonic', caption: 'C/E: Dó maior com Mi no baixo' },
        inPractice: { bass: 'O baixista decide o slash chord: toque a nota indicada após a barra.', guitar: 'Use o dedo mais grave para a nota de baixo; abafe cordas graves que não fazem parte.', keyboard: 'A mão esquerda toca só a nota de baixo, a direita o acorde.' },
        mistakes: ['Tocar a tônica quando a cifra pede outra nota de baixo.', 'Ler C/E como acorde de Mi.'],
        quiz: Q('No acorde C/G, qual nota fica no baixo?', ['Dó', 'Mi', 'Sol'], 2, 'O que vem depois da barra é a nota de baixo.'),
      },
    ],
  },
  {
    title: 'Campo harmônico & funções',
    topics: [
      {
        id: '5.1', title: 'Campo harmônico maior', source: 'guest1', practice: { family: 'Modos Gregos', mode: 'Jônio (Maior)', pattern: 8 },
        keyIdea: 'Empilhando terças sobre cada grau da escala maior, obtém-se os acordes naturais da tonalidade.',
        points: ['Tríades: I, IIm, IIIm, IV, V, VIm, VIIdim.', 'Tétrades: I7M, IIm7, IIIm7, IV7M, V7, VIm7, VIIm7(b5).', 'Em Dó: C7M, Dm7, Em7, F7M, G7, Am7, Bm7(b5).'],
        example: { semitones: [0, 2, 4, 5, 7, 9, 11], play: 'melodic', caption: 'Fundamentais do campo harmônico de Dó' },
        inPractice: { bass: 'Conheça os 7 graus como números; transponha qualquer música trocando o tom.', guitar: 'Toque a progressão I–IV–V–VI em vários tons usando formas móveis.', keyboard: 'Toque cada acorde do campo em estado fundamental, da esquerda para a direita.' },
        mistakes: ['Esquecer que o VII é meio-diminuto (m7b5) nas tétrades.', 'Misturar acordes de tonalidades diferentes sem intenção.'],
        quiz: Q('Qual é o IIm7 no campo harmônico de Dó maior?', ['Dm7', 'Em7', 'Am7'], 0, 'O 2º grau de Dó é Ré: Dm7.'),
      },
      {
        id: '5.2', title: 'Funções harmônicas', source: 'guest1', practice: { family: 'Modos Gregos', mode: 'Dórico', pattern: 6 },
        keyIdea: 'Os acordes se agrupam em três funções: repouso, afastamento e tensão; a música é o ciclo entre elas.',
        points: ['Tônica (I, VIm): repouso. Subdominante (IV, IIm): afastamento. Dominante (V7): tensão.', 'O trítono do V7 (3ª e 7ª) pede resolução na tônica.', 'Cadência II–V–I: Dm7, G7, C7M.'],
        example: { semitones: [2, 7, 0], play: 'melodic', caption: 'Fundamentais da cadência II–V–I em Dó (Ré, Sol, Dó)' },
        inPractice: { bass: 'A resolução V→I (quinta descendente) é o movimento mais natural do baixo.', guitar: 'Toque o II–V–I em 3 formas diferentes de acorde no braço.', keyboard: 'Na mão direita, conduza vozes: a 7ª do Dm7 desce para a 3ª do G7.' },
        mistakes: ['Confundir tensão com erro.', 'Ignorar a função: acordes diferentes podem ter a mesma função (I e VIm).'],
        quiz: Q('Qual função tem o acorde V7?', ['Tônica', 'Subdominante', 'Dominante'], 2, 'O V7 cria tensão e resolve na tônica.'),
      },
      {
        id: '5.3', title: 'Campo harmônico menor', source: 'berklee', practice: { family: 'Modos Gregos', mode: 'Eólio (Menor)', pattern: 7 },
        keyIdea: 'O campo menor tem três versões (natural, harmônica e melódica) e permite emprestar acordes do modo paralelo.',
        points: ['Natural: Im7, IIm7(b5), bIII7M, IVm7, Vm7, bVI7M, bVII7.', 'Harmônico: o V7 maior e o VIIdim7 dão resolução forte.', 'Empréstimo modal: pegar um acorde do modo paralelo (ex.: bVI e IVm em tom maior).'],
        example: { semitones: [0, 2, 3, 5, 7, 8, 10], play: 'melodic', flats: true, caption: 'Fundamentais do campo menor natural' },
        inPractice: { bass: 'Em tons menores, enfatize b3 e b7 para fixar a cor.', guitar: 'Pentatônica menor funciona sobre quase toda a progressão menor.', keyboard: 'Troque o V menor pelo V7 para dar resolução ao fim da frase.' },
        mistakes: ['Usar sempre o Vm7: sem o V7, falta a tensão final.', 'Chamar de "menor" o empréstimo modal sem entender de onde vem o acorde.'],
        quiz: Q('Na harmonia menor harmônica, o acorde V é...', ['menor', 'dominante (V7)', 'diminuto'], 1, 'A sensível transforma o V em dominante.'),
      },
    ],
  },
  {
    title: 'Modos gregos: introdução prática',
    topics: [
      {
        id: '6.1', title: 'Escala-mãe vs. centro tonal', source: 'levine', practice: { family: 'Modos Gregos', mode: 'Dórico', pattern: 1 },
        keyIdea: 'Os 7 modos usam as mesmas notas da escala maior; o que muda é onde fica o "repouso".',
        points: ['Cada modo começa em um grau da escala maior (Dó maior → Ré dórico, Mi frígio...).', 'O centro tonal é a nota de repouso; o fundo harmônico a confirma.', 'Cada modo tem uma nota característica que o distingue.'],
        example: { semitones: [2, 4, 5, 7, 9, 11, 12, 14], play: 'melodic', caption: 'Ré dórico: as notas de Dó maior começando em Ré' },
        inPractice: { bass: 'Sustente a tônica do modo no baixo para firmar o centro tonal.', guitar: 'Toque o shape da escala maior, mas aponte para a nota de repouso do modo.', keyboard: 'Mantenha um bordão na tônica do modo com a mão esquerda.' },
        mistakes: ['Tocar o desenho da escala maior sem estabelecer o novo centro.', 'Achar que modo é "outra" escala: é a mesma, com outro centro.'],
        quiz: Q('Qual modo tem as mesmas notas de Dó maior, mas começa em Ré?', ['Frígio', 'Dórico', 'Lídio'], 1, 'Ré é o 2º grau: dórico.'),
      },
      {
        id: '6.2', title: 'Modos maiores: Jônio, Lídio e Mixolídio', source: 'levine', practice: { family: 'Modos Gregos', mode: 'Lídio', pattern: 1 },
        keyIdea: 'Os três modos maiores diferem em uma nota: o 4º grau (lídio) e o 7º grau (mixolídio).',
        points: ['Jônio é a própria escala maior.', 'Lídio: 4ª aumentada (#11), som aberto e brilhante.', 'Mixolídio: 7ª menor (b7), o modo do acorde dominante e do rock.'],
        example: { semitones: [0, 2, 4, 6, 7, 9, 11, 12], play: 'melodic', caption: 'Dó lídio (com o Fá#)' },
        inPractice: { bass: 'Mixolídio sobre um acorde dominante: use b7 como nota de passagem.', guitar: 'Lídio brilha sobre acorde maior com 7M e #11.', keyboard: 'Compare Dó jônio, lídio e mixolídio trocando só uma tecla.' },
        mistakes: ['Esquecer o #11 do lídio.', 'Usar o jônio sobre dominante: a 7ª maior briga com o b7.'],
        quiz: Q('Qual modo tem a 4ª aumentada?', ['Lídio', 'Mixolídio', 'Dórico'], 0, 'O lídio tem #11 (4ª aumentada).'),
      },
      {
        id: '6.3', title: 'Modos menores & Lócrio', source: 'guest2', practice: { family: 'Modos Gregos', mode: 'Dórico', pattern: 10 },
        keyIdea: 'Dórico, frígio e eólio são menores com cores distintas; o lócrio é meio-diminuto.',
        points: ['Dórico: menor com 6ª maior, o som do groove e do fusion.', 'Frígio: 2ª menor, som espanhol. Eólio: menor natural.', 'Lócrio: b2 e b5, o modo do acorde m7(b5).'],
        example: { semitones: [0, 2, 3, 5, 7, 9, 10, 12], play: 'melodic', flats: true, caption: 'Dó dórico (note o Lá natural)' },
        inPractice: { bass: 'Dórico no funk e no soul: aproveite a 6ª maior como nota de cor.', guitar: 'Dórico sobre m7 é a escolha de solos em fusion.', keyboard: 'Toque o acorde m7 com a 6ª maior para ouvir a cor dórica.' },
        mistakes: ['Confundir dórico com eólio: a diferença é a 6ª.', 'Usar o lócrio sobre acorde menor comum.'],
        quiz: Q('Qual é a nota característica do modo dórico?', ['2ª menor', '6ª maior', '4ª aumentada'], 1, 'A 6ª maior distingue o dórico do eólio.'),
      },
    ],
  },
  {
    title: 'Leitura de partitura',
    topics: [
      {
        id: '7.1', title: 'Pauta, claves & linhas suplementares', source: 'med',
        keyIdea: 'A pauta tem cinco linhas e quatro espaços; a clave diz qual nota está em qual linha.',
        points: ['Clave de Sol: a 2ª linha é Sol. Notas de baixo para cima: Mi, Sol, Si, Ré, Fá (linhas) e Fá, Lá, Dó, Mi (espaços).', 'Clave de Fá: a 4ª linha é Fá. Linhas: Sol, Si, Ré, Fá, Lá.', 'Linhas suplementares estendem a pauta além das cinco linhas.'],
        example: { semitones: [0, 2, 4, 5, 7, 9, 11, 12], play: 'melodic', caption: 'Escala de Dó maior escrita na pauta' },
        inPractice: { bass: 'O baixo lê em clave de Fá; o Mi grave (corda solta) está abaixo da pauta, em linha suplementar.', guitar: 'A guitarra lê em clave de Sol; a 1ª corda solta (Mi) está no espaço abaixo da 1ª linha.', keyboard: 'Dó central fica em linha suplementar entre as duas claves, na pauta dupla.' },
        mistakes: ['Ler a nota certa na clave errada.', 'Esquecer que a guitarra e o baixo soam uma oitava abaixo do escrito.'],
        quiz: Q('Em clave de Sol, onde está a nota Sol?', ['Na 2ª linha', 'Na 1ª linha', 'Na 5ª linha'], 0, 'A clave de Sol "enrola" na segunda linha, que é a nota Sol.'),
      },
      {
        id: '7.2', title: 'Leitura rítmica: figuras e pausas', source: 'med', practice: { family: 'Pentatônica', mode: 'Menor', pattern: 3 },
        keyIdea: 'Cada figura tem um desenho e um valor; leia o compasso como um conjunto de tempos.',
        points: ['Semibreve (4 tempos, sem haste), mínima (2, cabeça vazia com haste), semínima (1, cabeça cheia).', 'Colcheia (½, uma bandeirola), semicolcheia (¼, duas bandeirolas). Hastes juntas formam barra.', 'O ponto soma metade do valor; cada figura tem a sua pausa.'],
        example: { semitones: [4], play: 'rhythm', rhythm: [1.5, 0.5, 1, 1], caption: 'Compasso 4/4: semínima pontuada, colcheia, 2 semínimas' },
        inPractice: { bass: 'Leia o compasso inteiro antes de tocar; marque o tempo 1 com o pé.', guitar: 'Bata o ritmo na palma antes de pegar a guitarra.', keyboard: 'Cada mão pode ter um ritmo diferente: conte pelos tempos, não pelas notas.' },
        mistakes: ['Ler cada figura isolada em vez do compasso.', 'Ignorar as pausas: elas valem tempo.'],
        quiz: Q('Quantas colcheias cabem em uma mínima?', ['2', '4', '8'], 1, 'Mínima = 2 tempos = 4 colcheias.'),
      },
      {
        id: '7.3', title: 'Armadura, acidentes & leitura melódica', source: 'med', practice: { family: 'Modos Gregos', mode: 'Jônio (Maior)', pattern: 1 },
        keyIdea: 'A armadura poupa acidentes: leia-a antes de começar e lembre-se dela em toda a peça.',
        points: ['A armadura (sustenidos ou bemóis logo após a clave) vale para todas as oitavas.', 'O acidente de ocorrência vale só até o fim do compasso (o bequadro cancela).', 'Leia a melodia por contorno: grau conjunto (passo) ou salto, subindo ou descendo.'],
        example: { semitones: [7, 9, 11, 12, 14, 16, 18, 19], play: 'melodic', keySharps: 1, caption: 'Escala de Sol maior com armadura de um sustenido (Fá#)' },
        inPractice: { bass: 'Antes de tocar, confira a armadura e marque os acidentes nas casas.', guitar: 'Pense na tonalidade (Sol maior) e use o shape da escala correspondente.', keyboard: 'Em Sol maior toque Fá# sempre que ler Fá, até que algum acidente indique o contrário.' },
        mistakes: ['Esquecer a armadura e tocar a nota natural.', 'Achar que o acidente vale para o resto da peça.'],
        quiz: Q('Quantos sustenidos tem a armadura de Sol maior?', ['1', '2', '3'], 0, 'Sol maior tem um sustenido: Fá#.'),
      },
    ],
  },
];

export const THEORY_MODULES: readonly TheoryModule[] = RAW.map((m, i) => ({
  id: i + 1,
  title: m.title,
  topics: m.topics.map((t) => ({ ...t, module: i + 1 })),
}));
export const THEORY_TOPICS: readonly TheoryTopic[] = THEORY_MODULES.flatMap((m) => m.topics);
