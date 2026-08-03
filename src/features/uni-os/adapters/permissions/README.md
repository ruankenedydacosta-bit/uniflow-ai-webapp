# Permissions Adapter

Representa permissões cognitivas a partir dos snapshots anteriores. Scopes e
grants descrevem somente leitura, proposta e solicitação de confirmação; nunca
roles, policies, RLS ou permissões técnicas de backend.

Nenhum status permite execução. `executionAllowed` permanece sempre `false`.
Permissão desconhecida não recebe grants.

`UNI_OS_ENABLED` continua desligada. Quando ativada explicitamente, o adapter
roda somente em modo sombra e o resultado é descartado.
