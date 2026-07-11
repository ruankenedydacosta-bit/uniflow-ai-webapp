# Supabase Auth and Data Plan

Este documento define o plano tecnico oficial para a Fase 2 da UniFlow AI.

A Fase 2 nao deve comecar criando tabelas soltas ou conectando telas diretamente ao Supabase. Ela deve transformar a base mockada atual em uma arquitetura real, segura e gradual, preservando o demo enquanto Auth, workspaces, RLS e dados reais entram modulo por modulo.

## 1. Objetivo da Fase 2

A Fase 2 marca a passagem de demo local/mockado para dados reais com Supabase.

Objetivo principal:

- criar autenticacao real;
- criar identidade do usuario;
- criar workspaces pessoais e empresariais;
- isolar dados com RLS desde o primeiro dia;
- substituir os mocks gradualmente por services reais;
- manter o app atual funcionando durante a migracao.

A UniFlow AI deve continuar sendo guiada pelo GPS Financeiro: os dados reais existem para alimentar clareza, direcao, previsao, leitura da Uni e proximo passo, nao para transformar o app em planilha ou ERP generico.

## 2. Principios

- Seguranca primeiro.
- RLS desde o comeco.
- Nenhuma tabela de produto sem regra de acesso.
- Dados pessoais e empresariais nunca devem se misturar.
- Workspaces sao a base de isolamento.
- `currentWorkspace` define o contexto ativo do usuario.
- A arquitetura deve crescer sem exigir reescrita dos modulos.
- A migracao deve ser gradual.
- O demo atual nao deve quebrar enquanto o backend real nasce.
- Telas nao devem chamar Supabase diretamente; devem consumir services por dominio.
- A Uni deve continuar orientando sem culpa, sem alarmismo e sem decidir pelo usuario.

## 3. Modelo inicial de autenticacao

### `auth.users`

Tabela gerenciada pelo Supabase Auth.

Responsabilidades:

- autenticar usuario;
- guardar identidade base;
- fornecer `id` usado como `user_id` nas tabelas publicas;
- lidar futuramente com email, provedores sociais e recuperacao de senha.

### `profiles`

Perfil publico/controlado do usuario autenticado.

Campos sugeridos:

- `id` UUID, igual a `auth.users.id`;
- `full_name`;
- `email`;
- `avatar_url`;
- `default_user_mode`;
- `default_workspace_id`;
- `created_at`;
- `updated_at`.

Uso no app:

- substituir dados mockados de perfil;
- alimentar Topbar, Configuracoes e preferencias basicas;
- indicar o workspace padrao apos login.

### `user_preferences`

Preferencias da experiencia e da Uni.

Campos sugeridos:

- `id`;
- `user_id`;
- `uni_tone`;
- `explanation_level`;
- `voice_enabled`;
- `auto_audio_enabled`;
- `notification_level`;
- `created_at`;
- `updated_at`.

Uso no app:

- Configuracoes;
- comportamento da Uni;
- voz e interacao;
- alertas com baixa carga cognitiva.

### `plans` e `subscriptions`

Na primeira etapa podem ser mockaveis, mas devem ter desenho compatível com uso real.

`plans`:

- `id`;
- `code`: `free`, `pro`, `business`, `enterprise`;
- `name`;
- `description`;
- `is_active`.

`subscriptions`:

- `id`;
- `user_id`;
- `plan_id`;
- `status`;
- `started_at`;
- `ends_at`;
- `created_at`.

Uso no app:

- substituir `DEFAULT_DEMO_ACCESS.plan`;
- filtrar modulos por plano;
- preparar upgrades futuros sem implementar pagamento agora.

### Relacao entre usuario e workspace

O usuario nunca deve acessar dados apenas por `user_id` quando o dado pertence a um espaco. Dados financeiros, clientes, CRM, projetos, agenda e objetivos devem apontar para `workspace_id`.

O `user_id` identifica a pessoa. O `workspace_id` identifica o contexto dos dados.

## 4. Modelo de workspaces

### `workspaces`

Representa o espaco onde os dados vivem.

Campos sugeridos:

- `id`;
- `owner_id`;
- `type`: `personal` ou `business`;
- `name`;
- `company_id` opcional;
- `created_at`;
- `updated_at`.

