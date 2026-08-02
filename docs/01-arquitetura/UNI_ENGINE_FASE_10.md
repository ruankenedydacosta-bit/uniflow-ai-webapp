# UniFlow AI — Fase 10: Production Readiness da Uni Engine

Entrega aditiva da camada de produção da Uni Engine (health check,
observability e consolidação de contratos), com **155 testes novos
(155/155 verdes)** e zero mudança de comportamento público.

## Regra da fase

- **Nenhum motor novo** — nenhuma capacidade nova de classificação,
  planejamento, metas, reflexão ou decisão.
- **Nenhuma mudança pública** — nada que o `UniChatPage.jsx` ou outro
  consumidor dependa foi removido, renomeado ou alterado de valor.
- **Tudo aditivo** — novos campos, novos módulos e novos envelopes.
- A revisão de API pública **não existiu** (`UNI_ENGINE_VERSION` segue `2.0`);
  a revisão de entrega passou a `10.0` (`UNI_ENGINE_REVISION`).

## O que foi entregue

```
src/features/uni-engine/
├── health/                          # módulo novo
│   ├── healthTypes.js               # HEALTH_CHECK_VERSION 1.0
│   ├── healthContracts.js           # createHealthCheck + contratos
│   ├── buildEngineHealth.js         # aggregator (9 módulos)
│   └── index.js
├── observability/                   # módulo novo
│   ├── observabilityTypes.js        # OBSERVABILITY_SNAPSHOT_VERSION 1.0
│   ├── observabilityContracts.js    # createObservabilitySnapshot
│   ├── buildObservabilitySnapshot.js# agregador de contadores/latências
│   ├── latencySources.js            # mapa UNI_ENGINE_MODULE_LATENCY_KEYS
│   └── index.js
└── phase10/                         # suite nova — 155 testes
    ├── shared.js                    # fixtures (phase10FullConfig, phase10Input…)
    ├── health.test.js               # 28
    ├── observability.test.js        # 27
    ├── contractNormalization.test.js# 33
    ├── serialization.test.js        # 15
    ├── fallback.test.js             # 14
    ├── integration.test.js          # 13
    ├── benchmark.test.js            # 8
    └── edgeCases.test.js            # 17
```

## Health check

`runEngineHealthCheck(config, context)` retorna o envelope
`{ version, revision, checkedAt, enabled, status, health, diagnostics, modules, summary }`.

### Status por módulo

- `healthy` — contrato íntegro e dados presentes;
- `inconsistent` — flag interna diz que o módulo tem dados, mas a seção veio nula;
- `degraded` — flag desligada com dados presentes (seção tolerada);
- `unavailable` — módulo desligado e sem seção;
- `error` — contrato violado ou exceção ao inspecionar.

### Prioridade do status agregado (testada)

```
telemetry_error → contract_error → fallback_active → inconsistent
→ activation_blocked → degraded → healthy
```

- `fallback_active` tem prioridade sobre `inconsistent`: quando o core caiu
  no caminho seguro, seções ausentes são esperadas — não é bug de contrato.
- O gate de "desligado" usa `!isUniEngineShadowEnabled(config)` (enabled XOR
  shadowMode), espelhando o gate real do orquestrador: `shadowMode=false`
  desliga o motor e o health reflete `disabled`, não `degraded`.

### Contrato e campos

`createHealthCheck` normaliza: aceita `telemetryErrors` como número no
nível raiz e como array/número em `diagnostics.telemetryErrors`.

## Observability

`buildObservabilitySnapshot(config, result, telemetry, t0)` retorna o
envelope `{ version, revision, timings, moduleStatus, counters, telemetry, correlationId }`.

- `moduleStatus` por módulo: `active | shadow | degraded | disabled | error`.
  Módulo com `enabled === false` → `disabled` (corrige telemetry desligada
  que antes aparecia como `active`).
- `UNI_ENGINE_MODULE_LATENCY_KEYS` é um **objeto** (mapa por módulo;
  `telemetry: null`), não um array.
- Fallback de activation em modo shadow **nunca** vira `ACTIVATION_FALLBACK`;
  ele só é sinalizado quando existe uma decisão `ERROR_SAFE`.

## Consolidação aditiva de contratos

- Contratos de `planning`, `goals`, `reflection`, `decision` e `epistemic`
  normalizam tipos de campo sem recriar objetos: um contrato já satisfeito
  passa inalterado.
- `runDecisionLayer`:
  - valida o **resultado completo** (`validateDecisionResult(result)`) após
    `latencyMs` ser definido (antes a latência ainda era 0 e a validação
    reportava erro falso);
  - na falha de validação, **sanitiza** campos corrompidos em vez de
    reconstruir: `decisionType→UNKNOWN`, `confidence→clamp 0..1`,
    `risk→NONE`, `reason→strings`, `recommendedExecutor→null`,
    `recommendedQuestion→null`, `requiredInformation→map String`;
    `diagnostics` recebe `UNKNOWN`;
  - `recommendations` são strings; `recommendationDetails` objetos (mesmo length).
- `runGoalEngine`: `emptyFallback` definido fora do `try` (evita ReferenceError
  no catch) e leitura de `featureFlags`/`workspaceType`/`referenceDate`
  movida para dentro do `try` (hardening contra inputs que lançam exceção).
- `runUniEngineShadow` com input inválido retorna fallback com
  `enabled: true, skipped: false` explícitos no caminho de erro.

## Testes

- **Suite Fase 10**: `node --test src/features/uni-engine/phase10/*.test.js`
  → **155/155 pass** (mínimo exigido: 150).
- **Suite completa uni-engine**:
  `node --test "src/features/uni-engine/**/*.test.js"` → **1416/1416 pass**.
- **Benchmark medido** (medianas): engine total ~0,70ms (orçamento 50ms),
  health ~0,18ms e observability ~0,31ms (orçamento 10ms), cada módulo < 20ms,
  caminho de erro < 20ms, motor desligado < 5ms.
- **ESLint**: 0 problemas nos arquivos tocados pela fase.
- **Build**: `npm run build` OK (aviso de chunk > 500kB, pré-existente).
- **`git diff --check`**: limpo.

### Estado global conhecido (pré-existente, fora do escopo)

- `npm test` global: 4576/4580 pass; as 4 falhas restantes estão em
  `simplifiedApp.test.js` (saudação/TTS da Home) e
  `financialQueriesIntegration.test.js` (campos legados do contexto
  financeiro) — fluxos da migração do snapshot financeiro **em andamento**,
  nenhum deles depende do uni-engine (cadeias de import verificadas).
- `npm run lint` global: 12 problemas remanescentes em arquivos não tocados
  (claude-prototype, docs/02-design-system, docs/04-layout, docs/05-hooks,
  FutureChart, accountResolution.test.js).

## Suites de apoio

- Determinismo testado: strip de timings (`latencyMs`, `latency`, `totalMs`,
  `checkedAt`, `timestamp`, `correlationId`) e de datas ISO embutidas em
  strings de evidence.
- Fixture do adapter de memória (para health memory:healthy em shadow):
  `{ retrieveRelevantSync, evaluateCandidatesSync }`.
