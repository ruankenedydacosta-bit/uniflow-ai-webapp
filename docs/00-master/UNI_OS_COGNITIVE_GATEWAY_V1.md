# UNI OS Cognitive Gateway V1

## Objetivo

O Cognitive Gateway Adapter define a futura fronteira entre o UNI OS e modelos
cognitivos. A V1 apenas consolida snapshots imutáveis e representa uma rota
futura; nenhum provider, modelo, prompt ou chamada externa é ativado.

## Arquitetura

```text
parsedIntent
contextSnapshot
memorySnapshot
planningSnapshot
reflectionSnapshot
securitySnapshot
permissionsSnapshot
  -> Cognitive Router
  -> Cognitive Gateway Schema
  -> gateway imutável com route = NOT_IMPLEMENTED
```

O adapter permanece isolado do runtime e não modifica adapters anteriores.

## Gateway

O gateway consolida os snapshots em `structuredInput`, faz deep clone e aplica
deep freeze. As entradas originais permanecem inalteradas.

Invariantes da V1:

- `provider: null`;
- `route: "NOT_IMPLEMENTED"`;
- `shouldInvokeModel: false`;
- `modelCapability: null`;
- `promptTemplate: null`;
- `externalCallMade: false`.

Esses valores são definidos internamente e não podem ser ativados pela entrada.

## Router

O router classifica somente uma capacidade futura para observação arquitetural.
Ele não seleciona provider ou modelo e sempre devolve a rota
`NOT_IMPLEMENTED`.

## Capabilities futuras

- `GENERAL_REASONING`;
- `FINANCIAL_REASONING`;
- `PLANNING`;
- `SUMMARIZATION`;
- `CLASSIFICATION`;
- `CONVERSATION`.

A capability classificada fica em `metadata.requestedCapability`. O campo
`modelCapability` permanece `null`, pois nenhuma capacidade de modelo está
realmente ativa.

## Saída

```js
{
  gatewayId,
  timestamp,
  provider: null,
  route: 'NOT_IMPLEMENTED',
  shouldInvokeModel: false,
  modelCapability: null,
  promptTemplate: null,
  structuredInput: {
    intent,
    context,
    memory,
    planning,
    reflection,
    security,
    permissions,
  },
  metadata: {
    version,
    requestedCapability,
    externalCallMade: false,
  },
}
```

## Fluxo da V1

1. Recebe snapshots somente leitura.
2. Classifica uma capability futura de maneira determinística.
3. Clona e congela a entrada estruturada.
4. Retorna invariavelmente `NOT_IMPLEMENTED`.
5. Em modo sombra, descarta o resultado.

Não há montagem de prompt, geração de texto ou interpretação de resposta.

## Modo sombra

`UNI_OS_ENABLED` permanece `false`. Com a flag desligada, nenhum gateway sombra
é criado. Quando ativado explicitamente para validação, o snapshot pode ser
observado e é descartado sem interferir no sistema.

Logs DEV contêm somente nome do gateway, capability futura, rota e
`shouldInvokeModel`. Não incluem snapshots, texto original, descrições
financeiras, valores, CPFs, cartões, e-mails, telefones ou tokens.

## Garantias

- nenhuma chamada de modelo ou API externa;
- nenhuma escolha de provider ou modelo;
- nenhum prompt ou texto gerado;
- nenhum token consumido;
- nenhuma execução ou persistência;
- snapshots de entrada preservados;
- structured input profundamente imutável;
- falhas do modo sombra contidas.

## Integração futura com OpenAI

Uma integração futura deverá ocorrer apenas em backend seguro. A ativação exigirá
configuração explícita, políticas de minimização de dados, contratos de saída
estruturada, observabilidade, limites de custo e testes de segurança. Chaves e
segredos nunca poderão entrar no frontend ou no snapshot cognitivo.

Esta V1 não contém import, SDK, endpoint, chave, nome de modelo ou código de
chamada da OpenAI.

## Integração futura com múltiplos modelos

O router poderá futuramente selecionar uma capability, enquanto uma camada
separada de backend decide provider e modelo conforme segurança, custo,
disponibilidade e qualidade. O UNI OS não deve depender diretamente de um
provider específico.

Fallbacks entre modelos, retries e interpretação de resposta não pertencem à
V1. Qualquer implementação futura continuará subordinada a Security e
Permissions e não poderá executar ações financeiras.