### Workspace pessoal

Criado para usuarios pessoais, Free/Pro ou como parte do modo `both`.

Caracteristicas:

- dados financeiros pessoais;
- objetivos pessoais;
- agenda pessoal;
- relatorios pessoais;
- sem CRM, Clientes e Projetos empresariais.

### Workspace empresarial

Criado para usuarios Business ou Enterprise.

Caracteristicas:

- financeiro empresarial;
- clientes;
- CRM;
- projetos;
- agenda empresarial;
- relatorios empresariais;
- possivel relacionamento com `companies`.

### Usuario com ambos

No modo `both`, o usuario pode ter:

- um workspace pessoal;
- um ou mais workspaces empresariais futuros;
- `currentWorkspace` no frontend para definir o contexto ativo.

Regra: o modo `both` nao significa misturar dados. Significa alternar contexto com seguranca.

### Membership e roles futuros

Tabela sugerida:

`workspace_members`

- `id`;
- `workspace_id`;
- `user_id`;
- `role`: `owner`, `admin`, `member`, `viewer`;
- `status`;
- `created_at`.

Uso futuro:

- equipe empresarial;
- permissoes;
- colaboradores;
- auditoria;
- Enterprise.

## 5. Tabelas sugeridas por modulo

### Pessoal e financeiro

#### `accounts`

Contas, carteiras, bancos ou caixas.

Campos base:

- `id`;
- `workspace_id`;
- `name`;
- `type`;
- `balance_initial`;
- `is_active`;
- `created_at`;
- `updated_at`.

#### `transactions`

Movimentacoes financeiras.

Campos base:

- `id`;
- `workspace_id`;
- `account_id`;
- `category_id`;
- `type`: `income`, `expense`, `transfer`;
- `amount`;
- `description`;
- `occurred_at`;
- `source`: `manual`, `voice`, `import`, `uni`;
- `created_by`;
- `created_at`;
- `updated_at`.

#### `categories`

Categorias pessoais ou empresariais.

Campos base:

- `id`;
- `workspace_id`;
- `name`;
- `type`;
- `kind`;
- `created_at`;
- `updated_at`.

#### `objectives`

Objetivos como destinos do GPS financeiro.

Campos base:

- `id`;
- `workspace_id`;
- `name`;
- `target_amount`;
- `current_amount`;
- `target_date`;
- `priority`;
- `status`;
- `next_step`;
- `created_at`;
- `updated_at`.

#### `agenda_items`

Compromissos financeiros, vencimentos, lembretes e acoes.

Campos base:

- `id`;
- `workspace_id`;
- `title`;
- `type`;
- `due_at`;
- `priority`;
- `status`;
- `suggested_action`;
- `created_at`;
- `updated_at`.

#### `reports_snapshots`

Snapshots de evolucao e leituras historicas.

Campos base:

- `id`;
- `workspace_id`;
- `period_start`;
- `period_end`;
- `summary`;
- `signals`;
- `metrics`;
- `created_at`.

### Empresarial

#### `companies`

Dados da empresa.

Campos base:

- `id`;
- `workspace_id`;
- `name`;
- `document`;
- `segment`;
- `created_at`;
- `updated_at`.

#### `clients`

Clientes e relacionamentos empresariais.

Campos base:

- `id`;
- `workspace_id`;
- `name`;
- `type`;
- `status`;
- `estimated_value`;
- `last_contact_at`;
- `next_action`;
- `created_at`;
- `updated_at`.

#### `crm_pipeline_stages`

Etapas personalizaveis do pipeline comercial.

Campos base:

- `id`;
- `workspace_id`;
- `name`;
- `position`;
- `is_closed`;
- `created_at`;
- `updated_at`.

#### `crm_opportunities`

Oportunidades comerciais conectadas a clientes.

Campos base:

- `id`;
- `workspace_id`;
- `client_id`;
- `stage_id`;
- `title`;
- `estimated_value`;
- `priority`;
- `status`;
- `last_interaction_at`;
- `next_step`;
- `created_at`;
- `updated_at`.

#### `projects`

Projetos como entregas conectadas a clientes e impacto financeiro.

Campos base:

