# Dashboard

## Finalidade

Tela inicial com um resumo do estado financeiro do espaço ativo e sugestões de próximos passos.

## Onde encontrar

`/dashboard` — primeira tela após login (e destino do botão "Home" no mobile).

## Passo a passo

A tela mostra: saudação personalizada; um resumo de "clareza financeira" (situação atual, previsão, principal sinal de atenção); uma recomendação de próxima ação; até 3 sinais de atenção (ex.: meta atrasada, mês com resultado negativo); um grid de métricas financeiras; um checklist de ativação para usuários novos; um gráfico de receitas x despesas; carrosséis de contas e categorias; uma prévia da Visão de Futuro; e atalhos de navegação rápida.

### Leitura do mês (Home simplificada)

Na Home de `/app/home`, logo abaixo da fala da Uni, o bloco "Leitura do mês" mostra até três frases sobre as saídas por categoria. Elas aparecem nesta ordem de prioridade, e ficam as três primeiras que existirem:

1. a categoria que mais passou do orçamento;
2. a categoria que já usou 80% ou mais do orçamento;
3. a categoria que mais subiu em relação ao mês anterior;
4. a categoria com mais saídas no mês;
5. a categoria que mais caiu;
6. em quantas categorias você está dentro do orçamento.

O orçamento de uma categoria é o teto mensal que você definiu. Sem teto, a Uni usa a média das saídas da categoria nos 3 meses anteriores, quando houver histórico. A média conta só os meses em que houve alguma saída, e média abaixo de R$ 50 não vira orçamento.

A comparação com o mês anterior é sempre até o mesmo dia (no dia 8, de 1 a 8 de cada mês). Subida ou queda só aparece se for de pelo menos R$ 50 e 20%. Saída sem categoria conta no total do mês, mas não vira frase. Tocar numa frase abre o Financeiro no histórico, filtrado pela categoria. Sem saídas no mês até hoje, o bloco avisa que ainda não há saídas.

### Definir o teto de uma categoria

1. Abra o Financeiro e vá para o histórico.
2. Em Categoria, escolha uma categoria de saída.
3. No cartão "Orçamento mensal", toque em Definir teto (ou Alterar, se já houver um).
4. Informe o valor e toque em Salvar teto.

Para voltar a usar a média, toque em Alterar e depois em Remover teto. Quem só pode ver o espaço não vê o botão.

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
