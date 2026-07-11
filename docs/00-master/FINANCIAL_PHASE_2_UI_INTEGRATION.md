# Financial Phase 2 UI Integration

Este documento registra a conexao do nucleo financeiro com a pagina Financeiro existente, sem alterar o CSS ou o desenho estrutural da experiencia.

## Status

- Hooks e CRUD implementados no frontend.
- Modo demo continua funcional sem Supabase.
- Pagina Financeiro preserva o visual e os mocks de clareza, projecao e leitura da Uni.
- Dashboard e outras paginas permanecem inalterados.
- Open Finance nao foi implementado.
- Nenhuma migration foi executada remotamente nesta etapa.
- Producao nao foi acessada.

## Pre-requisitos para dados reais

O CRUD real depende destas migrations, nesta ordem:

1. `20260710_001_auth_profiles_workspaces.sql`;
2. `20260711_002_financial_core.sql`;
3. `20260711_003_financial_catalog_seeds.sql`.

As migrations 002 e 003 devem ser aplicadas e validadas primeiro no `UniFlow DEV`. Sem as tabelas financeiras, o modo Supabase exibira uma falha humana e nao tentara usar producao ou contornar RLS.

## Fluxo de dados

```text
FinanceiroPage
  -> SessionContext.workspace.id
  -> useAccounts / useCategories / useTransactions
  -> accountService / categoryService / transactionService
  -> Supabase com sessao autenticada e RLS
```

A pagina nunca recebe um workspace arbitrario de formulario ou URL. Quando Supabase esta configurado, os hooks usam apenas `workspace.id`, carregado a partir de `profiles.current_workspace_id` pelo `SessionContext`.

## Hooks

### `useAccounts`

Responsabilidades:

- carregar contas do workspace atual;
- carregar o catalogo global de tipos de conta;
- criar e atualizar contas;
- excluir contas quando RLS e integridade permitirem;
- manter estado local no modo demo.

### `useCategories`

Responsabilidades:

- combinar categorias globais e categorias do workspace;
- criar e atualizar categorias personalizadas;
- excluir apenas categorias customizadas permitidas;
- manter o catalogo global imutavel na interface;
- manter estado local no modo demo.

### `useTransactions`

Responsabilidades:

- carregar os lancamentos recentes do workspace;
- criar entradas, despesas, transferencias e ajustes;
- atualizar e excluir lancamentos conforme RLS;
- manter estado local no modo demo.

Os hooks ignoram respostas antigas quando o workspace muda durante uma leitura. Eles retornam estados de carregamento, mutacao e erro sem expor chaves ou credenciais.

## Integracao visual

O layout permanente da pagina foi preservado.

Na secao `Movimentacoes recentes`, tres acoes discretas abrem os componentes UI existentes:

- Contas;
- Categorias;
- Novo lancamento.

Os formularios usam `Modal`, `Input`, `Button` e classes utilitarias ja existentes. Nenhum CSS, token ou componente base foi alterado.

## CRUD de contas

Campos desta fase:

- nome;
- tipo de conta;
- saldo atual.

Contas podem ser criadas, editadas e arquivadas. O arquivamento define `is_active = false`, remove a conta das listas ativas e preserva o historico relacionado.

## CRUD de categorias

Campos desta fase:

- nome;
- tipo: entrada, despesa ou transferencia.

Categorias globais aparecem como catalogo UniFlow e nao recebem controles de edicao. Categorias personalizadas podem ser criadas, editadas e excluidas conforme papel e autoria.

## CRUD de lancamentos

Campos desta fase:

- tipo;
- conta de origem;
- conta de destino para transferencia;
- categoria;
- descricao;
- valor;
- data.

O frontend cria apenas `source_type = manual` por meio dos defaults e grants do banco. Campos externos, provider e payload bruto nao fazem parte do formulario.

## Modo demo

Quando Supabase nao esta configurado:

- os hooks iniciam com `financialCrud.mock.js`;
- criar, editar e excluir atualiza apenas o estado React local;
- recarregar a pagina restaura os mocks;
- nenhuma chamada remota e realizada;
- a experiencia de clareza financeira continua usando os mocks existentes.

## Supabase e RLS

Quando Supabase esta configurado:

- services filtram por `workspace_id`;
- RLS valida membership e papel;
- viewer continua somente leitura no banco;
- owner/admin/member seguem as policies da migration;
- erros tecnicos do Postgres nao sao exibidos diretamente ao usuario;
- o frontend nunca usa `service_role`.

Os botoes podem permanecer visiveis para um viewer nesta fase, mas qualquer escrita sera bloqueada por RLS e retornara mensagem segura. A adaptacao visual por papel fica para quando o contexto expuser a role da membership atual.

## Saldo

Criar ou editar uma transacao ainda nao recalcula `accounts.current_balance` no cliente. Essa operacao precisa de RPC ou funcao transacional futura para impedir divergencias e concorrencia.

O saldo informado no CRUD de conta e tratado como valor inicial/manual desta fase, nao como conciliacao bancaria.

## Testes basicos

`src/hooks/financialHooks.test.js` usa `node:test` e `react-dom/server`, sem dependencia nova.

Cobertura atual:

- estado inicial de `useAccounts` no fallback;
- estado inicial de `useCategories` no fallback;
- estado inicial de `useTransactions` no fallback;
- transicoes imutaveis de inserir, atualizar e remover registros locais.

Comando:

```bash
npm test
```

Testes autenticados de CRUD e RLS devem ser adicionados somente depois que as migrations 002 e 003 forem aplicadas no `UniFlow DEV`.

## Limites desta fase

- sem Open Finance;
- sem importacao de arquivo;
- sem conciliacao;
- sem recorrencia automatica;
- sem calculo transacional de saldo;
- sem paginacao visual completa;
- sem sincronizacao em tempo real;
- sem alteracao dos cards de clareza e projecao;
- sem persistencia do CRUD demo apos recarregar.

## Proxima validacao segura

1. Aplicar 002 e 003 somente no `UniFlow DEV`.
2. Executar `financial_core_validation.sql`.
3. Validar CRUD com owner autenticado.
4. Validar bloqueios para viewer e outro workspace.
5. Confirmar erros de FK na exclusao de conta com transacoes.
6. Somente depois planejar RPC de lancamento e atualizacao de saldo.