- `id`;
- `workspace_id`;
- `client_id`;
- `name`;
- `status`;
- `progress`;
- `deadline`;
- `financial_impact`;
- `priority`;
- `created_at`;
- `updated_at`.

#### `project_milestones`

Marcos de projeto.

Campos base:

- `id`;
- `workspace_id`;
- `project_id`;
- `title`;
- `due_at`;
- `status`;
- `depends_on_client`;
- `created_at`;
- `updated_at`.

### Uni e IA

#### `uni_conversations`

Conversas e contexto conversacional.

Campos base:

- `id`;
- `workspace_id`;
- `user_id`;
- `title`;
- `channel`: `text`, `voice`, `quick_capture`;
- `created_at`;
- `updated_at`.

#### `uni_insights`

Leituras da Uni sobre dados do workspace.

Campos base:

- `id`;
- `workspace_id`;
- `source_type`;
- `title`;
- `summary`;
- `severity`;
- `status`;
- `created_at`.

#### `uni_recommendations`

Recomendacoes e proximos passos.

Campos base:

- `id`;
- `workspace_id`;
- `user_id`;
- `title`;
- `content`;
- `priority`;
- `status`;
- `expires_at`;
- `created_at`.

#### `user_cognitive_profile`

Perfil cognitivo e preferencias de comunicacao.

Campos base:

- `id`;
- `user_id`;
- `decision_style`;
- `risk_tolerance`;
- `financial_knowledge_level`;
- `preferred_explanation_depth`;
- `updated_at`.

## 6. Regras de RLS

Regras em alto nivel:

- Usuario autenticado so acessa linhas vinculadas aos workspaces em que possui membership.
- Dados pessoais ficam em workspace `personal`.
- Dados empresariais ficam em workspace `business`.
- Workspace empresarial nao deve ser acessado por usuario sem membership.
- Futuramente, membros acessam apenas workspaces permitidos.
- Roles controlam escrita, leitura e administracao.
- Toda tabela com `workspace_id` deve validar membership.
- Tabelas de perfil devem validar `auth.uid() = user_id` ou `auth.uid() = id`.
- Nenhuma tabela sensivel deve ficar sem RLS habilitado.

Exemplo conceitual:

- `profiles`: usuario so le e altera o proprio perfil.
- `workspaces`: usuario ve workspaces onde e owner ou membro.
- `transactions`: usuario ve apenas transacoes dos workspaces permitidos.
- `clients`, `crm_opportunities`, `projects`: usuario ve apenas dados do workspace empresarial permitido.

## 7. Ordem de implementacao recomendada

1. Criar projeto Supabase.
2. Criar variaveis de ambiente locais.
3. Criar cliente Supabase.
4. Implementar Auth basica.
5. Criar `profiles`.
6. Criar `workspaces`.
7. Criar `workspace_members`.
8. Substituir `DEFAULT_DEMO_ACCESS` gradualmente por access real.
9. Conectar Financeiro real.
10. Conectar Objetivos reais.
11. Conectar Agenda real.
12. Conectar Relatorios com snapshots reais.
13. Conectar Clientes.
14. Conectar CRM.
15. Conectar Projetos.
16. Conectar memoria inicial da Uni com conversas, insights e recomendacoes.

Regra: cada etapa deve manter o demo funcionando.

## 8. Estrategia de migracao do mock para real

- Manter mocks enquanto o backend nasce.
- Criar services por dominio antes de trocar telas.
- Trocar um modulo por vez.
- Nao conectar componentes diretamente ao Supabase.
- Usar fallbacks mockados quando dados reais ainda nao existirem.
- Validar RLS antes de popular cada modulo.
- Preservar `AccessModeSwitcher` ate existir onboarding/login real suficiente.
- Migrar o Dashboard por ultimo ou em paralelo controlado, pois ele depende de varios sinais.

Fluxo recomendado por modulo:

1. Criar tabelas.
2. Criar RLS.
3. Criar service.
4. Criar dados seed de desenvolvimento.
5. Conectar pagina ao service.
6. Manter fallback mockado.
7. Remover fallback apenas quando o modulo estiver estavel.

## 9. Estrutura de services futura

Sugestao:

