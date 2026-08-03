# Context Ranking Engine

Camada cognitiva isolada que ordena elementos válidos do contexto atual pela relevância para a conversa.

## Contrato

- recebe `parsedIntent`, `contextSnapshot`, `goalSnapshot`, `goalRankingSnapshot` e `memoryRankingSnapshot`;
- usa objetivos e memórias apenas como sinais de pontuação;
- rejeita elementos inválidos, expirados ou de outro workspace antes do score;
- não expõe IDs de sessão ou usuário;
- retorna cópias mínimas profundamente imutáveis;
- nunca cria, altera, apaga, persiste ou executa contexto.

`runContextRankingShadow()` respeita `UNI_OS_ENABLED`. Quando habilitado explicitamente, entrega o snapshot ao observador e descarta o resultado. O módulo não está conectado ao runtime ou ao Context Adapter.
