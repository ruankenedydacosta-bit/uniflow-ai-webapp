#!/usr/bin/env bash
# Hook Stop do Claude Code: ao terminar, se a branch atual tem commits que não
# estão em origin/main e nunca teve PR (aberta, mergeada ou fechada), bloqueia
# (exit 2) e pede ao agente que abra a PR. Sem rede ou sem gh, não bloqueia.
set -uo pipefail

entrada=$(cat)
# Segunda parada seguida: o agente já foi avisado. Não prende a sessão em loop.
[[ $(jq -r '.stop_hook_active // false' <<<"$entrada") == true ]] && exit 0

cwd=$(jq -r '.cwd // empty' <<<"$entrada")
cd "${cwd:-.}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

branch=$(git branch --show-current)
[[ -z $branch || $branch == main ]] && exit 0

git rev-parse -q --verify origin/main >/dev/null || exit 0
a_frente=$(git rev-list --count origin/main..HEAD 2>/dev/null) || exit 0
((a_frente > 0)) || exit 0

prs=$(timeout 20 gh pr list --head "$branch" --state all --json number --jq length 2>/dev/null) || exit 0
((prs == 0)) || exit 0

if [[ -z $(git rev-parse --abbrev-ref '@{upstream}' 2>/dev/null) ]] \
  || (($(git rev-list --count '@{upstream}..HEAD' 2>/dev/null || echo 1) > 0)); then
  push="Faça push da branch e abra"
else
  push="Abra"
fi

cat >&2 <<EOF
A branch $branch tem $a_frente commit(s) fora de origin/main e nenhuma PR. $push a PR para main antes de encerrar (regra "Sempre abrir PR"). Se o trabalho ainda não terminou ou a PR não deve existir, diga isso ao usuário em vez de abrir.
EOF
exit 2
