# Handoff para a futura Central de Suporte

Este documento explica como a Central de Suporte (interface ainda não implementada) deve consumir a fundação criada na fase OPENAI3. Nada aqui expõe a interface final — é a referência técnica para quem for construí-la.

## O que já existe (fundação desta fase)

- `docs/product-knowledge/*.md` — os documentos de conhecimento, legíveis por humanos.
- `src/features/product-knowledge/productKnowledgeManifest.js` — fonte de verdade estruturada (id, categoria, status, rotas, workspaces, keywords, conteúdo resumido).
- `src/features/product-knowledge/productKnowledgeRetrieval.js` — `retrieveProductKnowledge(query, { workspace, limit })`, busca local determinística, sem dependência externa.
- `src/features/product-knowledge/uniMode.js` — vocabulário `UNI_MODE.FINANCIAL` / `UNI_MODE.SUPPORT`.
- `src/features/product-knowledge/uniSupportContext.js` — `buildSupportRequestPayload({ text, messages, workspace })`, monta o payload pronto para enviar à Edge Function no modo suporte.
- `supabase/functions/uni-chat-llm/index.ts` — já aceita `mode: 'support'` e `productContext`, com instruções de suporte fixas server-side.

## Como selecionar `UNI_MODE.SUPPORT`

Uma futura tela de Central de Suporte deve:

1. Chamar `buildSupportRequestPayload({ text, messages, workspace })` (de `src/features/product-knowledge/index.js`) com a pergunta do usuário, o histórico curto da conversa de suporte (separado do histórico do chat financeiro) e o espaço ativo (`'personal'` ou `'business'`), se souber.
2. Passar o resultado (`{ mode, messages, productContext }`) para `uniLlmProvider.generateResponse({ system: null, messages, mode, productContext })` — o `system` pode ser omitido/ignorado: a Edge Function monta o prompt de suporte inteiramente no servidor, ignorando qualquer `system` enviado pelo cliente.
3. Nunca reaproveitar o `useUniLlm`/histórico do chat financeiro diretamente — manter os dois modos com estados de conversa separados, para não misturar contexto financeiro com perguntas de suporte.

## Quais metadados estarão disponíveis

A resposta da Edge Function no modo suporte tem este formato adicional:

```json
{
  "text": "...",
  "usage": { "promptTokens": 0, "completionTokens": 0 },
  "mode": "support",
  "knowledge": {
    "usedDocumentIds": ["uni-voice"],
    "matched": true,
    "escalate": false
  }
}
```

- `usedDocumentIds`: ids do manifesto usados como referência (permite auditoria — "essa resposta veio de qual documento").
- `matched`: `false` quando nenhum documento relevante foi encontrado para a pergunta.
- `escalate`: `true` quando `matched` é `false` — sinal de que a base não teve uma resposta confiável.

Esses campos não precisam ser todos exibidos ao usuário nesta fase; a interface pode usá-los internamente (ex.: decidir quando mostrar um botão "Falar com o suporte").

## Como escalonar para atendimento humano

Quando `knowledge.escalate === true` (ou quando o usuário pedir explicitamente), a interface futura deve oferecer um caminho para suporte humano — este documento não define QUAL canal (e-mail, chat externo, ticket), pois isso depende de uma decisão de produto fora do escopo desta fase. A Uni, no modo suporte, já é instruída a sugerir isso em texto quando não sabe a resposta.

## Limitações conhecidas desta fundação

- Recuperação é por palavras-chave determinística (Opção A), não semântica/embeddings. Pode não encontrar reformulações muito diferentes das keywords cadastradas — reforçar keywords no manifesto conforme perguntas reais aparecerem.
- Não há vínculo entre uma conversa de suporte e um ticket externo — isso pertence a uma fase futura.
- Não há interface própria de Central de Suporte ainda — apenas a fundação de dados/recuperação/modo de IA.
- O modo suporte nunca recebe dados financeiros do usuário, mesmo que o texto da pergunta contenha algo financeiro — para dúvidas sobre saldo/transações reais, o usuário deve ser direcionado ao chat financeiro (`/uni-ai`, `UNI_MODE.FINANCIAL`).

## Como atualizar o conhecimento após mudanças no produto

1. Editar ou criar o `.md` correspondente em `docs/product-knowledge/`.
2. Editar a entrada correspondente em `productKnowledgeManifest.js` (ou criar uma nova, com um novo id estável) — atualizar `content`, `status`, `routes`, `keywords` e `updatedAt`; incrementar `version` da entrada alterada.
3. Rodar `npm run product-knowledge:validate` — detecta documento órfão, rota inexistente, funcionalidade futura descrita como disponível, duplicação de conteúdo e conflito de workspace por rota.
4. Rodar `npm test` (os testes de `src/features/product-knowledge/` validam o manifesto e a recuperação).
5. Nunca remover um id existente sem justificativa — preferir marcar como `deprecated` caso o conteúdo tenha sido substituído por outra entrada.
