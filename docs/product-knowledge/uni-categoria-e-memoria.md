# Como a Uni escolhe a categoria

## Finalidade

Entender como a Uni escolhe a categoria de uma movimentação, como corrigir a escolha e quando ela lança sem mostrar o card.

## Onde encontrar

Na conversa com a Uni (`/app/uni`), por texto ou pela conversa por voz.

## Passo a passo

**Como a Uni escolhe a categoria**: a Uni lê a frase inteira e escolhe uma das categorias do espaço ativo. Categorias ocultas no espaço não entram na escolha. Quando a frase não diz do que se trata ("saiu 70"), a Uni pergunta a categoria. Quando você pede uma categoria que ainda não existe, a Uni mostra um card para criá-la antes de lançar.

**Corrigir a categoria no card**: antes de confirmar, toque em **Editar** e escolha outra categoria. Você também pode dizer a correção, por exemplo:

- "não, é Lazer";
- "coloca em Educação";
- "não, é dos filhos", quando existe a categoria Filhos.

O card volta com a categoria nova. Toque em **Confirmar** para salvar.

**A Uni lembra da sua escolha**: quando você confirma o card, a Uni guarda a descrição junto com a categoria escolhida. Na próxima vez que você lançar a mesma descrição, ela usa essa categoria. Por exemplo, se você confirmou "Curso de piano da Ana" em Lazer, a frase "paguei 250 do curso de piano da Ana" já vem em Lazer.

- Se você trocar a categoria no card, a Uni passa a usar a categoria nova.
- A categoria que você diz na frase ("lança 30 da padaria em Lazer") vale mais que a memória.
- A memória vale para despesas e receitas. Transferências não usam memória.
- A memória é sua e do espaço ativo. Outra pessoa do mesmo espaço não usa as suas escolhas, e outro espaço não as vê.

**Lançamento direto com Desfazer**: depois de você confirmar a mesma descrição 3 vezes seguidas na mesma categoria, sem trocar, a Uni pode lançar sem mostrar o card. Ela responde, por exemplo, "Lancei R$ 300,00 em Educação (Mensalidade escolar, Nubank)." e mostra o botão **Desfazer**.

A Uni só lança direto quando todas estas condições valem:

- a frase traz uma despesa ou uma receita só, com o valor;
- a conta já existe e ficou clara, porque você citou o nome ou porque é a única possível;
- a data é hoje ou um dia que já passou;
- a Uni tem certeza da categoria, e ela é a mesma que você confirmou 3 vezes.

Continuam com o card de confirmação:

- compra parcelada;
- valor que se repete ("todo mês");
- lançamento com data futura, que fica previsto;
- transferência;
- frase com mais de um lançamento;
- correção de um rascunho aberto;
- qualquer frase em que a Uni tenha dúvida.

**Desfazer um lançamento direto**: toque em **Desfazer** ou diga "desfazer" em até 60 segundos. A Uni apaga o lançamento, e na próxima vez com essa descrição ela mostra o card de novo. A contagem das 3 confirmações recomeça.

**Depois do prazo de Desfazer**: diga "apaga o último lançamento" ou exclua a movimentação na tela Financeiro.

## Diferenças PF/PJ

A memória é separada por espaço. O que você confirmou no espaço pessoal não vale no espaço da empresa, e o contrário também.

## Desktop / mobile

Funciona igual nos dois.

## Permissões

A memória é gravada só para quem pode lançar no espaço. Cada pessoa vê e usa só a própria memória.

## Pré-requisitos

A interpretação por IA precisa estar disponível. Sem ela, a Uni segue com o card de sempre e não lança direto.

## Limitações atuais

- A memória vem só do card da conversa, por texto ou por voz. Lançamentos feitos ou editados na tela Financeiro não mudam a memória.
- Para o lançamento direto, a descrição precisa ser a mesma, sem contar acentos e maiúsculas. "Escola" e "Mensalidade do colégio" contam como descrições diferentes.
- Ainda não há tela para ver ou apagar as memórias.

## Mensagens de erro conhecidas

Se a Uni não conseguir gravar o lançamento direto, ela mostra o card de confirmação. Toque em **Confirmar** para salvar sem duplicar.

## Funcionalidades ainda não disponíveis

- Tela para ver, editar ou apagar as memórias de categoria.
- Lançamento direto de compra parcelada, recorrência, previsto ou transferência.
