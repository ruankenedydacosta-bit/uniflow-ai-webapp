---
name: avisar-cor-fixa
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: src/.*\.(css|jsx?)$
  - field: file_path
    operator: not_contains
    pattern: theme.css
  - field: content
    operator: regex_match
    pattern: (["'`]#[0-9a-f]{3,8}\b|:\s*#[0-9a-f]{3,8}\b|\s#[0-9a-f]{3,8}\s*;|rgba?\(\s*\d)
---

**Cor fixa no código.**

Se existe token em `src/styles/theme.css` para essa cor, use `var(--token)` (AGENTS.md: "Não usar valores hardcoded quando existir token CSS"). Cor fixa só fica quando nenhum token serve, como em dado de gráfico ou meta tag.
