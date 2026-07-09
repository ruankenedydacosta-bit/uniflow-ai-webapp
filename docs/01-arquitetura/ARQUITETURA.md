# Módulo Projetos — Arquitetura (documento de planejamento, sem código)

Nenhuma linha de implementação neste documento, por pedido explícito.
Objetivo: fechar toda decisão estrutural antes da primeira linha de
código, seguindo exatamente o padrão arquitetural de Dashboard/Chat/CRM.

---

## 1. Ancoragem nos documentos existentes

"Projetos" não é um módulo descrito na Arquitetura Funcional — mas duas
das suas entidades já são:

- **Empresa** → já existe (`empresas`, docx 4.3: id, usuario_id, nome,
  cnpj, ramo, porte, logo). Um Projeto pertence a uma dessas linhas.
- **Cliente** → já existe (`clientes`, criado no módulo CRM desta mesma
  conversa). O campo "cliente" do Projeto referencia essa tabela — não
  cria uma segunda noção de cliente.
- **Responsáveis** → assumido como `funcionarios` (docx 4.3: id,
  empresa_id, nome, cargo, salário), não `usuarios`. Justificativa: o
  pedido fala em "responsáveis" no plural, e a única entidade que já
  modela "várias pessoas dentro de uma empresa" no Modelo Conceitual é
  Funcionários — `usuarios` é sempre o dono da conta, singular.

Todo o resto (status, prioridade, progresso, tarefas, arquivos, as 4
visualizações) é estrutura nova, seguindo o "padrão mínimo coerente"
que você definiu.

---

## 2. Estrutura de pastas

```
src/services/supabase/
└── projects.service.js          # "ProjectService" do roadmap — CRUD completo

src/features/projects/
├── ProjectBoard.jsx              # composição raiz (equivalente a CustomerBoard/ChatWindow)
├── ProjectBoardContext.jsx       # Context local do módulo (seção 8)
│
├── ── Alternância de visualização ──
├── ProjectViewSwitcher.jsx       # 4 botões: Lista/Kanban/Calendário/Timeline
│
├── ── Visualização: Lista ──
├── ProjectList.jsx
├── ProjectListItem.jsx
│
├── ── Visualização: Kanban ──
├── ProjectKanban.jsx
├── ProjectKanbanColumn.jsx
├── ProjectKanbanCard.jsx
│
├── ── Visualização: Calendário ──
├── ProjectCalendar.jsx
├── ProjectCalendarDay.jsx
│
├── ── Visualização: Timeline ──
├── ProjectTimeline.jsx
├── ProjectTimelineRow.jsx
│
├── ── Compartilhado entre visualizações ──
├── ProjectCard.jsx                # card compacto (usado por Lista e Kanban)
├── ProjectStatus.jsx               # mesmo padrão de CustomerStatus (span + utilities)
├── ProjectPriority.jsx             # mesmo padrão, vocabulário próprio (baixa/média/alta/urgente)
├── ProjectResponsibles.jsx         # reaproveita Avatar.Group (já existe, não recriar)
├── ProjectFiles.jsx                # reaproveita ImageAttachment/FileAttachment (já existem, do Chat)
├── ProjectTags.jsx                 # reaproveita literalmente CustomerTags do módulo CRM (import direto,
│                                    #   não uma cópia — tags são o mesmo conceito nos dois módulos)
│
├── ── Detalhe / formulário ──
├── ProjectDetails.jsx              # Modal grande: info + progresso + responsáveis + arquivos + tarefas
├── ProjectForm.jsx                 # Modal de criar/editar projeto
├── ProjectFilters.jsx              # status/prioridade/empresa/cliente
├── ProjectSearch.jsx               # mesmo padrão de CustomerSearch
│
├── ── Tarefas (dentro de um Projeto) ──
├── ProjectTasks.jsx                 # lista de tarefas, dentro de ProjectDetails
├── ProjectTaskItem.jsx
├── ProjectTaskForm.jsx              # criar/editar tarefa (inline, sem Modal aninhado)
│
├── constants.js
├── useProjects.js                   # lista + busca + filtros (mesmo papel de useCustomers)
├── useProject.js                    # 1 projeto + arquivos + responsáveis (mesmo papel de useCustomer)
├── useProjectTasks.js               # CRUD de tarefas — hook separado (ver seção 6)
├── useProjectView.js                # visualização ativa, persistida (reaproveita useLocalStorageState)
└── index.js

src/pages/ProjectsPage/
├── ProjectsPage.jsx                 # MainLayout + ProjectBoard (mesmo papel de CustomerPage)
└── index.js
```

Nenhum arquivo do Design System, do Chat ou do CRM é modificado — tudo
listado acima é novo, e onde há reuso (`Avatar.Group`, `ImageAttachment`,
`FileAttachment`, `CustomerTags`, `ProgressBar`, `useLocalStorageState`,
`useBreakpoint`), é import direto, não recriação.

---

## 3. Modelo de dados (suposições de schema)

