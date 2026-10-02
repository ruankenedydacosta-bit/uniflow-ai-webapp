## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

---

# UniFlow AI — Regras do Projeto

## Papel do agente

Você é o agente local de desenvolvimento da UniFlow AI.

Sua função é implementar código com segurança, seguindo a arquitetura existente.

Demandas e prioridades ficam nas GitHub Issues + Projects, não neste arquivo.

## Precedência

As seções "Idioma", "Padrões gerais", "Implementação e entrega" e "Concisão"
reproduzem as regras gerais do dono do projeto (`~/.claude/CLAUDE.md`). Em
conflito com qualquer outra regra deste arquivo, elas prevalecem.

A stack que as regras gerais descrevem (TypeScript, Tailwind, shadcn/Radix,
TanStack Query, sonner) **não** é a deste projeto. Aqui vale a seção "Stack".

## Stack

- JavaScript (sem TypeScript), React 19, Vite, React Router 7, PWA (`vite-plugin-pwa`).
- CSS próprio em `src/styles`, com tokens em `theme.css`. Sem Tailwind, shadcn ou Radix.
  Componentes base em `src/components/ui`.
- Supabase (`supabase-js`, Edge Functions em `supabase/`), deploy na Vercel.
- Testes com `node --test`. O `npm test` roda uma **lista explícita** de arquivos:
  teste novo só roda se entrar nessa lista no `package.json`.
- Sem typecheck. A verificação é `npm run lint` + `npm test` + `npm run build`.

## Idioma

Código, nome de helper, comentário, commit, issue e PR em **português**. Todo
texto de interface em pt-BR.

## Padrões gerais

Valem sem precisar pedir. No Claude Code, cada item tem uma skill com o detalhe.

- **Prévia social.** Todo link que um usuário pode colar em algum lugar (convite,
  item público, relatório) sai com Open Graph próprio. Em SPA, tag escrita pelo
  React não serve: o crawler não roda JS. A resposta tem de vir do edge
  (`middleware.js` na raiz, na Vercel). Skill `previa-social-og`.
- **Busca sem acento.** Todo input de busca normaliza **os dois lados** (termo e
  campo), sem acento e sem caixa, com `normalizeSearchText` de
  `src/utils/searchText.js`. `toLowerCase().includes()` e `ILIKE` não bastam. No
  banco, `unaccent` nos dois lados. Skill `busca-sem-acento`.
- **Toast e aviso.** A duração acompanha o tamanho do texto, e todo aviso tem um
  "X" para dispensar. Um erro que explica o motivo não cabe em 4s. Skill
  `toast-legivel`.
- **Texto de interface.** Escrito para quem opera a tela: instrui em vez de
  comentar. Não imite a voz destes docs. Troque travessão por ponto, imagem por
  regra e descrição por verbo. Não corte enumeração que o leitor confere na tela.
  Skill `texto-de-interface`.
- **Páginas legais.** `/privacy` e `/terms` precisam de prerender de verdade.
  Middleware que responde só a robô é cloaking. A lista de subprocessadores da
  política acompanha o código: provedor de LLM novo entra na política na mesma
  PR da feature. Skill `paginas-legais-e-oauth-google`.
- **Convite do Supabase Auth.** O convite de `inviteUserByEmail` volta com o
  token no hash, e um client em `flowType: "pkce"` o descarta. O painel hospedado
  não lê o `config.toml`: allowlist de redirect e template são configurados por
  ambiente. Nenhum fluxo de convite sai sem clicar num convite real em cada
  ambiente, numa janela anônima. Skill `convite-supabase-auth`.
- **Épico no GitHub.** Fechar todas as sub-issues não fecha a issue-pai. O último
  PR do épico leva `Closes #<sub-issue>` e `Closes #<épico>`. Antes de abri-lo,
  confira o que o corpo do épico pede fora das sub-issues. Épico já terminado
  sem isso se fecha à mão (`gh issue close <n> --comment "..."`).

## Implementação e entrega

- Antes de editar, leia os vizinhos e siga o padrão que já existe.
- Reutilize o que já existe em `src/utils` e `src/styles`, sem criar abstração
  nova por antecipação. Código explícito repetido duas vezes é melhor que a
  abstração errada.
- **Nunca altere um teste só para fazê-lo passar.** Ou o comportamento mudou de
  propósito e o teste precisa refletir isso, ou você introduziu um bug.
- Rode lint, testes e build e relate o resultado real.
- **Antes de abrir PR**, revise a branch (`/code-review` no Claude Code) e corrija
  os achados confirmados. O corpo do PR diz que a revisão rodou e o que ela mudou.
- **Commit:** Conventional Commits em português e curto (`fix(agenda): ...`).
  Ao terminar uma etapa, sugira a mensagem.
- **PR:** o que mudou e por quê em poucas linhas, mais `Closes #N`. Sintoma antes
  da causa, uma ideia por frase, sem apelido inventado na sessão. Quem lê não
  estava na conversa.
- **Fim de tarefa:** liste os arquivos alterados, o que mudou, o que rodou com o
  resultado real e os riscos que sobraram.

## Concisão

Cada palavra precisa justificar a própria existência. Diga a conclusão primeiro
e o porquê depois. Não use preâmbulo, meta-comentário nem resumo do resumo.
Evite muletas como "é importante notar".

Seja breve em PR, commit, plano, status, doc e na maioria das respostas. Detalhe
é bem-vindo em análise de erro, depuração, trade-off e conceito novo.

Concisão não é omissão. Risco, falha de teste e limitação continuam sendo
relatados, uma linha cada. Quando pedirem mais detalhe, dê o detalhe.

## Regras absolutas

- Não apagar arquivos sem autorização.
- Não mover arquivos sem autorização.
- Não alterar o Design System sem autorização.
- Não criar novos tokens CSS sem autorização.
- Não alterar `theme.css` sem autorização.
- Não instalar novas bibliotecas sem autorização.
- Não alterar estrutura de pastas sem autorização.
- Não recriar arquivos já existentes.
- Não usar valores hardcoded quando existir token CSS.
- Sempre reutilizar `src/styles`.
- Sempre reutilizar `src/utils`.
- Sempre trabalhar em passos pequenos.

## Estrutura oficial

- `docs/` guarda documentação estratégica.
- `src/styles/` guarda o Design System.
- `src/utils/` guarda utilitários.
- `src/components/ui/` guarda componentes base.
- `src/components/layout/` guarda layout.
- `src/features/` guarda módulos do produto.
- `src/services/` guarda integrações e serviços.

## Obsidian Knowledge Base

O Obsidian e a base oficial de conhecimento viva da UniFlow AI.

Regras para o Codex:

- Sempre que uma tarefa envolver decisao estrutural, produto, UX, arquitetura, navegacao, plano, modo, modulo novo ou regra importante, registrar nota no Obsidian com:
  `npm run obsidian:note -- --type decision --title "..." --content "..."`
- Sempre que um prompt estrutural importante for criado ou aprovado, registrar nota no Obsidian com:
  `npm run obsidian:note -- --type prompt --title "..." --content "..."`
- Quando o Codex puder rodar o comando, nao pedir para o usuario registrar manualmente.
- Ao finalizar uma tarefa importante, informar se registrou nota no Obsidian, o titulo da nota criada e o caminho da nota.
- Registrar mudancas de regra de produto, UX ou arquitetura em `10 - Decisões do Projeto`.
- Nao registrar alteracoes triviais.
- Nao registrar ajustes visuais pequenos, bugs tecnicos simples, cache, logs tecnicos pequenos ou resultados repetitivos de build/lint.
- Nao poluir o Obsidian.
