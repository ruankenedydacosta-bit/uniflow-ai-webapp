# Plano de Integração Asaas — UniFlow AI

Data: 2026-07-30 (atualizado em 2026-07-30 — Bloco Asaas 0). Este documento cobre a auditoria de planos/assinatura existentes e a arquitetura proposta para a integração Asaas. Nada aqui foi implementado — é design, não código. Nenhuma cobrança foi criada, nenhuma chamada externa foi feita, nenhuma migration foi executada.

## Bloco Asaas 0 — Congelamento de regras e preparação técnica

Esta seção consolida o levantamento pedido especificamente para "congelar" o que é fato (código/banco) antes de qualquer decisão comercial ser tomada. Nenhuma divergência abaixo foi corrigida — só registrada.

### 0.0 — Decisões comerciais OFICIAIS do MVP (congeladas em 2026-07-30)

As decisões abaixo foram recebidas do responsável pelo produto e são tratadas como **oficiais e definitivas para o MVP** a partir de agora — substituem as pendências correspondentes em `DECISOES_COMERCIAIS_PENDENTES` (seção 0.3, mantida abaixo já com o status atualizado por item). Nenhuma delas foi implementada em código ou banco nesta execução.

- **Plano vendido no MVP**: só o Plano Pessoal (nenhum outro plano é comercializado no lançamento).
- **Identificador interno**: `pro` — reaproveita a linha já existente em `plans` (não cria linha nova, não exige alterar o `check constraint` de `plans.id`).
- **Nome exibido ao usuário**: "Plano Pessoal" (o rótulo comercial não muda; só o `plan_id` técnico por trás é `pro`).
- **Valor**: R$ 29,90/mês.
- **Sem plano gratuito público**: `free` continua existindo tecnicamente (linha em `plans`, fallback em `access.js`), mas não é oferecido/comercializado — é o estado de "sem assinatura", não um produto vendido.
- **Sem trial automático**: nenhuma concessão automática de período gratuito.
- **Testes gratuitos manuais**: o administrador pode conceder acesso gratuito por prazo definido (ex.: 7 dias) a clientes específicos — mecanismo manual, não self-service. **Nota técnica (não comercial)**: como isso será operacionalizado (uma tela admin? um comando? um campo direto no banco?) ainda não foi decidido — fica registrado como pendência técnica de implementação, não comercial, a resolver quando este bloco virar execução.
- **Formas de pagamento**: Pix, Pix Automático e Cartão (conforme suporte da Asaas a cada um). **Boleto explicitamente fora do MVP.**
- **Ativação**: só após confirmação segura do pagamento via webhook da Asaas (modelo conservador — nunca libera acesso no clique de "assinar" antes da confirmação).
- **Cancelamento**: interrompe só a renovação futura; o usuário mantém acesso completo até o fim do período já pago (não é um corte imediato de acesso).
- **Inadimplência** (fluxo completo, oficial):
  1. Assinatura entra em `overdue`.
  2. Notificações são enviadas antes do vencimento, no vencimento e após o vencimento (canal a definir tecnicamente — e-mail, notificação in-app, ou ambos).
  3. A UniFlow também exibe notificação interna (usando a tabela `notifications` já existente, migration 020).
  4. Período de tolerância: 3 dias corridos a partir do vencimento.
  5. Após os 3 dias sem regularização, a assinatura muda para `suspended`.
  6. Em `suspended`, o acesso fica restrito apenas às telas necessárias para regularização (quais telas exatamente é detalhe técnico a desenhar na implementação, não decidido aqui).
  7. Os dados financeiros do usuário **nunca são apagados**, em nenhum estado.
  8. Pagamento confirmado reativa automaticamente o plano (de `overdue` ou de `suspended` de volta a `active`), sem ação manual do administrador.

### 0.1 — Tabela consolidada de planos

| Campo | Free | Pro (= "Plano Pessoal", OFICIAL) | Business | Enterprise |
|---|---|---|---|---|
| Identificador interno | `free` | `pro` **— agora oficialmente o identificador do Plano Pessoal (decisão 0.0)** | `business` | `enterprise` |
| Nome exibido | "Free" (`SettingsPage.jsx`, `plans.name`) | **"Plano Pessoal"** (decisão oficial — o rótulo `plans.name='Pro'` no banco não muda automaticamente; ver nota técnica abaixo) | "Business" | "Enterprise" |
| Preço exibido | Não comercializado (sem plano gratuito público, decisão 0.0) | **R$ 29,90/mês (oficial)** | **Fora do MVP de cobrança** (só Plano Pessoal é vendido, decisão 0.0) | **Fora do MVP de cobrança** |
| Periodicidade | N/A | **Mensal (oficial)** | N/A no MVP | N/A no MVP |
| Recursos | Todo o produto exceto Relatórios e módulos PJ (`navigation.js`) | Benefícios de `personalPlanConfig.js` (registro de voz, categorias inteligentes, "Pergunte à Uni", histórico completo, resumo mensal, controle de contas) — **pendência técnica**: hoje o gating real de `access.plan==='pro'` em `navigation.js` libera Relatórios, não necessariamente a lista de benefícios do Plano Pessoal; reconciliar os dois na implementação | + CRM/Clientes/Projetos (fora do MVP de cobrança, mas o código já funciona) | Mesmo conjunto de Business hoje |
| Limites | Nenhum limite numérico encontrado em código | Nenhum limite definido | — | — |
| Trial | N/A (não comercializado) | **Sem trial automático (oficial)**. Testes gratuitos manuais pelo admin, prazo definido (ex.: 7 dias) — mecanismo de concessão ainda não desenhado tecnicamente | N/A no MVP | N/A no MVP |
| Status atual no banco | Linha seed real: `('free','Free','Plano inicial para a experiencia financeira pessoal.')` | Linha seed real: `('pro','Pro','Plano pessoal com recursos e historico ampliados.')` — **já existe, reaproveitável sem migration de schema**; só o `plans.name`/`description` desta linha podem precisar de um `update` de conteúdo (não de estrutura) para refletir "Plano Pessoal" como nome comercial, se for esse o caminho escolhido na implementação | `('business', ...)` | `('enterprise', ...)` |
| Status atual na interface | Gating de navegação, rótulo em `SettingsPage.jsx` | Tela própria completa (`PersonalPlanPage.jsx`) com preço, benefícios, selos de confiança e CTA "ASSINAR PLANO PESSOAL" real (chama `startSubscription()`, que é stub) | Gating de navegação | Gating de navegação |
| Divergências (histórico, pré-decisão 0.0) | — | Até esta atualização, "Plano Pessoal" usava um `personalPlanConfig.js:PERSONAL_PLAN_ID='personal'` que não batia com nenhuma linha de `plans` — **resolvido pela decisão oficial de usar `pro`** | — | — |

