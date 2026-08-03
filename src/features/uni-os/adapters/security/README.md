# Security Adapter

Avalia snapshots imutáveis de intenção, contexto, memória, planejamento e
reflexão. Produz uma decisão estruturada `ALLOW`, `ALLOW_WITH_CONFIRMATION` ou
`BLOCK` sem alterar entradas ou executar ações.

Ações futuras com permissões ainda desconhecidas são bloqueadas por padrão.
`executionAllowed` permanece sempre `false`.

`UNI_OS_ENABLED` continua desligada. Quando ativada explicitamente, a validação
roda somente em modo sombra e o resultado é descartado.
