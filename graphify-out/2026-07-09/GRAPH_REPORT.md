# Graph Report - uniflow-ai-app  (2026-07-09)

## Corpus Check
- 139 files · ~33,829 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 478 nodes · 657 edges · 67 communities (53 shown, 14 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `248b94b8`
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
- cx

## God Nodes (most connected - your core abstractions)
1. `Uni AI Experience Reference` - 19 edges
2. `Badge()` - 16 edges
3. `cx()` - 15 edges
4. `Card()` - 14 edges
5. `Módulos oficiais do produto` - 13 edges
6. `Button()` - 12 edges
7. `Módulo Projetos — Arquitetura (documento de planejamento, sem código)` - 12 edges
8. `DashboardView` - 11 edges
9. `Kit Base UniFlow AI` - 11 edges
10. `Regras do Projeto` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Badge()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Badge/Badge.jsx → src/utils/cx.js
- `Button()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Button/Button.jsx → src/utils/cx.js
- `Card()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Card/Card.jsx → src/utils/cx.js
- `Loader()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Loader/Loader.jsx → src/utils/cx.js
- `Modal()` --calls--> `cx()`  [EXTRACTED]
  src/components/ui/Modal/Modal.jsx → src/utils/cx.js

## Import Cycles
- None detected.

## Communities (67 total, 14 thin omitted)

### Community 0 - "DashboardPage.jsx"
Cohesion: 0.14
Nodes (14): Avatar, Badge(), Button(), Card(), DashboardGreeting(), FinancialSummaryCard(), MetricRow(), GoalsSummaryCard() (+6 more)

### Community 1 - "devDependencies"
Cohesion: 0.09
Nodes (22): dependencies, react, react-dom, devDependencies, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh (+14 more)

### Community 2 - "cx"
Cohesion: 0.07
Nodes (26): 10. Papel da resposta consultiva da Uni, 11. Papel do dashboard reagindo apos a resposta, 12. Ritmo e tempos da experiencia, 13. O que deve ser preservado no WebApp, 14. O que nao deve ser copiado cegamente, 15. Componentes React propostos, 16. Hooks propostos, 17. Roadmap de implementacao (+18 more)

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

### Community 39 - "UniAIPage.jsx"
Cohesion: 0.12
Nodes (26): audioControlLabels, EXPERIENCE_STATES, EXPERIENCE_TIMING, createInsightReport(), createMessage(), getLastUniMessage(), getMockUniResponse(), getPortugueseVoice() (+18 more)

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

### Community 61 - "uni-demo_data.js"
Cohesion: 0.29
Nodes (5): clamp(), FinanceState, getReasoningChain(), pickRandom(), randomBetween()

### Community 66 - "cx"
Cohesion: 0.17
Nodes (5): Input, Loader(), Modal(), Tooltip(), cx()

## Knowledge Gaps
- **157 isolated node(s):** `Avatar`, `AvatarGroup`, `Badge`, `Button`, `Card` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cx()` connect `cx` to `DashboardPage.jsx`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `Badge()` connect `DashboardPage.jsx` to `cx`, `AppShell.jsx`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `Button()` connect `DashboardPage.jsx` to `cx`, `AppShell.jsx`, `UniAIPage.jsx`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `Avatar`, `AvatarGroup`, `Badge` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `DashboardPage.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.14304993252361672 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `cx` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._