# Graph Report - uniflow-ai-app  (2026-07-12)

## Corpus Check
- 242 files · ~99,574 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1337 nodes · 2441 edges · 106 communities (91 shown, 15 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `09c28014`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DashboardPage.jsx
- devDependencies
- cx
- MainDashboard.jsx
- AccessModeSwitcher.jsx
- CustomerBoard.jsx
- ChatWindow.jsx
- Loader.jsx
- Modal.jsx
- hooks.js
- Avatar.jsx
- Card.jsx
- Input.jsx
- dashboard.service.js
- Badge.jsx
- Tooltip.jsx
- useBreakpoint.js
- crm.service.js
- Button.jsx
- UI
- UniAIPage.jsx
- index.js
- Módulos oficiais do produto
- Implementação ativa observada
- Módulo Projetos — Arquitetura (documento de planejamento, sem código)
- Kit Base UniFlow AI
- Regras do Projeto
- Prompts Base para Agentes
- UniFlow AI — Regras do Projeto
- UniFlow AI — Fase 1: Autenticação, Login, Cadastro e Onboarding Inteligente
- Clientes (CRM)
- React + Vite
- DashboardView
- VoiceView
- uni-demo_data.js
- VoiceTimeline
- DemoController
- uni-demo_app.js
- App Structure Map
- User Modes and Plans
- navigation.js
- Obsidian Workflow
- create-note.js
- FinanceProjectionChart.jsx
- Supabase Auth and Data Plan
- authService.js
- Supabase Env Setup
- 5. Consultas de diagnostico
- Badge
- index.js
- Login Auth Integration
- signInWithEmail
- Onboarding Real Integration
- Financial Core Data Model
- Pessoal e financeiro
- Empresarial
- 3. Modelo inicial de autenticacao
- 4. Modelo de workspaces
- Uni e IA
- useAccess
- cx
- index.js
- routes.jsx
- accountService.js
- transactionService.js
- Open Finance Architecture
- ReportsPage.jsx
- AccessModeSwitcher.jsx
- FinanceiroPage.jsx
- ObjetivosPage.jsx
- Open Finance Migration Review
- AccessModeSwitcher.jsx
- ObjetivosPage.jsx
- AgendaPage.jsx
- Uni Conversation Financial Actions V1
- UniFinancialActionCard.jsx
- Uni Financial Memory V1
- SettingsPage.jsx

## God Nodes (most connected - your core abstractions)
1. `useAccess()` - 31 edges
2. `cx()` - 29 edges
3. `Badge()` - 27 edges
4. `Button()` - 26 edges
5. `formatCurrency()` - 26 edges
6. `Card()` - 25 edges
7. `Supabase Auth and Data Plan` - 23 edges
8. `Uni AI Experience Reference` - 20 edges
9. `Financial Core Data Model` - 18 edges
10. `Uni Financial Memory V1` - 17 edges

## Surprising Connections (you probably didn't know these)
- `FinanceTransactionModal()` --indirect_call--> `transaction()`  [INFERRED]
  src/pages/financeiro/FinanceTransactionModal.jsx → src/features/uni-memory/uniMemory.test.js
- `SessionProvider()` --calls--> `useAccess()`  [EXTRACTED]
  src/app/SessionContext.jsx → src/app/AccessContext.jsx
- `AccessModeSwitcher()` --calls--> `useAccess()`  [EXTRACTED]
  src/components/dev/AccessModeSwitcher.jsx → src/app/AccessContext.jsx
- `DashboardPage()` --calls--> `useAccess()`  [EXTRACTED]
  src/features/dashboard/DashboardPage.jsx → src/app/AccessContext.jsx
- `AgendaPage()` --calls--> `useAccess()`  [EXTRACTED]
  src/pages/AgendaPage.jsx → src/app/AccessContext.jsx

## Import Cycles
- None detected.

## Communities (106 total, 15 thin omitted)

### Community 0 - "DashboardPage.jsx"
Cohesion: 0.04
Nodes (46): 10. Regra de adaptacao, 11. Onboarding futuro, 12. Configuracoes futuras, 13. Arquitetura de codigo V1, 14. Dados futuros, 15. Fora do escopo da V1, 16. Criterios para integracao futura, 1. Objetivo (+38 more)

### Community 1 - "devDependencies"
Cohesion: 0.07
Nodes (26): dependencies, react, react-dom, @supabase/supabase-js, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks (+18 more)

### Community 2 - "cx"
Cohesion: 0.07
Nodes (27): 10. Papel da resposta consultiva da Uni, 11. Papel do dashboard reagindo apos a resposta, 12. Ritmo e tempos da experiencia, 13. O que deve ser preservado no WebApp, 14. O que nao deve ser copiado cegamente, 15. Componentes React propostos, 16. Hooks propostos, 17. Roadmap de implementacao (+19 more)

### Community 3 - "MainDashboard.jsx"
Cohesion: 0.17
Nodes (8): DashboardGreeting(), currency, FinancialSummaryCard(), GoalsSummaryCard(), currency, dateFormatter, RecentActivityList(), UniInsightsCard()

### Community 4 - "AccessModeSwitcher.jsx"
Cohesion: 0.18
Nodes (10): Decisoes ainda pendentes, Estado atual, Novas migrations, Nucleo financeiro no DEV, Open Finance validado no DEV, Ordem inicial, Proximo passo, Seguranca (+2 more)

### Community 5 - "CustomerBoard.jsx"
Cohesion: 0.29
Nodes (4): CustomerDetails(), CustomerForm(), EMPTY_FORM, CustomerList()

### Community 6 - "ChatWindow.jsx"
Cohesion: 0.28
Nodes (3): ChatInput(), ConversationList(), GROUP_LABELS

### Community 7 - "Loader.jsx"
Cohesion: 0.43
Nodes (7): cx(), Dots(), Linear(), Loader, Pulse(), Skeleton(), Spinner()

### Community 8 - "Modal.jsx"
Cohesion: 0.29
Nodes (4): Modal, ModalBody, ModalFooter, ModalHeader

### Community 9 - "hooks.js"
Cohesion: 0.33
Nodes (3): useTopbarMenu(), Sidebar, Topbar

### Community 11 - "Card.jsx"
Cohesion: 0.33
Nodes (4): Card, CardBody, CardFooter, CardHeader

### Community 39 - "UniAIPage.jsx"
Cohesion: 0.10
Nodes (31): baseCategories, fallbackAccountTypes, financialCrudMock, today, audioControlLabels, EXPERIENCE_STATES, EXPERIENCE_TIMING, createInsightReport() (+23 more)

### Community 41 - "index.js"
Cohesion: 0.17
Nodes (18): Input, Modal(), EMPTY_FORM, FinanceAccountModal(), CATEGORY_LABELS, EMPTY_FORM, FinanceCategoryModal(), CrudRow() (+10 more)

### Community 48 - "Módulos oficiais do produto"
Cohesion: 0.08
Nodes (23): 01. Login, 02. Onboarding Inteligente, 03. Perfil, 04. Empresas, 05. Painel de Clareza, 06. Receitas, 07. Despesas, 08. Fluxo de Caixa (+15 more)

### Community 49 - "Implementação ativa observada"
Cohesion: 0.15
Nodes (12): Aplicação, App, Atenções importantes, Componentes, Design System, Documentação organizada, Estrutura atual de `src`, Hooks e exports (+4 more)

### Community 50 - "Módulo Projetos — Arquitetura (documento de planejamento, sem código)"
Cohesion: 0.15
Nodes (12): 10. Questões em aberto (decidir antes de implementar), 11. Não-objetivos desta fase, 1. Ancoragem nos documentos existentes, 2. Estrutura de pastas, 3. Modelo de dados (suposições de schema), 4. Services — `projects.service.js`, 5. Context — `ProjectBoardContext`, 6. Hooks (+4 more)

### Community 51 - "Kit Base UniFlow AI"
Cohesion: 0.17
Nodes (11): Arquitetura mental do usuário, Como a Uni deve se comportar, Documentos principais, Estado real do repositório, Estrutura oficial do projeto, Kit Base UniFlow AI, Missão do produto, O que é a UniFlow AI (+3 more)

### Community 52 - "Regras do Projeto"
Cohesion: 0.17
Nodes (11): Commits, Filosofia de desenvolvimento, Fluxo recomendado antes de implementar, Padrão de componentes, Regra do Graphify, Regras absolutas, Regras de código React, Regras de Design System (+3 more)

### Community 53 - "Prompts Base para Agentes"
Cohesion: 0.20
Nodes (9): Prompt 1: leitura inicial obrigatória, Prompt 2: preparar uma implementação pequena, Prompt 3: criar componente base, Prompt 4: criar uma tela, Prompt 5: criar serviço, Prompt 6: criar módulo de produto, Prompt 7: revisar código, Prompt 8: tom de voz da Uni (+1 more)

### Community 54 - "UniFlow AI — Regras do Projeto"
Cohesion: 0.20
Nodes (9): Commits, Estado atual, Estrutura oficial, graphify, Obsidian Knowledge Base, Papel do agente, Prioridade atual, Regras absolutas (+1 more)

### Community 55 - "UniFlow AI — Fase 1: Autenticação, Login, Cadastro e Onboarding Inteligente"
Cohesion: 0.25
Nodes (7): Bug pré-existente encontrado (não corrigido, fora do meu escopo decidir), O que foi entregue, O que NÃO foi feito nesta fase (por escopo, não por esquecimento), Ordem de leitura recomendada, Rastreabilidade com os documentos de arquitetura, Regra do Design System — auditoria rápida, UniFlow AI — Fase 1: Autenticação, Login, Cadastro e Onboarding Inteligente

### Community 56 - "Clientes (CRM)"
Cohesion: 0.25
Nodes (7): Clientes (CRM), Decisão: por que não há `Badge`/`Tooltip` importados, Estrutura, Fluxo, O que falta para produção, Reuso do Design System, ⚠️ Sem docx específico — padrão mínimo coerente

### Community 57 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

### Community 61 - "uni-demo_data.js"
Cohesion: 0.29
Nodes (5): clamp(), FinanceState, getReasoningChain(), pickRandom(), randomBetween()

### Community 66 - "App Structure Map"
Cohesion: 0.05
Nodes (39): 10. Regras de evolucao, 11. Checklist ate o MVP demonstravel, 12. Decisao final deste mapa, 1. Objetivo do app, 2. Fontes oficiais e hierarquia, 3. Estrutura pessoal e empresarial, 4. Modulos do modo pessoal, 5. Modulos do modo empresarial (+31 more)

### Community 67 - "User Modes and Plans"
Cohesion: 0.05
Nodes (39): 10. Como evitar mistura de dados, 11. Regras de UX, 12. Sugestao futura de estrutura tecnica, 13. Roadmap de implementacao, 1. Objetivo da separacao, 2. App unico, experiencias diferentes, 3. Modos de uso, 4. Planos (+31 more)

### Community 68 - "navigation.js"
Cohesion: 0.14
Nodes (18): PLANS, useAccess(), canAccessNavigationItem(), canAccessRoute(), getFallbackRoute(), App(), AppContent(), ALL_MODES (+10 more)

### Community 69 - "Obsidian Workflow"
Cohesion: 0.22
Nodes (8): Caminho do cofre, Como criar uma nota, Fonte principal do app, Obsidian Workflow, Papel do Obsidian, Pastas do Obsidian, Regras para agentes, Tipos de nota

### Community 70 - "create-note.js"
Cohesion: 0.42
Nodes (8): buildNote(), createNote(), getDateParts(), getUniqueFilePath(), NOTE_TYPES, parseArgs(), slugify(), validateInput()

### Community 71 - "FinanceProjectionChart.jsx"
Cohesion: 0.36
Nodes (8): buildAreaPath(), buildLinePath(), FinanceProjectionChart(), getPointCoordinates(), getSeriesTotal(), getSeriesValues(), PADDING, SERIES_CLASSES

### Community 72 - "Supabase Auth and Data Plan"
Cohesion: 0.10
Nodes (20): 10. Variaveis de ambiente futuras, 11. Riscos, 12. Checklist da Fase 2, 13. Decisao oficial, 14. Schema inicial versionado, 15. Estrategia de ambientes, 16. Validacao inicial de Auth e workspaces, 17. RLS autenticado validado (+12 more)

### Community 73 - "authService.js"
Cohesion: 0.10
Nodes (41): getAccessFromSession(), INITIAL_SESSION_STATE, logAuthDevelopment(), SessionContext, SessionProvider(), VALID_PLANS, VALID_USER_MODES, VALID_WORKSPACE_TYPES (+33 more)

### Community 74 - "Supabase Env Setup"
Cohesion: 0.29
Nodes (6): Estado atual, Objetivo, Proxima etapa, Regras de seguranca, Supabase Env Setup, Variaveis necessarias

### Community 75 - "5. Consultas de diagnostico"
Cohesion: 0.07
Nodes (27): 1. Decisao de ambientes, 2. Identificacao do projeto atual do site, 3. Checklist de inventario, 4. Matriz de possiveis colisoes, 5. Consultas de diagnostico, 6. Classificacao do resultado, 7. Criterios para liberar teste em DEV, 8. Seguranca e producao (+19 more)

### Community 76 - "Badge"
Cohesion: 0.14
Nodes (13): Anon key, Chaves Supabase, Checagem antes de rodar, Execucao sem configuracao, Limites desta etapa, Por que usar um cliente autenticado, Publishable key, Resultados esperados (+5 more)

### Community 77 - "index.js"
Cohesion: 0.35
Nodes (10): addResult(), EXPECTED_PLAN_IDS, getJwtRole(), getSafeErrorCode(), isPermissionDenied(), isServerOnlyKey(), readConfiguration(), REQUIRED_ENVIRONMENT_VARIABLES (+2 more)

### Community 78 - "Login Auth Integration"
Cohesion: 0.09
Nodes (22): Arquitetura, `authService.js`, Com sessao e onboarding incompleto, Com sessao e profile concluido, Com sessao e sem profile, Fluxo com Supabase ativo, Limites desta etapa, Login Auth Integration (+14 more)

### Community 80 - "Onboarding Real Integration"
Cohesion: 0.11
Nodes (17): Atualizacao da sessao, Idempotencia e retomada, Limites desta etapa, Logs, Modo demo, Objetivo, Onboarding Real Integration, `onboardingService.js` (+9 more)

### Community 81 - "Financial Core Data Model"
Cohesion: 0.08
Nodes (25): Accounts, Accounts, `accountService.js`, Catalogo de tipos de conta, Categories, Categories, `categoryService.js`, Dados manuais e externos (+17 more)

### Community 82 - "Pessoal e financeiro"
Cohesion: 0.29
Nodes (7): `accounts`, `agenda_items`, `categories`, `objectives`, Pessoal e financeiro, `reports_snapshots`, `transactions`

### Community 83 - "Empresarial"
Cohesion: 0.29
Nodes (7): `clients`, `companies`, `crm_opportunities`, `crm_pipeline_stages`, Empresarial, `project_milestones`, `projects`

### Community 84 - "3. Modelo inicial de autenticacao"
Cohesion: 0.33
Nodes (6): 3. Modelo inicial de autenticacao, `auth.users`, `plans` e `subscriptions`, `profiles`, Relacao entre usuario e workspace, `user_preferences`

### Community 85 - "4. Modelo de workspaces"
Cohesion: 0.33
Nodes (6): 4. Modelo de workspaces, Membership e roles futuros, Usuario com ambos, Workspace empresarial, Workspace pessoal, `workspaces`

### Community 86 - "Uni e IA"
Cohesion: 0.33
Nodes (6): 5. Tabelas sugeridas por modulo, `uni_conversations`, Uni e IA, `uni_insights`, `uni_recommendations`, `user_cognitive_profile`

### Community 87 - "useAccess"
Cohesion: 0.17
Nodes (9): Badge(), Card(), FinancialSummaryCard(), MetricRow(), GoalsSummaryCard(), RecentActivityList(), clientsMock, ClientesPage() (+1 more)

### Community 88 - "cx"
Cohesion: 0.19
Nodes (8): Loader(), Tooltip(), agendaMock, AgendaPage(), getAgendaContext(), ProjectsPage(), projectsMock, cx()

### Community 89 - "index.js"
Cohesion: 0.08
Nodes (57): accountMatchesInput(), accountSearchTerms(), ACTION_INTENTS, buildFinancialIntentAction(), categorySimilarity(), createIssue(), executeFinancialIntentAction(), isFinancialTransactionIntent() (+49 more)

### Community 90 - "routes.jsx"
Cohesion: 0.20
Nodes (25): EMPTY_DATA, useOpenFinance(), createResult(), createUnavailableResult(), createValidationResult(), getExternalAccount(), isValidUuid(), listExternalAccounts() (+17 more)

### Community 91 - "accountService.js"
Cohesion: 0.14
Nodes (46): cloneRecords(), createDemoRecord(), createDemoResult(), removeRecord(), upsertRecord(), useAccounts(), useCategories(), useTransactions() (+38 more)

### Community 92 - "transactionService.js"
Cohesion: 0.10
Nodes (20): CRUD de categorias, CRUD de contas, CRUD de lancamentos, Edicao e contas arquivadas, Financial Phase 2 UI Integration, Fluxo de dados, Hooks, Integracao visual (+12 more)

### Community 93 - "Open Finance Architecture"
Cohesion: 0.09
Nodes (22): Criterios antes de producao, `external_accounts`, `external_transactions`, `externalAccountService.js`, Fronteiras do dominio, Idempotencia, LGPD e consentimento, Modelo de dados (+14 more)

### Community 94 - "ReportsPage.jsx"
Cohesion: 0.39
Nodes (6): reportsMock, buildChartPoints(), EvolutionChart(), getLinePath(), getReportsContext(), ReportsPage()

### Community 95 - "AccessModeSwitcher.jsx"
Cohesion: 0.10
Nodes (50): amountClose(), descriptionSimilarity(), detectFinancialAnomalies(), createFinancialSnapshot(), incrementAggregate(), inPeriod(), addDays(), buildMemoryCandidates() (+42 more)

### Community 96 - "FinanceiroPage.jsx"
Cohesion: 0.23
Nodes (9): useSession(), financialMock, FinanceiroPage(), formatMovementDate(), getCrudContext(), getFinancialContext(), LoginPage(), onboardingOptions (+1 more)

### Community 97 - "ObjetivosPage.jsx"
Cohesion: 0.13
Nodes (12): USER_MODES, AccessModeSwitcher(), getModeOptionsForPlan(), normalizeAccessForPlan(), PERSONAL_PLANS, PLAN_LABELS, PLAN_OPTIONS, USER_MODE_LABELS (+4 more)

### Community 98 - "Open Finance Migration Review"
Cohesion: 0.07
Nodes (27): 1. Ciclo de consentimento ambiguo, 2. Consentimento legivel depois da perda de membership, 3. IDs externos com escopo insuficiente, 4. Jobs duplicados em paralelo, 5. Retry e timestamps incompletos, 6. Exposicao ampla de colunas por SELECT, 7. Nome de payload pouco explicito, Auditoria da tentativa que falhou (+19 more)

### Community 99 - "AccessModeSwitcher.jsx"
Cohesion: 0.16
Nodes (7): Avatar, Button(), CURRENCY_FORMATTER, formatDate(), UniFinancialActionCard(), UniMessageBubble(), UniVoiceCapture()

### Community 100 - "ObjetivosPage.jsx"
Cohesion: 0.53
Nodes (4): objectivesMock, getObjectivesContext(), getProgress(), ObjetivosPage()

### Community 101 - "AgendaPage.jsx"
Cohesion: 0.17
Nodes (11): canUseBusinessFeatures(), DEFAULT_DEMO_ACCESS, isBusinessMode(), WORKSPACE_TYPES, AccessContext, AccessProvider(), dashboardMock, DashboardPage() (+3 more)

### Community 102 - "Uni Conversation Financial Actions V1"
Cohesion: 0.17
Nodes (11): Contas e categorias, Correção e campos ausentes, Estados, Evolução futura, Fluxo oficial, Limites da V1, Objetivo, Personalidade (+3 more)

### Community 103 - "UniFinancialActionCard.jsx"
Cohesion: 0.17
Nodes (19): ARCHETYPES, CORE_IDENTITY, getPersonalityProfile(), isValidPersonalityProfile(), PERSONALITY_PROFILE_IDS, PERSONALITY_PROFILES, buildPersonalityInstructions(), formatPercentage() (+11 more)

### Community 104 - "Uni Financial Memory V1"
Cohesion: 0.08
Nodes (23): Anomalias, Confiança, Contexto, Explicabilidade, GPS Financeiro futuro, Histórico, Histórico, contexto e memória, Limites da V1 (+15 more)

### Community 105 - "SettingsPage.jsx"
Cohesion: 0.38
Nodes (5): settingsMock, getSettingsContext(), PLAN_LABELS, SettingsPage(), USER_MODE_LABELS

## Knowledge Gaps
- **560 isolated node(s):** `Avatar`, `AvatarGroup`, `Badge`, `Button`, `Card` (+555 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isSupabaseConfigured` connect `accountService.js` to `authService.js`, `routes.jsx`, `AccessModeSwitcher.jsx`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `FinanceTransactionModal()` connect `index.js` to `FinanceiroPage.jsx`, `useAccess`, `AccessModeSwitcher.jsx`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `transaction()` connect `AccessModeSwitcher.jsx` to `index.js`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `Avatar`, `AvatarGroup`, `Badge` to the rest of the system?**
  _560 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DashboardPage.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `cx` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._