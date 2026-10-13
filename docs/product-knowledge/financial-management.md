# Gestão financeira (Financeiro, Categorias, Open Finance, Relatórios)

## Finalidade

Registrar, organizar e analisar movimentações financeiras (receitas, despesas, transferências).

## Onde encontrar

`/financeiro` (movimentações), `/categorias` (categorias), `/open-finance` (demonstração), `/relatorios` (relatórios).

## Passo a passo

**Registrar uma movimentação**: abrir Financeiro → "Nova movimentação" → escolher tipo (receita, despesa, transferência ou ajuste) → preencher conta, descrição, valor, data e categoria (forma de pagamento e observações são opcionais) → salvar. Campos obrigatórios: conta, descrição, valor maior que zero e data.

**Parcelamento**: ao registrar, é possível definir de 1 a 360 parcelas. O sistema cria uma movimentação real por parcela (uma por mês), todas ligadas por um mesmo grupo. As parcelas são gravadas juntas: se algo falhar, nenhuma é salva. Pela conversa com a Uni dá para registrar uma compra de 2 a 72 parcelas, como "comprei uma TV de 3 mil em 10 vezes". Editar ou excluir permite escolher o alcance: "somente esta", "esta e as futuras" ou "todas".

**Recorrência**: existe um campo "recorrente" com frequência e data final, mas ele apenas **marca** a movimentação como recorrente — o sistema não gera automaticamente as ocorrências futuras. Isso ainda depende de uma automação que não existe.

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

- Recorrência é apenas um rótulo — não gera lançamentos futuros automaticamente.
- Open Finance é 100% demonstrativo.
- Relatórios têm ao menos um recurso ainda desabilitado ("Disponível em breve" em um dos botões da tela).
- Registro por voz está limitado a receita e despesa, exige a Edge de
  transcrição configurada e sempre solicita confirmação explícita.

## Mensagens de erro conhecidas

Validação de formulário: campos obrigatórios não preenchidos impedem o envio (conta, descrição, valor > 0, data).

## Funcionalidades ainda não disponíveis

- Conexão bancária real (Open Finance).
- Geração automática de lançamentos recorrentes.
- Exportação em PDF.
- Transferência, edição e exclusão por voz.