**Conclusão atualizada (pós-decisão 0.0)**: os dois sistemas que antes coexistiam sem se conectar — o catálogo real `plans`/`subscriptions` e a feature isolada "Plano Pessoal" — agora têm uma ponte comercial oficial: **"Plano Pessoal" é o nome exibido para `plan_id='pro'`**. Isso evita a migration de schema que seria necessária para criar uma 5ª linha (`personal`) ou alterar o `check constraint` — `pro` já existe e é totalmente reaproveitável. O trabalho de implementação que resta é técnico (trocar `PERSONAL_PLAN_ID` de `'personal'` para `'pro'` em `personalPlanConfig.js`, e garantir que `plans.name`/badge de UI mostrem "Plano Pessoal" e não "Pro"), não mais uma decisão comercial em aberto.

### 0.2 — Ocorrências dos termos pedidos (busca literal, 2026-07-30)

| Termo | Ocorrências fora de teste/doc | Contexto |
|---|---|---|
| "Plano Pessoal" | `routes.jsx`, `PersonalPlanPage.jsx`, `SimplifiedPaymentsPage.jsx`, `SimplifiedPlanPage.jsx`, `SimplifiedAccountPage.jsx` | Feature completa, preço R$29,90/mês, sem vínculo com `plans` |
| "Free" | `access.js` (`PLANS.FREE = 'free'`), `navigation.js`, `SettingsPage.jsx` (`PLAN_LABELS`), `AccessModeSwitcher.jsx` (dev tool), migration 001 | Identificador/rótulo real, sem preço |
| "Gratuito" | Nenhuma ocorrência relacionada a planos (só em doc não relacionado de voz/TTS) | — |
| "Pro" | `access.js`, `navigation.js`, `SettingsPage.jsx`, migration 001 | Identificador/rótulo real, sem preço |
| "Business" | `access.js`, `navigation.js`, `SettingsPage.jsx`, migration 001, gating de CRM/Clientes/Projetos | Identificador/rótulo real, sem preço |
| "Enterprise" | `access.js`, `navigation.js`, `SettingsPage.jsx`, migration 001 | Identificador/rótulo real, sem preço; nenhuma feature exclusiva de Enterprise encontrada (hoje tem os mesmos gates de Business) |
| "R$ 29,90" | `personalPlanConfig.js`, `PersonalPlanPage.jsx`, `README.md` do personal-plan, testes que travam o valor | Único preço real no repositório |
| "R$ 39,90" | **Nenhuma ocorrência em todo o repositório** | Não inventar — não existe |
| "R$ 79,90" | **Nenhuma ocorrência em todo o repositório** | Não inventar — não existe |
| "R$ 1.590" | **Nenhuma ocorrência em todo o repositório** | Não inventar — não existe |
| Períodos gratuitos / trial | Coluna `trial_ends_at` existe (schema); `status in ('trialing', ...)` existe (schema); **nenhuma duração, regra de início/fim, ou lógica de concessão de trial existe em código** | Puro schema, sem comportamento |
| "upgrade" | `docs/product-knowledge/plans-and-limitations.md`, `troubleshooting.md`, `USER_MODES_AND_PLANS.md`, `productKnowledgeManifest.js` | Todas as ocorrências **confirmam a ausência** de um fluxo de upgrade real ("Não existe um fluxo de upgrade ou cobrança real no aplicativo nesta fase.") |
| "assinatura" | `subscriptions` (tabela), `SimplifiedPlanPage.jsx`, `SimplifiedPaymentsPage.jsx`, `startSubscription.js` | Schema real; UI real; execução real ainda não existe |

**Achado explícito pedido**: os valores R$ 39,90, R$ 79,90 e R$ 1.590 **não existem em nenhum arquivo do repositório** (código, docs, testes, migrations). Não foram inventados nem assumidos como preços de Pro/Business/Enterprise — e, com a decisão oficial 0.0, essa lacuna deixou de importar para o MVP: só o Plano Pessoal (R$29,90) é vendido.

### 0.3 — `DECISOES_COMERCIAIS_PENDENTES`

