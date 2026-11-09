# Relatório de viabilidade e segurança — Baixaria Fina

**Data:** 7 de novembro de 2026  
**Escopo:** avaliar se a aplicação pretendida pode ser construída com segurança usando Electron, React, TypeScript e um alvo Android separado via Capacitor.  
**Status do projeto:** estrutura de diretórios e especificação; ainda não há código, dependências, protótipos ou testes da nova implementação.

## 1. Conclusão executiva

**Conclusão: viável com condições e desenvolvimento por etapas.**

É tecnicamente possível construir o produto para Windows, macOS e Linux com Electron e oferecer uma aplicação Android separada com Capacitor. React e partes do domínio podem ser compartilhados. Electron, porém, não gera a aplicação Android, e a capacidade de compartilhar interface não significa que processamento de áudio, permissões, desempenho ou acesso a dispositivos serão iguais nas plataformas.

Os maiores desafios não são a montagem básica da interface: são a captura/reprodução de áudio de baixa latência, a separação e transcrição confiáveis, a manutenção da sincronização, a distribuição segura de modelos e dependências nativas e o tratamento de arquivos de mídia não confiáveis. Esses pontos não podem ser aprovados apenas por revisão de arquitetura. Precisam de provas técnicas, testes em dispositivos reais e critérios mensuráveis antes de prometer precisão ou paridade entre plataformas.

**Recomendação:** prosseguir com arquitetura e protótipos pequenos; não iniciar a implementação completa nem anunciar a qualidade musical como garantida antes dos gates descritos neste relatório. A organização atual em camadas é um bom ponto de partida, mas ainda não constitui uma arquitetura validada ou um produto seguro.

## 2. Escopo e limites da avaliação

Esta avaliação considera:

- requisitos e diretrizes do prompt mestre;
- a estrutura de pastas vazia em `baixaria-fina/`;
- o uso previsto de Electron para desktop e Capacitor para Android.

Não foram avaliados código novo, dependências, configurações de build, mecanismos de atualização, plugins, modelos ou instaladores, pois ainda não existem. Portanto:

- não é auditoria de segurança nem certificação;
- não confirma que um componente específico é seguro;
- não valida precisão de separação, transcrição, afinação ou sincronização;
- não garante compatibilidade com todos os dispositivos de áudio;
- as conclusões devem ser atualizadas quando as escolhas de implementação forem feitas.

## 3. Viabilidade por capacidade

| Capacidade | Viabilidade | Condições e observações |
|---|---|---|
| Desktop Windows/macOS/Linux com Electron, React e TypeScript | Alta | Exige empacotamento, assinatura, permissões e testes por sistema. Recursos nativos não são automaticamente portáveis. |
| Aplicação Android | Viável, com escopo próprio | Usar runtime separado, como Capacitor. Permissões, plugins e limitações de áudio Android precisam ser testados em aparelhos reais. |
| Compartilhamento de UI e domínio entre desktop e Android | Parcial/alta | Regras musicais, modelos de dados e componentes compatíveis podem ser compartilhados; integrações, navegação e áudio podem divergir. |
| Importação e reprodução de áudio | Alta, sujeita à seleção dos codecs | Formatos, codecs, licenças, arquivos grandes e tratamento de erro devem ser validados nos alvos distribuídos. |
| Exportação individual de stems, inclusive MP3 | Alta, condicionada ao encoder escolhido | Validar licença/redistribuição, qualidade, duração, metadados e alinhamento temporal do resultado. |
| Captura de instrumento e afinador em tempo real | Viável, mas de risco técnico elevado | Latência e disponibilidade variam com driver, interface, navegador/runtime e sistema. Deve haver calibração e modos degradados explícitos. |
| Separação automática de instrumentos | Viável como recurso assistido, não garantido | Qualidade, tempo, memória, tamanho de modelos, backend CPU/GPU, licenças e hardware são variáveis. A interface deve mostrar falhas e incerteza. |
| Transcrição confiável para tablatura | Viável como assistência revisável | Não presumir transcrição perfeita. Avaliar com gravações de referência e oferecer correção manual. |
| Sincronização consistente entre áudio, tablatura, braço e avaliação | Viável com arquitetura e validação apropriadas | Depende de relógio de áudio central, modelo de eventos único, compensação sem duplicação e testes de drift/latência. |
| Distribuição local/offline | Viável, com custo operacional | Modelos e runtimes aumentam o tamanho; instalação, atualização, permissões e fallback precisam de estratégia por plataforma. |

