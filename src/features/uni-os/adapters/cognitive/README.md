# Cognitive Gateway Adapter

Representa a futura fronteira entre o UNI OS e modelos cognitivos. O router
classifica somente uma capacidade futura; nenhuma capacidade é ativada.

O gateway sempre retorna `NOT_IMPLEMENTED`, `provider: null`,
`shouldInvokeModel: false`, `modelCapability: null` e `promptTemplate: null`.
Não monta prompts, escolhe modelos, consome tokens ou realiza chamadas externas.

`UNI_OS_ENABLED` continua desligada. Quando ativada explicitamente, o gateway
roda somente em modo sombra e o resultado é descartado.
