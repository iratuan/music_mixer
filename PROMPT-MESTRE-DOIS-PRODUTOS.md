# MASTER PROMPT — Descoberta, Arquitetura e Plano de Separação de Produtos

Atue como Principal Software Architect e Group Product Manager especialista em aplicações musicais desktop (Electron/Tauri/WebAudio/DSP), processamento de mídia local, bancos embarcados e ferramentas educacionais interativas.

Você está analisando o repositório existente deste projeto. Sua missão é conduzir uma descoberta técnica profunda e entregar um plano completo de engenharia e produto para separar a aplicação atual em **dois produtos independentes, distribuíveis separadamente e com identidade própria**, preservando o valor já construído e **sem alterar absolutamente nada no código ou no repositório até a aprovação explícita do usuário**.

---

## 0. Protocolo de Segurança, Governança e Evidência (Inviolável)

1. **Modo Somente Leitura (Read-Only Gate):** É terminantemente proibido editar, criar, mover, renomear ou excluir arquivos, branches, commits, manifests, dependências ou dados nesta fase. Sua saída deve ser exclusivamente o documento de diagnóstico, arquitetura e plano de execução.
2. **Higiene e Respeito ao Estado do Git:** Antes de qualquer análise, inspecione o estado atual do repositório (`git status`, `git branch`, `git diff`, arquivos não rastreados). Trate qualquer alteração local ou arquivo não rastreado como propriedade ativa do usuário. Documente-os no diagnóstico e jamais sugira descartá-los ou sobrescrevê-los.
3. **Rastreabilidade Baseada em Fatos:** Baseie cada conclusão no código-fonte real, schemas de banco, scripts de build, manifests (`package.json`, `Cargo.toml`, `tauri.conf.json`, `electron-builder`, etc.), testes e pontos de entrada. Não tire conclusões baseadas apenas em nomes de diretórios ou documentação desatualizada.
4. **Rotulagem Epistêmica Obrigatória:** Classifique explicitamente afirmações críticas usando tags:
   - `[EVIDÊNCIA]`: comprovado diretamente por arquivo/linha/símbolo do repositório (cite o caminho).
   - `[HIPÓTESE]`: inferência técnica que exige validação ou teste.
   - `[PROPOSTA]`: recomendação de produto ou arquitetura.
   - `[DECISÃO PENDENTE]`: ponto que bloqueia a execução e exige escolha do usuário.
5. **Proibição de Invenção:** Nunca invente métricas de desempenho, taxas de acerto de detecção de pitch/áudio, cobertura de testes ou suporte a formatos que não estejam comprovados no código.

---

## 1. Visão Estratégica: Os Dois Produtos

A separação não pode ser uma fachada visual, um toggle de modo na mesma janela ou dois builds idênticos com ícones diferentes. Cada produto deve ter **ciclo de vida, navegação, armazenamento, bundle e proposta de valor autônomos**:

### Produto A — Estúdio & Mixer (`Mixer`)
* **Promessa Central:** *Obter, organizar, separar, mixar e exportar faixas musicais com controle total sobre o áudio e a biblioteca local.*
* **Foco de Experiência:** Fluxo de produção e estudo auditivo passivo/analítico. O usuário quer encontrar uma música, isolar instrumentos (stems), ajustar volumes/pan/loops, visualizar o acompanhamento harmônico contextual e exportar resultados.
* **Fronteira Negativa (O que NÃO é):** Não é uma escola de música, não possui currículo de trilhas pedagógicas, não calcula XP/streaks, não julga execução do usuário e não exige cadastro de perfil de estudante.
* **Papel da Visualização de Instrumento:** O braço do instrumento (ou teclado/cifras) pode existir apenas como **inspetor contextual e passivo** sincronizado ao player (ex: acompanhar a harmonia/tablatura extraída da faixa), nunca como eixo dominante de navegação ou avaliação.

### Produto B — Formação & Prática Musical (`Aprendizado`)
* **Promessa Central:** *Dominar o instrumento, a harmonia e a percepção auditiva por meio de trilhas estruturadas, prática interativa, teoria aplicada e evolução mensurável.*
* **Foco de Experiência:** Jornada pedagógica ativa. O usuário quer saber o que estudar hoje, praticar exercícios (baixo, guitarra, teclado), treinar o ouvido (Ear Training), consultar teoria com fontes confiáveis e acompanhar seu progresso (XP, precisão, BPM, conquistas).
* **Fronteira Negativa (O que NÃO é):** Não é um gerenciador de downloads de mídia, não hospeda pipelines pesados de separação de stems por IA/DSP e não é uma estação de mixagem multipista.
* **Uso de Músicas na Prática:** O produto deve funcionar 100% de forma autônoma com exercícios nativos, sintetizadores/SoundFonts internos, backing tracks leves e arquivos de áudio próprios importados diretamente pelo usuário — sem exigir a instalação do Produto A.

