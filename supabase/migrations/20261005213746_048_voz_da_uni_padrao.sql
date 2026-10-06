begin;

-- A voz do navegador saiu do produto: a Uni fala só com a voz dela
-- (Edge Function uni-voice-tts). O app já ignora esta coluna; aqui o padrão
-- e os perfis existentes passam para a voz da Uni, para que uma versão antiga
-- do app ainda em cache no aparelho também use a voz da Uni.
--
-- A constraint continua aceitando 'native': uma versão antiga do app ainda
-- pode gravar esse valor, e a gravação não deve falhar por isso.

alter table public.profiles
  alter column voice_provider set default 'elevenlabs';

update public.profiles
  set voice_provider = 'elevenlabs'
  where voice_provider is distinct from 'elevenlabs';

comment on column public.profiles.voice_provider is
  'Provider de sintese de voz. Desde a 048 o app usa sempre a voz da Uni (elevenlabs); native fica aceito so por compatibilidade com versoes antigas do app.';

commit;
