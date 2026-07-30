# Runtime da integração OpenAI da Uni

Documento operacional (não é conhecimento de produto para a Uni consumir — é para quem mantém o sistema). Cobre a integração real, validada na fase OPENAI4, referência `95c4d45`.

## Arquitetura

- Frontend nunca fala com a OpenAI diretamente. Toda chamada passa pela Edge Function `supabase/functions/uni-chat-llm/index.ts`, que é a única detentora da credencial (`OPENAI_API_KEY`, Secret do Supabase — nunca lido, copiado ou logado por este processo, apenas confirmado como existente pelo nome).
- API usada: **Chat Completions** (`POST https://api.openai.com/v1/chat/completions`), oficialmente suportada e mantida indefinidamente pela OpenAI. Não migramos para a Responses API porque a arquitetura atual (mensagens simples, sem tools/estado gerenciado pela OpenAI) não precisa dela — migrar sem necessidade violaria a instrução da própria fase.
- Autenticação ao provedor: `Authorization: Bearer ${OPENAI_API_KEY}`, apenas server-side.
- Quatro modos explícitos, via campo `mode` no payload: `financial` (default, compatível com OPENAI1/OPENAI2), `support` (OPENAI3), `category_inference` (BLOCO D) e `financial_plan` (BLOCO E).

## Modo financeiro (`UNI_MODE.FINANCIAL`)

- O `system` enviado pelo frontend (personalidade + resumo financeiro agregado do workspace ativo) é usado como está — nenhuma mudança nesta fase.
- Contexto financeiro enviado: apenas um resumo agregado e arredondado (saldo, receita/despesa/resultado do mês, maior categoria de despesa) — nunca a lista de transações, nunca dados de outro workspace.
- Uni nunca executa uma ação sozinha; qualquer sugestão de mutação financeira estruturada na resposta é detectada e descartada (`looksLikeStructuredFinancialAction`), forçando o fluxo determinístico do app.

## Modo suporte (`UNI_MODE.SUPPORT`)

- O `system` enviado pelo cliente é **ignorado por completo** pela Edge Function — garantia server-side (não apenas convenção de frontend) de que dados financeiros nunca chegam a este modo.
- O prompt de suporte é montado inteiramente no servidor a partir de `SUPPORT_MODE_INSTRUCTIONS` (fixo, nunca editável pelo cliente) + um "contexto de produto" pequeno, já recuperado pelo cliente via busca local determinística sobre `docs/product-knowledge/` (`retrieveProductKnowledge`, `src/features/product-knowledge/`).
- O contexto de produto é tratado como **dado de referência**, nunca como instrução — mesmo que o texto de um documento pareça uma instrução, o modelo é orientado a ignorá-la.
- Ainda não existe uma Central de Suporte com tela própria. Este modo é acionado hoje apenas de forma técnica/direta (`buildSupportRequestPayload`), pronto para uma futura interface consumir (ver `SUPPORT_HANDOFF.md`).

## Modo de inferência de categoria (`UNI_MODE.CATEGORY_INFERENCE`, BLOCO D)

**Onde entra na hierarquia de resolução de categoria** (`src/features/uni-conversation/categoryResolution.js`): a IA é a **penúltima** camada, chamada só depois de todas as camadas determinísticas falharem, e antes da criação assistida:

1. Correspondência exata (nome idêntico).
2. Alias/aproximação local por texto (`categorySimilarity` — substring/overlap de palavras).
3. **Inferência da OpenAI** (só chamada quando 1–2 não encontraram nada, a feature flag `VITE_UNI_LLM_ENABLED` está ativa e existem categorias pessoais compatíveis para comparar).
4. Confirmação explícita do usuário (quando a confiança exige).
5. Criação assistida (`CREATE_CATEGORY`, fluxo já existente do Bloco B — nunca a IA cria a categoria, apenas sugere um nome).
6. Persistência pelo RPC determinístico existente (`execute_confirmed_financial_action`).

A OpenAI **nunca** é chamada quando já existe correspondência exata ou aproximada local — é estritamente um preenchimento de lacuna, não uma substituição do parser financeiro determinístico.

**Contrato estruturado da resposta** (validado tanto no cliente — `src/features/uni-category-inference/categoryInferenceContract.js` — quanto no servidor, em profundidade):

```json
{
  "decision": "existing_category" | "create_category" | "uncertain",
  "category_id": "um dos IDs enviados no payload, ou null",
  "confidence": 0.0,
  "suggested_name": "string curta (só para create_category) ou null",
  "reason": "justificativa curta, no máximo uma frase"
}
```

Regras de validação (resposta inválida em qualquer um destes casos vira fallback seguro — `uncertain` equivalente, nunca quebra o registro da transação): `decision` fora do enum; `confidence` não numérica, `< 0` ou `> 1`; `category_id` ausente/fora da lista de IDs enviada quando `decision === 'existing_category'`; `suggested_name` ausente quando `decision === 'create_category'`; JSON malformado. Campos extras (ex.: uma tentativa de incluir uma instrução de execução) são sempre ignorados, nunca interpretados.

