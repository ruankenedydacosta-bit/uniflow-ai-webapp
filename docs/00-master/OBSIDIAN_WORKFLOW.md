# Obsidian Workflow

O Obsidian e a base oficial de conhecimento viva da UniFlow AI.

Ele deve registrar decisoes, prompts aprovados, evolucao do roadmap e pontos importantes do produto sem substituir a documentacao estrutural do repositorio.

## Papel do Obsidian

O cofre `UniFlow AI - Base de Conhecimento` funciona como memoria operacional do projeto.

Use o Obsidian para registrar:

- decisoes importantes de produto, UX ou arquitetura;
- decisoes estruturais sobre navegacao, planos, modos, modulos novos ou regras importantes;
- prompts estruturais aprovados para Codex;
- mudancas relevantes no roadmap;
- aprendizados sobre WebApp, Landing, Design System ou Banco de Dados;
- pontos que precisam ser lembrados por agentes futuros.

Nao use o Obsidian para registrar:

- ajustes triviais;
- ajustes visuais pequenos;
- bugs tecnicos simples;
- cache ou atualizacoes mecanicas;
- logs tecnicos pequenos;
- resultados repetitivos de build/lint;
- detalhes que ja estao claros no commit ou no proprio codigo.

## Fonte principal do app

`docs/01-arquitetura` continua sendo a fonte principal da estrutura do aplicativo UniFlow AI.

As notas do Obsidian registram decisoes e evolucao do projeto. Elas ajudam a preservar contexto, mas nao substituem a arquitetura oficial documentada no repositorio.

## Tipos de nota

O script local aceita estes tipos:

- `decision`: decisoes do projeto.
- `prompt`: prompts Codex aprovados.
- `roadmap`: proximos passos e planejamento.
- `webapp`: evolucao do WebApp.
- `landing`: Site Landing Page.
- `design`: Design System.
- `database`: Banco de Dados.

## Pastas do Obsidian

Os tipos sao salvos nestas pastas do cofre:

- `decision` -> `10 - Decisões do Projeto`
- `prompt` -> `09 - Prompts Codex`
- `roadmap` -> `11 - Roadmap`
- `webapp` -> `08 - WebApp`
- `landing` -> `07 - Site Landing Page`
- `design` -> `13 - Design System`
- `database` -> `12 - Banco de Dados`

## Como criar uma nota

Comando base:

```bash
npm run obsidian:note -- --type decision --title "Financeiro menos poluído" --content "A tela Financeiro deve priorizar gráficos, leitura da Uni e próximos passos, evitando excesso de números soltos."
```

Quando a tarefa envolver decisao estrutural, produto, UX, arquitetura, navegacao, plano, modo, modulo novo ou regra importante, o Codex deve rodar o comando diretamente quando tiver permissao para isso. Nao deve pedir para o usuario registrar manualmente se puder executar o workflow.

Exemplo para prompt aprovado:

```bash
npm run obsidian:note -- --type prompt --title "Prompt de revisão do Financeiro" --content "Prompt aprovado para simplificar a página Financeiro com foco no GPS Financeiro."
```

Exemplo para roadmap:

```bash
npm run obsidian:note -- --type roadmap --title "Próxima etapa do WebApp" --content "Criar a tela de Metas/Objetivos seguindo a arquitetura oficial e a lógica de GPS Financeiro."
```

## Caminho do cofre

O caminho atual esta configurado no script:

```js
const OBSIDIAN_VAULT_PATH = "/Users/wagnerweber/UniFlow AI - Base de Conhecimento"
```

Se o cofre estiver em outro local, ajuste essa constante em `scripts/obsidian/create-note.js`.

## Regras para agentes

- Registrar nota no Obsidian quando uma alteracao representar decisao importante de produto, UX, arquitetura, navegacao, planos, modos, modulos ou regras.
- Usar `type: decision` para decisoes estruturais e registrar em `10 - Decisões do Projeto`.
- Usar `type: prompt` para prompts estruturais importantes aprovados e registrar em `09 - Prompts Codex`.
- Ao finalizar uma tarefa importante, informar se a nota foi registrada, o titulo da nota criada e o caminho da nota.
- Nao pedir para o usuario registrar manualmente quando o Codex puder rodar `npm run obsidian:note`.
- Nao registrar alteracoes triviais.
- Nao registrar ajustes visuais pequenos, bugs tecnicos simples, cache, logs tecnicos pequenos ou resultados repetitivos de build/lint.
- Nao poluir o Obsidian com notas inuteis.
- Manter notas claras, curtas e uteis para agentes futuros.
