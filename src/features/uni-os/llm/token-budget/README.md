# Token Budget Manager

Calcula e distribui um orcamento cognitivo aproximado sobre a Conversation Window sem modificar seu conteudo.

- Politicas: `ECONOMY`, `BALANCED`, `QUALITY` e `MAX_CONTEXT`.
- Estimativa estrutural deterministica, sem tokenizer ou SDK.
- Capacidade nao usada e redistribuida somente entre secoes com demanda estimada.
- Nenhuma mensagem e removida, nenhum contexto e reduzido e nenhum prompt e gerado.
- `runTokenBudgetShadow()` respeita `UNI_OS_ENABLED` e descarta o resultado.
