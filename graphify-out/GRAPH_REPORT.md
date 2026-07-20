# Graph Report - uniflow-ai-app  (2026-07-20)

## Corpus Check
- 497 files · ~194,127 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2399 nodes · 4960 edges · 153 communities (127 shown, 26 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `92339546`
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
- MainLayout.jsx
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
- index.js
- AgendaPage.jsx
- Uni Conversation Financial Actions V1
- UniFinancialActionCard.jsx
- Uni Financial Memory V1
- AccessModeSwitcher.jsx
- Teste autenticado da Memória Financeira V1
- Workspace Onboarding RLS Fix
- DashboardPage.jsx
- FinanceiroPage.jsx
- Uni Voice Input V1
- ObjetivosPage.jsx
- SettingsPage.jsx
- index.js
- SettingsPage.jsx
- Uni Voice Output Premium Demo V1
- index.ts
- ReportsPage.jsx
- Generate Uni Premium Voice
- futureCalculations.js
- MobileHomeView.jsx
- UniChatPage.jsx
- MobileAuthPage.jsx
- CognitiveLiveChart.jsx
- index.js
- AudioLibraryPage.jsx
- uniChatDataService.js
- UniChatPage
- financialQueryInterpreter.js
- VoiceManager
- MessageBubble.jsx
- useDashboardPersonalization.js
- voiceReview.test.js
- UniFlow Uni Audio Experience V1
- Mobile Auth Foundation V1
- UniFlow Cognitive Live Chart V1
- Mobile App Shell Integration V1
- UniFlow Home Mobile V1
- UniFlow Mobile Context Header V1
- UniFlow Financeiro Mobile V1
- uniChatMigration.test.js
- CardsWalletCarousel.jsx
- Mobile App Shell
- README.md
- README.md
- README.md
- README.md
- README.md
- README.md
- README.md
- objectives.mock.js

## God Nodes (most connected - your core abstractions)
1. `cx()` - 51 edges
2. `formatCurrency()` - 44 edges
3. `Button()` - 42 edges
4. `useAccess()` - 39 edges
5. `Badge()` - 37 edges
6. `Card()` - 31 edges
7. `useSession()` - 27 edges
8. `Supabase Auth and Data Plan` - 27 edges
9. `isSupabaseConfigured` - 23 edges
10. `SessionProvider()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `sleep()` --indirect_call--> `resolve()`  [INFERRED]
  docs/08-references/landing-uni-demo/uni-demo_chat.js → src/features/uni-memory-integration/conversationMemory.test.js
- `MainLayout()` --indirect_call--> `event()`  [INFERRED]
  docs/04-layout/MainLayout.jsx → src/features/uni-audio-selection/audioSelection.test.js
- `CognitiveLiveChart()` --indirect_call--> `event()`  [INFERRED]
  src/features/cognitive-live-chart/CognitiveLiveChart.jsx → src/features/uni-audio-selection/audioSelection.test.js
- `RangeSelect()` --calls--> `cx()`  [EXTRACTED]
  src/features/onboarding/components/StepFinancial.jsx → src/utils/cx.js
- `YesNoSelect()` --calls--> `cx()`  [EXTRACTED]
  src/features/onboarding/components/StepFinancial.jsx → src/utils/cx.js

## Import Cycles
- None detected.

## Communities (153 total, 26 thin omitted)

### Community 0 - "DashboardPage.jsx"
Cohesion: 0.04
Nodes (47): 10. Regra de adaptacao, 11. Onboarding futuro, 12. Configuracoes futuras, 13. Arquitetura de codigo V1, 14. Dados futuros, 15. Fora do escopo da V1, 16. Criterios para integracao futura, 1. Objetivo (+39 more)

### Community 1 - "devDependencies"
Cohesion: 0.07
Nodes (28): dependencies, react, react-dom, @supabase/supabase-js, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks (+20 more)

### Community 2 - "cx"
Cohesion: 0.07
Nodes (28): 10. Papel da resposta consultiva da Uni, 11. Papel do dashboard reagindo apos a resposta, 12. Ritmo e tempos da experiencia, 13. O que deve ser preservado no WebApp, 14. O que nao deve ser copiado cegamente, 15. Componentes React propostos, 16. Hooks propostos, 17. Roadmap de implementacao (+20 more)

### Community 3 - "MainDashboard.jsx"
Cohesion: 0.17
Nodes (8): DashboardGreeting(), currency, FinancialSummaryCard(), GoalsSummaryCard(), currency, dateFormatter, RecentActivityList(), UniInsightsCard()

### Community 4 - "AccessModeSwitcher.jsx"
Cohesion: 0.12
Nodes (15): Ação financeira atômica, Correção atômica e saldo derivado, Decisoes ainda pendentes, Estado atual, Memoria Financeira V1 no DEV, Novas migrations, Nucleo financeiro no DEV, Open Finance validado no DEV (+7 more)

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

### Community 23 - "MainLayout.jsx"
Cohesion: 0.16
Nodes (20): MainLayout(), AUDIO_CONTEXT_POLICIES, VOICE_PREFERENCES_DEFAULTS, isAudioInCooldown(), hourMatches(), isAudioEligible(), normalize(), appendAudioHistory() (+12 more)

### Community 39 - "UniAIPage.jsx"
Cohesion: 0.08
Nodes (35): createSpeechRecognitionAdapter(), ERROR_STATUS, getSpeechRecognitionConstructor(), mapSpeechRecognitionError(), sanitizeVoiceTranscript(), FakeRecognition, setupAdapter(), useUniVoiceInput() (+27 more)

### Community 41 - "index.js"
Cohesion: 0.13
Nodes (23): Input, Modal(), DEFAULT_CATEGORIES, formatInputCurrency(), GoalForm(), INITIAL_STATE, toNumber(), EMPTY_FORM (+15 more)

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
Cohesion: 0.12
Nodes (8): filterNavigationItems(), navigationItems, AppShell(), Sidebar(), Topbar(), Avatar, UniMessageBubble(), UniVoiceCapture()

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
Cohesion: 0.08
Nodes (24): 10. Variaveis de ambiente futuras, 11. Riscos, 12. Checklist da Fase 2, 13. Decisao oficial, 14. Schema inicial versionado, 15. Estrategia de ambientes, 16. Validacao inicial de Auth e workspaces, 17. RLS autenticado validado (+16 more)

### Community 73 - "authService.js"
Cohesion: 0.06
Nodes (66): getAccessFromSession(), INITIAL_SESSION_STATE, logAuthDevelopment(), SessionContext, SessionProvider(), VALID_PLANS, VALID_USER_MODES, VALID_WORKSPACE_TYPES (+58 more)

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
Nodes (18): Atualizacao da sessao, Idempotencia e retomada, Leitura do workspace recém-criado, Limites desta etapa, Logs, Modo demo, Objetivo, Onboarding Real Integration (+10 more)

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
Cohesion: 0.14
Nodes (21): Badge(), FinancialSummaryCard(), MetricRow(), GoalsSummaryCard(), RecentActivityList(), FutureGoals(), statusLabel(), FutureScenarios() (+13 more)

### Community 88 - "cx"
Cohesion: 0.12
Nodes (12): Card(), Loader(), Tooltip(), FutureExplanation(), FutureHeader(), getWorkspaceLabel(), StepGoal(), StepMode() (+4 more)

### Community 89 - "index.js"
Cohesion: 0.17
Nodes (19): ARCHETYPES, CORE_IDENTITY, getPersonalityProfile(), isValidPersonalityProfile(), PERSONALITY_PROFILE_IDS, PERSONALITY_PROFILES, buildPersonalityInstructions(), formatPercentage() (+11 more)

### Community 90 - "routes.jsx"
Cohesion: 0.23
Nodes (19): classifyInferredTypeBlock(), client(), contextFor(), createExplicit(), denied(), expectInferredTypeDenied(), expectInsertDenied(), jwtRole() (+11 more)

### Community 91 - "accountService.js"
Cohesion: 0.06
Nodes (99): useSession(), CURRENCY_FORMATTER, DATE_FORMATTER, useHomeFinancialData(), addContribution(), checkRequiredGoalFields(), createGoal(), createResult() (+91 more)

### Community 92 - "transactionService.js"
Cohesion: 0.10
Nodes (20): CRUD de categorias, CRUD de contas, CRUD de lancamentos, Edicao e contas arquivadas, Financial Phase 2 UI Integration, Fluxo de dados, Hooks, Integracao visual (+12 more)

### Community 93 - "Open Finance Architecture"
Cohesion: 0.09
Nodes (22): Criterios antes de producao, `external_accounts`, `external_transactions`, `externalAccountService.js`, Fronteiras do dominio, Idempotencia, LGPD e consentimento, Modelo de dados (+14 more)

### Community 94 - "ReportsPage.jsx"
Cohesion: 0.12
Nodes (16): Auditoria e aplicação no DEV, Concorrência de contas, Correção do índice de contas, `create`, `existing`, Frontend, Idempotência, Limites da V1 (+8 more)

### Community 95 - "AccessModeSwitcher.jsx"
Cohesion: 0.06
Nodes (90): amountClose(), descriptionSimilarity(), detectFinancialAnomalies(), createFinancialSnapshot(), incrementAggregate(), inPeriod(), accounts, categories (+82 more)

### Community 96 - "FinanceiroPage.jsx"
Cohesion: 0.15
Nodes (12): Conflitos, Correção e consentimento, Direitos do usuário, Entrada de voz, Fluxo, Limites, Memórias permitidas, Modo demo (+4 more)

### Community 97 - "ObjetivosPage.jsx"
Cohesion: 0.09
Nodes (22): Checklist após eventual falha, Checklist de aplicação no DEV, Checklist de validação após aplicação, Confirmação, Escopo, Exclusão de referências financeiras, Falha parcial, Grants (+14 more)

### Community 98 - "Open Finance Migration Review"
Cohesion: 0.07
Nodes (27): 1. Ciclo de consentimento ambiguo, 2. Consentimento legivel depois da perda de membership, 3. IDs externos com escopo insuficiente, 4. Jobs duplicados em paralelo, 5. Retry e timestamps incompletos, 6. Exposicao ampla de colunas por SELECT, 7. Nome de payload pouco explicito, Auditoria da tentativa que falhou (+19 more)

### Community 99 - "AccessModeSwitcher.jsx"
Cohesion: 0.12
Nodes (15): Button(), UniAudioControls(), UniExperienceShell(), CURRENCY_FORMATTER, formatDate(), UniFinancialActionCard(), UniInsightReport(), UniLiveContextPanel() (+7 more)

### Community 100 - "index.js"
Cohesion: 0.06
Nodes (75): createAccountProvisioningCoordinator(), createClientOperationId(), createError(), getHandlers(), provisionAccountAndTransaction(), ACCOUNT_RESOLUTION_STATUS, accountMatches(), cleanAccountName() (+67 more)

### Community 101 - "AgendaPage.jsx"
Cohesion: 0.08
Nodes (29): DEFAULT_DEMO_ACCESS, AccessContext, AccessProvider(), useAccess(), canAccessNavigationItem(), canAccessRoute(), getFallbackRoute(), App() (+21 more)

### Community 102 - "Uni Conversation Financial Actions V1"
Cohesion: 0.15
Nodes (12): Contas e categorias, Correção e campos ausentes, Estados, Evolução futura, Fluxo oficial, Limites da V1, Memória explícita, Objetivo (+4 more)

### Community 103 - "UniFinancialActionCard.jsx"
Cohesion: 0.05
Nodes (45): getWorkspaceTypeFromContext(), useVoiceManager(), UniInstantButton(), useReducedMotion(), CONTEXTS, FALLBACK_CONTEXT, resolveUniInstantContext(), UniInstantResultCard() (+37 more)

### Community 104 - "Uni Financial Memory V1"
Cohesion: 0.08
Nodes (23): Anomalias, Confiança, Contexto, Explicabilidade, GPS Financeiro futuro, Histórico, Histórico, contexto e memória, Limites da V1 (+15 more)

### Community 105 - "AccessModeSwitcher.jsx"
Cohesion: 0.33
Nodes (5): Aplicação no UniFlow DEV, Ensure Authenticated Profile, Modelo de segurança, Objetivo, Service

### Community 106 - "Teste autenticado da Memória Financeira V1"
Cohesion: 0.18
Nodes (10): Cenários, Código P0001 nos tipos inferidos, Estado, Execução, Limpeza e limites, Objetivo, Pré-requisitos, Resultado esperado (+2 more)

### Community 107 - "Workspace Onboarding RLS Fix"
Cohesion: 0.25
Nodes (7): Aplicação segura no DEV, Causa, Correção versionada, Estado do usuário B, Ownership no frontend, Sintoma confirmado, Workspace Onboarding RLS Fix

### Community 108 - "DashboardPage.jsx"
Cohesion: 0.05
Nodes (43): transaction(), AccountCardTile(), AccountsCarousel(), AvailableBalanceCard(), CategoriesBreakdown(), CategoryBar(), FinanceiroEmptyState(), FinanceiroErrorState() (+35 more)

### Community 109 - "FinanceiroPage.jsx"
Cohesion: 0.15
Nodes (12): Ambiguidade, Confirmação única e duplicidade, Conta arquivada, Conta ativa existente, Conta inexistente, Evolução para atomicidade, Fluxo oficial, Limites da V1 (+4 more)

### Community 110 - "Uni Voice Input V1"
Cohesion: 0.18
Nodes (10): Arquitetura, Confirmação e memória, Estados, Limites da V1, Objetivo, Personalidade, Privacidade, Saída de voz separada (+2 more)

### Community 111 - "ObjetivosPage.jsx"
Cohesion: 0.39
Nodes (5): financialMock, FinanceiroPage(), formatMovementDate(), getCrudContext(), getFinancialContext()

### Community 112 - "SettingsPage.jsx"
Cohesion: 0.25
Nodes (16): callAtomic(), cleanup(), createAccount(), createTestClient(), ensureTestWorkspace(), getAccountBalance(), getWorkspaceBalance(), jwtRole() (+8 more)

### Community 113 - "index.js"
Cohesion: 0.12
Nodes (29): createBrowserVoiceProvider(), selectPortugueseVoice(), createPremiumVoiceProvider(), createBrowserRuntime(), EDGE_SOURCE, HOOK_SOURCE, PAGE_SOURCE, PROVIDER_SOURCE (+21 more)

### Community 114 - "SettingsPage.jsx"
Cohesion: 0.08
Nodes (28): canUseBusinessFeatures(), isBusinessMode(), PLANS, USER_MODES, WORKSPACE_TYPES, ALL_MODES, ALL_PLANS, ALL_WORKSPACES (+20 more)

### Community 115 - "Uni Voice Output Premium Demo V1"
Cohesion: 0.12
Nodes (16): 10. Sanitização e privacidade, 11. Estados e mensagens, 12. Modo sem configuração, 13. Sequência segura para habilitar uma demonstração, 14. Limites e próximos passos, 15. Estado da implementação, 1. Objetivo, 2. Arquitetura de providers (+8 more)

### Community 116 - "index.ts"
Cohesion: 0.20
Nodes (4): activeUsers, CORS_HEADERS, PersonalityProfile, PRESETS

### Community 117 - "ReportsPage.jsx"
Cohesion: 0.39
Nodes (6): reportsMock, buildChartPoints(), EvolutionChart(), getLinePath(), getReportsContext(), ReportsPage()

### Community 118 - "Generate Uni Premium Voice"
Cohesion: 0.40
Nodes (4): Contrato, Estado, Generate Uni Premium Voice, Segredos obrigatórios

### Community 119 - "futureCalculations.js"
Cohesion: 0.14
Nodes (40): addMonths(), buildChartData(), calcAccumulatedBalance(), calcAllGoalProjections(), calcAllScenarioProjections(), calcGoalProjection(), calcMonthlyAverages(), calcProjectedBalance() (+32 more)

### Community 120 - "MobileHomeView.jsx"
Cohesion: 0.10
Nodes (17): EMPTY_METRICS, FinancialSummaryStrip(), GoalsProgressList(), normalizeProgress(), HomeEmptyState(), HomeSectionSkeleton(), InsightCarousel(), InsightChip() (+9 more)

### Community 121 - "UniChatPage.jsx"
Cohesion: 0.12
Nodes (22): ChatInput(), EmptyState(), formatDate(), HistoryPanel(), QuickSuggestions(), ScrollToLatest(), chatHistory, uniChatDataService (+14 more)

### Community 122 - "MobileAuthPage.jsx"
Cohesion: 0.16
Nodes (17): AUTH_MODES, getNextSlideIndex(), getSocialUnavailableResult(), normalizeAuthMode(), SOCIAL_PROVIDERS, WELCOME_SLIDES, isValidEmail(), validateAuthForm() (+9 more)

### Community 123 - "CognitiveLiveChart.jsx"
Cohesion: 0.15
Nodes (23): CognitiveChartTooltip(), CognitiveLiveChart(), MARGIN, comparisonInsight, currentMonthData, forecastInsight, forecastMonthData, modeOptions (+15 more)

### Community 124 - "index.js"
Cohesion: 0.17
Nodes (12): createAudioPlayer(), isLocalAudioSource(), VoiceContext, createVoiceManager(), INITIAL_STATE, manifest, findVoiceClip(), validateVoiceManifest() (+4 more)

### Community 125 - "AudioLibraryPage.jsx"
Cohesion: 0.17
Nodes (18): AUDIO_STATUS_FILTERS, filterAudioLibrary(), getAdjacentPlayableClip(), getAudioLibraryCounts(), getAudioLibraryOptions(), getOfficialReviewState(), normalize(), AudioLibraryPage() (+10 more)

### Community 126 - "uniChatDataService.js"
Cohesion: 0.21
Nodes (22): archiveConversation(), createConversation(), dbToConversation(), dbToMessage(), deleteConversation(), formatTimestamp(), getUserId(), isMigrationComplete() (+14 more)

### Community 127 - "UniChatPage"
Cohesion: 0.22
Nodes (15): convIdCounter, createConversation(), deriveTitle(), getStorage(), isMigrationComplete(), loadActiveId(), loadActiveSource(), loadHistory() (+7 more)

### Community 128 - "financialQueryInterpreter.js"
Cohesion: 0.21
Nodes (11): buildQueryResponse(), capitalize(), classifyFinancialQuery(), fmtCurrency(), fmtShortDate(), MONTH_NAMES, normalize(), buildFinancialContext() (+3 more)

### Community 129 - "VoiceManager"
Cohesion: 0.19
Nodes (3): createAudioHistoryEvent(), managerError(), VoiceManager

### Community 130 - "MessageBubble.jsx"
Cohesion: 0.21
Nodes (7): ActionConfirmation(), ChatHeader(), MessageBubble(), renderWithHighlight(), TypingIndicator(), UniAvatar(), UniSignatureWave()

### Community 131 - "useDashboardPersonalization.js"
Cohesion: 0.30
Nodes (11): DEFAULT_ACTION, getActivationSteps(), getGreeting(), getNextBestAction(), getTimeOfDay(), GOAL_CTA_MAP, GOAL_PHRASES, shouldShowActivation() (+3 more)

### Community 132 - "voiceReview.test.js"
Cohesion: 0.31
Nodes (7): BASE_VOICE_CATALOG_ENTRIES, VOICE_CATALOG_ENTRIES, applyVoiceReview(), REPLACEMENT_IDS, validateVoiceReviewEntries(), VOICE_REVIEW_STATUSES, VOICE_REVIEW_ENTRIES

### Community 133 - "UniFlow Uni Audio Experience V1"
Cohesion: 0.20
Nodes (9): Context map, Frequency and anti-repetition, Initial integrations, Local catalog, Next steps, Objective, Preferences, Safety and limitations (+1 more)

### Community 134 - "Mobile Auth Foundation V1"
Cohesion: 0.20
Nodes (9): Componentes, Estados, Fluxo, Google e Apple, Limites desta etapa, Mobile Auth Foundation V1, Objetivo, Próxima etapa (+1 more)

### Community 135 - "UniFlow Cognitive Live Chart V1"
Cohesion: 0.22
Nodes (8): Evolução futura, Integrações, Limitações, Modos, Objetivo, Props principais, UniFlow Cognitive Live Chart V1, Variantes

### Community 136 - "Mobile App Shell Integration V1"
Cohesion: 0.25
Nodes (7): Decisão, Desktop, Integração, Limitações, Mobile, Mobile App Shell Integration V1, Navegação

### Community 137 - "UniFlow Home Mobile V1"
Cohesion: 0.29
Nodes (6): Composição, Decisão, Integração, Limitações, Responsividade, UniFlow Home Mobile V1

### Community 138 - "UniFlow Mobile Context Header V1"
Cohesion: 0.29
Nodes (6): Bottom sheet Mais, Componentes, Limitações, Objetivo, UniFlow Mobile Context Header V1, Visual e acessibilidade

### Community 139 - "UniFlow Financeiro Mobile V1"
Cohesion: 0.33
Nodes (5): Estrutura, Limites da V1, Objetivo, Responsividade e acesso, UniFlow Financeiro Mobile V1

## Knowledge Gaps
- **810 isolated node(s):** `Avatar`, `AvatarGroup`, `Badge`, `Button`, `Card` (+805 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useSession()` connect `accountService.js` to `useDashboardPersonalization.js`, `AgendaPage.jsx`, `UniFinancialActionCard.jsx`, `UniAIPage.jsx`, `authService.js`, `ObjetivosPage.jsx`, `futureCalculations.js`, `UniChatPage.jsx`, `MobileAuthPage.jsx`, `AccessModeSwitcher.jsx`, `UniChatPage`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `useAccess()` connect `AgendaPage.jsx` to `useDashboardPersonalization.js`, `navigation.js`, `UniFinancialActionCard.jsx`, `UniAIPage.jsx`, `authService.js`, `ObjetivosPage.jsx`, `SettingsPage.jsx`, `ReportsPage.jsx`, `useAccess`, `cx`, `UniChatPage.jsx`, `UniChatPage`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `CognitiveLiveChart()` connect `CognitiveLiveChart.jsx` to `MobileHomeView.jsx`, `DashboardPage.jsx`, `MainLayout.jsx`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `Avatar`, `AvatarGroup`, `Badge` to the rest of the system?**
  _810 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DashboardPage.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `cx` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._