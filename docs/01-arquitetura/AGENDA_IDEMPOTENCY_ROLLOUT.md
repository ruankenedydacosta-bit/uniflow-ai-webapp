# Agenda — ordem obrigatória do rollout de idempotência

O frontend do Lote B.2/B.2.1 consulta e envia `agenda_items.client_operation_id`.
Ele não é compatível com um schema anterior à migration abaixo.

Ordem obrigatória, sem exceção:

1. aplicar `supabase/migrations/20260808003000_030_agenda_item_idempotency.sql` no ambiente alvo;
2. validar a coluna UUID, o índice único parcial por workspace e a trigger de imutabilidade;
3. somente depois liberar o frontend/backend que referencia `client_operation_id`.

Em caso de falha nas etapas 1 ou 2, o código novo não deve ser promovido. A
migration deste lote permanece apenas versionada localmente até autorização
explícita para o ambiente Supabase correspondente.