---

## 2. Metodologia de Descoberta Técnica

Execute a investigação do repositório nas seguintes frentes:

1. **Topologia do Repositório & Build:**
   - Identifique framework desktop/web, linguagem de backend (Node/Python/Rust), empacotador, scripts de build, workers, binários externos (ex: FFmpeg, Demucs/Spleeter/ONNX, yt-dlp) e modelos empacotados.
   - Avalie o peso de cada dependência no tamanho final do instalador e nos requisitos de hardware (CPU/GPU/RAM).
2. **Mapeamento de Domínios & Acoplamentos:**
   - Rastreie o fluxo de dados de ponta a ponta: UI -> Estado (Stores/Context) -> IPC/API -> Serviços de Domínio -> Persistência (SQLite, LocalStorage, IndexedDB, Sistema de Arquivos).
   - Identifique onde regras de negócio do Mixer (ex: gerenciamento de stems/biblioteca) estão misturadas com regras de Aprendizado (ex: charts de exercícios, fretboard, gamificação, teoria).
3. **Auditoria de Persistência & Dados do Usuário:**
   - Mapeie todas as tabelas SQLite, chaves de `localStorage`/`IndexedDB` e pastas em `appData` / `userData`.
   - Identifique riscos de colisão de arquivos, locks de banco e perda de dados durante a separação.
4. **Auditoria de Segurança, IPC, Licenças & Direitos Autorais:**
   - Verifique exposição de APIs no `preload` / IPC, permissões de sistema de arquivos, CSP, execução de processos filhos e validação de URLs/arquivos externos.
   - Verifique licenças de dependências de áudio/IA e garanta que os fluxos de importação/obtenção de mídia exijam autorização do usuário e não contornem DRM, paywalls ou termos de serviço.

---

## 3. Regras de Ouro para Fronteiras e Compartilhamento

Ao propor a arquitetura alvo, aplique rigorosamente estas regras:

1. **Propriedade Única (Single Source of Truth):** Toda funcionalidade e entidade de domínio pertence a **um único produto proprietário**. Não duplique schemas de banco ou regras de negócio.
2. **Independência de Runtime:** O **Mixer** deve iniciar, operar e persistir dados sem o **Aprendizado** instalado. O **Aprendizado** deve iniciar, operar e persistir dados sem o **Mixer** instalado.
3. **Isolamento de Estado Local:** Os produtos **não** devem compartilhar automaticamente o mesmo arquivo SQLite ativo, diretório `userData`, cache de sessão ou configurações de janela (evitando corrupção por acesso concorrente e acoplamento de ciclo de vida).
4. **Pacotes Compartilhados Puramente Técnicos:** Extraia bibliotecas internas (`packages/*` ou módulos isolados) **apenas** para utilitários sem regra de produto (ex: engine de áudio/WebAudio, relógio master de sincronia, parser de teoria musical/escalas, componentes base de UI/Design System, tipos de intercâmbio). O pacote compartilhado nunca pode importar código específico de um dos produtos.
5. **Integração Opcional Baseada em Contrato (Loose Coupling):** Se houver sinergia útil (ex: *"Abrir stem/harmonia gerada no Mixer como base de prática no Aprendizado"*), projete-a como um **contrato de intercâmbio explícito e versionado** (ex: pacote/manifesto `.mcraft-pack` ou esquema JSON documentado via importação/exportação ou deep-link tolerante a falhas), jamais como acesso direto ao banco interno do outro aplicativo.

---

## 4. Estrutura Obrigatória do Relatório de Entrega

Apresente sua análise exatamente nas **12 seções** abaixo, com rigor técnico e clareza executiva:

### 1. Resumo Executivo
- Síntese do diagnóstico atual, por que a separação é necessária, as duas promessas de valor e a recomendação arquitetural principal.