- `src/services/supabaseClient.js`
- `src/services/authService.js`
- `src/services/workspaceService.js`
- `src/services/financeService.js`
- `src/services/objectivesService.js`
- `src/services/agendaService.js`
- `src/services/reportsService.js`
- `src/services/clientsService.js`
- `src/services/crmService.js`
- `src/services/projectsService.js`
- `src/services/uniService.js`

Responsabilidade dos services:

- encapsular queries;
- traduzir dados do Supabase para o formato usado pelas telas;
- centralizar erros;
- evitar acoplamento das paginas ao banco;
- facilitar troca futura de implementacao.

## 10. Variaveis de ambiente futuras

Criar futuramente em `.env.local`:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Nao colocar chaves reais em documentacao, commits ou prints.

## 11. Riscos

- Misturar dados pessoais e empresariais.
- Criar tabela sem RLS.
- Usar `user_id` onde deveria usar `workspace_id`.
- Acoplar tela diretamente ao Supabase.
- Quebrar o demo atual durante a migracao.
- Criar backend antes de entender o fluxo do usuario.
- Criar schema generico demais e perder a logica do GPS Financeiro.
- Transformar a Uni em chatbot sem memoria/contexto.
- Guardar dados de IA sem politica clara de acesso.
- Implementar plano/pagamento antes de validar access real.

## 12. Checklist da Fase 2

- [ ] Projeto Supabase criado.
- [ ] Variaveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas localmente.
- [ ] Cliente Supabase criado.
- [x] Auth base validado manualmente no `UniFlow DEV`.
- [x] `profiles` criado e leitura autenticada validada no DEV.
- [x] `workspaces` criado e leitura por membership validada no DEV.
- [x] `workspace_members` criado e owner ativo validado no DEV.
- [ ] Access real substitui parcialmente `DEFAULT_DEMO_ACCESS`.
- [ ] Login mockado evolui para login real sem quebrar demo.
- [x] Onboarding integrado ao profile/workspace real no `UniFlow DEV`.
- [ ] Financeiro conectado por service.
- [ ] Objetivos conectado por service.
- [ ] Agenda conectada por service.
- [ ] Relatorios conectados por snapshots.
- [ ] Clientes conectado por service.
- [ ] CRM conectado por service.
- [ ] Projetos conectado por service.
- [ ] Uni com conversas, insights e recomendacoes iniciais persistidos.
- [ ] Build e lint passam a cada etapa.
- [ ] Decisoes estruturais registradas no Obsidian.

## 13. Decisao oficial

A Fase 2 deve comecar por Supabase Auth, profiles, workspaces, membership e RLS.

Somente depois disso os modulos devem migrar de mock para dados reais. Essa ordem protege a coerencia da UniFlow AI: primeiro identidade, contexto e seguranca; depois dados; depois automacoes e IA real.

## 14. Schema inicial versionado

A primeira migration da Fase 2 foi versionada em:

`supabase/migrations/20260710_001_auth_profiles_workspaces.sql`

Ela inclui:

- `profiles` ligado a `auth.users`;
- `workspaces` pessoais e empresariais;
- `workspace_members` com roles e status;
- `plans` como catalogo inicial;
- `subscriptions` vinculadas ao workspace;
- `site_leads` para captura compartilhada entre site e aplicativo;
- criacao automatica apenas do profile apos cadastro;
- criacao da membership owner quando um workspace for criado explicitamente;
- triggers de `updated_at`;
- constraints, indices, grants minimos e RLS.

A migration foi aplicada com sucesso somente no projeto Supabase `UniFlow DEV`. O ambiente de producao permanece sem alteracoes.

Os fluxos manuais de Auth, profile automatico, workspace pessoal e membership owner ativa foram confirmados no DEV. A validacao autenticada de RLS tambem foi concluida com 8/8 testes aprovados para o usuario owner preparado.

No MVP, site e aplicativo compartilharao o mesmo projeto Supabase. Essa decisao reduz duplicacao de identidade e permite converter leads em usuarios sem sincronizar bancos separados. O isolamento continua obrigatorio: o site possui apenas permissao publica de captura, enquanto dados privados e operacoes administrativas permanecem protegidos por RLS e backend futuro.

## 15. Estrategia de ambientes

