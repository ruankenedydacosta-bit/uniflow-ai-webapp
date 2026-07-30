begin;

-- SUPORTE1: Central de Suporte da UniFlow AI.
--
-- (1) Conversas de suporte reaproveitam uni_conversations/uni_messages
-- (mesma tabela do chat financeiro) -- opcao A da fase, preferida por ser a
-- mais simples e segura: mesma RLS, mesmo isolamento por usuario ja
-- validado, sem duplicar infraestrutura. A unica mudanca e um metadado de
-- tipo (`conversation_type`), aditivo e com default seguro -- nenhuma linha
-- existente muda de comportamento (todas ja sao 'financial').
--
-- (2) `support_requests` e uma tabela nova, pequena e isolada: guarda
-- solicitacoes de atendimento humano quando a Uni nao resolve. Nunca copia
-- o historico da conversa -- no maximo uma referencia (`conversation_id`),
-- nunca o conteudo. Usuario cria e ve as proprias; nunca edita status
-- (isso fica para um futuro painel administrativo via service role).

alter table public.uni_conversations
  add column conversation_type text not null default 'financial'
  constraint uni_conversations_conversation_type_check
  check (conversation_type in ('financial', 'support'));

comment on column public.uni_conversations.conversation_type is
  'financial (chat financeiro, UNI_MODE.FINANCIAL) ou support (Central de Suporte, UNI_MODE.SUPPORT) -- nunca mistura as duas na mesma conversa.';

create index uni_conversations_type_idx
  on public.uni_conversations (user_id, conversation_type, updated_at desc);

-- Solicitacoes de atendimento humano.
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  conversation_id uuid references public.uni_conversations(id) on delete set null,
  category text not null,
  subject text not null,
  description text not null,
  impact text not null default 'medium',
  platform text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_requests_category_check check (category in (
    'acesso_conta', 'financeiro', 'chat_uni', 'voz', 'notificacoes',
    'pessoal_empresa', 'erro_tecnico', 'cobranca_plano', 'privacidade_seguranca', 'outro'
  )),
  constraint support_requests_impact_check check (impact in ('low', 'medium', 'high')),
  constraint support_requests_platform_check check (platform is null or platform in ('desktop', 'mobile')),
  constraint support_requests_status_check check (status in ('open', 'in_review', 'resolved', 'closed')),
  -- Limites de tamanho: mesma logica de defesa em profundidade ja usada na
  -- Edge Function uni-chat-llm (nunca confiar so na validacao client-side).
  constraint support_requests_subject_length_check check (char_length(subject) between 1 and 150),
  constraint support_requests_description_length_check check (char_length(description) between 1 and 4000)
);

create index support_requests_user_idx
  on public.support_requests (user_id, created_at desc);

alter table public.support_requests enable row level security;

-- Usuario so ve as PROPRIAS solicitacoes -- nunca as de outro usuario.
create policy support_requests_select_own
  on public.support_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Usuario pode criar a propria solicitacao. Sem policy de update/delete
-- para authenticated -- usuario nunca edita status; tratamento fica para um
-- futuro papel administrativo via service role (que ignora RLS).
create policy support_requests_insert_own
  on public.support_requests
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

revoke all on table public.support_requests from anon, authenticated;
grant select on table public.support_requests to authenticated;
grant insert (user_id, workspace_id, conversation_id, category, subject, description, impact, platform)
  on public.support_requests to authenticated;

comment on table public.support_requests is
  'Solicitacoes de atendimento humano criadas pelo usuario quando a Uni (modo suporte) nao resolve. Nunca copia o historico da conversa -- no maximo uma referencia via conversation_id.';
comment on column public.support_requests.status is
  'open (padrao) | in_review | resolved | closed -- somente um futuro papel administrativo (service role) altera; usuario nunca edita.';
comment on column public.support_requests.conversation_id is
  'Referencia opcional e segura a uni_conversations -- nunca uma copia do conteudo da conversa.';

commit;
