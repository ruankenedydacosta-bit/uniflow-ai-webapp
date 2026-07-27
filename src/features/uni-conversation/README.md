# Uni Conversation

## Pending action stack

`pendingActionStack.js` representa dependências conversacionais sem conhecer
domínios. A primeira ação ocupa a base da pilha; uma dependência suspende essa
ação e passa a ser a ação ativa. Quando a dependência é concluída, a operação
retorna `resumedAction` com todos os campos e o contexto anteriores preservados.

Cada pilha pertence a uma combinação de usuário, workspace e conversa. IDs ou
`deduplicationKey` repetidos são recusados. Objetos públicos são clones
defensivos e profundamente congelados.

Executores de domínio são registrados em `createPendingActionCoordinator`.
Assim, conta, categoria, cliente, projeto ou meta podem reutilizar o mecanismo
sem que o núcleo interprete ou execute regras desses módulos.

O cancelamento pode encerrar apenas a dependência e retomar o pai, ou cancelar
todo o ramo com `cascade: true`. Falhas permanecem estruturadas na ação ativa.
O armazenamento em `sessionStorage` tem TTL e isolamento pela identidade.

As APIs legadas de snapshot único continuam disponíveis durante a migração
gradual dos fluxos existentes.
