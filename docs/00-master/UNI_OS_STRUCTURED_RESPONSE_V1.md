# UNI OS Structured Response V1

## Objetivo

O Structured Response Adapter consolida todos os snapshots cognitivos do UNI OS
em um único envelope imutável. A V1 não gera linguagem natural, voz, emoção,
personalidade, prompt ou ação.

## Arquitetura

```text
parsedIntent
contextSnapshot
memorySnapshot
planningSnapshot
reflectionSnapshot
securitySnapshot
permissionsSnapshot
cognitiveSnapshot
  -> Structured Response Builder
  -> Structured Response Schema
  -> resposta imutável com communication nula
```

O adapter permanece isolado do runtime e não modifica adapters anteriores.

## Fluxo

1. Recebe snapshots somente leitura.
2. Agrupa intenção, contexto e memória em `facts`.
3. Posiciona os demais snapshots em seções próprias.
4. Faz deep clone de cada seção.
5. Aplica deep freeze ao envelope completo.
6. Mantém comunicação nula e execução bloqueada.

Nenhuma interpretação ou transformação semântica é realizada.

## Entradas

- `parsedIntent`;
- `contextSnapshot`;
- `memorySnapshot`;
- `planningSnapshot`;
- `reflectionSnapshot`;
- `securitySnapshot`;
- `permissionsSnapshot`;
- `cognitiveSnapshot`.

Todas as entradas permanecem inalteradas.

## Saída

```js
{
  responseId,
  timestamp,
  version,
  facts: {
    parsedIntent,
    context,
    memory,
  },
  planning,
  reflection,
  security,
  permissions,
  cognition,
  communication: {
    emotion: null,
    personality: null,
    outputType: null,
  },
  executionAllowed: false,
  metadata: {
    schemaVersion,
    generatedInShadowMode,
  },
}
```

Objetos ausentes são representados por objetos vazios. O schema não injeta
texto, defaults financeiros ou fatos que não existam nos snapshots.

## Schema

O schema define `version` e `schemaVersion` como `1.0`. Cada snapshot é clonado
antes do deep freeze, evitando congelar objetos pertencentes aos adapters de
origem.

Tentativas de fornecer `communication`, `output`, texto, voz ou
`executionAllowed: true` são ignoradas. Esses campos são controlados pelo schema.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Com a flag desligada, nenhuma resposta
estruturada sombra é criada. Quando ativada explicitamente para validação, a
resposta pode ser observada e é descartada sem interferir no sistema.

`generatedInShadowMode` identifica o contexto de validação. Ele não ativa
nenhuma funcionalidade.

Logs DEV contêm somente nomes de seções, versão do schema, flag de modo sombra e
`executionAllowed`. Não incluem snapshots, texto original, descrições
financeiras, valores, CPFs, cartões, e-mails, telefones ou tokens.

## Garantias

- nenhuma geração de texto ou voz;
- nenhuma montagem de prompt;
- nenhuma execução ou persistência;
- nenhuma chamada a serviços ou APIs externas;
- nenhum fato criado, corrigido ou alterado;
- snapshots de entrada preservados;
- envelope profundamente imutável;
- comunicação sempre nula;
- execução sempre bloqueada;
- falhas do modo sombra contidas.

## Limitações

- o adapter ainda não participa do runtime;
- não produz conteúdo para o usuário;
- não resolve emoção ou personalidade;
- não escolhe tipo de saída;
- não interpreta o retorno de modelos;
- não autoriza ações, mesmo com Security e Permissions favoráveis.

## Integração futura com Personality Layer

A Personality Layer poderá futuramente receber uma cópia segura deste envelope
e produzir instruções de tom em uma etapa separada. Ela não deverá modificar
fatos, riscos, permissões ou planejamento.

O resultado de personalidade continuará sendo estruturado antes de qualquer
geração de linguagem natural.

## Integração futura com Voice Output

Voice Output só poderá consumir texto final produzido e aprovado em outra etapa.
Ele não deve receber memória bruta, contexto completo ou credenciais, nem pode
alterar a decisão cognitiva.

Esta V1 não chama SpeechSynthesis, ElevenLabs ou qualquer serviço de áudio.
