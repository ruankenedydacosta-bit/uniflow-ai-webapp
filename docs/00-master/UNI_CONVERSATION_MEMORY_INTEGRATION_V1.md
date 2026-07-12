# Uni Conversation Memory Integration V1

## Objetivo

Esta V1 permite que a conversa financeira use preferências explícitas ou
confirmadas para reduzir repetição sem retirar controle do usuário. A memória
melhora interpretação; ela não executa, confirma ou decide ações financeiras.

## Fluxo

1. O parser interpreta a frase normalmente.
2. `useConversationMemory` carrega memórias do titular pelo
   `uniMemoryService` e `SessionContext`.
3. `conversationMemoryContext` remove metadados operacionais e tipos proibidos.
4. `explicitMemoryResolver` aplica somente preferências compatíveis.
5. Conta, categoria, valor e data passam pela validação financeira existente.
6. A interface informa discretamente quando uma preferência influenciou.
7. A ação continua exigindo confirmação explícita antes de persistir.

## Memórias permitidas

- `merchant_category_mapping`: associa descrição específica a categoria.
- `category_preference`: sugere categoria compatível com o tipo da movimentação.
- `account_preference`: sugere conta ativa em contexto compatível.
- `conversation_preference`: altera somente a redação/personality profile.
- `financial_goal_context`: permanece contexto informativo e não muda payload.

São ignoradas memórias `rejected`, `expired`, `superseded`, pertencentes a
outro titular ou de tipos reservados ao backend. Candidate só entra quando sua
origem representa informação explícita do usuário.

## Prioridade e invariantes

Uma preferência explícita válida pode complementar o resolvedor genérico.
Conta arquivada nunca é aplicada. Conflitos relevantes não são sobrescritos.

Memória nunca altera:

- valor;
- data;
- workspace;
- tipo financeiro sem validação;
- necessidade de confirmação;
- decisão final do usuário.

## Conflitos

Quando frase e memória apontam para opções diferentes, a Uni apresenta as duas
alternativas. O usuário escolhe a opção desta ocasião. Nenhuma memória é
alterada silenciosamente.

## Correção e consentimento

Uma correção de categoria ou conta vale imediatamente apenas para a ação atual.
Quando a descrição é específica e não existe duplicidade, a Uni pode perguntar
se deve lembrar.

- **Lembrar:** persiste payload explícito mínimo via `uniMemoryService`.
- **Só desta vez:** preserva a correção atual sem persistir.
- **Cancelar:** encerra a sugestão sem desfazer a correção já aplicada.

Não são armazenados frase completa, valor, data, payload bancário bruto,
tokens, áudio ou transcrição.

## Supabase

O hook usa exclusivamente `SessionContext` e não recebe `user_id` ou
`workspace_id` do caller. RLS continua limitando a memória ao titular. Escrita
usa somente `createExplicitMemoryCandidate` após clique em “Lembrar”. Tipos
inferidos permanecem bloqueados no frontend.

Falha de carregamento ou persistência produz mensagem humana e não interrompe
a conversa nem a correção atual.

## Modo demo

O demo inicia com um conjunto pequeno de preferências locais. “Lembrar” adiciona
memória apenas ao estado da sessão; recarregar restaura os mocks. Nenhuma chamada
Supabase é executada sem configuração.

## Direitos do usuário

Memórias continuam revisáveis, corrigíveis, rejeitáveis e removíveis pelas
fronteiras já definidas. Um gerenciador completo de memórias permanece futuro.

## Limites

- regras locais e determinísticas;
- sem LLM, OpenAI, ElevenLabs ou API externa;
- sem persistência automática de inferências;
- sem gerenciamento completo de memória na UI;
- sem alteração de migrations;
- `financial_goal_context` ainda não produz orientação visual dedicada;
- voz reutiliza o parser atual, sem IA de voz externa.
