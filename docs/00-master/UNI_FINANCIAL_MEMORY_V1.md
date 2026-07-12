# Uni Financial Memory V1

## Objetivo

A Memória Financeira V1 permite que a Uni reconheça padrões úteis de forma determinística, explicável e controlada pelo usuário. Ela não usa LLM, voz, Open Finance real ou API externa.

A memória existe para reduzir esforço mental e alimentar futuramente o GPS Financeiro. Ela não deve vigiar o usuário, copiar todo o histórico ou transformar inferências em verdades silenciosas.

## Histórico, contexto e memória

### Histórico

O histórico é a fonte factual detalhada: contas, categorias e transações. Continua no domínio financeiro e não é duplicado integralmente nas tabelas de memória.

### Contexto

O contexto representa a situação recente de uma conversa ou decisão. É temporário, deve expirar quando deixar de ser útil e não inclui armazenamento indefinido da transcrição completa.

### Memória

Memória é um fato financeiro resumido, útil e rastreável. Cada memória possui tipo, chave, valor sanitizado, confiança, origem, período observado, evidências mínimas e estado de revisão.

Uma memória não substitui os registros que a originaram. Ela aponta para evidências suficientes para explicar por que o padrão foi sugerido.

## Tipos iniciais

- `category_preference`: categoria frequente no período analisado.
- `account_preference`: conta mais utilizada em lançamentos relevantes.
- `merchant_category_mapping`: associação corrigida explicitamente entre estabelecimento/descrição e categoria.
- `recurring_income`: possível receita recorrente.
- `recurring_expense`: possível despesa recorrente.
- `spending_pattern`: tendência, concentração ou mudança financeira observável.
- `financial_goal_context`: contexto temporário ou explícito ligado a um objetivo.
- `conversation_preference`: preferência de comunicação ou interação informada pelo usuário.

Não existem tipos para saúde, religião, política, diagnóstico emocional ou outros atributos sensíveis.

## Snapshot financeiro

`financialSnapshot.js` recebe contas, categorias e transações já autorizadas pelo domínio e produz um resumo imutável com:

- período analisado;
- receitas, despesas e fluxo líquido;
- quantidade de transações;
- totais e médias por categoria;
- totais por conta;
- descrições mais frequentes.

O snapshot não consulta Supabase e não inclui uma cópia do array de transações.

## Padrões detectados

### Recorrências

A recorrência considera em conjunto descrição semelhante, categoria, conta, tipo, valor aproximado e intervalo entre datas. O resultado informa frequência provável, confiança e IDs/datas usados como evidência.

Duas ocorrências podem gerar uma observação de baixa maturidade, mas a criação de candidato de memória exige pelo menos três ocorrências e confiança mínima.

### Mudanças de gastos

Períodos equivalentes são comparados para identificar aumento ou redução por categoria. A V1 também reconhece concentração de despesas e mudança da conta principal usada no período.

### Anomalias

As anomalias são sinais explicáveis, não diagnósticos:

- valor acima da média disponível da categoria;
- provável duplicidade;
- uso incomum de conta para uma descrição recorrente.

A linguagem deve convidar à conferência, sem culpa, medo ou alarmismo. Uma anomalia isolada não vira memória automaticamente.

## Confiança

Confiança varia de `0` a `1` e mede força das evidências disponíveis, não certeza absoluta.

- preferências explícitas e correções do usuário: confiança máxima na preferência informada;
- padrões inferidos: confiança calculada por quantidade, similaridade e regularidade;
- dados insuficientes: nenhum candidato inferido;
- contexto recente: confiança moderada e expiração obrigatória quando aplicável.

Baixa confiança deve ser comunicada como possibilidade. A Uni nunca apresenta um candidato como fato definitivo sem confirmação adequada.

## Resolução e contradições

As regras do `memoryResolver` são:

1. preferência explícita vence inferência não confirmada;
2. memória confirmada vence novo candidato automático;
3. valores contraditórios não são sobrescritos silenciosamente;
4. contradição com memória confirmada exige revisão;
5. evidência equivalente e mais recente pode atualizar confiança e data;
6. memória temporária expirada deixa de ser ativa;
7. o usuário pode confirmar, rejeitar ou remover sua própria memória.

## Explicabilidade

Toda sugestão contém uma explicação determinística. Exemplo:

> Percebi esse padrão porque ocorreram 3 lançamentos semelhantes, na mesma categoria, com aproximadamente 30 dias de intervalo.

