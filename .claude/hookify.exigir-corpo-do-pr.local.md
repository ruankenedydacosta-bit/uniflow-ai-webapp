---
name: exigir-corpo-do-pr
enabled: true
event: bash
action: block
conditions:
  - field: command
    operator: regex_match
    pattern: (^|[;&|(])\s*gh\s+pr\s+create
  - field: command
    operator: regex_match
    pattern: ^(?![\s\S]*Closes #\d)|^(?![\s\S]*revis)
---

**Corpo do PR incompleto.** O comando precisa trazer o corpo inline em `--body`, com:

- `Closes #N` da issue. No último PR de um épico, também `Closes #<épico>`, depois de conferir o que o corpo do épico pede fora das sub-issues.
- Uma linha dizendo que a revisão (`/code-review`) rodou e o que ela mudou. Se ainda não rodou, rode antes.

Com `--body-file` esta regra não lê o corpo. Passe o texto em `--body`.