| Tabela | Papel | Colunas |
|---|---|---|
| `projetos` | 1 projeto | id, empresa_id, cliente_id (nullable), nome, descricao, status, prioridade, data_inicial, prazo, orcamento, progresso, tags[], criado_em, atualizado_em |
| `projeto_responsaveis` | N:N projeto↔funcionário | projeto_id, funcionario_id |
| `tarefas` | N tarefas por projeto | id, projeto_id, titulo, descricao, status, responsavel_id (funcionario_id, nullable), prazo, ordem, criado_em |
| `projeto_arquivos` | N arquivos por projeto | id, projeto_id, nome, url, tipo, criado_em |

- `status` do projeto: `planejamento` / `em_andamento` / `pausado` / `concluido` / `cancelado`.
- `prioridade`: `baixa` / `media` / `alta` / `urgente`.
- `status` da tarefa: `a_fazer` / `fazendo` / `concluida` — são exatamente as 3 colunas do Kanban de tarefas dentro de `ProjectTasks` (o Kanban *de projetos* usa o status do projeto; tarefas têm seu próprio, menor).
- `progresso`: percentual 0–100, **derivado** (calculado a partir de tarefas concluídas / total), não digitado à mão — evita progresso e tarefas ficarem dessincronizados. Recalculado no service sempre que uma tarefa muda de status.
- `ordem`: usado pelo Kanban de tarefas para manter a posição ao arrastar.
- Arquivos reaproveitam o mesmo bucket-pattern de `chat.service.js` (`chatService.uploadAttachment`), só que num bucket próprio (`project-attachments`) — mesmo método, não a mesma função.

---

## 4. Services — `projects.service.js`

Um único arquivo, mesmo padrão de `crm.service.js`. Métodos (assinatura,
sem corpo):

**Projetos**
- `listProjects(empresaId, { search, status, prioridade, clienteId })`
- `getProject(projectId)`
- `createProject(empresaId, payload)`
- `updateProject(projectId, changes)` — usado tanto por edição de campos quanto por drag-and-drop no Kanban (`changes = { status }`)
- `deleteProject(projectId)`

**Responsáveis**
- `setResponsibles(projectId, funcionarioIds[])` — substitui a lista inteira (mais simples que add/remove incremental para este escopo)
- `listResponsibles(projectId)`

**Tarefas**
- `listTasks(projectId)`
- `createTask(projectId, payload)`
- `updateTask(taskId, changes)` — inclui mudança de `status`/`ordem` (drag no Kanban de tarefas)
- `deleteTask(taskId)`
- Efeito colateral documentado: toda escrita em tarefa recalcula e persiste `projetos.progresso` (não é um método separado — é parte de `createTask`/`updateTask`/`deleteTask`, mesma decisão de "logActivity automático" já usada em `crm.service.js`)

**Arquivos**
- `uploadFile(projectId, file)`
- `listFiles(projectId)`
- `deleteFile(fileId)`

---

## 5. Context — `ProjectBoardContext`

