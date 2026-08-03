# Reflection Adapter

Analisa criticamente `planningSnapshot` junto de intenção, contexto e memória
somente leitura. Produz risco, confiança, ambiguidades, inconsistências e
recomendações estruturadas.

O adapter nunca modifica o plano, executa ações, persiste dados ou chama
serviços. `executionAllowed` permanece sempre `false`.

`UNI_OS_ENABLED` continua desligada. Quando ativada explicitamente, a reflexão
roda em modo sombra e seu resultado é descartado.
