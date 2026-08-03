# Planning Adapter

Transforma `parsedIntent`, `contextSnapshot` e `memorySnapshot` em um plano
cognitivo estruturado e profundamente imutável.

O adapter apenas representa passos. Não executa, persiste, chama serviços,
consulta Supabase ou altera providers. `executionAllowed` é sempre `false`.

`UNI_OS_ENABLED` permanece desligada. Quando ativada explicitamente, a execução
sombra observa o plano e descarta o resultado sem interferir no fluxo atual.
