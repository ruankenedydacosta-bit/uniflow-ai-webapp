# Obsidian Workflow

O Obsidian e a base oficial de conhecimento viva da UniFlow AI.

Ele deve registrar decisoes, prompts aprovados, evolucao do roadmap e pontos importantes do produto sem substituir a documentacao estrutural do repositorio.

## Papel do Obsidian

O cofre `UniFlow AI - Base de Conhecimento` funciona como memoria operacional do projeto.

Use o Obsidian para registrar:

- decisoes importantes de produto, UX ou arquitetura;
- prompts estruturais aprovados para Codex;
- mudancas relevantes no roadmap;
- aprendizados sobre WebApp, Landing, Design System ou Banco de Dados;
- pontos que precisam ser lembrados por agentes futuros.

Nao use o Obsidian para registrar:

- ajustes triviais;
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

- Sugerir ou criar nota no Obsidian quando uma alteracao representar decisao importante.
- Registrar prompts estruturais aprovados em `09 - Prompts Codex`.
- Registrar mudancas de regra de produto, UX ou arquitetura em `10 - Decisões do Projeto`.
- Nao registrar alteracoes triviais.
- Nao poluir o Obsidian com logs pequenos.
- Manter notas claras, curtas e uteis para agentes futuros.
