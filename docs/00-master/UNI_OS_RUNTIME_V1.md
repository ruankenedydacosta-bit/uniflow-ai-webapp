# UNI OS Shadow Runtime V1

## Objetivo

O UNI OS Shadow Runtime encadeia todos os adapters cognitivos existentes em um
pipeline único, determinístico e não operacional. A V1 valida a arquitetura de
ponta a ponta sem alterar o fluxo legado, gerar comunicação ou executar ações.

## Arquitetura

```text
ParsedIntent
  -> Context Adapter
  -> Memory Adapter
  -> Planning Adapter
  -> Reflection Adapter
  -> Security Adapter
  -> Permissions Adapter
  -> Cognitive Gateway
  -> Structured Response Adapter
  -> Communication Layer
  -> Runtime Result
```

Nenhum adapter pode ser pulado ou reordenado. A ordem faz parte das invariantes
do runtime.

## Entradas

O runtime recebe somente:

- `parsedIntent`;
- `runtimeContext`.

`runtimeContext` pode conter `contextSources` e `memorySources`, que são clonados
antes do pipeline. Os providers originais não são congelados ou alterados.

## Pipeline completo

### Context

Normaliza sessão, usuário, workspace, idioma, timezone, canal, personalidade e
feature flags. Durante uma execução habilitada, o snapshot interno identifica
`uniOS: true` sem alterar as fontes.

### Memory

Consolida somente memória explícita, válida, ativa, não expirada e pertencente
ao workspace atual. Continua exclusivamente em leitura.

### Planning

Representa passos cognitivos. Nunca executa e mantém `executionAllowed: false`.

### Reflection

Identifica ausências, ambiguidades, riscos e inconsistências sem corrigir o
plano.

### Security

Produz `ALLOW`, `ALLOW_WITH_CONFIRMATION` ou `BLOCK`. Nenhum status autoriza
execução.

### Permissions

Representa scopes e grants cognitivos. Não consulta roles, RLS ou permissões
técnicas.

### Cognitive Gateway

Classifica uma capability futura, mas permanece com `NOT_IMPLEMENTED`, provider
nulo e nenhuma chamada externa.

### Structured Response

Consolida todos os snapshots em um envelope imutável, sem texto, voz ou
comunicação.

### Communication

Representa emoção, personalidade, tom, verbosidade e estilo. Não gera conteúdo.

## Runtime Result

```js
{
  runtimeId,
  timestamp,
  parsedIntent,
  context,
  memory,
  planning,
  reflection,
  security,
  permissions,
  cognition,
  structuredResponse,
  communication,
  executionAllowed: false,
  completed: true,
  metadata: {
    version,
    shadowMode: true,
    telemetry,
  },
}
```

O resultado faz deep clone dos snapshots antes do deep freeze final.

## Invariantes

O runtime valida obrigatoriamente:

- os nove adapters foram executados na ordem correta;
- todos os snapshots existem e estão profundamente congelados;
- Planning, Reflection, Security, Permissions, Structured Response e
  Communication proíbem execução;
- Cognitive Gateway não permite modelo ou chamada externa;
- Structured Response mantém comunicação nula;
- Communication mantém canal e perfil de voz nulos.

Qualquer quebra de invariante encerra a execução com falha segura e nenhum
resultado é entregue.

A preservação das entradas e providers também é coberta por testes de não
mutação. O runtime não importa React, reducers, serviços financeiros ou clientes
de API.

## Telemetria

A telemetria é criada por execução e contém somente:

- `pipelineDurationMs`;
- `adaptersExecuted`;
- `validationErrors`;
- `shadowExecutions`.

Não existe contador global, persistência ou envio remoto. A telemetria nunca
inclui texto original, descrições financeiras, dados pessoais, tokens, e-mails,
telefones, cartões ou CPFs.

## Logs DEV

Em desenvolvimento, o runtime pode registrar:

- `Pipeline Started`;
- `Pipeline Finished`;
- duração;
- adapters executados;
- resultado da validação.

Nenhum conteúdo dos snapshots é registrado.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Com a flag desligada, `uniOSRuntime.process`
retorna `null` antes de executar qualquer adapter.

Para uma futura integração silenciosa, `runUniOSRuntimeShadow` executa o pipeline,
permite observação técnica e descarta o resultado. O fluxo legado continua sendo
a única fonte de verdade.

## Garantias

- nenhuma geração de texto, voz, SSML ou prompt;
- nenhuma execução ou persistência;
- nenhuma chamada a APIs ou modelos;
- nenhum consumo de tokens;
- nenhuma alteração de providers, reducers ou estado React;
- nenhum adapter anterior modificado;
- snapshots profundamente imutáveis;
- falhas e observadores contidos;
- resultado sombra sempre descartado pela interface de integração.

## Limitações

- o runtime ainda não está conectado à aplicação;
- a feature flag é constante e permanece desligada;
- não há telemetria persistida ou remota;
- não existe geração de resposta para o usuário;
- não existe autorização técnica ou execução real;
- o pipeline não compara resultados com o fluxo legado.

## Roadmap para ativação futura

1. Auditar contratos e payloads de todos os snapshots.
2. Criar uma feature flag de desenvolvimento controlada, sem ativação em
   produção.
3. Conectar somente `runUniOSRuntimeShadow` após o Parser Adapter.
4. Comparar telemetria técnica e invariantes sem usar a resposta do runtime.
5. Validar privacidade, desempenho e regressões por um período definido.
6. Planejar geração de texto em etapa separada e aprovada.
7. Manter execução financeira fora do UNI OS até existir autorização técnica,
   confirmação e auditoria próprias.
