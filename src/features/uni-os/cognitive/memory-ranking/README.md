# Memory Ranking Engine

Camada cognitiva isolada que seleciona e ordena memórias elegíveis pela relevância para a conversa atual.

## Contrato

- recebe `parsedIntent`, `contextSnapshot`, `memorySnapshot`, `goalSnapshot` e `goalRankingSnapshot`;
- exige memória válida, ativa, não expirada e pertencente ao workspace atual;
- calcula score somente com regras determinísticas;
- retorna referências mínimas, score, confiança e motivos estruturados;
- nunca cria, edita, remove, persiste ou executa memórias;
- aplica deep freeze sem congelar as entradas.

`runMemoryRankingShadow()` respeita `UNI_OS_ENABLED`. Quando habilitado explicitamente, entrega o snapshot ao observador e descarta o resultado. O módulo não está conectado ao runtime, aos providers ou a APIs.