Lista original de 15 decisões, agora com status atualizado após a decisão oficial 0.0. Itens marcados **RESOLVIDO** não precisam de nova resposta do produto; itens marcados **PENDENTE** continuam em aberto; itens marcados **PENDENTE (técnico)** foram resolvidos comercialmente mas geram uma sub-decisão técnica a resolver na implementação, não uma nova decisão de produto.

1. **Planos oferecidos no MVP** — **RESOLVIDO**: só Plano Pessoal (`pro`).
2. **Preço oficial** — **RESOLVIDO**: R$ 29,90/mês. Preço de Pro/Business/Enterprise fica sem objeto (não são vendidos no MVP).
3. **Recorrência** — **RESOLVIDO**: mensal.
4. **Trial ou gratuidade** — **RESOLVIDO**: sem trial automático; concessão manual pelo admin, prazo definido (ex.: 7 dias). **PENDENTE (técnico)**: mecanismo exato de concessão manual (tela admin, comando, edição direta) ainda não desenhado.
5. **Métodos de pagamento** — **RESOLVIDO**: Pix, Pix Automático, Cartão. Boleto fora do MVP.
6. **Data de vencimento** — **PENDENTE (técnico)**: a regra exata de dia de vencimento da cobrança recorrente (dia da assinatura vs. dia fixo do mês) não foi especificada na decisão oficial; assumir "dia da assinatura" como padrão da Asaas até segunda ordem, mas não implementar sem confirmar.
7. **Regra de ativação** — **RESOLVIDO**: só após confirmação segura via webhook (modelo conservador).
8. **Cancelamento** — **RESOLVIDO**: interrompe só a renovação; acesso mantido até o fim do período pago.
9. **Downgrade** — **N/A no MVP**: só existe um plano pago (Plano Pessoal) e nenhum plano gratuito público — não há "downgrade" possível hoje, só cancelamento. Se Business/Enterprise entrarem depois, esta decisão volta a ser necessária.
10. **Inadimplência** — **RESOLVIDO** (fluxo completo, ver 0.0): `overdue` → notificações antes/no/depois do vencimento (in-app + interno) → tolerância de 3 dias → `suspended` (acesso restrito, dados preservados) → reativação automática por pagamento confirmado.
11. **Reativação** — **RESOLVIDO** para o caminho `overdue`/`suspended` → `active` (automática por pagamento). **PENDENTE**: reativação a partir de `canceled`/`expired` (após o fim do período pago) — presumir "nova assinatura" até confirmação, não assumido como decisão oficial.
12. **Reembolso** — **PENDENTE**: nenhuma política definida nesta decisão.
13. **Chargeback** — **PENDENTE**: nenhuma política definida nesta decisão.
14. **Business e Enterprise no MVP** — **RESOLVIDO por implicação**: fora do MVP de cobrança (só Plano Pessoal é vendido). O código de gating para esses planos continua existindo e funcional, só não há como comprá-los.
15. **Nomenclatura "Plano Pessoal"** — **RESOLVIDO**: nome exibido "Plano Pessoal", identificador interno `pro` (reaproveita a linha já existente em `plans`, sem migration de schema para isso).

**Pendências comerciais que restam em aberto após a decisão 0.0**: item 6 (regra exata de vencimento), item 12 (reembolso), item 13 (chargeback), e o detalhe de reativação pós-cancelamento total (item 11). Estas quatro precisam de nova resposta do responsável pelo produto antes da implementação do Bloco 3 do roadmap.

### 0.4 — Matriz de estados da assinatura (atualizada com as regras oficiais 0.0)

A tarefa pediu 9 estados (`free, pending, active, overdue, suspended, canceled, expired, refunded, chargeback`). O schema atual (`subscriptions.status`) só permite 5 (`trialing, active, past_due, canceled, expired`) mais o estado derivado `not_configured` (ausência de linha). Com a decisão oficial 0.0, o fluxo de inadimplência (`overdue`→`suspended`) e o cancelamento sem corte imediato de acesso já têm regra de negócio definida — o que falta é só a extensão técnica do schema (ver 0.5), não mais uma decisão de produto para a maior parte da tabela.