## 4. Fronteiras de confiança e principais riscos

| Risco | Nível inicial | Impacto potencial | Controles recomendados |
|---|---|---|---|
| Conteúdo do renderer comprometido ou com acesso excessivo ao sistema | Alto | Acesso a arquivos, execução de ações locais ou exposição de projetos | `contextIsolation` e sandbox habilitados; `nodeIntegration` desabilitado; CSP restritiva; sem conteúdo remoto desnecessário; preload mínimo; Electron Fuses conforme aplicável. |
| IPC permissivo ou payloads não validados | Alto | Ações locais indevidas, acesso a caminhos arbitrários ou falhas | Canais allowlist; validar esquema, tamanho, origem e estado da operação no processo principal; não expor APIs genéricas de shell ou filesystem. |
| Arquivos de áudio, projetos ou arquivos compactados malformados | Alto | Travamentos, consumo excessivo, falhas de parser ou escrita fora da pasta esperada | Tratar como entrada não confiável; limitar tamanho/duração; validar formatos; cancelar operações; usar bibliotecas mantidas; isolar decodificação/inferência quando justificável; impedir traversal na extração de ZIP. |
| Dependências npm, plugins, codecs e binários nativos | Alto | Vulnerabilidade transitiva, comportamento inesperado ou distribuição incompatível | Minimizar dependências; fixar e revisar versões; auditoria contínua; SBOM; verificar origem e licença; rebuild e assinatura controlados de módulos nativos. |
| Modelos, samples e ferramentas auxiliares | Médio/alto | Licença incompatível, download adulterado, executável inseguro ou tamanho excessivo | Verificar origem, hash e licença; evitar execução arbitrária de scripts baixados; empacotar apenas artefatos redistribuíveis; comunicar downloads e fallback. |
| Atualização e instaladores sem integridade comprovada | Alto | Instalação de pacote adulterado ou downgrade | Assinar artefatos; proteger canal e metadados de atualização; validar assinatura antes de instalar; planejar rollback e processo de release auditável. |
| Áudio capturado e arquivos musicais do usuário | Médio/alto (privacidade) | Exposição de gravações ou projetos | Processamento local por padrão; pedir permissão no contexto; explicar qualquer envio remoto; proteger diretórios e logs; não registrar áudio ou caminhos privados sem necessidade. |
| Execução pesada de DSP/modelos no processo principal | Médio/alto | Interface congelada, consumo excessivo, perda de áudio ou falhas | Processar fora da UI; limites de recursos, cancelamento e timeout; monitorar uso; apresentar progresso e erro real. |
| Divergência de latência ou relógio entre camadas | Alto (integridade funcional) | Avaliação injusta e representação musical incorreta | Fonte temporal de áudio única; distinguir captura, detecção e execução estimada; calibrar por dispositivo; medir drift e eventos perdidos; permitir desativar avaliação quando a confiança for insuficiente. |
| Supor paridade de áudio entre desktop e Android | Alto (viabilidade) | Recursos indisponíveis ou latência inadequada no mobile | Adaptadores separados; definir matriz de capacidades; validar em interfaces/dispositivos reais; lançar Android com escopo compatível e claramente documentado. |
| Assinatura e empacotamento multiplataforma | Médio | Builds indisponíveis, alertas do sistema operacional ou cadeia de release frágil | Builds reproduzíveis por alvo; assinatura/notarização onde necessário; CI com credenciais protegidas; testes de instalação e atualização em cada sistema. |

Os níveis são uma triagem inicial, não resultados de exploração ou auditoria.

## 5. Arquitetura recomendada para reduzir risco

