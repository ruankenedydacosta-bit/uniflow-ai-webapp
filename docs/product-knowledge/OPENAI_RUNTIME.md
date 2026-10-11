# Runtime da integração OpenAI da Uni

Documento operacional (não é conhecimento de produto para a Uni consumir — é para quem mantém o sistema). Cobre a integração real, validada na fase OPENAI4, referência `95c4d45`.

## Arquitetura

- Frontend nunca fala com a OpenAI diretamente. Toda chamada passa pela Edge Function `supabase/functions/uni-chat-llm/index.ts`, que é a única detentora da credencial (`OPENAI_API_KEY`, Secret do Supabase — nunca lido, copiado ou logado por este processo, apenas confirmado como existente pelo nome).
- API usada: **Chat Completions** (`POST https://api.openai.com/v1/chat/completions`), oficialmente suportada e mantida indefinidamente pela OpenAI. Não migramos para a Responses API porque a arquitetura atual (mensagens simples, sem tools/estado gerenciado pela OpenAI) não precisa dela — migrar sem necessidade violaria a instrução da própria fase.
- Autenticação ao provedor: `Authorization: Bearer ${OPENAI_API_KEY}`, apenas server-side.
- Modos explícitos, via campo `mode` no payload: `financial` (default, compatível com OPENAI1/OPENAI2), `support` (OPENAI3), `phrase_fact`, `financial_intent` e `financial_response_compose`. Os modos `category_inference` e `financial_plan` saíram em #138: o plano e a categoria do lançamento vêm do `uni-interpret`.

## Modo financeiro (`UNI_MODE.FINANCIAL`)

- O `system` enviado pelo frontend (personalidade + resumo financeiro agregado do workspace ativo) é usado como está — nenhuma mudança nesta fase.
- Contexto financeiro enviado: apenas um resumo agregado e arredondado (saldo, receita/despesa/resultado do mês, maior categoria de despesa) — nunca a lista de transações, nunca dados de outro workspace.
- Uni nunca executa uma ação sozinha; qualquer sugestão de mutação financeira estruturada na resposta é detectada e descartada (`looksLikeStructuredFinancialAction`), forçando o fluxo determinístico do app.

## Modo suporte (`UNI_MODE.SUPPORT`)

- O `system` enviado pelo cliente é **ignorado por completo** pela Edge Function — garantia server-side (não apenas convenção de frontend) de que dados financeiros nunca chegam a este modo.
- O prompt de suporte é montado inteiramente no servidor a partir de `SUPPORT_MODE_INSTRUCTIONS` (fixo, nunca editável pelo cliente) + um "contexto de produto" pequeno, já recuperado pelo cliente via busca local determinística sobre `docs/product-knowledge/` (`retrieveProductKnowledge`, `src/features/product-knowledge/`).
- O contexto de produto é tratado como **dado de referência**, nunca como instrução — mesmo que o texto de um documento pareça uma instrução, o modelo é orientado a ignorá-la.
- Ainda não existe uma Central de Suporte com tela própria. Este modo é acionado hoje apenas de forma técnica/direta (`buildSupportRequestPayload`), pronto para uma futura interface consumir (ver `SUPPORT_HANDOFF.md`).

## Modelo

- Configurável via `UNI_LLM_MODEL` (Secret/variável de ambiente da Edge Function). Sem essa variável, o default é `gpt-5.4-mini`.
- **Por quê `gpt-5.4-mini`**: confirmado disponível na conta via uma chamada real e server-side a `GET /v1/models` (nunca por suposição de nome) — feita por uma função de diagnóstico temporária, criada, usada uma única vez e removida (`supabase functions delete`) nesta mesma fase. É a geração "mini" (custo controlado) mais recente confirmada disponível; qualidade e velocidade em PT-BR superiores ao `gpt-4o-mini` anterior, mantendo o mesmo perfil de custo baixo esperado de um modelo "mini".
- **Alternativas consideradas e descartadas**: `gpt-4o-mini` (mantido como o modelo anterior, ainda funcional e disponível, mas de geração mais antiga); `gpt-5.5`/`gpt-5.6-*` (gerações mais novas, mas sem uma variante "mini" claramente confirmada nesta conta/lista de modelos — usar o modelo "cheio" violaria "não usar automaticamente o modelo mais caro"); `gpt-5.4-nano` (mais barato ainda, mas o corte de qualidade para instruções estruturadas de dois modos distintos, com contexto financeiro e de produto, pareceu arriscado demais para não ter sido testado nesta fase).
- **Impacto de custo/latência observado nas chamadas reais desta fase**: respostas curtas (chat financeiro/suporte, limite de 500 tokens de saída) ficaram na faixa de 50–100 tokens de prompt e 30–90 tokens de saída por chamada, com latência de ~2 a ~4 segundos por resposta.
- **Troca de modelo no futuro**: basta alterar o secret/variável `UNI_LLM_MODEL` no Supabase e reimplantar a função — nunca requer alterar o frontend.

## Correção real encontrada nesta fase