### 2. Diagnóstico Verificado do Repositório
- Estado do Git (branch, alterações pendentes, arquivos não rastreados).
- Stack tecnológica verificada, dependências pesadas (áudio/IA/mídia), estrutura de pastas, testes existentes e lacunas/conflitos encontrados na documentação ou código.

### 3. Matriz Completa de Alocação de Funcionalidades
Tabela detalhada cobrindo **100% das funcionalidades e módulos identificados no repositório**, classificando cada item em exatamente uma categoria:
- `Produto A (Mixer)`
- `Produto B (Aprendizado)`
- `Núcleo Técnico Compartilhado (Sem acoplamento de produto)`
- `Integração Opcional (Contrato de intercâmbio)`
- `Descontinuar / Adiar / Esclarecer`

Colunas obrigatórias: `Funcionalidade` | `Evidência no Código` | `Destino Proposto` | `Dependências Técnicas` | `Impacto no Usuário Atual` | `Justificativa`.

### 4. Definição Detalhada dos Dois Produtos
Para **Produto A (Mixer)** e **Produto B (Aprendizado)** separadamente:
- Público-alvo e dor principal;
- Promessa central e proposta de valor;
- Navegação principal e telas essenciais;
- Lista explícita de **Não-Objetivos (Out of Scope)** para evitar regressão de escopo.

### 5. Jornadas e Fluxos Críticos (Incluindo Edge Cases)
- Fluxo principal ponta a ponta de cada produto;
- Tratamento de estados vazios (primeiro uso sem arquivos/progresso), falhas de processamento/áudio, cancelamento de tarefas longas e retomada de sessão.

### 6. Fronteiras Técnicas, Dados e Segurança
- Separação de processos, IPC/Preload, permissões e validação de entradas não confiáveis (arquivos, metadados, URLs);
- Separação física de armazenamento (`appId`, `productName`, diretórios de dados, arquivos SQLite distintos);
- Especificação do contrato de integração opcional entre os dois produtos (formato, versionamento e comportamento quando o outro app não está instalado).

### 7. Análise Comparativa de Arquitetura e Distribuição
Compare objetivamente pelo menos 3 topologias aplicáveis ao repositório atual:
- **Opção 1:** Monorepo com dois aplicativos/shells independentes + pacotes técnicos compartilhados (`packages/audio-core`, `packages/music-theory`, `packages/ui-kit`, etc.).
- **Opção 2:** Dois repositórios/projetos totalmente separados com publicação de pacotes internos versionados.
- **Opção 3:** Núcleo headless/backend compartilhado com dois frontends/empacotamentos distintos.

Avalie cada opção nos critérios: *isolamento de runtime, tamanho do instalador (peso de IA/FFmpeg), custo de manutenção, velocidade de release independente, complexidade de build/CI e reversibilidade*. Justifique a recomendação vencedora com evidências do projeto.

### 8. Plano de Migração Incremental (Sem Big-Bang)
Divida a execução em etapas pequenas, sequenciais e verificáveis (fatias verticais):
- Para cada etapa: `Objetivo`, `Dono Funcional`, `Módulos/Arquivos Afetados`, `Pré-requisitos`, `Critério Objetivo de Aceite` e `Estratégia de Rollback`.

### 9. Plano de Proteção e Migração de Dados Existentes
- Como preservar bibliotecas de músicas, stems já processados, cadastros de usuários, histórico de sessões, XP e conquistas já salvos no banco atual;
- Fluxo de backup automático pré-migração, importação/exportação explícita e recuperação em caso de falha.

### 10. Estratégia de Testes e Gates de Qualidade
- Testes unitários e de contrato para pacotes compartilhados;
- Testes E2E verificando que o **Mixer** funciona sem o **Aprendizado** e vice-versa;
- Gates de segurança (IPC, arquivos, licenças), acessibilidade e integridade de migração SQLite.

### 11. Decisões Pendentes para o Usuário (Somente o Essencial)
Liste **apenas** decisões de negócio, marca, distribuição ou UX que não podem ser deduzidas do código (ex: nomes finais dos produtos, política de distribuição de modelos de separação de stems, compatibilidade com versões antigas). Para cada pergunta, apresente: `Contexto`, `Opções (A/B/C)`, `Impacto Técnico` e `Recomendação Padrão`.

### 12. Próximo Passo Imediato (Gate de Aprovação)
- Defina exatamente qual será a primeira tarefa executável após o "De Acordo" do usuário e **encerre aguardando aprovação explícita**.