1. **Renderer sem autoridade:** React apresenta estado e solicita operações específicas; não acessa diretamente filesystem, shell, banco de dados ou módulos nativos.
2. **Processo principal como fronteira:** Electron main valida cada operação e limita caminhos às pastas autorizadas pelo usuário ou às áreas internas do aplicativo.
3. **Preload estreito:** API explícita e tipada, sem encaminhador IPC genérico. Validar também em runtime; tipos TypeScript não validam dados recebidos.
4. **Domínio independente:** regras de notas, afinações, eventos e mapeamento do braço não dependem de Electron, React, Capacitor nem de codecs.
5. **Adaptadores por plataforma:** áudio, permissões, importação, notificações e persistência podem ter implementações diferentes atrás de contratos estáveis.
6. **Processamento isolado:** decodificação, DSP e inferência não devem bloquear a UI nem o relógio de reprodução. A decisão por processo auxiliar ou módulo nativo deve vir de protótipos, não de suposição.
7. **Persistência versionada:** validar schema ao abrir/importar projetos; suportar migrações e recuperação; manter arquivos de mídia separados de metadados.
8. **Falha segura:** quando o modelo, dispositivo ou backend não estiver disponível, interromper a operação com explicação. Não exibir resultado simulado como separação ou transcrição real.
9. **Capacidades declaradas:** cada plataforma deve informar quais operações suporta e com quais limitações. Interface compartilhada não deve ocultar diferenças do runtime.

## 6. Plano de validação e gates

### Gate A — decisões de segurança antes do primeiro build funcional

- Definir política de conteúdo e CSP, permissões Electron, canais IPC e política de navegação.
- Selecionar frameworks de validação de payload e versionamento do formato de projeto.
- Definir como importar, armazenar, remover e exportar áudio sem aceitar caminhos arbitrários do renderer.
- Escolher dependências e codecs somente após análise de manutenção, vulnerabilidades e licença.

**Aprovar quando:** as fronteiras de confiança estiverem documentadas e revisadas; nenhum acesso privilegiado genérico estiver disponível ao renderer.

### Gate B — prova técnica de áudio e sincronização

- Comparar captura/reprodução no desktop e em Android real.
- Medir latência de entrada/saída, jitter, estabilidade e drift em diferentes buffers.
- Validar notas graves, erros de oitava e sequências de referência conhecidas.
- Testar fallback sem GPU e comportamento quando o modelo não pode ser carregado.
- Determinar quais recursos não são suportados em cada plataforma.

**Aprovar quando:** houver medições reproduzíveis e critérios de aceitação por alvo; a avaliação puder recusar resultados de baixa confiança.

### Gate C — formatos e processamento de arquivos não confiáveis

- Testar mídia truncada, inválida, grande e com metadados incomuns.
- Testar projetos e ZIPs inválidos, incluindo caminhos malformados e limites de recursos.
- Verificar cancelamento, limpeza de temporários e recuperação após falhas.

**Aprovar quando:** operações não resultarem em escrita fora do escopo autorizado, travamento permanente ou consumo sem limites definidos.

### Gate D — distribuição e atualização

- Empacotar e instalar em Windows, macOS (incluindo Apple Silicon), Linux e Android.
- Verificar assinatura, integridade, permissões, atualização, rollback e remoção.
- Produzir inventário de dependências e revisar licenças de modelos, samples e codecs.

**Aprovar quando:** cada alvo tiver build e atualização testados, artefatos verificáveis e limitações documentadas.

### Gate E — qualidade musical e lançamento

- Medir pitch, oitava, onset, duração, sincronização, exportação e confiança em conjunto de referência.
- Incluir testes de regressão para 4, 5 e 6 cordas, afinações e dispositivos.
- Realizar revisão de segurança das fronteiras e dependências antes de distribuir.

**Aprovar quando:** os resultados atenderem metas definidas com dados medidos; falhas e limitações forem visíveis ao usuário.

## 7. Decisões necessárias antes de compromissos de escopo

Estas escolhas podem ser investigadas durante os protótipos, mas não devem ser presumidas:

- Android será uma versão completa ou uma edição de prática/afinador com escopo menor?
- Separação e transcrição serão obrigatoriamente locais, ou haverá opção remota explícita?
- Quais sistemas operacionais e versões mínimas serão suportados no primeiro lançamento?
- Quais dispositivos/interfaces de áudio compõem a matriz mínima de testes?
- Modelos e samples poderão ser baixados sob demanda ou deverão acompanhar o instalador?
- Qual tamanho de instalação, tempo de processamento e latência são aceitáveis?
- Quais formatos de projeto/tablatura e requisitos de interoperabilidade são prioritários?

## 8. Parecer final

O objetivo é **executável com segurança**, desde que “com segurança” signifique aplicar controles verificáveis, minimizar privilégios, testar formatos e dependências, proteger áudio e validar cada plataforma separadamente. Segurança absoluta não pode ser prometida.

