# UniFlow AI — Fases 13–19.1 da Uni Engine (Rollout Financeiro)

Consolidação da ativação shadow do motor cognitivo até o controle
determinístico de rollout do runtime financeiro. Documento único cobrindo
Fases 13, 14, 15, 16, 17, 18, 19 e 19.1 (identidade e isolamento).

## Regra geral das fases

- **Legado sempre soberano** — todo texto visível cai para o pipeline legado
  em qualquer falha, flag desligada, ou gate reprovado.
- **Shadow mode nunca influencia** — `influenceApplied=false`,
  `executionAllowed=false`, `discarded=true` em todos os motores
  observacionais (Fases 13–17).
- **Nenhuma escrita financeira** nos motores observacionais.
- **Todas as flags nascem `false`/`0`** (produção, canary, telemetria,
  rollout).
- **Pending Action Stack e confirmação pendente são soberanos** — nunca
  substituídos por resposta de runtime.

---

## Fase 13 — Ativação Shadow + Motor Epistêmico

- **Objetivo**: ativar a Uni Engine em shadow mode e o modelo epistêmico
  observacional.
- **Estado**: implementada, integrada, commitada (`a76b07d`).
- **Testes**: parte da árvore geral `uni-engine` (epistemic/, decision/,
  planning/, goals/, reflection/, activation/, integration/, gateway/).
- **Flags**: `enabled`, `shadowMode`, `epistemicEnabled` — todas `false`/`true`
  (shadow) por padrão conforme `uniEngineConfig.js`.
- **Comando de validação**: `npm run test:uni-engine`.

## Fase 14 — Pipeline Cognitivo Observacional

- **Objetivo**: consolidar os componentes cognitivos (gateway, observation,
  readiness, plan, route, orchestrator, context bridge, comparison,
  divergence diagnostics) em um snapshot único por turno.
- **Estado**: implementada, integrada, commitada (`33a08d5`).
- **Bug encontrado e corrigido nesta consolidação**: `uniEngineConfig.js`
  continha um merge malformado — objeto duplicado com sintaxe inválida
  (`config.chave: valor`) e a cascata de segurança das Fases 5–9 estava
  apagada (bloco `if` nunca fechado). Corrigido; 3 chaves duplicadas
  removidas de `UNI_ENGINE_DEFAULT_CONFIG`.
- **Testes**: `cognitive-pipeline/`, `cognitive-comparison/`,
  `cognitive-orchestrator/`, `telemetry/` — todos verdes.
- **Flags**: cascata `enabled → activationEnabled → integrationEnabled →
  applicationEnabled → cognitiveOrchestratorEnabled`, todas `false`.

## Fase 15 — Financial Reasoning

- **Objetivo**: motor de raciocínio financeiro observacional — snapshot,
  diagnóstico, inferência, planner, comparação.
- **Arquivos**: `financial-reasoning/` (snapshot, diagnostics, inference,
  planner, comparison, telemetry, contracts, types).
- **Estado**: implementada, integrada (via Fase 17), validada globalmente.
- **Testes**: **84/84**.
- **Flags**: `financialReasoningEnabled=false`, `financialReasoningShadowMode=true`.

## Fase 16 — Financial Conversational

- **Objetivo**: camada conversacional sobre o motor financeiro — detecção de
  intenção, resolução temporal, enriquecimento de contexto, planner de
  consulta, execução shadow, comparação de períodos, narrativa.
- **Arquivos**: `financial-conversational/` (temporal, context,
  query-planner, executor, comparison, narrator, integration, contracts,
  types).
- **Estado**: implementada, integrada (reaproveitada pela Fase 17 via
  `resolveTemporalReferences`/`extractTemporalEntities`), validada
  globalmente.
- **Testes**: **73/73**.

## Fase 17 — Financial Runtime

- **Objetivo**: runtime conversacional financeiro somente leitura — intent →
  temporal → query planning → execução → comparação → narrativa → shadow.
- **Arquivos**: `financial-runtime/` (intent, temporal, query, executor,
  comparator, comparison, narrator, shadow, contracts, types, utils).
