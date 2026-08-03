# Goal Ranking Engine

Camada cognitiva isolada que ordena objetivos existentes pela relevancia para a conversa atual.

## Contrato

- recebe `parsedIntent`, `contextSnapshot`, `memorySnapshot` e `goalSnapshot`;
- calcula score exclusivamente com regras deterministicas;
- preserva todos os objetivos e suas prioridades originais;
- retorna apenas referencias (`goalId`), score, relevancia e motivos estruturados;
- clona e congela profundamente a saida;
- nunca cria, edita, remove, persiste ou executa objetivos.

`runGoalRankingShadow()` respeita `UNI_OS_ENABLED`. Quando habilitado explicitamente, entrega o snapshot ao `observer` e descarta o resultado. O modulo nao esta conectado ao runtime ou a qualquer fluxo existente.
