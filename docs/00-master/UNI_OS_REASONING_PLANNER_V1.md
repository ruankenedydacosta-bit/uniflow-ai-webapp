# UNI OS Reasoning Planner V1

## Objetivo

O Reasoning Planner é a camada cognitiva intermediária entre o Cognitive
Context Builder e o futuro consumo desse contexto pelo Prompt Builder.

```text
Compiled Context
      |
      v
Reasoning Planner
      |
      v
Prompt Builder (integração futura)
```

A V1 é totalmente isolada. O Prompt Builder, o Runtime, o Offline Pipeline e
os adapters existentes não foram conectados ou modificados.

## Responsabilidade

O planner lê um contexto já compilado e produz um `reasoningPlan`. Esse objeto
descreve como uma futura etapa cognitiva deverá analisar a solicitação, sem
realizar a análise e sem produzir linguagem natural.

O módulo nunca:

- gera texto ou prompt;
- chama modelos, APIs ou SDKs;
- executa ações;
- persiste dados;
- altera contexto, memória, objetivos ou insights;
- modifica o fluxo legado.

## Contrato

O `reasoningPlan` contém:

- `intent`;
- `reasoningDepth`;
- `analysisMode`;
- `decisionStrategy`;
- `responseStrategy`;
- `conversationMode`;
- `confidenceTarget`;
- `priorityFocus`;
- `requiredCapabilities`;
- `requiredContextSections`;
- `requiredMemorySections`;
- `requiredInsightSections`;
- `requiredGoalSections`;
- `riskLevel`;
- `ambiguityLevel`;
- `followUpRequired`;
- `plannerVersion`;
- `generatedAt`;
- `executionAllowed`, sempre `false`;
- metadados de segurança e isolamento.

Todo objeto público é clonado defensivamente e profundamente congelado.

## Profundidade

- `LOW`: conversa casual ou solicitação direta sem risco.
- `MEDIUM`: ação financeira ou configuração que exige precisão.
- `HIGH`: análise financeira ou planejamento estruturado.
- `VERY_HIGH`: emergência, risco crítico ou ambiguidade alta.

A profundidade define somente o alvo de confiança. Ela não inicia raciocínio,
modelo ou execução.

## Modos de análise

- `CASUAL`;
- `TRANSACTIONAL`;
- `ANALYTICAL`;
- `PLANNING`;
- `CONFIGURATION`;
- `SAFETY`.

Os modos são resolvidos por regras determinísticas a partir da intenção já
presente no contexto compilado.

## Estratégias

As estratégias de decisão incluem resposta direta, confirmação obrigatória,
análise orientada por dados, avaliação de opções, esclarecimento prévio,
segurança primeiro e preservação de preferência.

As estratégias de resposta são apenas códigos estruturados. Elas não contêm
frases e não geram comunicação para o usuário.

## Capacidades e seções

O planner referencia apenas IDs oficiais do Capability Registry. Também indica
quais seções do contexto, memória, insights e objetivos serão necessárias em
uma integração futura.

Essa seleção não remove nem modifica qualquer item do `compiledContext`.

## Validação

O validator verifica:

- enums oficiais;
- capacidades conhecidas;
- seções válidas e sem duplicidade;
- confiança entre zero e um;
- versão e timestamp;
- imutabilidade;
- `executionAllowed: false`.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Quando habilitado explicitamente em teste,
o planner produz um snapshot para observação e retorna `reasoningPlan: null`.
O resultado é descartado e nunca se torna fonte de verdade da aplicação.

## Garantias da V1

- implementação local e determinística;
- nenhum HTTP;
- nenhuma integração OpenAI ou ElevenLabs;
- nenhum SDK externo;
- nenhum token consumido;
- nenhum efeito colateral;
- nenhuma alteração no Runtime, Prompt Builder, Prompt Compiler ou Offline
  Pipeline.

## Limitações

A V1 conhece apenas sinais estruturados já compilados. Ela não interpreta texto
bruto, não corrige ambiguidades e não decide pelo usuário.

## Próxima etapa

Definir uma integração sombra explícita entre Cognitive Context Builder,
Reasoning Planner e Prompt Builder. Essa integração deverá preservar o prompt
atual como fonte de verdade e manter o plano somente como dado estruturado.
