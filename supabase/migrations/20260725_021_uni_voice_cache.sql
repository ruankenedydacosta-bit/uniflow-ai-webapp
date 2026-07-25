begin;

-- ELEVEN2.1: cache persistente de audio TTS (ElevenLabs) -- evita gerar de
-- novo o mesmo audio (mesmo texto sanitizado + usuario + voz + modelo +
-- formato + versao do algoritmo de cache), economizando creditos do
-- provedor. Privado e isolado por usuario: dois usuarios com o MESMO texto
-- nunca compartilham o mesmo arquivo nesta primeira versao.
--
-- Apenas metadados OPERACIONAIS ficam aqui -- nunca o texto integral, nunca
-- a API key, nunca o voice_id em claro (so um hash nao reversivel dele).
-- Toda leitura/escrita real acontece na Edge Function (uni-voice-tts) via
-- service role key, que ignora RLS por padrao -- as policies abaixo sao
-- defesa em profundidade caso a tabela seja consultada diretamente no
-- futuro, nunca o caminho principal desta fase.

create table public.uni_voice_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cache_key text not null,
  storage_path text not null,
  voice_id_hash text not null,
  model_id text not null,
  output_format text not null,
  character_count integer not null,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint uni_voice_cache_character_count_check check (character_count >= 0)
);

-- Um usuario nunca tem duas linhas para a MESMA cache_key -- a Edge
-- Function faz upsert (on_conflict) nessa combinacao para que chamadas
-- concorrentes para o mesmo conteudo convirjam numa unica linha, sem criar
-- duplicidade permanente.
create unique index uni_voice_cache_user_key_uidx
  on public.uni_voice_cache (user_id, cache_key);

-- Consulta de limpeza futura (arquivos expirados) -- preparada nesta fase,
-- a limpeza automatica em si fica para uma proxima.
create index uni_voice_cache_expires_idx
  on public.uni_voice_cache (expires_at);

alter table public.uni_voice_cache enable row level security;

-- Usuario so enxerga os proprios registros -- nenhuma leitura cruzada.
create policy uni_voice_cache_select_own
  on public.uni_voice_cache
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Grants
revoke all on table public.uni_voice_cache from anon, authenticated;
grant select on table public.uni_voice_cache to authenticated;
-- Sem insert/update/delete para authenticated: a Edge Function usa a
-- service role key (bypassa RLS/grants), unico caminho de escrita.

comment on table public.uni_voice_cache is
  'Metadados do cache de audio TTS (ELEVEN2.1) -- nunca o texto integral nem a API key; leitura/escrita real via service role na Edge Function uni-voice-tts.';
comment on column public.uni_voice_cache.cache_key is
  'SHA-256(versao_algoritmo:user_id:voice_id:model_id:output_format:texto_sanitizado) -- nunca o texto puro.';
comment on column public.uni_voice_cache.voice_id_hash is
  'Hash nao reversivel do voice_id -- nunca o identificador do provedor em claro.';
comment on column public.uni_voice_cache.expires_at is
  'TTL de 30 dias por padrao (configuravel via ELEVENLABS_CACHE_TTL_DAYS na Edge Function).';

-- Bucket privado para os arquivos de audio cacheados -- nunca publico.
insert into storage.buckets (id, name, public)
values ('uni-voice-cache', 'uni-voice-cache', false)
on conflict (id) do nothing;

-- Defesa em profundidade: mesmo que algum consumidor futuro use o cliente
-- Supabase autenticado diretamente contra o Storage (fora do fluxo
-- principal desta fase, que serve o audio pela propria Edge Function),
-- cada usuario so acessa a PRÓPRIA pasta (<user_id>/...) no bucket.
create policy uni_voice_cache_storage_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'uni-voice-cache'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

commit;
