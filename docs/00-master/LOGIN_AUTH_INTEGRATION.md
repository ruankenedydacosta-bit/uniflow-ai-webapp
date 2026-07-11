# Login Auth Integration

Este documento registra a primeira integracao real do Login da UniFlow AI com Supabase Auth.

## Objetivo

Conectar o Login existente ao Supabase Auth sem alterar sua identidade visual, sem conectar o Onboarding e sem substituir os mocks dos modulos.

A integracao usa somente o client publico configurado por:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Nenhuma `service_role` deve ser usada no frontend.

## Arquitetura

### `authService.js`

Responsavel por encapsular:

- `signInWithPassword`;
- `signOut`;
- `getSession`;
- `onAuthStateChange`;
- leitura do profile autenticado;
- respostas controladas quando Supabase nao esta configurado.

As paginas nao chamam `supabase.auth` diretamente.

### `workspaceService.js`

Responsavel por carregar:

- workspaces permitidos por RLS;
- workspace atual indicado pelo profile ou primeiro workspace permitido;
- subscription ativa/trialing/past_due do workspace, quando existir.

Sem subscription, o access usa fallback coerente com o tipo do workspace: `free` para pessoal e `business` para empresarial.

### `SessionContext.jsx`

Fonte central da sessao autenticada. Mantem:

- `session`;
- `user`;
- `profile`;
- `workspace`;
- `subscription`;
- status de carregamento;
- erro controlado;
- indicador de profile ausente;
- `signInWithPassword`;
- `signOut`;
- recuperacao e atualizacao da sessao.

O provider tambem sincroniza `AccessContext` com `user_mode`, tipo do workspace e plano real/fallback. Isso preserva o filtro atual de navegacao sem migrar os dados dos modulos.

Ordem dos providers:

```text
AccessProvider
  BrowserRouter
    SessionProvider
      AppContent
```

## Recuperacao de sessao

Ao iniciar o app com Supabase configurado:

1. `getSession` recupera a sessao persistida.
2. `onAuthStateChange` acompanha login, logout e renovacao de token.
3. O profile do usuario e carregado por RLS.
4. O workspace atual e carregado por membership.
5. A subscription e consultada quando existe workspace.
6. `SessionContext` e `AccessContext` sao atualizados.

Callbacks do listener sao processados depois do retorno do evento de Auth para evitar consultas concorrentes dentro de `onAuthStateChange`. Sincronizacoes antigas sao descartadas em troca de sessao ou remount do `React.StrictMode`.

## Fluxo com Supabase ativo

### Sem sessao

- Rotas internas redirecionam para `/login`.
- O Login usa email e senha com `signInWithPassword`.
- Erros sao apresentados em linguagem generica, sem expor detalhes tecnicos.

### Com sessao e profile

- Profile e workspace sao carregados.
- O access real e derivado.
- O usuario e redirecionado para `/dashboard`.

### Com sessao e sem profile

- O estado `profileMissing` e ativado.
- O usuario e redirecionado para `/onboarding`.
- O Onboarding continua mockado nesta etapa e nao grava dados reais.

### Sessao persistida

- Abrir novamente o app recupera a sessao antes de renderizar rotas privadas.
- Um Loader existente evita exibir o AppShell antes da verificacao.

## Rotas protegidas

Com Supabase configurado:

- rota privada sem sessao -> `/login`;
- sessao sem profile -> `/onboarding`;
- sessao com profile -> rota solicitada;
- `/login` com sessao/profile validos -> `/dashboard`;
- `/onboarding` sem sessao -> `/login`;
- `/onboarding` com profile existente -> `/dashboard`.

As regras de modo, plano e workspace continuam sendo aplicadas depois da verificacao de Auth.

## Modo demo

Quando `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` nao existe:

- nenhum client Supabase e criado;
- `SessionContext` entra em modo demo;
- rotas continuam acessiveis como antes;
- o Login preserva o conteudo e os botoes `Entrar no demo` e `Comecar agora`;
- `DEFAULT_DEMO_ACCESS` continua ativo;
- nenhum mock de modulo e substituido.

## Login visual

Nenhum CSS do Login foi alterado. A pagina reutiliza o mesmo layout, Card e botoes.

Quando Supabase esta ativo, o card existente exibe os componentes base `Input` para email e senha. Quando nao esta configurado, o conteudo mockado anterior permanece inalterado.

## SignOut

`signOut` esta disponivel em `SessionContext` e:

1. encerra a sessao no Supabase;
2. limpa o estado local da sessao;
3. permite que os guards retornem o usuario ao Login.

Nenhum novo controle visual de logout foi adicionado nesta etapa.

## Logs

Logs de ciclo de Auth usam `console.info` somente quando `import.meta.env.DEV` e verdadeiro.

Eles nao imprimem:

- email;
- senha;
- token;
- chave;
- UUID do usuario;
- dados do profile ou workspace.

## Seguranca

- RLS continua sendo a fonte de autorizacao dos dados.
- A anon/publishable key nao substitui policies.
- Credenciais nunca sao salvas pelo codigo da pagina.
- Mensagens tecnicas do Supabase nao sao exibidas diretamente ao usuario.
- Nenhuma tabela ou migration foi criada nesta integracao.
- Producao nao foi acessada durante a implementacao.

## Limites desta etapa

- Onboarding continua mockado.
- Cadastro real ainda nao foi integrado.
- Recuperacao de senha ainda nao foi integrada.
- Dados de Dashboard, Financeiro, Objetivos e demais modulos continuam mockados.
- O controle visual de signOut sera conectado ao perfil em etapa posterior.
- Testes de roles admin, member e viewer continuam pendentes.

## Validacao recomendada no UniFlow DEV

1. Abrir `/login` com as variaveis DEV configuradas.
2. Entrar com usuario de teste existente.
3. Confirmar redirecionamento para `/dashboard` quando o profile existe.
4. Recarregar a pagina e confirmar recuperacao da sessao.
5. Confirmar que a Sidebar reflete o workspace pessoal do usuario de teste.
6. Validar `signOut` por um consumidor controlado do `SessionContext`.
7. Remover temporariamente as variaveis e confirmar o modo demo.

Nunca executar essa validacao contra producao.
