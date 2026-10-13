# Google Agenda: sincronização e saúde

Épico #98. Contrato: comentário do épico (issue #98). Este documento cobre a
operação: o que roda, onde ver se está saudável e o que fazer quando não está.

## O que roda

| Peça | Gatilho | Faz |
|---|---|---|
| `google-calendar-export` | pg_cron a cada minuto, só com trabalho (migration 060) | App → Google, pela fila `calendar_export_queue`. |
| `google-calendar-webhook` | Aviso do Google (`events.watch`) | Sync incremental do calendário avisado. |
| `google-calendar-sync-dispatch` | pg_cron a cada 10 min (migration 073) | Conexões sem passada há 30 min: lista de calendários, canais e sync de segurança. |
| `google-calendar-sync-now` | Botão no app (`sincronizarAgora`) | Mesmo que o dispatch, para a conexão de quem chamou. Uma vez a cada 30 s. |

Regras da importação (Google → app):

- Janela: de `now() - 30 dias` a `now() + 365 dias`. Sync completo da janela
  sem `sync_token`, depois de um 410 e uma vez por semana.
- O sync completo cancela o item vindo do Google cujo evento sumiu da janela.
  Nada é apagado.
- Sync completo repetido só insere evento alterado desde o último completo ou
  que acabou de entrar na janela. Um item importado e excluído no app só volta
  se o evento mudar no Google.
- Não entram: evento privado ou confidencial, convite recusado e evento que
  não é compromisso (local de trabalho, ausência, foco, aniversário).
- O mesmo evento em calendários de dois membros do espaço vira um item só.
- Item cancelado no app continua cancelado quando o evento muda no Google.
- Canal de 7 dias, renovado quando faltam menos de 2.
- Calendário que deixa de ser lido perde o canal, o `sync_token` e a janela.

## Consulta de saúde

Rode no SQL editor do projeto (só leitura).

```sql
-- 1. Calendários lidos com erro no último sync, sync parado ou travado.
select
  conexao.user_id,
  conexao.workspace_id,
  conexao.status as status_da_conexao,
  conexao.last_error_code,
  calendario.external_calendar_id,
  calendario.last_sync_error,
  calendario.last_synced_at,
  calendario.last_full_sync_at,
  calendario.sync_lock_until
from public.calendar_connection_calendars as calendario
join public.calendar_connections as conexao on conexao.id = calendario.connection_id
where calendario.is_read
  and conexao.status = 'active'
  and (
    calendario.last_sync_error is not null
    or calendario.last_synced_at is null
    or calendario.last_synced_at < now() - interval '1 hour'
    or calendario.sync_lock_until > now() + interval '10 minutes'
  )
order by calendario.last_synced_at nulls first;

-- 2. Canais vencidos ou ausentes em calendário lido (o dispatch deveria ter renovado).
select
  conexao.workspace_id,
  calendario.external_calendar_id,
  calendario.channel_expires_at
from public.calendar_connection_calendars as calendario
join public.calendar_connections as conexao on conexao.id = calendario.connection_id
where calendario.is_read
  and conexao.status = 'active'
  and (calendario.channel_id is null or calendario.channel_expires_at < now() + interval '1 day');

-- 3. Canal ainda aberto em calendário que não é mais lido.
select calendario.connection_id, calendario.external_calendar_id, calendario.channel_expires_at
from public.calendar_connection_calendars as calendario
where not calendario.is_read and calendario.channel_id is not null;

-- 4. Fila de exportação: pendentes vencidas e as que desistiram.
select ultimo_erro, count(*) as linhas, min(proxima_tentativa_em) as mais_antiga
from public.calendar_export_queue
where concluida_em is null and proxima_tentativa_em < now() - interval '10 minutes'
group by ultimo_erro
order by linhas desc;

-- 5. Últimas execuções dos crons.
select job.jobname, detalhe.status, detalhe.return_message, detalhe.start_time
from cron.job_run_details as detalhe
join cron.job as job on job.jobid = detalhe.jobid
where job.jobname in ('google-calendar-export', 'google-calendar-sync-dispatch')
order by detalhe.start_time desc
limit 20;
```

## Valores de `last_sync_error`

| Valor | Significa | O que fazer |
|---|---|---|
| `google_indisponivel` | 5xx, cota ou API desativada. | Passa sozinho. Se persistir, confira a Calendar API no Google Cloud. |
| `escopo_insuficiente` | Falta escopo. A conexão também fica com `last_error_code`. | A pessoa conecta de novo. |
| `conexao_revogada` | 401 na listagem. | A pessoa conecta de novo. |
| `calendario_ausente` | O calendário sumiu da conta. | Some da tabela na próxima lista de calendários. |
| `sync_token_vencido` | 410 também no sync completo. | O próximo sync recomeça do zero. |
| `banco_indisponivel` | RPC da importação falhou. | Veja os logs do Postgres e da função. |
| `paginas_demais` | Mais de 40 páginas (10 mil eventos) numa passada. | O `sync_token` é descartado e o próximo sync é completo. Se o completo também passar do limite, o calendário é grande demais para uma execução. |
| `varredura_falhou` | O completo listou tudo, mas a varredura falhou. | O próximo sync refaz o completo. |

## Limites conhecidos

- O dispatch pega até 10 conexões por execução, em ordem aleatória, e para de
  pegar conexão nova depois de 60 s.
- O sync completo precisa terminar numa execução da função: a posição na
  listagem (`pageToken`) não é guardada. Um calendário que estoure o tempo da
  Edge Function fica sem `sync_token` e recomeça do zero a cada tentativa.
- Um aviso do webhook que chega com o calendário em sync confere de novo três
  vezes em 10 s. Depois disso, a mudança espera o sync de segurança (até 40 min).
  Uma rajada de avisos ainda gera vários syncs incrementais seguidos.
- Item editado no app entre a leitura e a gravação de um lote fica com a versão
  do app. A mudança do Google só volta se o evento mudar de novo.