A explicação usa somente evidências conhecidas. Não existe geração textual por IA externa nesta etapa.

## Persistência e migration 005

A migration local `20260711_005_uni_financial_memory.sql` prepara:

- `uni_financial_memories`: memória resumida, confiança, status, origem e retenção;
- `uni_memory_evidence`: referências mínimas a transações/contas, sem payload bancário bruto;
- constraints de tipos, estados, confiança, temporalidade e JSON seguro;
- unicidade ativa por workspace, usuário, tipo e chave;
- índices workspace-first e de expiração;
- triggers de proteção do frontend e `updated_at`;
- RLS por workspace.

A migration está apenas preparada localmente. Ela não foi aplicada no UniFlow DEV nem em produção.

## Policies e fronteira de escrita

- somente o titular com membership ativa pode ler suas memórias e evidências;
- owner, admin ou member podem inserir somente fatos próprios com origem explícita/correção;
- frontend não pode inserir memória confirmada nem candidato inferido automaticamente;
- frontend não recebe grant direto de update;
- usuário pode confirmar ou rejeitar apenas a própria memória por RPC controlada;
- usuário pode corrigir apenas uma memória explícita própria por RPC controlada;
- usuário pode remover a própria memória;
- evidências são somente leitura no frontend;
- candidatos automáticos e evidências futuras exigem backend seguro/service role;
- não existe policy privada com `USING (true)` nem escrita pública.

`uniMemoryService.js` mantém essa fronteira: deriva `user_id` da sessão Supabase, não envia confiança ou timestamps privilegiados, não persiste inferências automáticas e exige ação explícita para candidatos criados pelo usuário.

## Privacidade

Não entram na memória:

- áudio;
- transcrição completa indefinida;
- tokens, senhas, segredos, certificados ou chaves privadas;
- payload Open Finance bruto;
- dados de saúde, religião ou política;
- diagnóstico emocional;
- conteúdo sem relação necessária com o domínio financeiro.

O JSON é sanitizado no service e revalidado por constraint recursiva no banco. A profundidade, quantidade de itens e tamanho total são limitados. Evidências guardam referências opcionais e resumos mínimos, não cópias bancárias.

## Retenção

- contexto de conversa sugerido pela V1 expira em até 30 dias;
- padrões de gastos temporários expiram em até 90 dias;
- recorrências e preferências permanecem enquanto úteis, revisáveis e não rejeitadas;
- memórias rejeitadas ou superseded deixam de orientar a Uni;
- `expires_at` permite retenção específica por tipo e contexto;
- o usuário mantém direito de revisar, corrigir por nova informação explícita, rejeitar e apagar.

Uma política operacional de limpeza automática será definida antes da ativação do backend.

## Relação com o Mapa Cognitivo

A memória financeira registra fatos e preferências financeiras explicáveis. O Mapa Cognitivo adapta como a Uni comunica esses fatos. Ele não autoriza inferir atributos sensíveis nem alterar a matemática para combinar com o usuário.

Preferências de comunicação explicitamente informadas podem alimentar `conversation_preference`; diagnósticos emocionais e inferências invasivas permanecem proibidos.

## Open Finance futuro

Open Finance será uma fonte automática de contas e transações mediante consentimento revogável. Depois da normalização e conciliação, esses fatos poderão alimentar os mesmos analisadores.

Tokens, certificados e payloads brutos continuarão fora da memória. A geração automática de candidatos ocorrerá em Edge Functions/backend seguro, nunca diretamente no frontend.

## GPS Financeiro futuro

O GPS Financeiro poderá usar memórias confirmadas e padrões recentes para explicar:

- onde o usuário está;
- o que mudou;
- o que merece atenção;
- para onde está indo;
- qual próximo passo faz sentido.

Memória melhora contexto e continuidade, mas não decide pelo usuário nem substitui projeções financeiras formais.

## Limites da V1

- regras determinísticas e heurísticas simples;
- nenhuma integração com `UniAIPage`;
- nenhuma persistência automática;
- migration ainda não aplicada;
- nenhuma política de limpeza automatizada executando;
- nenhuma API externa, LLM, voz ou Open Finance real;
- sem aprendizagem estatística avançada;
- sem inferência de atributos sensíveis.

A próxima etapa segura é revisar estaticamente a migration, executar `uni_financial_memory_validation.sql` após aplicação somente no UniFlow DEV e validar RLS com cliente autenticado antes de integrar a memória à conversa.
