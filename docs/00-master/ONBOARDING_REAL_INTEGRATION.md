# Onboarding Real Integration

Este documento registra a integracao do Onboarding existente com Supabase no ambiente `UniFlow DEV`.

## Objetivo

Persistir a escolha inicial do usuario sem alterar o visual da pagina, sem conectar os modulos mockados e sem criar novas tabelas ou migrations.

O Onboarding continua usando os tres cards existentes:

- Minha vida financeira;
- Minha empresa;
- Os dois.

Nenhum CSS, componente do Design System ou texto estrutural da experiencia foi redesenhado.

## Services

### `profileService.js`

Centraliza:

- leitura do profile autenticado;
- atualizacao segura dos campos permitidos;
- respostas controladas sem Supabase;
- tratamento de usuario ausente.

Contas autenticadas criadas antes do trigger podem não possuir a linha em
`profiles`. A migration `20260712_006_ensure_authenticated_profile.sql`
adiciona a RPC `ensure_own_profile`, que cria exclusivamente o profile do
próprio `auth.uid()` sem conceder `INSERT` direto ao frontend. O onboarding usa
essa recuperação somente quando a leitura inicial não encontra o profile.

Campos usados nesta etapa:

- `full_name`;
- `phone`;
- `user_mode`;
- `current_workspace_id`;
- `onboarding_completed`.

O cliente nao cria profiles. O registro deve existir pelo trigger validado de `auth.users`. Se ele estiver ausente, o fluxo para com erro controlado e nao tenta contornar RLS.

### `onboardingService.js`

Orquestra o fluxo completo:

1. Confirma Supabase e usuario autenticado.
2. Carrega o profile existente.
3. Resolve nome e telefone sem adicionar campos visuais.
4. Atualiza `full_name`, `phone` e `user_mode`.
5. Procura workspace compativel ja acessivel ao usuario.
6. Reutiliza o workspace ou cria um novo.
7. Atualiza `current_workspace_id` e `onboarding_completed`.
8. Retorna profile e workspace finais.

As paginas nao executam queries Supabase diretamente.

## Origem de nome e telefone

Como o visual nao foi alterado, os dados sao resolvidos nesta ordem.

Nome:

1. valor fornecido ao service;
2. `profiles.full_name`;
3. `user_metadata.full_name`;
4. `user_metadata.name`;
5. nome legivel derivado da parte local do email;
6. fallback `UniFlow`.

Telefone:

1. valor fornecido ao service;
2. `profiles.phone`;
3. telefone do usuario Auth;
4. `user_metadata.phone`;
5. `null`.

Nenhuma credencial ou dado pessoal e registrado em logs.

## Workspace padrao

Mapeamento atual:

| Escolha | `user_mode` | Workspace padrao |
| --- | --- | --- |
| Minha vida financeira | `personal` | `personal` |
| Minha empresa | `business` | `business` |
| Os dois | `both` | `business` |

O nome usa o nome resolvido do usuario:

- pessoal: `<Nome> - Pessoal`;
- empresarial: `<Nome> - Empresa`.

No modo `both`, esta etapa prepara o workspace empresarial como contexto inicial. A criacao adicional do workspace pessoal fica para uma evolucao controlada do gerenciamento de espacos.

### Leitura do workspace recém-criado

A migration `20260712_007_workspace_owner_select_policy.sql` corrige o retorno
do `INSERT ... RETURNING` usado pelo onboarding. A policy de SELECT passa a
permitir o proprietário por `owner_user_id = auth.uid()` ou membros ativos por
`is_workspace_member(id)`, sem abrir leitura entre workspaces.

O `owner_user_id` enviado na criação e usado no rollback agora vem
exclusivamente da sessão Supabase, não de parâmetro externo.

## Idempotencia e retomada

O onboarding usa varias operacoes protegidas por RLS, mas ainda nao existe uma RPC transacional para agrupa-las.

Para tornar uma nova tentativa segura:

- uma atualizacao de profile que afete zero linhas retorna erro controlado e interrompe o fluxo antes de criar recursos;
- um workspace atual compativel e reutilizado;
- caso nao exista, o service procura workspace do mesmo tipo pertencente ao usuario;
- se necessario, reutiliza outro workspace do mesmo tipo ao qual o usuario tenha membership;
- somente cria um workspace quando nenhum compativel existe;
- `onboarding_completed` e atualizado apenas depois de existir workspace valido.

Se a atualizacao final do profile falhar depois da criacao, o service remove somente o workspace criado por aquela tentativa, validando `id` e `owner_user_id`. Workspaces preexistentes ou reutilizados nunca entram nesse rollback. Se a limpeza tambem falhar, o fluxo retorna `ONBOARDING_ROLLBACK_FAILED` e nao redireciona o usuario.

