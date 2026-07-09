# Graph Report - uniflow-ai-app  (2026-07-09)

## Corpus Check
- 112 files · ~23,609 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 363 nodes · 436 edges · 58 communities (49 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ce815678`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- DashboardPage.jsx
- devDependencies
- cx
- MainDashboard.jsx
- AppShell.jsx
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

## God Nodes (most connected - your core abstractions)
1. `cx()` - 15 edges
2. `Módulos oficiais do produto` - 13 edges
3. `Badge()` - 12 edges
4. `Módulo Projetos — Arquitetura (documento de planejamento, sem código)` - 12 edges
5. `Kit Base UniFlow AI` - 11 edges
6. `Regras do Projeto` - 11 edges
7. `Card()` - 9 edges
8. `Prompts Base para Agentes` - 9 edges
9. `formatCurrency()` - 8 edges
10. `Button()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Loader()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Loader/Loader.jsx → src/utils/cx.js
- `Modal()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Modal/Modal.jsx → src/utils/cx.js
- `Tooltip()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Tooltip/Tooltip.jsx → src/utils/cx.js
- `MetricRow()` --calls--> `formatCurrency()`  [EXTRACTED]
  src/features/dashboard/components/FinancialSummaryCard.jsx → src/utils/formatters.js
- `Badge()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Badge/Badge.jsx → src/utils/cx.js

## Import Cycles
- None detected.

## Communities (58 total, 9 thin omitted)

### Community 0 - "DashboardPage.jsx"
Cohesion: 0.12
Nodes (16): Avatar, Badge(), Button(), Card(), Loader(), Modal(), Tooltip(), DashboardGreeting() (+8 more)

### Community 1 - "devDependencies"
Cohesion: 0.09
Nodes (22): dependencies, react, react-dom, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+14 more)

### Community 2 - "cx"
Cohesion: 0.18
Nodes (7): Input, contextItems, conversationMessages, getLastUniMessage(), getVoiceIntensity(), quickSuggestions, UniAIPage()

### Community 3 - "MainDashboard.jsx"
Cohesion: 0.17
Nodes (8): DashboardGreeting(), currency, FinancialSummaryCard(), GoalsSummaryCard(), currency, dateFormatter, RecentActivityList(), UniInsightsCard()

### Community 4 - "AppShell.jsx"
Cohesion: 0.11
Nodes (14): App(), appRoutes, navigationItems, AppShell(), Sidebar(), Topbar(), DashboardPage(), AgendaPage() (+6 more)

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
Cohesion: 0.22
Nodes (8): Commits, Estado atual, Estrutura oficial, graphify, Papel do agente, Prioridade atual, Regras absolutas, UniFlow AI — Regras do Projeto

### Community 55 - "UniFlow AI — Fase 1: Autenticação, Login, Cadastro e Onboarding Inteligente"
Cohesion: 0.25
Nodes (7): Bug pré-existente encontrado (não corrigido, fora do meu escopo decidir), O que foi entregue, O que NÃO foi feito nesta fase (por escopo, não por esquecimento), Ordem de leitura recomendada, Rastreabilidade com os documentos de arquitetura, Regra do Design System — auditoria rápida, UniFlow AI — Fase 1: Autenticação, Login, Cadastro e Onboarding Inteligente

### Community 56 - "Clientes (CRM)"
Cohesion: 0.25
Nodes (7): Clientes (CRM), Decisão: por que não há `Badge`/`Tooltip` importados, Estrutura, Fluxo, O que falta para produção, Reuso do Design System, ⚠️ Sem docx específico — padrão mínimo coerente

### Community 57 - "React + Vite"
Cohesion: 0.50
Nodes (3): Expanding the ESLint configuration, React Compiler, React + Vite

## Knowledge Gaps
- **136 isolated node(s):** `Avatar`, `AvatarGroup`, `Badge`, `Button`, `Card` (+131 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cx()` connect `DashboardPage.jsx` to `cx`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `Badge()` connect `DashboardPage.jsx` to `cx`, `AppShell.jsx`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `Card()` connect `DashboardPage.jsx` to `cx`, `AppShell.jsx`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `Avatar`, `AvatarGroup`, `Badge` to the rest of the system?**
  _136 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DashboardPage.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11962833914053426 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `AppShell.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11182795698924732 - nodes in this community are weakly interconnected._