| Estado pedido | Existe hoje como | Origem | Acesso permitido (regra oficial) | Mensagem exibida | Transição possível | Evento Asaas associado | Ação do usuário necessária |
|---|---|---|---|---|---|---|---|
| `free` | Ausência de linha em `subscriptions` → UI deriva `not_configured` | Nenhuma assinatura criada ainda | Acesso ao plano `free` via fallback de `access.js` — **não é um produto oferecido, é só "sem assinatura"** (decisão 0.0) | "Pagamento ainda não configurado" (`SimplifiedPlanPage.jsx`) | → `pending` (ao iniciar checkout) | Nenhum (estado pré-Asaas) | Assinar o Plano Pessoal, se desejar |
| `pending` | **Não existe hoje** — precisa de um novo valor de `status`, ou refletir a partir de `billing_payments.status='pending'` sem assinatura `active` ainda | Cobrança criada (Pix, Pix Automático ou Cartão), aguardando confirmação do webhook | Igual a `free` — **ativação só ocorre após confirmação via webhook (regra oficial 0.0)**, nunca antes | **Nova mensagem necessária** ("Aguardando confirmação do pagamento") | → `active` (webhook confirma) ou → `free`/`expired` (timeout, regra de prazo a definir tecnicamente) | `PAYMENT_CREATED` | Concluir o pagamento |
| `active` | Existe (`status='active'`) | Webhook confirma pagamento | Acesso total ao Plano Pessoal | "Seu plano está ativo" (`SimplifiedPlanPage.jsx`) | → `overdue` (falha na renovação), → **cancelamento agendado** (ação do usuário — ver nota abaixo, mantém `active` até `current_period_ends_at`) | `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | Nenhuma |
| `overdue` | Mapeia para `past_due` existente | Falha na cobrança de renovação | **Mantém acesso durante os 3 dias de tolerância (regra oficial 0.0)** | "Pagamento pendente" + notificação in-app (tabela `notifications`) antes/no/após o vencimento | → `active` (pagamento regularizado, automático) → `suspended` (após 3 dias sem regularização, regra oficial) | `PAYMENT_OVERDUE` | Regularizar o pagamento |
| `suspended` | **Não existe hoje** — precisa de novo valor de `status` | 3 dias corridos de tolerância vencidos sem regularização (regra oficial 0.0) | **Acesso restrito só às telas de regularização** (quais telas exatamente: pendência técnica); **dados financeiros nunca apagados** (regra oficial, não negociável) | **Nova mensagem necessária** ("Assinatura suspensa por falta de pagamento — regularize para continuar") | → `active` (pagamento confirmado, **reativação automática**, regra oficial) | Nenhum evento único — regra interna calculada sobre `overdue` + 3 dias | Regularizar o pagamento |
| `canceled` | Existe (`status='canceled'`) | Usuário cancela a renovação | **Mantém acesso completo até `current_period_ends_at` (regra oficial 0.0) — não é um corte imediato.** Após o fim do período pago, transiciona para o equivalente de "sem assinatura" | "Plano cancelado" — **precisa de nova variante de mensagem para o período em que o cancelamento já foi pedido mas o acesso ainda está ativo** (pendência técnica) | → `free` (fim do período) ou → `active` (reativação antes do fim do período, se o usuário mudar de ideia — pendência técnica de UX, não decidida) | `SUBSCRIPTION_DELETED` (ou equivalente — a Asaas normalmente cancela a recorrência futura, não a cobrança já paga) | Nenhuma até o fim do período; assinar novamente depois, se desejar |
| `expired` | Existe (`status='expired'`) | Fim do período sem renovação (seja por cancelamento cumprido, seja por `suspended` nunca regularizado) | Sem acesso ao Plano Pessoal, fallback para `free` | "Plano expirado" | → `free` ou → `active` (nova assinatura) | Calculado internamente a partir de `current_period_ends_at` vencido | Assinar novamente |
| `refunded` | **Não existe hoje** — existiria em `billing_payments.status='refunded'` | Estorno de uma cobrança específica | **PENDENTE — política de reembolso não definida (item 12 ainda em aberto)** | **Nova mensagem necessária** | `PAYMENT_REFUNDED` | Depende da política a definir | Depende da política a definir |
| `chargeback` | **Não existe hoje** — existiria em `billing_payments.status='chargeback'` | Contestação da cobrança pelo titular do cartão | **PENDENTE — política de chargeback não definida (item 13 ainda em aberto)** | **Nova mensagem necessária** | `PAYMENT_CHARGEBACK_REQUESTED` / `PAYMENT_CHARGEBACK_DISPUTE` | Depende da política a definir | Depende da política a definir |

**Nota técnica sobre "cancelamento sem corte imediato"**: a regra oficial ("cancelamento interrompe só a renovação; acesso continua até o fim do período pago") não é representável apenas com o `status` atual de `subscriptions` — é preciso distinguir "está ativo e vai renovar" de "está ativo mas não vai renovar" enquanto o período corrente não terminar. Isso é uma alteração de schema **aditiva** (ex.: uma coluna nova `cancel_at_period_end boolean`), detalhada em 0.5 — não é uma nova decisão comercial, é uma consequência técnica da decisão já tomada.

**Nota sobre `refunded`/`chargeback`**: continuam como as únicas duas pendências comerciais que impedem fechar 100% da matriz — sem essa resposta, a Edge Function de webhook (`billing-webhook`, Parte 5) não pode ter sua lógica de tratamento desses dois eventos totalmente especificada.

### 0.5 — `plans`/`subscriptions`: o que é reaproveitável, o que falta, o que é aditivo

**Totalmente reaproveitável, sem mudança:**
- Estrutura de `plans` (catálogo) e `subscriptions` (uma por workspace).
- RLS já correta: leitura para membro do workspace, escrita 100% backend/service-role — esse padrão de segurança já é exatamente o que uma integração de pagamento exige, não precisa mudar.
- `getWorkspaceSubscription()`/`getWorkspaceSubscriptionAny()` (`workspaceService.js`) — já leem o shape certo.
- `access.js` (`getAccessFromSession`) — já deriva `access.plan` de `subscription.plan_id` com fallback seguro; não precisa mudar para os 4 planos existentes funcionarem com Asaas.
- Trigger `subscriptions_set_updated_at` — continua útil sem alteração.

**Falta (não existe hoje, tudo aditivo — nenhuma tabela existente precisa ser recriada):**
- Vínculo com cliente Asaas (`asaas_customer_id`) — tabela nova `billing_customers` (proposta na Parte 5).
- Histórico de cobranças — tabela nova `billing_payments`.
- Idempotência de webhook — tabela nova `webhook_events`.
- Campo de forma de pagamento e ID da assinatura na Asaas — colunas novas em `subscriptions` (`asaas_subscription_id`, `payment_method` restrito a `pix`/`pix_automatico`/`credit_card` — **sem `boleto`, por decisão oficial 0.0**), **aditivas** (`alter table ... add column`, nunca `drop`/`rename` de coluna existente).
- `cancel_at_period_end boolean not null default false` em `subscriptions` — **nova necessidade, decorrente diretamente da regra oficial 0.0** de que cancelamento não corta acesso imediatamente. Coluna aditiva, sem impacto em linhas existentes (default `false`).
- Estados `pending`/`suspended` — **já são regra de negócio oficial (0.0), não mais uma decisão em aberto** — mas ainda exigem ampliar o `check constraint` de `subscriptions.status`, que é uma migration que **recria o constraint** (`drop constraint` + `add constraint`), não uma alteração puramente aditiva. Precisa rodar um `update` de backfill compatível antes de qualquer linha existente ser afetada (hoje todas as linhas existentes já usam valores do constraint antigo, então a ampliação é seguramente compatível — só adiciona valores novos ao `in (...)`, não remove nenhum).
- ~~5ª linha em `plans` para "Plano Pessoal"~~ — **não é mais necessária**: a decisão oficial 0.0 reaproveita a linha `pro` já existente, eliminando a necessidade de alterar o `check constraint` de `plans.id`.
- Mecanismo de concessão manual de teste gratuito pelo admin (decisão 0.0, item pendente técnico) — provavelmente um campo/flag em `subscriptions` (ex.: `granted_by_admin_until timestamptz`) ou reaproveitamento de `trial_ends_at` com uma origem diferente (`status='trialing'` já existe no schema atual) — **não decidido nesta preparação**, fica como item técnico do Bloco 3 do roadmap.

**Migrations existentes que não podem ser reaplicadas** (já fechadas, não confundir com "falta corrigir"):
- `20260710_001_auth_profiles_workspaces.sql` — já aplicada; qualquer mudança em `plans`/`subscriptions` deve vir em uma migration NOVA (`alter table`), nunca editando esta.
- `20260716_009_fix_atomic_financial_action_and_balances.sql` e `20260723_019_fix_financial_goals_linked_account_fk.sql` — migrations corretivas já fechadas (bugs de 008 e 011 respectivamente); não relacionadas a billing, citadas aqui só para reforçar o padrão do projeto: correções viram migration nova, nunca edição de uma já aplicada.
- `20260720_013_ensure_auth_session_rls.sql` — reafirma RLS de `subscriptions` de forma idempotente; uma migration de billing que mexer em RLS de `subscriptions` deve seguir o mesmo padrão (idempotente, `drop policy if exists` + `create policy`), não presumir que só uma aplicação vai rodar.

### 0.6 — Implementação proposta para catálogo e autorização de capacidades (issue #55)

O PR empilhado sobre #123 propõe `public.plan_capabilities` como fonte persistida das capacidades dos quatro planos. O seed preserva a matriz existente: `pro` recebe Relatórios; `business` e `enterprise` recebem Relatórios e Gestão; `free` não recebe capacidades pagas. A migration não atualiza nem remove assinaturas e não troca IDs existentes.

O cliente carrega as capacidades pela relação da assinatura com o catálogo. As Edge Functions compartilham os IDs/nomes canônicos do módulo `supabase/functions/_shared/planCatalog.js`; os RLS de `clients`, `crm_pipeline_stages`, `crm_opportunities` e `projects` consultam uma função SQL que escolhe a mesma assinatura elegível mais recente do cliente e combina membership ativa, plano ativo, status e capacidade. Uma assinatura cancelada mantém a capacidade somente até `current_period_ends_at`.

**Estado desta proposta em 2026-10-25:** validada em cluster PostgreSQL 17 descartável, com schema mínimo equivalente às tabelas/funções referenciadas pela migration; a migration aplicou sem erro e asserts com role `authenticated` cobriram a matriz de capacidades, status ausente/pendente/ativo/cancelado/suspenso, fim do período pago, uma assinatura mais recente cancelada sobre outra ativa, desempate estável, bloqueio de SELECT/INSERT em workspace gratuito, isolamento de membro e ausência de SELECT para `anon`. O stack Supabase/PostgREST completo não foi executado, pois o Docker local não está disponível; nenhuma migration foi aplicada a ambiente remoto. Relatórios não têm tabela ou Edge Function própria; seu bloqueio continua sendo de navegação no cliente, enquanto as tabelas financeiras de base mantêm acesso conforme as policies existentes.

## Parte 4 — Auditoria dos planos atuais

### O que existe hoje (real, no banco)

Tabela `public.plans` (migration `20260710_001_auth_profiles_workspaces.sql`), com `id` restrito por `check` a exatamente 4 valores:

```sql
create table public.plans (
  id text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint plans_id_check check (id in ('free', 'pro', 'business', 'enterprise'))
);
```

Tabela `public.subscriptions` (mesma migration), uma assinatura por workspace:

```sql
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  plan_id text not null references public.plans(id) on delete restrict,
  status text not null default 'active',
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('trialing','active','past_due','canceled','expired'))
);
```

RLS: leitura liberada para o membro do workspace (`subscriptions_select_active_member`); **nenhuma escrita liberada para clientes** — só backend/service-role, por design (comentário da migration: "escrita reservada ao backend nesta fase").

Documentação existente (`docs/product-knowledge/plans-and-limitations.md`): planos Free/Pro/Business/Enterprise controlam acesso a Relatórios (Pro+) e a CRM/Clientes/Projetos (Business/Enterprise + Espaço Empresa). O documento já afirma explicitamente: **"Não existe um fluxo de upgrade ou cobrança real no aplicativo nesta fase."**

### Divergência real encontrada (registrar, não inventar)

O "Plano Pessoal" (R$ 29,90/mês, `src/features/personal-plan/personalPlanConfig.js`, `PERSONAL_PLAN_ID = 'personal'`) **não corresponde a nenhuma linha da tabela `plans`** — o `check` constraint só aceita `free/pro/business/enterprise`. Ou seja: existe hoje um produto/preço vendido na tela (`PersonalPlanPage.jsx`) que não tem representação nenhuma no schema de assinaturas real. Isso precisa ser resolvido explicitamente no desenho da Asaas (ver decisão necessária abaixo), não presumido.

Além disso, `SimplifiedAccountPage.jsx` mostra um badge fixo **"Plano Pessoal"** independente do `plan_id` real da assinatura — outra divergência entre o texto exibido e o dado real.

**Decisão necessária antes de implementar (não decidida por esta auditoria):** o "Plano Pessoal" R$29,90/mês é (a) um apelido comercial para o plano `free` ou `pro` já existente, ou (b) precisa de uma 5ª linha na tabela `plans` (o que exige alterar o `check constraint`, uma migration real)? Esta auditoria não assume nenhuma das duas — fica registrado como pendência de decisão de produto.

### Estados de assinatura hoje

`getWorkspaceSubscriptionAny()` já lê e mapeia corretamente os 6 estados reais possíveis (`not_configured` é um estado derivado do lado cliente quando não há linha; os outros 5 vêm do `check` de `status`): `not_configured`, `trialing`, `active`, `past_due`, `canceled`, `expired`. As telas "Seu plano" e "Pagamento e assinatura" já sabem exibir todos os 6 — a parte que falta é popular esses dados com uma assinatura real.

Não existe hoje: trial com data de início real (nada escreve `trial_ends_at`), histórico de cobrança, campo de forma de pagamento, `asaas_customer_id` ou equivalente.

## Parte 5 — Arquitetura proposta da integração Asaas

### Verificação prévia (obrigatória, já feita)

Busca confirmada em todo o repositório: **nenhuma tentativa de integração existe** com Asaas, Stripe, Mercado Pago ou PagSeguro (as duas últimas aparecem só como nomes de instituição no normalizador de contas bancárias, sem relação com processamento de pagamento). Nenhum SDK de pagamento está instalado no `package.json`. Nenhuma Edge Function ou migration referencia qualquer provedor de pagamento. **A integração seria inteiramente nova — não há nada para reaproveitar além das tabelas `plans`/`subscriptions` já existentes.**

### Regra de segurança (não negociável)

A chave da Asaas (`ASAAS_API_KEY`) **nunca** vai para o frontend. Toda chamada à API da Asaas passa por uma Edge Function do Supabase, usando o secret do Supabase (`Deno.env.get('ASAAS_API_KEY')`), seguindo exatamente o mesmo padrão já usado por `uni-voice-tts`/`uni-chat-llm` para `ELEVENLABS_API_KEY`/`OPENAI_API_KEY`. O frontend nunca fala diretamente com `api.asaas.com`.

### Tabelas propostas (nenhuma criada nesta execução)

Reaproveitar `plans`/`subscriptions` como estão — não duplicar. Adicionar apenas o que falta:

**1. Alteração em `subscriptions` (migration futura, não nesta execução)** — adicionar colunas em vez de criar uma tabela nova, já que "uma assinatura por workspace" já é o modelo certo:
- `asaas_subscription_id text` — ID da assinatura na Asaas.
- `payment_method text check (payment_method in ('pix','pix_automatico','credit_card'))` — nullable até a 1ª cobrança. **Sem `boleto`, por decisão oficial 0.0.**
- Manter `current_period_ends_at`/`trial_ends_at` já existentes.

**2. `billing_customers`** (nova tabela — vínculo usuário↔cliente Asaas, 1:1 com `workspaces` ou `profiles`, a decidir conforme se a cobrança é por usuário ou por workspace):
- Finalidade: armazenar o `asaas_customer_id` de forma segura, nunca exposto ao cliente sem necessidade.
- Colunas: `id uuid pk`, `workspace_id uuid references workspaces(id)`, `asaas_customer_id text not null unique`, `cpf_cnpj text` (obrigatório pela Asaas — ver LGPD: minimizar exposição, nunca logar em texto livre), `email text`, `created_at`, `updated_at`.
- Índices: único em `asaas_customer_id`; índice em `workspace_id`.
- RLS: **select-only para o membro do workspace** (nunca expor CPF/CNPJ de outro usuário); toda escrita via service-role, igual ao padrão já usado em `subscriptions`.
- Campos vindos da Asaas: `asaas_customer_id`. Campos internos: `workspace_id`, timestamps.

**3. `billing_payments`** (nova tabela — histórico de cobranças, o que hoje falta para a tela "Histórico de pagamentos" parar de ser sempre vazia):
- Finalidade: espelhar cada cobrança (`payment`) da Asaas para exibir histórico e permitir conciliação.
- Colunas: `id uuid pk`, `workspace_id uuid references workspaces(id)`, `asaas_payment_id text not null unique`, `asaas_subscription_id text`, `status text check (status in ('pending','confirmed','received','overdue','refunded','chargeback','canceled'))`, `billing_type text check (billing_type in ('pix','pix_automatico','credit_card'))` — **sem `boleto`, por decisão oficial 0.0**, `value numeric(12,2) not null`, `due_date date`, `paid_at timestamptz`, `invoice_url text`, `created_at`, `updated_at`.
- Índices: único em `asaas_payment_id`; índice em `(workspace_id, status)`; índice em `asaas_subscription_id`.
- RLS: select-only para membro do workspace; escrita só via service-role (webhook).
- Campos vindos da Asaas: `asaas_payment_id`, `status`, `billing_type`, `value`, `due_date`, `paid_at`, `invoice_url`. Campos internos: `workspace_id`, `asaas_subscription_id` (FK lógica), timestamps.

**4. `webhook_events`** (nova tabela — idempotência e auditoria de webhook, essencial):
- Finalidade: registrar todo evento recebido da Asaas ANTES de processá-lo, para nunca processar o mesmo evento duas vezes (webhook duplicado é uma garantia explícita da Asaas, não uma exceção) e para ter trilha de auditoria/conciliação.
- Colunas: `id uuid pk`, `asaas_event_id text not null unique` (ou hash do payload, caso a Asaas não garanta um ID estável — validar na doc oficial no momento da implementação), `event_type text not null`, `payload jsonb not null`, `processed_at timestamptz`, `processing_error text`, `received_at timestamptz not null default now()`.
- Índices: único em `asaas_event_id`; índice em `event_type`; índice em `processed_at` (para reprocessar falhas).
- RLS: **nenhum acesso de cliente** — tabela 100% backend/service-role, nem select para `authenticated`.
- Campos vindos da Asaas: `asaas_event_id`, `event_type`, `payload` (corpo bruto do webhook, guardado sempre, mesmo se o processamento falhar). Campos internos: `processed_at`, `processing_error`, `received_at`.

**5. `billing_events` (opcional, avaliar necessidade real antes de criar)** — só criar se `billing_payments` sozinha não for suficiente para reconstruir o histórico de mudanças de status de uma cobrança (ex.: pending→confirmed→refunded). Se `billing_payments.status` mais `updated_at` já for suficiente para o MVP, **não criar esta tabela agora** — é a orientação explícita da tarefa ("não criar tabelas desnecessárias").

**Tabela `subscription_plans` da lista de referência da tarefa: não recomendada como tabela nova.** `plans` já cumpre esse papel — criar `subscription_plans` seria duplicar. Se o "Plano Pessoal" precisar virar uma 5ª linha real (ver decisão pendente acima), o caminho é alterar o `check constraint` de `plans`, não criar uma tabela paralela.

### Edge Functions propostas (nomes de referência, adaptar ao padrão do projeto)

Seguindo o padrão de nomeação já usado (`uni-voice-tts`, `uni-chat-llm`):

1. **`billing-create-customer`** — cria (ou reaproveita, se já existir) o cliente na Asaas e grava em `billing_customers`. Chamada uma vez, ao usuário escolher um plano pago pela primeira vez.
2. **`billing-create-subscription`** — cria a assinatura recorrente na Asaas para o `asaas_customer_id` existente; grava `asaas_subscription_id` em `subscriptions`.
3. **`billing-create-charge`** — cria a cobrança pontual/próximo ciclo (Pix, Pix Automático ou Cartão — **nunca boleto, decisão oficial 0.0**), retorna os dados de checkout (QR code Pix, dados de Pix Automático, ou token de cartão) para a UI.
4. **`billing-get-status`** — consulta o status atual de uma cobrança/assinatura (fallback para quando o webhook atrasa — ver fluxo de UX abaixo).
5. **`billing-cancel-subscription`** — cancela a assinatura na Asaas e atualiza `subscriptions.status = 'canceled'`.
6. **`billing-change-plan`** — troca de plano (upgrade/downgrade), ajustando o valor da assinatura na Asaas.
7. **`billing-webhook`** — recebe eventos da Asaas. Passos obrigatórios: (a) validar a autenticidade do webhook (token/assinatura, conforme a Asaas exigir — verificar na doc oficial no momento da implementação), (b) checar `webhook_events.asaas_event_id` antes de processar (idempotência), (c) gravar o evento bruto em `webhook_events` sempre, mesmo se o processamento subsequente falhar, (d) atualizar `subscriptions`/`billing_payments` de acordo com o tipo de evento, (e) nunca confiar em dado vindo do frontend para esta função — só no payload assinado da Asaas.

Cada função segue o padrão de segurança já usado nas Edge Functions existentes: `ASAAS_API_KEY` só como secret do Supabase, nunca no frontend; validação de `Authorization: Bearer` do usuário (exceto o webhook, que valida a Asaas, não o usuário); CORS restrito à origem do app (seguindo o padrão já usado por `uni-voice-transcribe`, que é a única função hoje com `APP_ALLOWED_ORIGINS` — replicar esse padrão para billing, já que envolve dinheiro).

### Idempotência

Duas camadas, seguindo o mesmo padrão já comprovado no financeiro (`transactions.client_operation_id` + RPC `execute_confirmed_financial_action`):
- Do lado do cliente → Asaas: usar o suporte nativo da Asaas a chave de idempotência na criação de cobrança, se disponível (verificar na doc oficial), para que um duplo clique no botão "Pagar" nunca gere duas cobranças.
- Do lado Asaas → nosso backend (webhook): `webhook_events.asaas_event_id` único, checado antes de qualquer processamento — replay do mesmo evento nunca duplica o efeito.

### Ambientes sandbox e produção

Dois secrets separados no Supabase (`ASAAS_API_KEY_SANDBOX`/`ASAAS_API_KEY_PRODUCTION`, ou um único `ASAAS_API_KEY` trocado por ambiente do projeto Supabase — seguir o que a Asaas oferece de URLs distintas para sandbox `https://sandbox.asaas.com/api/v3` vs. produção `https://api.asaas.com/v3`). A Edge Function deve ler a URL base de uma variável de ambiente, nunca hardcoded, para permitir alternar sem novo deploy de código.