Se a rede falhar depois da criacao do workspace e antes da atualizacao final do profile, a nova tentativa encontra e reutiliza esse workspace.

Cliques repetidos na mesma pagina sao bloqueados enquanto uma submissao esta em andamento. Concorrencia entre abas diferentes ainda depende de uma constraint/RPC futura e nao sera resolvida alterando a migration aplicada nesta etapa.

## Atualizacao da sessao

Depois de concluir:

1. `OnboardingPage` chama `refreshSession`.
2. `SessionContext` recarrega profile, workspace e subscription.
3. `AccessContext` recebe modo, workspace e plano real/fallback.
4. O guard deixa de considerar o onboarding pendente.
5. O usuario segue para `/dashboard`.

Os guards agora usam `onboarding_completed`, nao apenas a existencia do profile. Isso e necessario porque o trigger cria o profile com onboarding incompleto.

## Modo demo

Sem Supabase configurado:

- nenhuma query e executada;
- os mesmos cards atualizam apenas `AccessContext`;
- `DEFAULT_DEMO_ACCESS` e os mocks continuam funcionando;
- o usuario segue para `/dashboard` como antes;
- o badge continua indicando `Onboarding mockado`.

## Supabase ativo

Com sessao autenticada:

- o badge existente indica onboarding seguro e estados curtos de processamento;
- a escolha persiste profile e workspace;
- o trigger da migration cria a membership owner ativa;
- o contexto e recarregado;
- o usuario segue para o Dashboard.

Se nao houver sessao, o guard envia para `/login`. Se o profile nao existir, o Onboarding permanece na pagina com erro controlado, pois o frontend nao possui permissao para inserir profiles.

## Tratamento de falhas

- Supabase ausente: fallback demo.
- Usuario ausente: pede novo login.
- Profile ausente: tenta garantir de forma segura o profile do próprio usuário;
  se a RPC falhar, interrompe sem criar workspace órfão.
- Profile atualizado com zero linhas: erro controlado antes da criacao do workspace.
- Workspace existente: reutiliza.
- Falha ao concluir profile depois de criar workspace: remove a criacao da tentativa atual.
- Falha de rede: mensagem curta no badge e possibilidade de tentar novamente.
- Falha ao atualizar a sessao: nao redireciona ate recuperar o contexto.
- Duplo clique: ignorado enquanto a operacao esta ativa.

## Logs

Logs usam `console.info` somente quando `import.meta.env.DEV` e verdadeiro.

Eles registram apenas eventos operacionais, como workspace criado/reutilizado e onboarding concluido. Nao registram email, telefone, UUID, token, chave ou payload do profile.

## Seguranca

- Todas as operacoes usam a sessao autenticada e a anon/publishable key.
- RLS continua determinando acesso e escrita.
- `owner_user_id` recebe somente o ID do usuario autenticado.
- Nenhuma `service_role` e usada no frontend.
- Nenhuma migration foi criada ou alterada.
- Producao nao foi acessada nesta implementacao.

## Limites desta etapa

- Dashboard e modulos continuam mockados.
- Subscription nao e criada pelo onboarding.
- Cadastro e recuperacao de senha continuam fora do escopo.
- Modo `both` ainda cria apenas um workspace padrao.
- Nao existe RPC transacional para o onboarding.
- Nao existe interface para editar nome e telefone durante esta etapa.

## Preferencia de comunicacao futura

A Personalidade V1 define que o usuario deve conhecer brevemente a Uni e,
depois, poder escolher um tom inicial: `balanced`, `direct`, `warm` ou
`strategic`.

Essa escolha nao foi adicionada ao fluxo atual. Quando entrar:

- sera curta, opcional e posterior a apresentacao da identidade da Uni;
- usara `balanced` quando o usuario pular;
- nao alterara `user_mode`, plano ou workspace;
- podera ser modificada a qualquer momento em Configuracoes;
- permanecera separada do mapa cognitivo inferido;
- nao podera remover as regras centrais descritas em
  `UNI_PERSONALITY_V1.md`.

Nenhum dado de personalidade foi persistido nesta etapa.

## Validacao recomendada no UniFlow DEV

1. Aplicar e revisar a migration 006 somente no UniFlow DEV.
2. Usar um usuário autenticado sem profile para validar a recuperação segura.
3. Repetir com um usuário com profile e `onboarding_completed = false`.
4. Entrar pelo Login real.
5. Confirmar redirecionamento para `/onboarding`.
6. Escolher um modo.
7. Confirmar profile atualizado.
8. Confirmar workspace criado ou reutilizado.
9. Confirmar membership owner ativa.
10. Confirmar `current_workspace_id` e `onboarding_completed = true`.
11. Confirmar redirecionamento para `/dashboard`.
12. Repetir em modo demo sem variáveis Supabase.

Nunca executar essa validacao contra producao.
