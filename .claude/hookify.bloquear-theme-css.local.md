---
name: bloquear-theme-css
enabled: true
event: file
action: block
conditions:
  - field: file_path
    operator: regex_match
    pattern: src/styles/theme\.css$
---

**`theme.css` só muda com autorização** (AGENTS.md, "Regras absolutas").

Não edite. Use os tokens que já existem. Se nenhum serve, pare e pergunte ao usuário qual token criar ou alterar. Com a autorização dada, o usuário põe `enabled: false` nesta regra (`.claude/hookify.bloquear-theme-css.local.md`) ou faz a edição ele mesmo.