**Faixas de confiança** (`src/features/uni-category-inference/categoryInferenceConfig.js`):

| Faixa | Comportamento |
|---|---|
| `>= 0.88` (alta) | Resolve a categoria diretamente (`RESOLVED`) — ainda sujeita à confirmação final normal da transação, nunca persiste sozinha. |
| `>= 0.65 e < 0.88` (intermediária) | Vira uma pergunta explícita ("Posso usar a categoria X?"), mesmo padrão já usado por uma aproximação local. |
| `< 0.65` (baixa) | Ignorada por completo — tratada como se a IA não tivesse sugerido nada. |
| `create_category` | Nunca cria sozinha — o nome sugerido alimenta o fluxo assistido `CREATE_CATEGORY` já existente, que pede confirmação e retoma a transação original após a criação real. |

**Entrada enviada** (`categoryInferencePayload.js`): apenas descrição sanitizada (até 160 caracteres), tipo (`income`/`expense`), até 12 categorias pessoais (`{id, name}`, nomes truncados em 60 caracteres) e `locale: 'pt-BR'`. Nunca saldo, contas, CPF, e-mail, telefone, histórico completo ou contexto Business — por construção (a função só lê esses três campos da entrada, e filtra qualquer categoria com `applies_to === 'business'` mesmo que o chamador passe por engano).

**Responsabilidades da OpenAI**: interpretar semanticamente a descrição e sugerir uma categoria/nome, com confiança e justificativa curta. Nunca: persistir transação, criar categoria, escolher conta, confirmar a ação do usuário, chamar RPC, alterar saldo, ou inventar um ID fora da lista enviada.

**Responsabilidades da camada determinística**: todo o resto — parsing da frase, resolução de conta, aplicação da hierarquia de confiança, criação real da categoria (`useCategories().saveCategory`), persistência da transação (`execute_confirmed_financial_action`), e toda a confirmação final ao usuário.

**Contexto Pessoal**: só participam categorias do workspace/produto Pessoal (mesmo filtro fail-closed do Bloco C); nenhuma categoria Business é enviada à IA nem aceita de volta — mesmo que sugerida, um ID business nunca estaria na allowlist enviada, então seria rejeitado como "ID não permitido".

**Timeout dedicado**: 8 segundos (mais curto que os 20s do chat, documentado em `categoryInferenceConfig.js` — a inferência acontece no meio do fluxo de registro por voz, não pode travar a experiência). Token de saída fixo e pequeno (200, nunca controlado pelo cliente).

**Fallback**: qualquer erro (timeout, 401, 429, 503, JSON inválido, ID inexistente, confiança fora do intervalo) faz a camada determinística seguir exatamente como se a IA nunca tivesse sido chamada — usuário ainda pode escolher ou criar a categoria manualmente, o fluxo nunca quebra.

## Modo de plano financeiro (`UNI_MODE.FINANCIAL_PLAN`, BLOCO E)

**Importante — escopo desta seção**: o Bloco E é uma evolução **funcional** do parser financeiro da Uni (entender frases financeiras mais ricas — multioperação, transferência, parcelamento, recorrência — e transformá-las num plano estruturado, sempre confirmado pelo usuário antes de qualquer persistência). Ele **não é** um sistema de raciocínio geral, não implementa AGI, e não é a mesma coisa que o futuro projeto "Uni Engine" (motor epistêmico/modelo mental/curiosidade/metacognição, cogitado para uma fase totalmente separada e ainda não iniciada). Qualquer semelhança de linguagem ("plano", "operações", "confiança") descreve apenas uma extensão do mesmo padrão híbrido determinístico+IA já usado no Bloco D — nunca uma mudança de natureza do sistema.

**Arquitetura híbrida**: o parser determinístico de uma única operação (`src/features/uni-intents/`) continua sendo a primeira tentativa. Uma heurística puramente determinística (`src/features/uni-conversation/financialPlanTrigger.js`, nunca a IA) decide quando vale tentar a camada neural — frase com dois ou mais valores monetários, menção a parcelamento (`10x`, "parcelado"), recorrência ("todo mês", "mensalmente") ou transferência. Quando a heurística não dispara, ou quando a camada neural não devolve um plano válido (indisponível, erro, timeout, resposta fora do contrato), o fluxo determinístico de uma única operação segue exatamente como antes — o Bloco E nunca é uma dependência obrigatória do caminho normal.

**Contrato estruturado do plano** (validado tanto no cliente — `src/features/uni-financial-plan/financialPlanContract.js` — quanto no servidor, em profundidade, na Edge Function):

```json
{
  "version": "1",
  "decision": "single_operation" | "multiple_operations" | "clarification_required" | "unsupported",
  "operations": [{
    "temporary_id": "op_1",
    "operation_type": "expense" | "income" | "transfer" | "installment_purchase" | "recurring_expense" | "recurring_income",
    "amount": 0.0,
    "currency": "BRL",
    "description": "string",
    "date_expression": "texto original (ex.: 'ontem'), nunca uma data já calculada",
    "source_account_reference": "nome textual, nunca um ID",
    "destination_account_reference": "nome textual, nunca um ID (só para transfer)",
    "category_reference": "nome textual, nunca um ID",
    "installments": { "count": 0, "installment_amount": 0.0, "total_amount": 0.0 },
    "recurrence": { "frequency": "monthly", "interval": 1 },
    "confidence": 0.0,
    "missing_fields": ["..."],
    "reason": "justificativa curta"
  }],
  "clarification_question": "string ou null",
  "global_confidence": 0.0
}
```