A estrutura atual é apropriada para começar a descoberta, mas não justifica ainda afirmar que o aplicativo é seguro, que Android terá a mesma experiência do desktop ou que a IA produzirá tablaturas corretas. Recomenda-se aprovar apenas a etapa de provas técnicas e decisões arquiteturais. A implementação completa e a distribuição devem aguardar a aprovação dos gates correspondentes.

## 9. Análise complementar com REA e referências instaladas

**Data da análise complementar:** 7 de novembro de 2026.

### 9.1. Ferramenta e limites de acesso

O REA MCP não estava conectado a esta sessão. O diagnóstico inicial `rea doctor --client vscode --json` apontou `registration:vscode` como `config_drift` no registro MCP do VS Code. Após autorização explícita do usuário, `rea setup --client vscode --yes` criou o registro em `C:\Users\iratu\AppData\Roaming\Code\User\mcp.json`, preservando as demais configurações e sem variáveis extras de provedor. O diagnóstico posterior confirma `registration:vscode: healthy`, mas as ferramentas REA ainda não aparecem nesta sessão; é necessário reconectar/reiniciar o VS Code para ativar a conexão. Portanto, esta etapa usou o **CLI REA 6.5.0 via npx**, não o MCP. Não foram instalados provedores nativos.

A restrição de clean-room previamente registrada para o Rocksmith foi explicitamente liberada pelo usuário para uma análise REA limitada, sem copiar código, músicas ou assets. Ainda assim, não foi executado o jogo nem extraído conteúdo. A análise estática nativa profunda não prosseguiu porque nenhum provedor estava disponível.

### 9.2. Moises — observações estáticas do pacote Electron

Foi analisado estaticamente `resources/app.asar` da instalação local, sem iniciar o aplicativo e usando `--integrity-policy record-and-continue` para preservar uma inconsistência de integridade como dado não confiável.

- Evidence REA: `ev_fad8383fbe7d0e7bd5e6cbd9cb1fc48e91d8ddcf9697275a5a96e248132a6d6c`.
- SHA-256 do ASAR: `e7242b3db57214f5a32ff24b4fb2e3f66d5ffabd6101381dbc4992de3d6bd284`.
- A análise inventariou 6.516 arquivos relevantes, leu cerca de 56,8 MB de texto, analisou estaticamente 2.892 arquivos JavaScript e registrou 12 falhas de parse. Os 33.274 “findings” são observações do analisador, não 33.274 vulnerabilidades.
- O resumo estático indicou 2 janelas, 6 APIs de context bridge, 79 membros expostos, 65 handlers no processo principal, 69 canais literais e 36 operações com canal dinâmico. Foram observadas 10 ocorrências relacionadas à validação do remetente e 54 transmissões renderer pareadas.
- O próprio REA registra que canais dinâmicos não foram resolvidos, que relações estáticas não provam invocação em runtime e que reatribuições/efeitos dinâmicos não são avaliados. Logo, nem “54 pareadas” nem “0 transmissões literais sem par” é um atestado de segurança.
- Foi registrada uma contradição entre hash declarado no ASAR e bytes observados para `node_modules/@moises-ai/plugin-server-win32-x64/dist/MoisesPluginServer.exe`. O REA classifica esses bytes como `observed-untrusted`; a diferença pode ocorrer após assinatura ou alteração de binário pelo empacotamento e **não demonstra, por si só, adulteração maliciosa**.
- O relatório não infere a finalidade do helper nativo: a análise não resolveu seu entrypoint e não observou execução.

#### Fuses do executável Electron do Moises

O leitor estático de fuses retornou Evidence `ev_96ca29abc05bae2ffd58341546fa381a2c119d4c9674400c46ad435580db561b` para `Moises.exe` (SHA-256 `161eb1d64dc908cb26e8f614e188fafadb4f36ac1df1c52775b06f872de5505d`). Observações:

- habilitados: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, `GrantFileProtocolExtraPrivileges` e `WasmTrapHandlers`;
- desabilitados: `EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar` e `LoadBrowserProcessSpecificV8Snapshot`.

