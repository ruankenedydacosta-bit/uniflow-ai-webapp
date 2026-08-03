# UNI OS Offline Cognitive Pipeline V1

## Objetivo

O Offline Cognitive Pipeline executa pela primeira vez toda a orquestracao LLM do
UNI OS usando exclusivamente componentes locais. Ele conecta os modulos existentes
sem alterar seus contratos e sem tocar no fluxo legado.

Nao existe integracao com OpenAI, Claude, Gemini, APIs, HTTP ou SDKs. O unico adapter
executavel e o LLM Adapter Mock.

## Arquitetura

```text
Compiled Cognitive Context
          |
          v
1. Model Router
          |
          v
2. Conversation Window
          |
          v
3. Token Budget
          |
          v
4. Prompt Builder
          |
          v
5. Prompt Validator
          |
          +---- rejected ----> stop, Mock blocked
          |
       approved
          v
6. LLM Adapter Mock
          |
          v
Immutable Offline Pipeline Result
          |
          v
Discarded by Shadow Runner
```

## Encadeamento

Cada etapa recebe somente o envelope imutavel devolvido pela etapa anterior. O
envelope carrega o input local e os snapshots ja produzidos. A etapa seguinte apenas
le esses valores e acrescenta seu proprio snapshot em um novo envelope congelado.

Uma verificacao de fingerprint confirma que nenhuma etapa alterou o envelope recebido.
O resultado final usa copia defensiva e deep freeze.

## Etapas

### Model Router

Produz uma selecao exclusivamente representacional usando registries e policies
locais. Nenhum provider selecionado e chamado.

### Conversation Window

Seleciona deterministicamente mensagens, objetivos, memorias, contexto e insights.

### Token Budget

Calcula estimativas aproximadas e distribuicao local de budget. Nenhum tokenizer ou
token real e utilizado.

### Prompt Builder

Monta as onze secoes obrigatorias do Prompt Estruturado sem gerar resposta.

### Prompt Validator

Audita schema, budget, capability, routing, provider, metadata e integridade. Um
relatorio rejeitado interrompe o pipeline antes do Mock.

### LLM Adapter Mock

Executa somente quando `validationReport.approved` e verdadeiro. A resposta e fixa,
simulada, sem raciocinio real e identifica `UNI_OS_MOCK` como provider executado.

## Saida

O contrato `offlinePipelineResult` contem:

- routing;
- conversationWindow;
- tokenBudget;
- structuredPrompt;
- validationReport;
- mockResponse ou `null`;
- statistics;
- metadata.

Todos os niveis permanecem profundamente imutaveis e `executionAllowed` permanece
falso.

## Telemetria

Sao registrados apenas:

- inicio e fim do pipeline;
- tempo de execucao;
- modulos executados;
- status da validacao;
- indicacao de execucao do Mock.

Conteudo do prompt e dados do usuario nunca entram nos logs.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. A execucao so ocorre quando habilitada
explicitamente para validacao. O observer pode inspecionar o snapshot local, mas o
retorno do shadow runner sempre descarta o resultado.

O fluxo legado continua como unica fonte de verdade.

## Garantias

- ordem fixa sem etapas puladas;
- Mock bloqueado para prompts rejeitados;
- snapshots anteriores preservados;
- deep freeze do resultado completo;
- nenhuma IA ou provider real;
- nenhum HTTP, SDK ou API externa;
- nenhum token real consumido;
- nenhuma persistencia;
- nenhuma alteracao em runtime, UX ou fluxo financeiro.

## Roadmap

A proxima etapa prevista e criar um Adapter OpenAI isolado no ambiente DEV. A troca
devera ocorrer somente na fronteira de adapter, preservando Router, Window, Budget,
Builder, Validator e modo sombra. Credenciais e chamadas externas continuarao
proibidas no frontend.