Ao validar com uma chamada real, a API rejeitou o parâmetro `max_tokens` para o modelo atual: `"'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."` — corrigido trocando para `max_completion_tokens` (nome atual, universal, do mesmo parâmetro). Também trocado o role `system` por `developer` nas mensagens enviadas à OpenAI, o caminho oficial atual para instruções de sistema (a API aceita ambos para a família de modelos em uso, mas `developer` é o recomendado daqui para frente).

## Limites

| Limite | Valor |
|---|---|
| Mensagens de histórico enviadas | 12 (servidor); 8 (cliente, mais conservador) |
| Caracteres por mensagem | 800 (servidor); 500 (cliente) |
| Tamanho do `system` | 6000 caracteres (servidor); 4000 (cliente) |
| Entradas de contexto de produto | 5, 700 caracteres cada, 3000 no total |
| Tokens de saída | 500 (`max_completion_tokens`) |
| Timeout da chamada ao provedor | 20 segundos |
| Tamanho máximo da resposta exibida | 2000 caracteres |
| Retry | uma única tentativa extra, apenas para falha de rede pura (nunca para timeout, 401, 429 ou erro de payload) |

## Tratamento de erros (nunca expõe detalhe interno ao usuário)

| Situação real | Status ao cliente | Mensagem |
|---|---|---|
| Secret ausente | 503 | "A resposta por IA não está configurada neste ambiente." |
| Chave inválida/revogada (401 da OpenAI) | 503 | mesma mensagem acima — tratado como indisponível, nunca revela que a chave existe mas é inválida |
| Saldo insuficiente (`insufficient_quota`) | 503 | "A resposta por IA não está disponível no momento." |
| Rate limit genérico | 429 | "Muitas solicitações. Tente em instantes." |
| Erro do provedor / resposta vazia / recusa do modelo | 502 | "Não consegui gerar uma resposta agora." |
| Timeout (20s) | 504 | mesma mensagem acima |
| Ação financeira estruturada detectada na resposta | 422 | "Resposta inválida." (força fallback determinístico) |
| Payload do cliente ilegível | 400 | "Não foi possível ler esta solicitação." |
| Sem sessão autenticada | 401 | "Entre novamente para usar a Uni." |

Em todos os casos, o frontend já existente cai no fluxo determinístico (mensagem de fallback fixa, nunca duplicada) quando o modo LLM falha — comportamento herdado de OPENAI1/OPENAI2, não alterado nesta fase.

## Observabilidade

Cada chamada gera uma linha de log estruturado (JSON) na própria Edge Function, apenas com: modo, modelo, duração, status HTTP, motivo normalizado (`reason`: `ok`, `empty`, `refusal`, `invalid_key`, `rate_limit`, `insufficient_quota`, `provider_error`, `server_error`, `timeout`, `network_error`, `structured_action_blocked`), tokens de prompt e de saída, e timestamp. **Nunca** loga o texto da pergunta, da resposta, o contexto financeiro, o contexto de produto, e-mail, CPF, nome completo ou qualquer secret. Nenhuma tabela nova de uso foi criada nesta fase — o volume atual não justifica; os logs seguros da própria função e o painel de uso da OpenAI já bastam.

## Custo

Sem uma tabela de billing própria nesta fase — o controle de custo é primariamente pelos limites acima (histórico curto, contexto mínimo, tokens de saída limitados, modelo "mini") e pelo painel de uso da conta OpenAI. Ver a seção "Quando os créditos acabarem" abaixo para o comportamento em caso de esgotamento.

## Quando os créditos da OpenAI acabarem

A API retorna 429 com `error.code = "insufficient_quota"`. A Edge Function detecta isso especificamente e responde 503 ao cliente (tratado como "indisponível", igual a uma chave ausente) — o app cai automaticamente no fluxo determinístico, sem erro alarmante ao usuário. Para restaurar: adicionar crédito/billing na conta OpenAI; nenhuma mudança de código é necessária.

## Rotação da chave

1. Gerar uma nova chave no painel da OpenAI.
2. Atualizar o Secret `OPENAI_API_KEY` no Supabase (`supabase secrets set`, fora deste processo, com a chave em mãos apenas de quem estiver operando — nunca colar a chave em uma sessão de IA).
3. Nenhuma reimplantação de função é necessária só para trocar um secret (o valor é lido em tempo de execução via `Deno.env.get`), mas reimplantar não tem efeito colateral se quiser forçar a atualização.
4. Revogar a chave antiga no painel da OpenAI depois de confirmar que a nova funciona.

## Checklist de validação (repetir após qualquer mudança nesta Edge Function)

- [ ] `npm test`, `npm run build`, `npm run lint`, `npm run product-knowledge:validate` sem regressão.
- [ ] Nenhum secret no bundle (`grep` em `dist/`).
- [ ] Uma chamada financeira real responde 200 com texto coerente.
- [ ] Uma chamada de suporte real responde 200, cita apenas o conhecimento fornecido, nunca inventa.
- [ ] Uma tentativa de prompt injection (revelar prompt/chave/dados de outro usuário) é recusada.
- [ ] Erros (401/429/500/timeout) não vazam detalhe interno.
- [ ] Nenhuma duplicação de mensagem após erro/retry/abort.
