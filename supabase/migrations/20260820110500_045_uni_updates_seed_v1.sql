begin;

-- UNIUPD1: primeira entrada do changelog, correspondente à versão já
-- publicada (APP_VERSION = '1.0.0' em appIdentity.js). Não é uma
-- "novidade nova" para quem já usa o app -- existe para popular o
-- histórico de Novidades da Uni desde o dia 1, sem gerar destaque
-- indevido na Home para usuários existentes (o destaque só aparece
-- para versões futuras publicadas após o cadastro do usuário).
--
-- created_at fixo e anterior a QUALQUER usuário existente (data real de
-- lançamento do MVP, não "agora") -- se fosse now(), a entrada apareceria
-- como pendente para todo usuário já cadastrado, já que v1.0.0 é a
-- versão que eles já usam, não uma novidade.
insert into public.updates (version, icon, title, description, features, active, created_at)
values (
  '1.0.0',
  '🚀',
  'Bem-vindo à UniFlow AI',
  'A primeira versão da Uni já está no ar, com organização financeira simples e conversas inteligentes sobre o seu dinheiro.',
  '["Conversas com a Uni sobre suas finanças", "Relatório financeiro inteligente", "Agenda, metas e categorias em um só lugar"]'::jsonb,
  true,
  '2026-07-01T00:00:00Z'
);

commit;
