# Agenda — ordem obrigatória do rollout de idempotência

O Lote B.2.2 nasce com `VITE_AGENDA_IDEMPOTENCY_ENABLED=false`. Nesse modo,
nenhuma consulta ou escrita referencia `agenda_items.client_operation_id`, e o
frontend permanece compatível com o schema anterior à migration 030.

Ordem obrigatória, sem exceção:

1. implantar o frontend/backend compatível com a flag OFF;
2. aplicar `supabase/migrations/20260808003000_030_agenda_item_idempotency.sql` no ambiente alvo;
3. validar a coluna UUID, o índice único parcial por workspace e a trigger de imutabilidade;
4. somente depois habilitar `VITE_AGENDA_IDEMPOTENCY_ENABLED=true` e liberar o caminho B.2.

Em caso de falha nas etapas 2 ou 3, a flag deve permanecer OFF. A
migration deste lote permanece apenas versionada localmente até autorização
explícita para o ambiente Supabase correspondente.