### Logs e conciliação

Reaproveitar o padrão de log estruturado já usado em `uni-chat-llm` (a função já registra `mode`, `model`, `durationMs`, `status`, `reason` por chamada). Para billing, logar (sem dado sensível: nunca CPF/CNPJ completo, nunca dado de cartão) `event_type`, `asaas_payment_id`, `status`, `durationMs` por chamada de Edge Function e por webhook processado. Conciliação: `billing-get-status` chamável manualmente (ou por um job agendado, se o projeto tiver Supabase Cron) para comparar o status local com o da Asaas periodicamente, cobrindo o caso de webhook perdido.

## Parte 6 — Fluxo de pagamento do usuário (UX)

### Fluxo principal

1. Usuário abre Conta → Seu Plano (tela já existe, `SimplifiedPlanPage.jsx`).
2. Escolhe o plano (hoje só existe "Plano Pessoal" — tela já existe, `PersonalPlanPage.jsx`, precisa só trocar o `onClick` do stub pela chamada real).
3. Visualiza preço e benefícios (já existe, `personalPlanConfig.js`).
4. Seleciona forma de pagamento — **tela nova, ainda não existe**: escolher Pix, Pix Automático ou Cartão (boleto fora do MVP, decisão oficial 0.0).
5. Inicia checkout — chama `billing-create-customer` (se ainda não tiver `asaas_customer_id`) e depois `billing-create-subscription`/`billing-create-charge`.
6. Recebe instrução de pagamento — **tela nova**: QR code Pix, fluxo de autorização do Pix Automático, ou formulário de cartão (tokenização client-side apontando direto para a Asaas, nunca passando o número do cartão pelo nosso backend).
7. Pagamento fica pendente — **estado novo na UI**, distinto do "not_configured" atual.
8. Webhook confirma (`billing-webhook` recebe `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`) → atualiza `subscriptions.status = 'active'`.
9. Assinatura é ativada — a tela "Seu plano" já sabe renderizar o estado `active`, só precisa que o dado real chegue.
10. Recursos do plano são liberados — já funciona hoje via `access.plan` (`src/app/access.js`), só depende do `plan_id` correto estar na linha de `subscriptions`.

