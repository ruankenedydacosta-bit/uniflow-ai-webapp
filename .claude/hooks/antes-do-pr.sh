#!/usr/bin/env bash
# Hook PreToolUse do Claude Code: antes de `gh pr create`, confere conflito com
# origin/main, lint nos arquivos da branch, testes e build. Falhou, bloqueia
# (exit 2) e devolve o motivo ao agente.
set -uo pipefail

comando=$(jq -r '.tool_input.command // ""')
# Só quando gh é o comando (início de linha, ou depois de ; && || | ou (), não quando aparece num texto.
grep -qE '(^|[;&|(])[[:space:]]*gh[[:space:]]+pr[[:space:]]+create' <<<"$comando" || exit 0

raiz=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$raiz" || exit 0

falhas=()

if ! git fetch -q origin main 2>/dev/null; then
  falhas+=("Não consegui buscar origin/main. Confira a rede e o remote.")
else
  # merge-tree sai com 1 no conflito e com mais que 1 em erro (git anterior ao 2.38, sem --write-tree).
  saida=$(git merge-tree --write-tree origin/main HEAD 2>&1)
  case $? in
    0) ;;
    1) falhas+=("A branch conflita com origin/main. Faça rebase ou merge antes de abrir o PR.") ;;
    *) falhas+=("git merge-tree falhou sem dizer se há conflito:"$'\n'"$(tail -n 5 <<<"$saida")") ;;
  esac
fi

# Só os arquivos da branch: a main ainda tem erros de lint antigos em docs/ e src/.
mapfile -t alterados < <(git diff --name-only --diff-filter=ACMR origin/main...HEAD -- '*.js' '*.jsx' 2>/dev/null)
if ((${#alterados[@]})); then
  if ! saida=$(npx eslint "${alterados[@]}" 2>&1); then
    falhas+=("Lint falhou nos arquivos da branch:"$'\n'"$saida")
  fi
fi

saida=$(timeout 180 npm test 2>&1)
case $? in
  0) ;;
  124) falhas+=("npm test passou de 180s sem terminar. Algum teste está travado (handle aberto, timer).") ;;
  *) falhas+=("npm test falhou:"$'\n'"$(tail -n 40 <<<"$saida")") ;;
esac

if ! saida=$(npm run build 2>&1); then
  falhas+=("npm run build falhou:"$'\n'"$(tail -n 30 <<<"$saida")")
fi

((${#falhas[@]})) || exit 0

{
  echo "PR bloqueado pelo hook .claude/hooks/antes-do-pr.sh. Corrija e tente de novo:"
  printf -- '- %s\n' "${falhas[@]}"
} >&2
exit 2
