# Uni Conversation Financial Actions V1

## Objetivo

Esta V1 conecta a interpretação determinística de linguagem financeira da Uni ao domínio financeiro existente. A conversa passa a ser a experiência principal para registrar movimentações, enquanto formulários permanecem como fallback para correções e exceções.

O fluxo opera por texto e pela transcrição final do microfone, ambos usando o
mesmo `sendMessage`. LLM e serviços externos não fazem parte desta etapa.

## Fluxo oficial

1. **Interpretar:** `financialParser` classifica a intenção e extrai entidades candidatas.
2. **Contextualizar:** preferências explícitas ou confirmadas podem complementar categoria, conta e tom, sem alterar valor ou data.
3. **Validar:** a camada `uni-conversation` revalida valor, tipo, conta, categoria, descrição e data contra os dados atuais do workspace. Uma conta mencionada e inexistente pode ser preparada, sem escrita, para criação após a confirmação.
4. **Esclarecer:** quando faltar informação ou houver conflito de memória, a Uni pergunta pelo dado necessário.
5. **Confirmar:** quando os dados estiverem completos, a Uni apresenta um resumo antes de qualquer escrita.
6. **Executar:** somente o botão `Confirmar` chama `saveTransaction` do hook financeiro.
7. **Responder:** o resultado é comunicado com o perfil de personalidade resolvido localmente.

Nenhuma entidade extraída pelo parser é considerada confiável sem validação de domínio.

## Estados

- `idle`: sem ação financeira ativa.
- `interpreting`: entrada em interpretação.
- `needs_clarification`: falta um dado ou existe ambiguidade.
- `awaiting_confirmation`: payload validado aguardando consentimento explícito.
- `executing`: criação em andamento pelo hook financeiro.
- `completed`: lançamento confirmado pelo domínio.
- `error`: falha controlada sem exposição de detalhes técnicos.
- `canceled`: fluxo encerrado sem escrita.

## Segurança e workspace

- `UniAIPage` obtém o workspace exclusivamente do `SessionContext`.
- `useTransactions` continua responsável por vincular a operação ao `workspace.id`.
- A ação conversacional não recebe nem envia `workspace_id` arbitrário no payload.
- Contas arquivadas são bloqueadas para novos lançamentos.
- Categorias precisam existir, estar ativas e ser compatíveis com o tipo da movimentação.
- Não existe criação de lançamento sem confirmação na V1.

## Contas e categorias

A resolução de contas considera nome e instituição por identidade normalizada
exata, sem correspondência vaga. Uma conta ativa única é reutilizada; uma conta
inexistente é proposta e criada somente após confirmação; ambiguidade exige
escolha; conta arquivada exige reativação ou criação nova explícita. O contrato
completo está em `UNI_AUTOMATIC_ACCOUNT_RESOLUTION_V1.md`.

A categoria inferida é comparada ao catálogo global e personalizado já carregado. A Uni pode sugerir uma categoria existente por aproximação, mas não cria categorias automaticamente nesta etapa. Se não houver correspondência segura, o usuário escolhe uma categoria existente.

## Correção e campos ausentes

Campos ausentes não abrem um formulário completo automaticamente. Exemplo:

> Usuário: "Gastei 40 reais."
>
> Uni: "Em qual conta você fez esse pagamento?"

O formulário compacto de correção aparece apenas quando o usuário solicita `Corrigir` ou quando um campo específico precisa ser esclarecido.

## Personalidade

As respostas usam `personalityResolver` e `personalityPromptBuilder` apenas como regras locais. Os perfis `balanced`, `direct`, `warm` e `strategic` alteram a redação, mas nunca modificam a ação financeira, o payload ou as validações.

Não há chamada de IA externa, ElevenLabs, OpenAI ou outro LLM nesta V1.

## Supabase e modo demo

Com Supabase configurado, a confirmação usa `useAccounts` quando houver
provisionamento e `useTransactions` para o lançamento. Ambos respeitam RLS e o
workspace autenticado. O estado dos hooks é atualizado imediatamente após cada
resposta do service.

Sem Supabase, os mesmos hooks mantêm fallback local editável. A confirmação
adiciona conta e lançamento à sessão atual, sem persistência após recarregar.

## Memória explícita

A memória entra depois do parser e antes da validação da ação. Ela pode sugerir
categoria, conta ativa ou perfil de redação. Conflitos exigem escolha; correções
só viram memória após “Lembrar”. “Só desta vez” e “Cancelar” não persistem.

Memória não altera amount, date, workspace ou a confirmação obrigatória.

## Limites da V1

- Parser baseado em regras e palavras-chave.
- Ações operacionais limitadas a lançamentos financeiros suportados pelo domínio atual.
- Transferências podem exigir esclarecimento de conta de origem e destino.
- Sem categorização automática nova.
- Sem execução por voz nesta integração inicial.
- Sem LLM, Open Finance ou APIs externas.

## Evolução futura

1. Persistir preferência de personalidade e mapa cognitivo.
2. Ampliar esclarecimentos sequenciais e correções conversacionais.
3. Evoluir a entrada de voz, já integrada ao mesmo contrato de interpretação e
   confirmação visual, sem criar confirmação falada automática.
4. Conectar LLM como camada de interpretação, preservando validação determinística.
5. Reconciliar ações conversacionais com dados automáticos de Open Finance.
