# UNI OS Security Adapter V1

## Objetivo

O Security Adapter valida riscos e políticas sobre os snapshots cognitivos já
produzidos pelo UNI OS. A V1 transforma sinais de planejamento e reflexão em
uma decisão estruturada, sem executar, persistir, corrigir ou completar dados.

## Arquitetura

```text
parsedIntent
contextSnapshot
memorySnapshot
planningSnapshot
reflectionSnapshot
  -> Security Policy
  -> Security Engine
  -> Security Schema
  -> decisão imutável com executionAllowed = false
```

O adapter é isolado e não está ligado ao runtime. Nenhum adapter anterior é
alterado ou acionado por esta camada.

## Fluxo

1. Lê inconsistências e flags da reflexão.
2. Mapeia códigos conhecidos para reasons de segurança.
3. Verifica risco, confiança e necessidade de confirmação.
4. Detecta representações de ações futuras sem permissões conhecidas.
5. Produz `ALLOW`, `ALLOW_WITH_CONFIRMATION` ou `BLOCK`.

Nenhuma decisão da V1 autoriza execução. Mesmo `ALLOW` significa apenas que não
foram encontrados bloqueios cognitivos no snapshot analisado.

## Entradas

- `parsedIntent`;
- `contextSnapshot`;
- `memorySnapshot`;
- `planningSnapshot`;
- `reflectionSnapshot`.

Todas as entradas são somente leitura e permanecem inalteradas. Contexto,
memória e intenção já fazem parte do contrato para validações futuras, enquanto
a V1 usa principalmente os sinais estruturados do planejamento e da reflexão.

## Saída

```js
{
  securityId,
  timestamp,
  status,
  blocked,
  confirmationRequired,
  confidence,
  risk,
  reasons: [],
  warnings: [],
  executionAllowed: false,
  metadata: { version },
}
```

O schema filtra status, reasons e warnings por allowlists, remove duplicidades e
aplica deep freeze. `executionAllowed` é sempre definido internamente como
`false`.

## Status

- `ALLOW`: consulta ou orientação consistente, sem confirmação ou bloqueios;
- `ALLOW_WITH_CONFIRMATION`: proposta não executável que exige confirmação, sem
  outros bloqueios;
- `BLOCK`: risco alto, baixa confiança, ambiguidade, ausência, conflito ou
  permissão ainda desconhecida.

## Reasons

- `LOW_CONFIDENCE`;
- `AMBIGUOUS_ACCOUNT`;
- `AMBIGUOUS_CATEGORY`;
- `AMBIGUOUS_INTERPRETATION`;
- `MISSING_ACCOUNT`;
- `MISSING_CATEGORY`;
- `MISSING_AMOUNT`;
- `MISSING_DATE`;
- `HIGH_RISK`;
- `CONTEXT_CONFLICT`;
- `STRUCTURAL_CONFLICT`;
- `PERMISSION_UNKNOWN`.

Inconsistências desconhecidas são tratadas como `STRUCTURAL_CONFLICT`, evitando
que um novo código passe silenciosamente pela política.

## Warnings

- `CONFIRMATION_REQUIRED`;
- `REVIEW_RECOMMENDED`.

Warnings não removem reasons nem liberam execução.

## Política conservadora

Passos que representam criação, reativação ou persistência exigirão uma futura
decisão do Permissions Adapter. Como essa decisão ainda não existe, a V1 gera
`PERMISSION_UNKNOWN` e bloqueia o snapshot por padrão.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Com a flag desligada, nenhuma decisão sombra
é gerada. Quando ativada explicitamente para validação, a decisão pode ser
observada e é descartada sem interferir no sistema.

Logs DEV incluem somente status, reasons, warnings, flags, confiança e risco.
Não incluem texto original, descrições financeiras, valores, CPFs, cartões,
e-mails, telefones ou tokens.

## Garantias

- nenhuma execução ou persistência;
- nenhuma chamada a serviços, Supabase ou APIs externas;
- nenhuma alteração dos snapshots;
- saída profundamente imutável;
- bloqueio seguro para códigos desconhecidos;
- permissões desconhecidas nunca são presumidas;
- falhas do modo sombra são contidas.

## Limitações

- a decisão não participa do runtime;
- `ALLOW` não é autorização operacional;
- não existem grants ou roles conectados nesta etapa;
- não há avaliação remota, OpenAI ou ElevenLabs;
- a V1 não corrige inconsistências nem solicita dados ao usuário.

## Integração futura

O Permissions Adapter poderá fornecer grants explícitos e escopos por workspace.
Somente depois disso o pipeline poderá diferenciar uma ação bloqueada por
permissão desconhecida de uma ação cognitivamente válida e autorizada. A
execução real continuará em uma camada separada e exigirá confirmação.
