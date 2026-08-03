# UNI OS Capability Registry V1

## Objetivo

O Capability Registry inicia a camada de orquestração futura registrando quais capacidades cognitivas o UNI OS poderá solicitar. Ele conhece somente capacidades e não possui informação sobre modelos, fornecedores, APIs ou credenciais.

## Arquitetura

O módulo isolado vive em `src/features/uni-os/llm/capability-registry`.

- `capabilityCatalog.js`: catálogo inicial das capabilities.
- `capabilityValidator.js`: valida contrato e unicidade.
- `capabilitySchema.js`: clona e aplica deep freeze.
- `capabilityRegistry.js`: cria o registry, busca itens e controla modo sombra.
- `index.js`: API pública local.

Não existe integração com Runtime, Gateway, engines, rankings ou interfaces.

## Capabilities

O catálogo V1 contém 17 capabilities:

- `GENERAL_REASONING`;
- `FINANCIAL_REASONING`;
- `LONG_TERM_PLANNING`;
- `GOAL_ANALYSIS`;
- `INSIGHT_ANALYSIS`;
- `CLASSIFICATION`;
- `SUMMARIZATION`;
- `EXPLANATION`;
- `RECOMMENDATION`;
- `FORECAST`;
- `DOCUMENT_ANALYSIS`;
- `VISION`;
- `OCR`;
- `VOICE`;
- `CALCULATION`;
- `BRAINSTORMING`;
- `CONVERSATION`.

## Schema

```js
{
  capabilities: [{
    id,
    name,
    description,
    complexity,
    estimatedCost,
    estimatedLatency,
    supportsStreaming,
    supportsVision,
    supportsVoice,
    requiresStructuredContext,
    metadata,
  }],
  version,
  metadata,
}
```

O registry e cada capability são profundamente imutáveis.

## Estimativas

`estimatedCost` e `estimatedLatency` usam somente as faixas relativas `LOW`, `MEDIUM` e `HIGH`. Elas descrevem a natureza esperada da capability e não representam preço, prazo ou garantia de qualquer serviço.

Complexidade usa `LOW`, `MEDIUM`, `HIGH` e `VERY_HIGH`.

## Validação

Antes de criar o registry, o validator exige:

- ID presente no catálogo oficial;
- IDs únicos;
- nome e descrição não vazios;
- complexidade, custo e latência válidos;
- todos os campos de suporte como booleanos explícitos;
- metadata estruturada.

Falhas são representadas por códigos e o modo sombra as contém sem afetar a aplicação.

## Fluxo

```text
Catálogo local
  -> validar contrato e unicidade
  -> clonar
  -> deep freeze
  -> registry somente leitura
```

## Modo sombra

`UNI_OS_ENABLED` continua desligada. Quando habilitado explicitamente, o registry é entregue a um observador e descartado. Logs DEV registram somente carregamento, contagem e versão.

## Garantias

- nenhuma seleção de modelo ou fornecedor;
- nenhuma API, endpoint ou credencial;
- nenhum prompt ou geração de texto;
- nenhum token consumido;
- nenhuma alteração do Runtime, Gateway ou contexto;
- nenhuma persistência ou execução;
- catálogo e resultado profundamente imutáveis.

## Limitações

A V1 não mede custo ou latência reais, não verifica disponibilidade e não associa capabilities a implementações. Os valores são classificações relativas e estáticas.

## Roadmap

A próxima etapa deverá criar um Provider Registry separado. Depois poderão existir Routing Policies e, somente após essas fronteiras estarem concluídas e auditadas, um Model Router. Nenhuma integração externa deve ocorrer antes disso.