Regras centrais de validação (qualquer violação invalida o plano inteiro, caindo no fluxo determinístico normal): `resolved_date` nunca é lido do plano (só `date_expression` sobrevive à validação — a data real é sempre recalculada por um resolvedor determinístico local, nunca pela matemática da IA); `account_id`/`category_id`/`user_id`/`execute`/`persist`/`rpc` e qualquer campo de execução são ignorados mesmo se presentes; `transfer` exige origem e destino distintas e não vazias; `installment_purchase` exige `count × installment_amount ≈ total_amount`; `recurring_*` exige uma frequência válida; até 6 operações por plano; categorias/contas Business nunca entram no payload nem são aceitas de volta (mesmo filtro fail-closed do Bloco D).

**Resolução determinística por operação** (`src/features/uni-conversation/pendingFinancialPlan.js`): cada operação do plano passa individualmente pelos MESMOS resolutores já usados por uma única transação (`resolveFinancialAccount`, `resolveFinancialCategory`, `buildFinancialIntentAction`) — nunca uma resolução em lote, nunca pulando a hierarquia de confiança do Bloco D. Uma operação com conta/categoria ainda não cadastrada nunca cria silenciosamente — pede que o usuário informe uma conta/categoria já existente (a criação assistida de conta/categoria dentro de um plano com várias operações ainda não existe; é uma limitação documentada, não um comportamento simulado).

**Datas relativas** (`src/features/uni-intents/relativeDateResolver.js`): hoje/ontem/anteontem/amanhã, fim/começo do mês, dia da semana (passado ou "que vem"), "dia N" — sempre resolvidas localmente a partir de uma data de referência fixa (nunca `new Date()` direto em teste, sempre injetada), nunca confiando em qualquer data que a IA eventualmente calcule.

**Multioperação e mistura de receita/despesa**: cada operação é independente — "Gastei R$ 80 no mercado e R$ 50 de gasolina" vira duas operações de despesa separadas; receita e despesa na mesma frase nunca são somadas/subtraídas num valor líquido. Uma confirmação consolidada cobre todas as operações prontas de uma vez; uma operação cancelada não afeta as demais.

**Parcelamento e recorrência (limite de escopo explícito)**: compreendidos e apresentados ao usuário na confirmação, mas **nunca persistidos** — não existe hoje RPC/tabela de parcelamento nem de recorrência automática no backend. Essas operações ficam marcadas como `capabilityPending`, com uma mensagem honesta explicando a limitação, e nunca bloqueiam as demais operações do mesmo plano de seguir para confirmação.

**Transferência**: ao contrário do chat de uma única operação (que bloqueia `register_transfer` por decisão de produto, não técnica — `ALLOWED_CHAT_WRITE_INTENTS` em `UniChatPage.jsx`), o RPC atômico existente (`execute_confirmed_financial_action`) já suporta `transaction_type = 'transfer'` (confirmado em `supabase/migrations/20260712_008_atomic_financial_action.sql` e `20260716_009_...sql`). O módulo do plano chama a resolução/persistência diretamente, contornando apenas aquele allowlist específico do fluxo antigo — nunca altera a RPC nem o schema.

**Correções conversacionais**: um turno de acompanhamento como "Foi ontem", "Na verdade foram R$95", "Troca para Alimentação" ou "Não foi Nubank, foi Caixa" corrige a operação atual do plano pendente (`src/features/uni-conversation/financialPlanPresenter.js#parsePlanCorrectionOverrides`) usando apenas contas/categorias reais já carregadas — nunca inventa uma conta/categoria que não exista na lista.

**Confiança e esclarecimento**: `>= 0.90` (alta) segue para confirmação; `0.70–0.90` (intermediária) e `< 0.70` (baixa) pedem uma pergunta de esclarecimento específica (nunca genérica) — nunca lida em voz alta como número/percentual (a experiência de voz nunca lê ID, JSON ou confiança).

**Persistência**: uma operação por vez, pelo mesmo RPC atômico já existente — nunca em lote, nunca uma "transação fantasma" cobrindo várias operações de uma vez (não existe hoje um RPC atômico de lote; se uma operação falhar no meio da confirmação, as já confirmadas permanecem confirmadas e o plano fica `partial`, nunca promete que tudo foi registrado quando não foi).

**Payload enviado**: frase do usuário (até 240 caracteres), um resumo textual curto do plano pendente (para correções, nunca o plano inteiro serializado), até 12 contas e 12 categorias pessoais (`{id, name}`), data de referência e timezone. Nunca saldo, histórico de transações, CPF, e-mail, telefone ou contexto Business.

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
