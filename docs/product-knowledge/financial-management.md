# Gestão financeira (Financeiro, Categorias, Open Finance, Relatórios)

## Finalidade

Registrar, organizar e analisar movimentações financeiras (receitas, despesas, transferências).

## Onde encontrar

`/financeiro` (movimentações), `/categorias` (categorias), `/open-finance` (demonstração), `/relatorios` (relatórios).

## Passo a passo

**Registrar uma movimentação**: abrir Financeiro → "Nova movimentação" → escolher tipo (receita, despesa, transferência ou ajuste) → preencher conta, descrição, valor, data e categoria (forma de pagamento e observações são opcionais) → salvar. Campos obrigatórios: conta, descrição, valor maior que zero e data.

**Parcelamento**: ao registrar, é possível definir de 1 a 360 parcelas. O sistema cria uma movimentação real por parcela (uma por mês), todas ligadas por um mesmo grupo. Editar ou excluir permite escolher o alcance: "somente esta", "esta e as futuras" ou "todas".

**Recorrência**: em entrada ou saída, ligue "Lançamento recorrente" e escolha a frequência (diária, semanal, mensal ou anual), de quanto em quanto tempo repete e, se quiser, a data final. A data do formulário é a do primeiro lançamento.

- Os lançamentos dos próximos 3 meses já entram como previstos. Todo dia, o app cria os seguintes, até a data final.
- No mensal, o dia é contado a partir do primeiro lançamento. Um aluguel no dia 31 cai no último dia dos meses mais curtos e volta ao 31 no mês seguinte.
- Ligue "Confirmar automaticamente na data" para débito automático. Sem isso, confirme cada lançamento quando ele acontecer.
- Ao editar ou excluir um lançamento da série, escolha o alcance: "Somente este", "Este e os próximos" ou "Todos da série". Mudar o valor, a descrição, a conta ou a categoria em "Este e os próximos" também vale para os lançamentos que a série ainda vai criar. Excluir "Este e os próximos" ou "Todos" encerra a série.
- Transferência e ajuste de saldo não têm recorrência.

**Filtrar**: por texto, período (semana/mês/trimestre/ano/tudo), tipo, conta, categoria, forma de pagamento, status de parcela e status de recorrência.

**Exportar**: botão de exportar gera um CSV com a lista filtrada atual. Não há exportação em PDF.

**Categorias**: cada categoria tem um tipo (receita, despesa ou transferência) e um escopo (pessoal, empresa ou ambos). Existem categorias padrão já disponíveis; o usuário pode criar e editar as suas, se tiver permissão (owner/admin/member).

**Open Finance** — **é uma demonstração, não uma integração bancária real**. A tela em `/open-finance` deixa isso explícito: "Esta é uma demonstração visual: ainda não há conexão bancária real, coleta de credenciais ou dados da sua conta." Instituições, valores e contas mostrados são fictícios. Não prometer ao usuário que é possível conectar um banco de verdade.

**Relatórios**: mostram séries mensais de receita/despesa/resultado (últimos meses), médias mensais, comparação percentual mês a mês, progresso médio das metas ativas, e sinais de atenção (ex.: meses seguidos com resultado negativo, metas atrasadas) — tudo calculado a partir de dados reais, sem geração livre por IA.

## Diferenças PF/PJ

Categorias podem ser específicas de cada espaço ou compartilhadas. Contas, transações, relatórios e Open Finance existem em ambos os espaços, com dados independentes.

## Desktop / mobile

Desktop: uma lista com filtros e exportação em um só modal. Mobile: uma visão mais visual (carrossel de contas, carteira de cartões, gráfico de receita/despesa, lista de movimentações recentes), sem a navegação de período anterior/próximo que existe no desktop.

## Permissões

Registrar/editar depende do papel no espaço (owner/admin/member podem editar; viewer não).

## Pré-requisitos

Ao menos uma conta cadastrada para registrar uma movimentação.

## Limitações atuais

- Pela conversa com a Uni, um pedido recorrente ("pago 120 de academia todo mês") ainda registra só o lançamento do dia. Para criar a série, use a tela Financeiro.
- Open Finance é 100% demonstrativo.
- Relatórios têm ao menos um recurso ainda desabilitado ("Disponível em breve" em um dos botões da tela).
- Registro por voz está limitado a receita e despesa, exige a Edge de
  transcrição configurada e sempre solicita confirmação explícita.

## Mensagens de erro conhecidas

Validação de formulário: campos obrigatórios não preenchidos impedem o envio (conta, descrição, valor > 0, data).

## Funcionalidades ainda não disponíveis

- Conexão bancária real (Open Finance).
- Exportação em PDF.
- Transferência, edição e exclusão por voz.
