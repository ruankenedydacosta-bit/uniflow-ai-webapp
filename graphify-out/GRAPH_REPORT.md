# Graph Report - uniflow-ai-app  (2026-07-10)

## Corpus Check
- 158 files · ~47,388 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 647 nodes · 980 edges · 71 communities (57 shown, 14 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9ec7c802`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DashboardPage.jsx
- devDependencies
- cx
- MainDashboard.jsx
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

## God Nodes (most connected - your core abstractions)
1. `cx()` - 27 edges
2. `Badge()` - 23 edges
3. `Card()` - 21 edges
4. `formatCurrency()` - 20 edges
5. `useAccess()` - 19 edges
6. `Uni AI Experience Reference` - 19 edges
7. `Button()` - 18 edges
8. `User Modes and Plans` - 15 edges
9. `App Structure Map` - 13 edges
10. `6. Catalogo oficial de modulos` - 13 edges

## Surprising Connections (you probably didn't know these)
- `AccessModeSwitcher()` --calls--> `useAccess()`  [EXTRACTED]
  src/components/dev/AccessModeSwitcher.jsx → src/app/AccessContext.jsx
- `Sidebar()` --calls--> `useAccess()`  [EXTRACTED]
  src/components/layout/Sidebar/Sidebar.jsx → src/app/AccessContext.jsx
- `Loader()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Loader/Loader.jsx → src/utils/cx.js
- `Modal()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Modal/Modal.jsx → src/utils/cx.js
- `Tooltip()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Tooltip/Tooltip.jsx → src/utils/cx.js

## Import Cycles
- None detected.

## Communities (71 total, 14 thin omitted)

### Community 0 - "DashboardPage.jsx"
Cohesion: 0.06
Nodes (50): canUseBusinessFeatures(), DEFAULT_DEMO_ACCESS, isBusinessMode(), WORKSPACE_TYPES, AccessContext, useAccess(), Avatar, Badge() (+42 more)

### Community 1 - "devDependencies"
Cohesion: 0.08
Nodes (23): dependencies, react, react-dom, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+15 more)

### Community 2 - "cx"
Cohesion: 0.07
Nodes (26): 10. Papel da resposta consultiva da Uni, 11. Papel do dashboard reagindo apos a resposta, 12. Ritmo e tempos da experiencia, 13. O que deve ser preservado no WebApp, 14. O que nao deve ser copiado cegamente, 15. Componentes React propostos, 16. Hooks propostos, 17. Roadmap de implementacao (+18 more)

### Community 3 - "MainDashboard.jsx"
Cohesion: 0.17
Nodes (8): DashboardGreeting(), currency, FinancialSummaryCard(), GoalsSummaryCard(), currency, dateFormatter, RecentActivityList(), UniInsightsCard()

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
Cohesion: 0.09
Nodes (29): Input, audioControlLabels, EXPERIENCE_STATES, EXPERIENCE_TIMING, createInsightReport(), createMessage(), getLastUniMessage(), getMockUniResponse() (+21 more)

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
Cohesion: 0.08
Nodes (23): PLANS, USER_MODES, AccessProvider(), App(), ALL_MODES, ALL_PLANS, BUSINESS_MODES, BUSINESS_PLANS (+15 more)

### Community 69 - "Obsidian Workflow"
Cohesion: 0.22
Nodes (8): Caminho do cofre, Como criar uma nota, Fonte principal do app, Obsidian Workflow, Papel do Obsidian, Pastas do Obsidian, Regras para agentes, Tipos de nota

### Community 70 - "create-note.js"
Cohesion: 0.42
Nodes (8): buildNote(), createNote(), getDateParts(), getUniqueFilePath(), NOTE_TYPES, parseArgs(), slugify(), validateInput()

### Community 71 - "FinanceProjectionChart.jsx"
Cohesion: 0.36
Nodes (8): buildAreaPath(), buildLinePath(), FinanceProjectionChart(), getPointCoordinates(), getSeriesTotal(), getSeriesValues(), PADDING, SERIES_CLASSES

## Knowledge Gaps
- **247 isolated node(s):** `Avatar`, `AvatarGroup`, `Badge`, `Button`, `Card` (+242 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cx()` connect `DashboardPage.jsx` to `UniAIPage.jsx`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Badge()` connect `DashboardPage.jsx` to `navigation.js`, `UniAIPage.jsx`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `Button()` connect `DashboardPage.jsx` to `UniAIPage.jsx`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `Avatar`, `AvatarGroup`, `Badge` to the rest of the system?**
  _247 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DashboardPage.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.059932785660941 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `cx` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._