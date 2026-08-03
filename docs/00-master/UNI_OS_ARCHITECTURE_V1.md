# UNI OS Architecture V1

## 1. Objetivo

O UNI OS e o nucleo de organizacao cognitiva da UniFlow AI. A Fundacao V1
define contratos puros para organizar uma intencao ja processada, sem conectar
o nucleo a UX, voz, financeiro, memoria, Supabase ou qualquer modelo de IA.

Esta versao existe para estabilizar fronteiras antes de alterar comportamento.
Ela nao esta importada por paginas ou features atuais e nao substitui engines,
hooks, reducers ou services existentes.

## 2. Principios

- identidade central imutavel;
- fatos separados de tom e apresentacao;
- planejamento separado de execucao;
- memoria somente leitura;
- confirmacao preservada para futuras acoes;
- seguranca e permissoes como fronteiras explicitas;
- nenhum provider cognitivo implicito;
- resposta estruturada antes de texto ou voz;
- funcoes puras e contratos testaveis.

## 3. Estrutura

```text
src/features/uni-os/
  identity/
  state/
  attention/
  context/
  memory/
  planning/
  reflection/
  emotion/
  security/
  permissions/
  cognitive/
  response/
  orchestrator/
  index.js
```

Cada modulo possui engine principal, export publico, README e teste unitario.
Nenhum modulo importa React, Supabase ou API externa.

## 4. Fluxo V1

```text
Parser existente (fora do UNI OS)
  -> Identity
  -> State
  -> Attention
  -> Context
  -> Memory
  -> Planning
  -> Reflection
  -> Security
  -> Permissions
  -> Cognitive Gateway
  -> Structured Response
```

O parser nao e chamado pelo UNI OS. `uniOS.process()` recebe `parsedIntent` ja
estruturado. Emotion e uma projecao auxiliar usada na montagem da resposta;
ela nao interrompe ou altera a cadeia de fatos, validacoes e permissoes.

O resultado atual sempre possui a forma:

```json
{
  "facts": {},
  "plan": {},
  "emotion": {},
  "personality": {},
  "output": {}
}
```

No orchestrator padrao, `output.text` e `output.voice` sao `null`,
`output.executesAction` e `false` e o gateway retorna `NOT_IMPLEMENTED`.

## 5. Modulos

### Identity

Fonte somente leitura de missao, principios, personalidade base, valores e
limites. Nao adapta a personalidade nem decide comportamento.

### State

Maquina isolada com `idle`, `listening`, `thinking`,
`waiting_confirmation`, `executing`, `finished` e `error`. Ela nao substitui
os estados atuais de conversa ou voz.

### Attention

Classifica uma intencao processada como `financial_action`,
`financial_question`, `casual`, `explanation`, `emergency`, `planning` ou
`configuration`. A classificacao nunca executa a intencao.

### Context

Cria snapshots somente leitura de sessao, usuario, workspace, idioma, horario e
historico curto. Nao carrega dados por conta propria.

### Memory

Consome somente providers explicitamente recebidos. Nao cria, infere, corrige,
confirma ou persiste memoria. A integracao com os providers atuais permanece
futura.

### Planning

Transforma atencao e intencao em passos deterministas. O plano marca quando uma
confirmacao sera necessaria, mas nao solicita nem executa essa confirmacao.

### Reflection

Le conflitos, ambiguidades, riscos e confirmacao pendente. Mantem o plano
original por referencia e declara `changedPlan: false`.

### Emotion

Converte apenas sinais contextuais em `calm`, `objective`, `educational`,
`celebration`, `empathy` ou `alert`. Nao diagnostica emocao nem muda fatos.

### Security

Agrega checks fornecidos por dominios existentes. A V1 nao adiciona regra de
seguranca e retorna `not_evaluated` quando nao recebe checks.

### Permissions

Compara requirements e grants explicitamente recebidos. Nao consulta plano,
sessao, workspace, RLS ou banco e permanece marcada como nao integrada.

### Cognitive Gateway

Interface assincrona para uma integracao cognitiva futura. Retorna somente
`NOT_IMPLEMENTED`, `provider: null` e `externalCallMade: false`.

### Structured Response

Cria o envelope imutavel de fatos, plano, emocao, personalidade e output. Nao
redige resposta, sintetiza voz ou executa acao.

### Orchestrator

`uniOS.process()` coordena os engines. O factory
`createUniOSOrchestrator()` aceita engines substitutos somente para testes e
integracoes futuras controladas. A instancia padrao esta desconectada do app.

## 6. Garantias da Fundacao V1

- nenhuma mudanca de UX;
- nenhuma alteracao em Voice Input ou Voice Output;
- nenhuma alteracao do fluxo financeiro ou confirmacao;
- nenhuma criacao ou inferencia de memoria;
- nenhuma consulta ao Supabase;
- nenhuma migration;
- nenhuma chamada OpenAI ou ElevenLabs;
- nenhum texto ou audio gerado;
- nenhuma acao executada;
- nenhuma feature atual importa `uni-os`.

## 7. Testes

Cada modulo possui teste proprio. A cobertura inclui:

- transicoes validas, invalidas, erro e reset de state;
- classificacao de attention sem execucao;
- planos estruturados, confirmacao e fallback;
- reflexao sem mutacao;
- contrato completo da structured response;
- ordem do orchestrator;
- gateway `NOT_IMPLEMENTED`;
- memoria apenas por leitura;
- seguranca e permissoes sem regras implicitas;
- output nulo e nenhuma execucao.

## 8. Integracoes futuras

A integracao deve ocorrer em etapas separadas e reversiveis:

1. definir adaptador entre parser atual e `parsedIntent` do UNI OS;
2. mapear estados atuais sem substitui-los;
3. criar adapters somente leitura para contexto e memoria;
4. formalizar checks existentes de seguranca e permissoes;
5. validar o structured response em paralelo ao fluxo atual;
6. integrar personalidade como apresentacao posterior aos fatos;
7. projetar gateway OpenAI exclusivamente no backend;
8. adicionar observabilidade sanitizada e feature flag;
9. migrar um caso de uso nao transacional antes de acoes financeiras;
10. manter confirmacao e idempotencia no dominio financeiro.

OpenAI, voz premium e Supabase nao devem ser conectados diretamente ao
orchestrator. Cada integracao futura precisa de adapter, politica, testes,
fallback e fronteira de seguranca proprios.

## 9. Estado

A Fundacao V1 esta implementada apenas como infraestrutura local e testes. Nao
ha ativacao no runtime da aplicacao e nenhuma feature existente mudou de
comportamento.
