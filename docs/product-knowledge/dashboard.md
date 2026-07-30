# Dashboard

## Finalidade

Tela inicial com um resumo do estado financeiro do espaço ativo e sugestões de próximos passos.

## Onde encontrar

`/dashboard` — primeira tela após login (e destino do botão "Home" no mobile).

## Passo a passo

A tela mostra: saudação personalizada; um resumo de "clareza financeira" (situação atual, previsão, principal sinal de atenção); uma recomendação de próxima ação; até 3 sinais de atenção (ex.: meta atrasada, mês com resultado negativo); um grid de métricas financeiras; um checklist de ativação para usuários novos; um gráfico de receitas x despesas; carrosséis de contas e categorias; uma prévia da Visão de Futuro; e atalhos de navegação rápida.

## Diferenças PF/PJ

O conteúdo reflete os dados do espaço ativo (Pessoal ou Empresa) — trocar de espaço atualiza todo o dashboard.

## Desktop / mobile

Mobile usa uma versão dedicada (`MobileHomeView`) com um resumo mais compacto (briefing, próximo passo, insights), construída a partir dos mesmos dados do desktop.

## Permissões

Visível a qualquer papel (owner/admin/member/viewer) do espaço ativo.

## Pré-requisitos

Apresentação e Plano Pessoal concluídos. Sem transações registradas, os cartões mostram estados vazios (ex.: "ainda não há histórico suficiente").

## Limitações atuais

Nenhuma seção do dashboard é gerada por IA generativa sem checagem — os sinais e recomendações vêm de regras determinísticas sobre os dados reais do usuário, não de texto livre da OpenAI.

## Mensagens de erro conhecidas

"Ainda não há histórico suficiente para uma leitura financeira do período." — aparece quando não há dados suficientes para o briefing.

## Funcionalidades ainda não disponíveis

Nenhuma identificada além das já listadas em `settings-and-security.md` ("Leitura da Uni" personalizada, prevista para uma próxima etapa).
