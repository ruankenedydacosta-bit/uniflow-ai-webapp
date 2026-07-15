# UniFlow Financeiro Mobile V1

## Objetivo

O Financeiro Mobile aprofunda a leitura executiva iniciada na Home. A tela organiza período, saldo, fluxo, contas, cartões, lançamentos, categorias e previsão em uma sequência única, sem transformar o produto em uma planilha compactada.

## Estrutura

1. Seletor de período persistente.
2. Leitura curta do período.
3. Saldo disponível com receitas e despesas.
4. Gráfico interativo de duas séries.
5. Carrossel de contas.
6. Carteira de cartões.
7. Lançamentos recentes.
8. Distribuição por categorias.
9. Previsão financeira da Uni.
10. Ação contextual para novo lançamento.

## Limites da V1

Os dados são mocks imutáveis. A V1 não calcula métricas, sincroniza instituições, categoriza lançamentos ou usa IA. Os comandos de contas, categorias e lançamentos reutilizam os gerenciadores existentes, sem modificar suas regras.

O botão central da Uni continua reservado à conversa pelo Mobile App Shell. Por isso, a ação financeira contextual vive acima da navegação nesta versão, sem alterar o contrato global do shell.

## Responsividade e acesso

A camada é exibida entre 320px e 767px, usa safe areas, alvos mínimos de toque, rolagem horizontal com snap e redução de movimento. O desktop mantém a composição anterior sem mudanças visuais.