- **Bugs reais encontrados e corrigidos nesta consolidação** (25 falhas →
  0):
  - Intent: fórmula de confiança recalibrada; matriz de precedência
    explícita para intents compostas (`period_comparison_query`,
    `category_breakdown_query`, `recurring_query`).
  - Temporal: resolvers de "hoje/ontem/semana/mês relativo" implementados;
    precedência corrigida (data completa antes de ano isolado); intervalo
    sem ano suportado; tradução de vocabulário Fase16↔Fase17.
  - Query: intent `unknown` não gera mais plano "melhor esforço".
  - Executor: gate `snapshot.hasData===false`; fixture de teste corrigida
    para o contrato real de metas (`status`/`target_amount`/`current_amount`).
  - Narrator: `planType` sincronizado com o dado real (não mais adivinhado
    só pelo tipo de intent); itens de breakdown normalizados
    (`.value`/`.name`).
  - Shadow: distinção entre "sem período mencionado" (não bloqueia) e
    "período mencionado mas ambíguo" (bloqueia).
- **Testes**: **94/94** (era 69/94 no início da consolidação).
- **Flags**: `financialRuntimeEnabled` (herda de `financialReasoningEnabled`
  na prática de uso).

## Fase 18 — Runtime Financeiro Visível

- **Objetivo**: gateway único de seleção entre texto legado e texto do
  runtime financeiro, com 15 gates de segurança (flag, elegibilidade,
  validação factual, confiança ≥0.90, identidade, narrativa, Pending
  Action).
- **Arquivos**: `financial-runtime/response-selection/`, `eligibility/`,
  `confidence/`, `factual-validation/`, `canary/`, `fail-safe/`, `gateway/`.
- **Bug real corrigido**: `runFinancialRuntimeVisibleGateway.js` chamava
  `createEmptyFinancialRuntimeResponse` (indefinida) em todo caminho de
  saída — `ReferenceError` reproduzível em qualquer chamada. Corrigido +
  teste dedicado (5 testes); dois imports com caminho relativo errado
  (`../uniEngineContracts.js`, `../financial-runtime/...`) também
  corrigidos. Este arquivo permanece **não usado** por nenhum outro módulo
  (achado, não integrado — a integração real acontece via
  `selectFinancialVisibleResponse`, chamado diretamente pelo
  `UniChatPage.jsx`).
- **Estado**: implementada e **integrada** — `selectFinancialVisibleResponse`
  exportado uma única vez de `uni-engine/index.js`, importado e chamado uma
  única vez em `UniChatPage.jsx`.
- **Flags**: `financialRuntimeVisibleEnabled=false`,
  `financialRuntimeVisibleCanaryEnabled=false`,
  `financialRuntimeVisibleMinConfidence=0.90`. Cascata:
  `enabled → financialReasoningEnabled → financialRuntimeVisibleEnabled`.

## Fase 19 — Financial Rollout

- **Objetivo**: controle de rollout determinístico (canary, produção,
  emergency rollback) decidindo apenas entre o texto legado e o texto já
  escolhido pela Fase 18 — nunca reexecuta o runtime nem gera nova
  narrativa.
- **Arquivos**: `financial-rollout/` (assignment, decision, eligibility,
  integration, rollback, telemetry, types, contracts).
- **Duplicações encontradas e consolidadas**:
  - `buildFinancialRolloutComparison` existia em `comparison/` (canônico,
    28 testes) e `telemetry/` (assinatura incompatível, 1 teste) —
    consolidado em `comparison/`; `telemetry/` mantém só
    `calculateComparisonMetrics` (agregação).
  - `FINANCIAL_ROLLOUT_VERSION` duplicado em `types/` (canônico) e
    `contracts/` — `contracts/` agora reexporta de `types/`.
- **Bug real corrigido**: `runFinancialRolloutIntegration({})` lançava
  `TypeError` (config não sanitizado) — corrigido com fallback seguro.
- **Bug de bundling corrigido**: 7 dos 9 arquivos importavam `crypto`
  (Node-only) — 6 eram imports mortos (removidos), 1 uso real (hash de
  bucket de canary) trocado por FNV-1a puro em JS, sem nova dependência.
  Sem essa correção, o bundle do navegador (Vite) falharia ao tentar
  resolver `crypto` a partir do momento em que o módulo fosse importado
  por `UniChatPage.jsx`.
- **Estado**: implementada e **integrada** em `UniChatPage.jsx`, no mesmo
  ponto de `applyEngineGuidanceToResponse`, logo após a seleção da Fase 18 —
  reaproveita `legacyText`, `financialRuntimeResult`, `financialSelection`,
  identidade e config já calculados; nunca chama o runtime, o seletor da
  Fase 18, o LLM ou o TTS uma segunda vez.
