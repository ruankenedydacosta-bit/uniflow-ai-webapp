# Supabase RLS Testing

Este documento define o roteiro seguro para validar as policies RLS da UniFlow AI com um usuario autenticado.

O teste deve ser executado somente contra o projeto Supabase `UniFlow DEV`. Ele nao conecta Login ou Onboarding, nao substitui mocks e nao deve usar credenciais de producao.

## Status da validacao

- Data: `2026-07-10`.
- Ambiente: Supabase `UniFlow DEV`.
- Resultado: `8/8` testes aprovados.
- Cliente: `supabase-js` com usuario autenticado.
- Chave: anon/publishable do ambiente DEV.
- `service_role`: nao utilizada.
- Producao: sem alteracoes.

Foram confirmados profile proprio, workspaces permitidos, membership owner ativa e plans. A leitura de `site_leads` e a escrita em `subscriptions` permaneceram bloqueadas, e o `signOut` foi concluido.

## Por que usar um cliente autenticado

O SQL Editor normalmente executa como `postgres`, role que pode ignorar RLS. Por isso, uma consulta bem-sucedida no editor nao prova que as policies funcionam para usuarios reais.

A validacao principal usa `supabase-js`, a chave publica do projeto DEV e uma sessao criada por `signInWithPassword`. Consultas como `postgres` ou `service_role` nao contam como validacao de acesso do usuario.

O roteiro complementar de simulacao de claims esta em:

`supabase/tests/rls_validation.sql`

## Variaveis temporarias

O script le somente estas variaveis do processo:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_TEST_EMAIL
SUPABASE_TEST_PASSWORD
```

Use valores exclusivamente do `UniFlow DEV`. O arquivo `.env.local` pode ser usado apenas localmente porque ja e ignorado pelo Git; nunca versione esse arquivo nem salve a senha em documentacao, prints, chat ou Obsidian.

Com as quatro variaveis definidas em `.env.local`, o comando recomendado e:

```bash
node --env-file=.env.local scripts/supabase/test-rls.js
```

O Node carrega esse arquivo apenas para o processo do teste. O script continua recusando chaves `service_role` ou `sb_secret_` detectaveis.

Como alternativa, exporte URL e chave publica na sessao local do terminal:

```bash
export VITE_SUPABASE_URL="URL_DO_UNIFLOW_DEV"
export VITE_SUPABASE_ANON_KEY="CHAVE_PUBLICA_DO_UNIFLOW_DEV"
```

Depois execute com as credenciais temporarias do usuario de teste:

```bash
SUPABASE_TEST_EMAIL="..." SUPABASE_TEST_PASSWORD="..." npm run supabase:test-rls
```

Use esse formato somente em um terminal pessoal e controlado, considerando que comandos inline podem permanecer no historico local. Ao terminar, encerre a sessao do terminal ou remova as variaveis exportadas:

```bash
unset VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY SUPABASE_TEST_EMAIL SUPABASE_TEST_PASSWORD
```

## Checagem antes de rodar

- [ ] Confirmar no Dashboard que a URL pertence ao `UniFlow DEV`.
- [ ] Confirmar que a chave e `anon` legada ou publishable key.
- [ ] Confirmar que o usuario de teste possui profile e workspace pessoal.
- [ ] Confirmar que sua membership e `owner` e `active`.
- [ ] Confirmar que nenhuma variavel aponta para producao.
- [ ] Fechar qualquer terminal compartilhado ou gravacao de tela.

O script nao consegue inferir pelo nome do projeto se uma URL aponta para DEV ou producao. Essa conferencia manual e obrigatoria.

## Chaves Supabase

### Anon key

Chave publica legada usada por clientes web. Ela identifica inicialmente a role `anon`; depois do login, o JWT do usuario autenticado passa a determinar o acesso. Nao ignora RLS.

### Publishable key

Formato publico mais recente, normalmente iniciado por `sb_publishable_`. Tem finalidade de cliente semelhante a anon key e tambem depende de Auth e RLS para proteger dados.

### Service role ou secret key

Chave exclusiva de backend administrativo. Pode ignorar RLS e nunca deve aparecer no frontend ou neste teste. O script interrompe antes da conexao quando detecta `sb_secret_` ou um JWT com role `service_role`.

## Testes cobertos

1. Autenticacao por email e senha do usuario de teste.
2. Leitura somente do proprio profile.
3. Leitura dos workspaces permitidos por membership ativa.
4. Leitura das memberships do workspace e confirmacao do owner ativo.
5. Leitura dos quatro plans ativos.
6. Bloqueio ou resultado vazio ao tentar ler `site_leads`.
7. Bloqueio da tentativa de escrita em `subscriptions`.
8. `signOut` ao final, inclusive depois de falhas intermediarias.

Qualquer falha critica resulta em exit code `1`.

## Resultados esperados

- O profile retornado possui o mesmo `id` da sessao autenticada.
- Pelo menos um workspace fica visivel para o usuario owner.
- A membership owner ativa e encontrada.
- `free`, `pro`, `business` e `enterprise` ficam visiveis como plans ativos.
- `site_leads` retorna permission denied ou zero linhas.
- A escrita em `subscriptions` retorna permission denied/RLS.
- A sessao e encerrada com sucesso.

Se a escrita em `subscriptions` for aceita, o script falha e informa o UUID gerado. Ele nao apaga o registro automaticamente. Use o bloco de limpeza de `rls_validation.sql` para localizar o registro e remova-o manualmente somente no DEV depois de revisar a falha.

## Execucao sem configuracao

Se qualquer variavel estiver ausente, o script:

- informa apenas o nome da variavel ausente;
- nao imprime senha nem chave;
- nao cria o client;
- nao inicia conexao;
- encerra com exit code `1`.

## Limites desta etapa

Este primeiro script valida o usuario owner ja preparado. Cenarios com segundo usuario, ausencia de membership e roles admin/member/viewer continuam no roteiro manual e devem ser automatizados apenas depois que fixtures seguras e descartaveis forem definidas.

Nenhum resultado com emails, senhas, chaves, tokens ou UUIDs de usuarios deve ser registrado no Obsidian.
