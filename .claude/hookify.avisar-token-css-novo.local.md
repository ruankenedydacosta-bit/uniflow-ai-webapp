---
name: avisar-token-css-novo
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.css$
  - field: content
    operator: regex_match
    pattern: (^|[\n;{])\s*--[\w-]+\s*:
---

**Variável CSS nova fora do `theme.css`.**

Token novo exige autorização (AGENTS.md, "Regras absolutas"). Se esta edição declara uma `--variável` que não existia, troque por um token de `src/styles/theme.css` ou pergunte ao usuário antes. Se a variável já existia e só mudou de lugar no texto, siga.