Desenvolvimento e migrations serao testados em projeto Supabase DEV. No lancamento, site e aplicativo compartilharao o mesmo projeto de producao para Auth, leads e perfis.

Regras operacionais:

- a mesma conta Supabase pode administrar DEV e producao;
- o projeto `UniFlow DEV` deve ser separado do projeto que contem dados reais do site;
- nenhuma migration deve ser testada diretamente em producao;
- antes do primeiro teste em DEV, o projeto atual do site deve ser auditado com `SUPABASE_EXISTING_PROJECT_AUDIT.md`;
- compatibilidades e conflitos devem gerar uma migration de adaptacao revisavel, sem alterar silenciosamente o schema de producao;
- a aplicacao em producao so pode ser preparada depois de testes de Auth, leads, profiles, workspaces, memberships, grants e RLS no projeto DEV.

Status da migration inicial:

- aplicada no `UniFlow DEV`;
- Auth e RLS base validados no DEV;
- nao aplicada em producao;
- sem conexao com Login, Onboarding ou mocks do aplicativo nesta etapa.

## 16. Validacao inicial de Auth e workspaces

O teste manual no projeto `UniFlow DEV` confirmou:

- criacao de usuario em Supabase Auth;
- criacao automatica de `profiles` pelo trigger de `auth.users`;
- criacao manual de workspace pessoal;
- criacao automatica de `workspace_members` pelo trigger do workspace;
- membership do proprietario com `role = owner` e `status = active`.

Esses resultados validam o fluxo estrutural inicial, mas ainda nao conectam o Login ou o Onboarding do aplicativo.

O roteiro autenticado confirmou 8/8 testes: profile proprio, workspaces permitidos, membership owner, plans, bloqueio de leitura de `site_leads`, bloqueio de escrita em `subscriptions`, autenticacao e `signOut`.

A proxima etapa e integrar o Login real por `authService`, mantendo o visual atual. O Onboarding permanece mockado durante essa integracao, assim como os dados dos modulos.

O ambiente de producao permanece sem alteracoes.

## 17. RLS autenticado validado

Em 2026-07-10, o script `scripts/supabase/test-rls.js` foi executado contra o projeto `UniFlow DEV` com anon/publishable key e usuario autenticado.

Resultado:

- 8/8 testes aprovados;
- `service_role` nao utilizada;
- acesso permitido apenas aos dados esperados do owner;
- `site_leads` protegido contra leitura autenticada;
- `subscriptions` protegido contra escrita do cliente;
- producao sem alteracoes.

Esse resultado liberou a integracao real do Login e do Onboarding existentes. Os mocks dos modulos permanecem preservados.

## 18. Onboarding real integrado

O Onboarding agora usa a sessao autenticada para:

- atualizar `full_name`, `phone` e `user_mode`;
- reutilizar ou criar o workspace padrao;
- definir `current_workspace_id`;
- marcar `onboarding_completed = true`;
- recarregar o `SessionContext` antes do Dashboard.

O visual foi preservado e o modo demo continua disponivel sem configuracao Supabase. Nenhum modulo de produto deixou de usar mocks nesta etapa.

A implementacao tambem trata duas bordas de consistencia: atualizacoes de profile que afetem zero linhas encerram com erro controlado; se a atualizacao final falhar depois de criar um workspace, somente o workspace novo daquela tentativa e removido. Workspaces reutilizados permanecem intactos.

## 19. Nucleo financeiro real preparado

A proxima fronteira de dados reais e o nucleo financeiro. A migration versionada `supabase/migrations/20260711_002_financial_core.sql` cria a base para:

- contas por workspace;
- categorias globais do sistema e customizadas por workspace;
- transacoes com integridade entre conta, destino e categoria;
- origem manual, importada, automatizada ou sincronizada;
- deduplicacao por provider e identificador externo;
- RLS e grants por papel.

A migration foi apenas criada e ainda nao foi aplicada no `UniFlow DEV` nem em producao. Os mocks e as telas permanecem inalterados.

Open Finance foi preparado somente no modelo: origem, IDs externos, status de sincronizacao e payload sanitizado opcional. Consentimentos, tokens, certificados, webhooks, providers e Edge Functions ficam para migrations e camadas seguras futuras. Nenhum segredo bancario pertence ao dominio financeiro publico.