Isso descreve apenas os bytes de configuração do executável. Não prova uma vulnerabilidade explorável, nem estabelece os valores de `nodeIntegration`, `contextIsolation`, CSP, permissões ou comportamento efetivo da aplicação. Serve como **alerta de arquitetura para não copiar defaults do produto de referência**. No Baixaria Fina, revisar explicitamente cada fuse e desabilitar capacidades de execução/inspeção que não sejam necessárias; habilitar validação de integridade e restrição de carregamento quando compatíveis com o empacotamento adotado. Verificar separadamente proteção de cookies, protocolo `file:` e exigências de desenvolvimento.

### 9.3. Rocksmith — evidência obtida e bloqueio restante

- O parser estático de recursos PE do REA examinou `Rocksmith2014.exe` e registrou Evidence `ev_13ef4f2a687ba248c6a48b0c38d6932cc58940e4cc8d19853d369b40194b3786`, SHA-256 `0d42e2ff3c7af6843ecb81259cc64f1ddefa1397b7ce53fdcf0a05d0b61a0dc3`.
- Observação técnica: imagem PE32 x86, aproximadamente 11,6 MB. Esse parser inventaria recursos e seus intervalos/hashes; não revela fluxo de jogo, sincronização, reconhecimento de nota ou interação musical.
- A visão geral estática mais profunda (`rea analyze`) retornou `provider_unavailable`: Ghidra não está configurado, Hopper não é suportado neste Windows e a conexão IDA não está configurada. Nenhum desses provedores foi instalado nem a análise foi contornada com outro descompilador.
- O executável não foi iniciado e nenhuma tela ou comportamento em runtime foi observado. Assim, os requisitos de Rocksmith neste relatório permanecem baseados no escopo declarado pelo usuário, não em verificação do produto.

### 9.4. Efeito na avaliação e recomendações

1. **Segurança Electron continua viável, mas exige hardening deliberado.** A referência mostra uma superfície IPC e preload de tamanho significativo; os números não são metas nem evidência de segurança. No Baixaria Fina, expor apenas operações específicas e necessárias, validar payloads em runtime e evitar canais dinâmicos sempre que possível.
2. **Trate o processamento de áudio como fronteira de confiança.** A presença de um helper nativo na distribuição do Moises ilustra que aplicações de mídia podem incluir componentes fora do JavaScript. No Baixaria Fina, assinar/verificar helpers e modelos, validar seus protocolos, limitar recursos e não executar instaladores ou modelos baixados sem verificação.
3. **Não inferir funcionamento online/offline ou privacidade a partir da análise estática.** Esta investigação não observou tráfego nem execução do Moises. A promessa do Baixaria Fina de processamento local deve ser validada com testes de rede e inspeção de runtime antes da publicação.
4. **Reduzir o risco de escopo multiplataforma.** Implementar primeiro uma fatia desktop testável; tratar Android como alvo separado com matriz de capacidades. Afinador/prática por microfone pode ser um alvo mobile inicial; captura por interface USB, latência rigorosa, separação pesada e exportação avançada devem depender de provas técnicas no aparelho e no sistema específicos.
5. **Precisão musical requer evidência própria.** Nenhuma evidência desta análise prova qualidade de separação/transcrição do Moises ou comportamento do Rocksmith. Criar corpus de baixo gravado com notas e tempos conhecidos e medir erro de pitch/oitava, onset, duração, drift e qualidade de stems.
6. **Próximo passo para usar o MCP:** o registro foi aplicado com aprovação e o diagnóstico confirma a configuração, mas as ferramentas não apareceram na sessão ativa. Reiniciar/reconectar o VS Code e verificar novamente a disponibilidade do MCP. Para investigação nativa profunda do Rocksmith, também será necessária disponibilidade/configuração de um provedor compatível. A observação de interface deve ser uma sessão separada, explicitamente delimitada, para evitar alterações de estado ou efeitos de execução.

### 9.5. Conclusão revisada

A conclusão continua sendo **viável com condições**. A evidência real do pacote Electron do Moises acrescenta um exemplo concreto da complexidade de preload/IPC, fuses de segurança e componentes nativos, mas não é um modelo a copiar nem uma auditoria do produto. Para o Rocksmith, o REA confirmou apenas metadados de recursos; a análise de comportamento permanece em aberto. Antes de afirmar segurança ou paridade funcional, são necessários: configuração Electron própria endurecida, provas de áudio por plataforma, observação autorizada de fluxos de referência e revisão do pacote final.