Único Context desta feature (nenhum outro módulo até agora precisou de
um — Dashboard e CRM resolveram tudo com props, porque a árvore era
rasa). Projetos precisa porque a mesma informação ("qual projeto está
selecionado", "qual visualização está ativa") é lida por 4 visualizações
irmãs (Lista/Kanban/Calendário/Timeline) e por `ProjectDetails` — sem
Context, `ProjectBoard` teria que perfurar essa prop através de 4 níveis
de componentes que nem sempre são o caminho direto (ex.: um card dentro
de uma coluna do Kanban, dentro do Kanban, dentro do Board).

**Valor exposto** (forma, não implementação):
```
{
  activeView,            // 'lista' | 'kanban' | 'calendario' | 'timeline'
  setActiveView,
  selectedProjectId,
  selectProject,          // abre ProjectDetails
  closeProjectDetails,
  filters: { search, status, prioridade, clienteId },
  setFilters,
}
```

Escopo: **local ao módulo** — o Provider vive dentro de `ProjectBoard`,
não no app inteiro. Nenhuma outra feature (Chat, CRM, Dashboard) lê ou
escreve neste Context.

---

## 6. Hooks

| Hook | Responsabilidade | Consome |
|---|---|---|
| `useProjects(empresaId, filters)` | Lista + busca (debounce) + filtros — mesmo papel de `useCustomers` | `projects.service` |
| `useProject(projectId)` | 1 projeto + responsáveis + arquivos — mesmo papel de `useCustomer` | `projects.service` |
| `useProjectTasks(projectId)` | CRUD de tarefas, separado de `useProject` para não inchar um hook só (Kanban de tarefas muda com muito mais frequência que os dados do projeto em si) | `projects.service` |
| `useProjectView()` | Lê/persiste a visualização ativa. Reaproveita `useLocalStorageState` (já existe, usado por `MainLayout` para o colapso da Sidebar) — não reimplementa persistência | `useLocalStorageState` |

Nenhum hook novo de baixo nível (debounce, drag-and-drop) é necessário
além do que já existe — exceto o próprio mecanismo de drag-and-drop do
Kanban, que é discutido como questão em aberto na seção 10.

---

## 7. Estados (por componente, alto nível)

| Componente | Estado local |
|---|---|
| `ProjectBoard` | nenhum estado próprio além do Provider do Context (fonte única de verdade) |
| `ProjectForm` | valores do formulário + erros de validação + `saving` (mesmo padrão de `CustomerForm`) |
| `ProjectTaskForm` | valores da tarefa em edição inline |
| `ProjectKanban` | estado efêmero de drag (qual card está sendo arrastado, sobre qual coluna) — não persiste, só existe durante o gesto |
| `ProjectCalendar` | mês/ano em exibição (navegação ← →) |
| `ProjectTimeline` | janela de datas visível (zoom/scroll horizontal) |
| Demais componentes | sem estado — recebem tudo via props/Context (apresentacionais puros) |

---

## 8. Eventos principais

| Evento | Origem | Efeito |
|---|---|---|
| Criar projeto | `ProjectForm` submit | `projects.service.createProject` → `useProjects` insere no topo da lista |
| Mudar visualização | `ProjectViewSwitcher` click | `ProjectBoardContext.setActiveView` → persiste via `useProjectView` |
| Selecionar projeto | click em `ProjectCard`/`ProjectListItem`/`ProjectKanbanCard`/`ProjectTimelineRow` | `ProjectBoardContext.selectProject` → abre `ProjectDetails` |
| Arrastar card no Kanban | drop em outra coluna | `projects.service.updateProject({ status })` (otimista: UI atualiza antes da confirmação do servidor) |
| Criar/editar/mover tarefa | `ProjectTasks`/`ProjectTaskForm` | `projects.service.*Task` → recalcula `progresso` → `useProject` reflete o novo valor |
| Upload de arquivo | `ProjectFiles` | `projects.service.uploadFile` → lista de arquivos atualizada |
| Buscar/filtrar | `ProjectSearch`/`ProjectFilters` | atualiza `filters` no Context → `useProjects` refaz a query (debounce de 300ms, mesmo valor já usado em `useCustomers`) |

---

## 9. Fluxo de dados (visão geral)

```
ProjectsPage
 └─ ProjectBoard (Provider do ProjectBoardContext)
     ├─ useProjects(empresaId, filters) ──► projects.service.listProjects
     │
     ├─ ProjectViewSwitcher (lê/escreve activeView via Context)
     │
     ├─ activeView === 'lista'      → ProjectList → ProjectListItem → ProjectCard
     ├─ activeView === 'kanban'     → ProjectKanban → ProjectKanbanColumn → ProjectKanbanCard
     ├─ activeView === 'calendario' → ProjectCalendar → ProjectCalendarDay → ProjectCard (compacto)
     ├─ activeView === 'timeline'   → ProjectTimeline → ProjectTimelineRow
     │
     ├─ ProjectForm (Modal, aberto por botão "+ Novo projeto")
     │
     └─ ProjectDetails (Modal, aberto quando selectedProjectId existe)
         ├─ useProject(selectedProjectId)
         ├─ ProjectResponsibles (Avatar.Group)
         ├─ ProjectFiles (ImageAttachment/FileAttachment)
         └─ ProjectTasks (useProjectTasks(selectedProjectId))
             └─ ProjectTaskItem[] + ProjectTaskForm
```

Regra geral, igual ao CRM: **cada visualização é "burra"** — recebe a
mesma lista de projetos (já filtrada por `useProjects`) e só decide
*como desenhar*, nunca refaz a busca de dados por conta própria. Isso
evita 4 implementações divergentes de fetch para os mesmos dados.

---

## 10. Questões em aberto (decidir antes de implementar)

1. **Drag-and-drop do Kanban**: não há biblioteca de DnD em uso em
   nenhum componente já construído. Duas opções: (a) implementar com
   HTML5 Drag and Drop API nativo (sem dependência, mesmo espírito do
   resto do projeto), ou (b) aceitar uma dependência (`@dnd-kit/core` é
   a mais comum). Requer sua decisão antes da implementação, porque
   contraria a regra "sem dependências externas" seguida até aqui.
2. **Timeline (Gantt)**: desenhar barras proporcionais a `data_inicial`/
   `prazo` num grid de dias é a parte mais visualmente complexa do
   módulo. Planejo resolver com CSS Grid puro (uma coluna por dia,
   `grid-column: span N`), sem lib de gráfico — mas é um ponto de risco
   de esforço que vale sinalizar.
3. **Escopo de "empresa"**: todo projeto pertence a uma empresa, mas a
   `ProjectsPage` ainda não sabe qual empresa é "a atual" quando o
   usuário tem mais de uma (`empresas` é 1:N com `usuarios`, docx 4.3).
   Assumi, para este planejamento, que existe (ou existirá em breve) um
   seletor de empresa ativa em algum nível acima de `ProjectsPage` — se
   isso não existir ainda, é um pré-requisito antes deste módulo.

---

## 11. Não-objetivos desta fase

- Reordenar tarefas por arrastar dentro da mesma coluna (só mudança de
  coluna/status está no escopo inicial).
- Notificações de prazo vencendo (pertence ao módulo Notificações,
  ainda não construído).
- Anexar arquivos diretamente a uma tarefa (só o projeto tem `ProjectFiles`
  nesta fase — tarefas não têm anexo próprio).