### Fluxos de exceção (nenhum existe hoje — todos são tela/lógica nova)

| Cenário | Tratamento proposto |
|---|---|
| Pagamento expirado (Pix não pago / cartão não autorizado a tempo) | `billing-webhook` recebe `PAYMENT_OVERDUE` → `billing_payments.status='overdue'`; segue o fluxo oficial de inadimplência (0.0): notificações → 3 dias de tolerância → `suspended`. |
| Pix não pago no prazo | Mesma lógica de expiração; Asaas cancela o Pix automaticamente após o prazo — UI oferece gerar novo. |
| Cartão recusado | `billing-create-charge` retorna erro síncrono da Asaas — UI mostra motivo genérico (nunca o código bruto do adquirente) e oferece tentar outra forma de pagamento. |
| Cobrança duplicada | Prevenida por idempotência (ver acima); se ocorrer do lado da Asaas, `billing-webhook` deve conciliar por `asaas_subscription_id`, nunca criar duas linhas ativas. |
| Usuário fecha a tela durante o pagamento | Estado fica "pendente" no banco; ao reabrir "Seu Plano", `billing-get-status` consulta a Asaas para atualizar, sem depender só do webhook. |
| Webhook atrasado | `billing-get-status` como fallback de consulta ativa, chamável pela UI ("verificar pagamento agora") e opcionalmente por um job periódico. |
| Webhook duplicado | Idempotência via `webhook_events.asaas_event_id` — processado só uma vez, ainda que recebido várias. |
| Usuário tenta pagar novamente | Se já existe cobrança `pending` do mesmo ciclo, reutilizar/exibir a existente em vez de criar uma nova (evita cobrança duplicada). |
| Cancelamento | `billing-cancel-subscription`; UI já tem o modal, só falta a chamada real. |
| Downgrade | `billing-change-plan`; decidir regra de produto (imediato vs. no fim do ciclo) — não assumida aqui. |
| Renovação | Responsabilidade da Asaas (assinatura recorrente); `billing-webhook` só reflete o novo ciclo (`current_period_ends_at`). |
| Inadimplência | `status='past_due'` já é um estado real e já exibido pela UI hoje — falta popular via webhook. |

### Telas que já existem vs. precisam ser criadas

**Já existem (só precisam de dado real):** Seu Plano, Pagamento e assinatura (estados vazios), Plano Pessoal (landing/CTA).
**Precisam ser criadas:** seleção de forma de pagamento (Pix/Pix Automático/Cartão — sem boleto), tela de instrução de pagamento (QR Pix/autorização Pix Automático/formulário de cartão), tela/estado de "pagamento pendente" com polling ou botão de verificação manual, histórico de cobranças com dados reais (a estrutura visual já existe, populá-la é o que falta), tela/estado de "assinatura suspensa" restrita a regularização (novo, decorrente da regra oficial de inadimplência).
