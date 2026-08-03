# UNI OS Communication Layer V1

## Objetivo

A Communication Layer define como a Uni poderá se comunicar futuramente, sem
produzir conteúdo. A V1 representa emoção, personalidade, tom, verbosidade e
estilo a partir de snapshots existentes e nunca altera fatos ou decisões.

## Arquitetura

```text
structuredResponse + contextSnapshot + memorySnapshot
  -> Emotion Adapter
  -> Personality Adapter
  -> Communication Composer
  -> Communication Schema
  -> objeto imutável sem texto, voz ou execução
```

A camada permanece isolada do runtime e não modifica Structured Response ou
adapters anteriores.

## Emotion

Estados suportados:

- `CALM`;
- `OBJECTIVE`;
- `EDUCATIONAL`;
- `EMPATHETIC`;
- `ENCOURAGING`;
- `CELEBRATING`;
- `CAREFUL`;
- `URGENT`;
- `FOCUSED`;
- `SUPPORTIVE`.

Emotion usa somente sinais estruturados de intenção, situação, risco e status de
segurança. A precedência prioriza urgência, bloqueios e risco alto antes de
outros sinais. `URGENT` produz tom `urgent_calm`, preservando clareza sem
alarmismo.

Emotion nunca altera fatos, números, contas, categorias, datas, decisões,
permissões ou segurança.

## Personality

A camada consome somente os perfis existentes:

- `balanced` -> `DIDACTIC`;
- `direct` -> `MINIMALIST`;
- `warm` -> `FRIENDLY`;
- `strategic` -> `EXECUTIVE`.

Uma preferência explícita válida presente na memória tem prioridade sobre o
contexto. Valores inválidos usam o perfil existente `balanced` como fallback.

`FORMAL` e `CUSTOM` pertencem apenas ao vocabulário reservado do schema. A V1
não cria esses perfis, não os seleciona automaticamente e não altera qualquer
preferência do usuário.

## Communication Object

```js
{
  communicationId,
  timestamp,
  emotion,
  personality,
  tone,
  verbosity,
  communicationStyle,
  outputChannel: null,
  voiceProfile: null,
  executionAllowed: false,
  metadata: { version },
}
```

`outputChannel` e `voiceProfile` permanecem nulos. O objeto não contém texto,
SSML, áudio ou prompt.

## Tone

Cada emoção possui um tom estruturado correspondente, como `calm`, `objective`,
`educational`, `careful` ou `urgent_calm`. Tone é apenas um código de orientação
futura, não uma frase ou instrução de prompt.

## Verbosity e estilo

Os perfis existentes são representados por:

- `balanced`: `BALANCED` e `BALANCED_GUIDANCE`;
- `direct`: `CONCISE` e `DIRECT_CLARITY`;
- `warm`: `BALANCED` e `WARM_GUIDANCE`;
- `strategic`: `STRUCTURED` e `STRATEGIC_CLARITY`.

Esses valores não geram conteúdo na V1.

## Fluxo

1. Emotion lê sinais estruturados sem alterar a resposta.
2. Personality resolve somente uma preferência existente.
3. Composer combina códigos de emoção e personalidade.
4. Schema valida allowlists e aplica deep freeze.
5. Em modo sombra, o resultado é descartado.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Com a flag desligada, nenhum objeto de
comunicação é criado. Quando ativada explicitamente para validação, o objeto pode
ser observado e é descartado sem interferir no sistema.

Logs DEV incluem somente emotion, personality, tone, verbosity e
communicationStyle. Não incluem texto, frases, descrições financeiras, dados
pessoais ou tokens.

## Garantias

- nenhuma geração de texto, SSML, voz ou prompt;
- nenhuma execução ou persistência;
- nenhuma chamada a serviços ou APIs externas;
- nenhuma criação ou alteração de personalidade;
- fatos e decisões preservados;
- snapshots de entrada inalterados;
- output e voz bloqueados no schema;
- execução sempre proibida;
- falhas do modo sombra contidas.

## Limitações

- a camada ainda não participa do runtime;
- não gera linguagem natural;
- não define voz ou canal de saída;
- não adapta preferências permanentemente;
- não interpreta dados pessoais ou financeiros brutos;
- não substitui Security ou Permissions.

## Integração futura com geração de texto

Um gerador futuro poderá consumir apenas fatos aprovados e o objeto de
comunicação para produzir linguagem natural. Essa etapa deverá preservar fatos,
respeitar Security e Permissions e impedir que tom ou personalidade alterem
números e decisões.

Nenhum prompt ou modelo é integrado nesta V1.

## Integração futura com Voice Output

Voice Output poderá receber somente texto final aprovado e metadados mínimos de
comunicação. `voiceProfile` deverá ser resolvido em uma camada separada, sem
expor memória, contexto completo ou credenciais.

Esta V1 não chama SpeechSynthesis, ElevenLabs ou qualquer serviço de áudio.