- **Testes**: **131/131** (antes da 19.1).
- **Flags**: `financialRolloutEnabled=false`,
  `financialRolloutProductionEnabled=false`,
  `financialRolloutCanaryEnabled=false`, `financialRolloutCanaryPercentage=0`,
  `financialRolloutTelemetryEnabled=false`,
  `financialRolloutEmergencyRollback=false`.

## Fase 19.1 — Identidade e Isolamento do Rollout

- **Problema real**: `buildEligibilityReasons` (em três arquivos:
  `integration/`, `decision/`, `eligibility/`) comparava
  `runtimeResult?.turnId?.workspace`/`.conversation` — mas `turnId` sempre
  foi (e continua sendo) uma **string simples**. Os gates
  `requireWorkspaceMatch`/`requireConversationMatch`/`requireIdentityMatch`
  nunca bloqueavam de verdade; um teste existente (`financialRolloutEligibility.test.js`)
  até simulava `turnId: { workspace: 'ws-1' }`, um objeto que nunca existe
  no contrato real.
- **Correção estrutural** (sem inventar propriedade dentro de turnId):
  `workspaceId`/`conversationId` passaram a viajar como campos **próprios**
  do resultado do runtime (irmãos de `turnId`/`messageId`, nunca aninhados),
  adicionados de forma aditiva em `runFinancialRuntimeShadow.js`,
  `createEmptyRuntimeResult` e `finalizeResult`. `UniChatPage.jsx` agora
  passa `workspaceId`/`conversationId` reais ao chamar o runtime.
- **Gates novos**: `requireTurnMatch`/`requireMessageMatch` adicionados ao
  contrato de config (`FINANCIAL_ROLLOUT_CONFIG`, `uniEngineConfig.js`),
  `true` por padrão (fail-closed). Função `identityMismatches(...)`
  centraliza a comparação (workspace/conversation/turn/message) nos três
  arquivos que decidiam elegibilidade — nenhum campo é lido de dentro de
  `turnId`.
- **Reason codes**: `workspace_mismatch`, `conversation_mismatch`,
  `turn_mismatch`, `message_mismatch`, `identity_missing` (minúsculos em
  `integration`/`decision`; maiúsculos em `eligibility`, mantendo a
  convenção já existente de cada arquivo).
- **Testes novos**: 13 em `financialRolloutIntegration.test.js` (identidade
  completa, workspace/conversation/turn/message ausente e divergente, troca
  de workspace/conversationId, repetição do mesmo turno, gates desligados,
  identidade malformada, StrictMode, serializável, sem escrita), 2 em
  `financialRolloutEligibility.test.js` (workspace/turn divergente com
  contrato real).
- **Estado**: **concluída** — workspaceId/conversationId/turnId/messageId
  são comparados de verdade; nenhum campo lido de dentro de `turnId`.
- **Testes**: financial-rollout **147/147** (era 131/131); UniChatPage
  **203/203**; árvore uni-engine completa **2488/2488**.

---

## Comandos de validação (todas as fases)

```bash
find src/features/uni-engine/financial-rollout -name "*.test.js" -print0 | sort -z | xargs -0 node --test
node --test src/features/uni-chat/UniChatPage.test.js
npm run test:uni-engine
npm test
npm run build
git diff --check
```

## Roadmap oficial

- ✅ Fase 19.1 — identidade e isolamento do rollout (concluída nesta consolidação).
- ⏭️ Fase 19.2 — consolidação, documentação e preparação de commits (este documento).
- ⏭️ Fase 20 — Tool Calling seguro.
- ⏭️ Fase 21 — memória operacional (reaproveita o motor epistêmico já existente — **não reconstruir**).
- ⏭️ Fase 22 — modelo mental.
- ⏭️ Fase 23 — metacognição.
- ⏭️ Fase 24 — Uni Engine v1 integrada.

## Riscos restantes conhecidos

- `runFinancialRuntimeVisibleGateway.js` (Fase 18) permanece órfão/não usado
  por nenhum outro módulo — corrigido e testado isoladamente, mas não é o
  caminho de integração real.
- Lint pré-existente (imports/variáveis não usados: `extractStableIdentityPart`,
  `isRuntimeOk`, `stableIdFromIdentity`, `financialSelection`/`environment`
  não usados em `financialRolloutIntegration.js`) não foi limpo — fora do
  escopo desta consolidação (risco cosmético, não funcional).
- 2 TODOs históricos de telemetria não implementada permanecem
  (`runFinancialRuntimeShadow.js`, `runFinancialConversationalShadow.js`).
