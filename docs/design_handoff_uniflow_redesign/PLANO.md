# Plano de implementação (para o Claude Code)

## Como pedir (cole no Claude Code, na raiz do repo)

> Leia `design_handoff_uniflow_redesign/README.md` inteiro antes de qualquer coisa. Ele é a fonte de verdade do redesign; os HTML em `screens/` são referência visual, não código para copiar. Depois de ler, me devolva um plano em fases (igual ao PLANO.md ou melhor) e só então comece pela Fase 0. Ao fim de cada fase, pare e me mostre o resultado antes de seguir. Não invente textos: copie os que estão nos arquivos de tela. Não mude comportamento que já existe (press-and-hold do botão da Uni, confirmação obrigatória de rascunho, workspaces Pessoal/Empresa).

## Fases (uma branch/worktree por fase; cada uma mergeável sozinha)

**Fase 0 · Fundação** (bloqueia tudo; fazer primeiro, sem paralelo)
- Tokens: adicionar as variáveis Nocturne que faltarem + `--brand-blue/violet/green` e as variantes `-text`.
- `UniOrb.jsx` + keyframes (README › Uni Orb). Storybook/rota de teste com os 4 modos.
- Shell: `BottomNavigation` (5 colunas, orb no centro, linha em degradê) e header padrão. Trocar o miolo de `UniCenterButton` pelo UniOrb mantendo o press-and-hold.
- Primitivos reutilizados: Card, Card da Uni, Tag, Chips de filtro, Segmented, Toggle, ProgressBar, Timeline, IconBox 36.
- Rename global Objetivos → Metas (rota, label, textos).

**Fase 1 · Uni** — telas 02 Conversa, 03 Voz (estados + waveform + card de rascunho). Depende da Fase 0.

**Fase 2 · Núcleo** — telas 01 Home, 04 Financeiro, 05 Nova movimentação (sheet), 06 Agenda. Depende da Fase 0.

**Fase 3 · Menu Mais** — 07 Mais, 08 Metas, 09 Visão de futuro, 10 Categorias, 11 Open Finance, 12 Relatórios, 13 Notificações, 14 Configurações, 15 Login. Depende da Fase 0.

**Fase 4 · Empresa** — 16 Clientes, 17 CRM, 18 Projetos. Depende da Fase 0.

Fases 1–4 são independentes entre si → podem rodar em paralelo com worktrees:
```bash
git worktree add ../uniflow-f1-uni        -b redesign/f1-uni
git worktree add ../uniflow-f2-core       -b redesign/f2-core
git worktree add ../uniflow-f3-mais       -b redesign/f3-mais
git worktree add ../uniflow-f4-empresa    -b redesign/f4-empresa
```
Cada worktree recebe o mesmo prompt acima + "Implemente apenas a Fase N. Não toque em arquivos fora do escopo da fase; se precisar de algo da Fase 0 que não existe, pare e me avise."

## Checklist por tela (o Claude Code deve marcar)
- [ ] Layout bate com o HTML lado a lado em 390px
- [ ] Textos idênticos aos do arquivo de design
- [ ] Nav inferior com orb; tela ativa marcada
- [ ] Tokens, nunca hex solto (exceto os três da marca via variável)
- [ ] Números com `tabular-nums`
- [ ] `prefers-reduced-motion` respeitado
- [ ] Nenhum dado salvo sem confirmação
