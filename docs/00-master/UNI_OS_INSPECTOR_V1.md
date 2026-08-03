# UNI OS Inspector V1

## Objetivo

O UNI OS Inspector V1 e uma interface interna de engenharia para visualizar a arquitetura cognitiva da Uni sem interferir no produto. Nesta versao, toda a pagina opera exclusivamente com um snapshot mockado, imutavel e sem conexao com o runtime real.

O Inspector existe para tornar o pipeline compreensivel antes da instrumentacao real. Ele nao e uma tela de usuario, nao participa de decisoes e nao altera o fluxo legado.

## Acesso

- Rota direta: `/dev/uni-os`.
- Disponivel somente quando `import.meta.env.DEV` e verdadeiro.
- Nao aparece na sidebar, em menus ou em botoes do aplicativo.
- Nao usa `SessionContext`, Supabase ou dados autenticados.

## Arquitetura

A pagina esta isolada em `src/pages/dev/uni-os` e possui quatro camadas:

1. `mocks`: snapshot estatico e profundamente congelado.
2. `hooks`: entrega local do mock e formatacao do horario.
3. `components`: cabecalho, timeline, painel de runtime e cards independentes.
4. `UNIOSInspectorPage`: composicao visual, sem regra cognitiva.

Nenhum componente importa o runtime, adapters, providers de memoria ou servicos do produto.

## Layout

### Topo

O cabecalho identifica a ferramenta e exibe os estados `Development Only`, `Shadow Mode` e `UNI OS v1`, alem do horario fixado no snapshot.

### Pipeline

A coluna esquerda representa, em ordem, as etapas:

1. Parser.
2. Context.
3. Memory.
4. Planning.
5. Reflection.
6. Security.
7. Permissions.
8. Cognitive.
9. Structured Response.
10. Communication.

O status e apenas visual. Nenhuma etapa e executada pelo Inspector.

### Cards

A area central apresenta um card para cada snapshot. Cada card mostra sinais compactos, pode expandir o JSON mockado e permite copiar esse JSON quando a Clipboard API esta disponivel.

Expandir, recolher ou copiar nao altera o mock. O objeto de runtime e profundamente imutavel.

### Runtime

O painel direito exibe metadados tecnicos simulados:

- versao e build;
- estado do pipeline;
- modo sombra;
- permissao de execucao;
- deep freeze;
- adapters representados;
- latencia simulada;
- feature flag.

## Responsividade

- Desktop: timeline, cards e runtime em tres colunas.
- Notebook: timeline e cards permanecem lado a lado; runtime ocupa a largura inferior.
- Tablet: pipeline vira uma faixa horizontal rolavel e os paineis sao empilhados.
- Larguras menores: cards e metricas usam uma coluna.

As animacoes respeitam `prefers-reduced-motion`.

## Runtime Integration

O Inspector consome `runUniOSRuntimeShadow()` exclusivamente em desenvolvimento. O runtime continua com a flag global desligada; o hook do Inspector solicita uma execucao explicita e isolada com entrada vazia, captura o snapshot pelo `observer` e respeita o descarte obrigatorio do resultado publico.

O fluxo legado nao recebe o retorno, nao consulta o Inspector e permanece como unica fonte de verdade. O Inspector nao envia contexto autenticado, dados de sessao ou informacoes financeiras para iniciar a leitura.

### Sanitizacao

Antes de chegar aos cards, cada snapshot e clonado, sanitizado e profundamente congelado. Chaves e valores relacionados a texto original, descricoes, emails, telefones, CPF, cartoes, contas, valores financeiros, tokens, JWT, IDs internos, segredos e `service_role` sao substituidos por `[REDACTED]`.

A sanitizacao nunca modifica o snapshot pertencente ao runtime. Os cards recebem apenas o view model derivado.

### Fallback

Quando o runtime falha de forma segura, fica indisponivel ou nao entrega snapshot ao `observer`, a interface usa automaticamente o mock V1. Nesse estado, o cabecalho exibe `Mock Runtime` e o painel identifica `Mock runtime snapshot`.

### Refresh

O botao `Refresh Runtime` solicita uma nova leitura sem alterar estado do produto. Em DEV, a mesma leitura ocorre automaticamente a cada dois segundos. O intervalo e cancelado ao desmontar a pagina, e respostas antigas sao invalidadas para evitar atualizacoes tardias ou vazamentos.

### Modo sombra

Todas as execucoes permanecem com `executionAllowed: false`, sem modelo cognitivo, texto, voz, persistencia ou APIs. Timeline, cards e painel de runtime representam somente snapshots sanitizados e telemetria tecnica.

## Mocks

O mock cobre todos os snapshots esperados, mantem `executionAllowed: false`, `shadowMode: true` e `featureFlag: false`. Identificadores e valores sao ficticios e nao representam dados de usuario. Ele deixou de ser a fonte primaria e agora funciona somente como fallback controlado.

## Garantias

- integracao somente com o runtime real em modo sombra;
- zero chamada de API;
- zero leitura de providers;
- zero persistencia;
- zero efeito sobre reducers ou estado React do produto;
- zero exposicao na navegacao;
- zero disponibilidade da rota em producao.

## Limitacoes

Os status, tempos e conteudos nao representam uma execucao real. A pagina ainda nao possui selecao de execucoes, streaming de etapas, comparacao entre snapshots ou exportacao de telemetria.

## Integracao futura

Uma etapa futura podera adicionar historico local e comparacao entre execucoes sanitizadas. Qualquer evolucao deve preservar o descarte do resultado, a ausencia de dados pessoais e o fluxo legado como unica fonte de verdade ate a ativacao formal do UNI OS.
