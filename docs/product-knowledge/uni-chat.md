# Chat da Uni

## Finalidade

Conversar em linguagem natural com a assistente Uni para tirar dúvidas e registrar movimentações financeiras.

## Onde encontrar

`/app/uni`. Para abrir a conversa, toque em **Mais** na barra inferior e depois em **Conversa com a Uni**. Na tela de voz, toque em **Conversa**.

No topo da conversa ficam a Uni, o espaço ativo ("Espaço Pessoal") e dois botões: "Ver histórico" e "Nova conversa". Embaixo fica o campo "Escreva para a Uni". Digite a mensagem e toque no botão à direita para enviar. O campo recebe só texto: para falar com a Uni, toque na Uni, no centro da barra inferior.

## Passo a passo

**Registrar uma movimentação por chat**: descreva a movimentação em linguagem natural (ex.: "gastei 50 reais no mercado"). A Uni mostra um card de rascunho com o tipo ("Saída · rascunho" ou "Entrada · rascunho"), a categoria, o valor, a conta, a descrição e a data. Confira os dados e toque em **Confirmar** para salvar. **Editar** abre os campos no próprio card e **Cancelar** descarta o rascunho. **Nada é salvo antes de você tocar em Confirmar.** A Uni nunca registra, edita ou apaga uma movimentação sem a sua confirmação. A exceção é o lançamento direto: uma despesa ou receita cuja descrição você já confirmou 3 vezes seguidas na mesma categoria pode ser lançada sem card, com o botão **Desfazer** por 60 segundos. Veja o artigo "Como a Uni escolhe a categoria".

**Registrar uma compra parcelada**: diga o total e o número de parcelas, como "comprei uma TV de 3 mil em 10 vezes no Nubank" ou "parcelei a geladeira de 2.400 em 12x". O card "Compra parcelada · rascunho" mostra:

- as parcelas, em destaque (ex.: "10x de R$ 300,00");
- o valor total;
- a última parcela, quando o arredondamento deixa um centavo de diferença;
- a categoria, a conta e a data da primeira parcela.

Ao tocar em **Confirmar**, a Uni grava todas as parcelas de uma vez, uma por mês a partir da primeira. As parcelas com data depois de hoje ficam previstas até você confirmar no Financeiro. Se você disser só o valor de cada parcela ("10x de 300"), a Uni calcula o total.

**Registrar um lançamento recorrente**: diga o valor e de quanto em quanto tempo repete, como "aluguel de 1.500 todo dia 10", "pago 180 pra diarista toda semana" ou "recebo 2 mil do inquilino todo mês". O card "Saída recorrente · rascunho" (ou "Entrada recorrente") mostra:

- o valor;
- a regra, em "Repete" (ex.: "Todo mês, no dia 10", "A cada 2 semanas");
- a data do primeiro lançamento;
- a categoria, a conta e a descrição.

Sem dia na frase, o primeiro lançamento é hoje. Com um dia ("todo dia 10"), é a próxima vez que esse dia chega. Com o verbo no passado ("paguei o aluguel dia 5, que é todo mês"), a série começa nesse dia, e os lançamentos até hoje entram como realizados. Para trocar a regra antes de confirmar, diga "não, é toda semana" ou "a cada 15 dias". Ao tocar em **Confirmar**, a Uni cria a série e os lançamentos dos próximos 3 meses. Os seguintes são criados sozinhos. Os lançamentos com data depois de hoje ficam previstos até você confirmar no Financeiro.

**Mudar ou encerrar um lançamento recorrente**: diga o que muda e, se quiser, a partir de quando. Por exemplo, "a academia sobe pra 130 a partir de dezembro", "o condomínio agora sai da conta conjunta" ou "cancelei a Netflix, tira dos próximos meses". O card mostra o lançamento, a partir de quando vale e quantos previstos mudam. Ao tocar em **Confirmar**:

- mudar troca valor, categoria ou conta do próximo previsto em diante, e os que a série ainda vai gerar já saem com a mudança;
- encerrar apaga os previstos do próximo em diante, e a série para de gerar novos. Os lançamentos já realizados ficam.

Sem data na frase, a mudança vale a partir do próximo previsto. Para mudar só um lançamento da série, use a tela Financeiro.

**Confirmar um lançamento previsto**: conte que pagou ou recebeu, como "já paguei o aluguel" ou "o salário caiu". Se houver um previsto com esse nome, de até 45 dias atrás a 10 dias à frente, a Uni mostra o card "Alteração · rascunho" para marcar como pago ou recebido, com a data de hoje. Se você disser outro dia ou outro valor ("paguei 1.550 do aluguel ontem"), o card já vem com eles. Sem previsto parecido, a Uni registra um lançamento novo, como sempre. Com mais de um previsto parecido, ela lista e pergunta qual.

**Alterar uma movimentação já salva**: diga qual é a movimentação e o que muda. Por exemplo:

- "corrige o mercado de ontem pra 50 reais";
- "o almoço de ontem na verdade foi 35";
- "errei o valor do posto, era 200";
- "muda a categoria do iFood de sexta pra Lazer";
- "o Uber de segunda foi no Nubank".

A Uni procura a movimentação pelo nome, pelo dia, pelo valor ou pela conta que você disser e mostra um card "Alteração · rascunho" com o valor de antes e o de depois (por exemplo, "R$ 32,00 → R$ 50,00"). Toque em **Confirmar** para salvar ou em **Cancelar** para deixar como estava. Para ajustar antes de confirmar, diga só a mudança ("não, pra 60").

- Se mais de uma movimentação combinar com o que você disse, a Uni lista até cinco e pergunta qual. Responda com o número da lista ("número 2") ou com um detalhe ("a de 85", "a do Nubank").
- Logo depois de confirmar uma movimentação, "corrige pra 50" ou "na verdade foi 50" altera essa mesma movimentação.
- Dá para mudar valor, data, conta, categoria e descrição. A categoria nova precisa ser do mesmo tipo (despesa ou receita) e já existir.

**Excluir uma movimentação já salva**: diga qual é, com o nome e o dia ou o valor. Por exemplo, "apaga o Uber de ontem" ou "tira esse último, foi engano". A Uni mostra um card com a movimentação, o valor, o dia e a conta. Toque em **Confirmar** para excluir ou em **Cancelar** para manter. Depois de excluir, o botão **Desfazer** fica disponível por 20 segundos e traz a movimentação de volta.

- Se mais de uma movimentação combinar, a Uni lista até cinco e pergunta qual.
- Pela conversa a Uni exclui uma movimentação por vez. Para apagar várias, use a tela Financeiro.
- Transferências, ajustes de saldo, parcelas e movimentações importadas só podem ser excluídos na tela Financeiro.

**Ver movimentações**: pergunte pelos itens, não só pelo total. Por exemplo, "quais foram os gastos com Uber esse mês" ou "o que eu paguei na sexta". A Uni lista até cinco movimentações com data, descrição, valor e conta. Quando todas são do mesmo tipo, mostra também o total. "Quanto gastei" responde só o total.

**Onde mais gastou, comparação e contas a pagar**:

- "com o que eu mais gastei em setembro?" responde a categoria com o maior gasto, quanto ela pesou nas saídas e as duas seguintes;
- "esse mês eu gastei mais que no mês passado?" compara o total de saídas com o período anterior do mesmo tamanho. Com o mês ainda em andamento, compara o mesmo trecho: de 1 a 14 de outubro contra de 1 a 14 de setembro;
- "o que tenho pra pagar essa semana?" lista as saídas previstas do período, da mais próxima à mais distante. Sem período, a Uni olha os próximos 7 dias.

**Teto de gasto por categoria**: defina, mude ou tire o teto mensal de uma categoria de saída, como "no máximo 600 por mês com Alimentação" ou "tira o teto de Lazer". A Uni mostra um card e só salva depois de **Confirmar**. É o mesmo teto da tela Registros e da Leitura do mês. Para saber como está, pergunte "quanto ainda posso gastar com Lazer?" ou "como estão meus tetos?": a Uni responde o gasto do mês, o teto e quanto falta ou quanto passou.

**Contas**: a Uni cria, renomeia, arquiva e reativa contas pela conversa. Por exemplo, "cria uma conta no Inter", "muda o nome da conta Nubank para Nubank PJ", "arquiva a conta do Santander" ou "volta a usar a conta da Caixa". A conta nova começa com saldo zero. Arquivar tira a conta das escolhas, e os lançamentos dela continuam no Financeiro.

**Categorias**: a Uni cria, renomeia, exclui, oculta e mostra de novo categorias pela conversa. Por exemplo, "cria a categoria Pets", "troca o nome de Moradia para Casa", "tira a categoria Dívidas", "esconde a categoria Presentes" ou "volta a mostrar Educação". A Uni mostra um card com o que vai mudar e só salva depois de **Confirmar**. "Quais são as minhas categorias" lista as categorias por tipo. Categorias padrão do app não podem ser renomeadas nem excluídas, mas podem ser ocultadas. "Outras despesas", "Outras entradas" e "Transferência" não podem ser ocultadas.

**Metas**: a Uni cria, altera, exclui e consulta metas. Por exemplo, "quero juntar 5 mil para a viagem até dezembro", "muda a meta da viagem para 8 mil", "apaga a meta do carro" ou "como está a meta da viagem". Criar, alterar e excluir passam por um card de confirmação. Uma meta que já tem dinheiro guardado (aporte ou valor inicial) só pode ser excluída na tela Metas.

**Aporte e retirada de meta**: diga quanto guardou ou tirou, como "guardei 400 na viagem" ou "tirei 200 do casamento". O card mostra o valor, a data, a transferência que entra no Financeiro e quanto fica guardado. Se houver mais de uma conta possível, a Uni pergunta de qual saiu o dinheiro. Para não lançar no Financeiro, diga "só na meta".

**Agenda**: além de marcar um compromisso, a Uni remarca ("passa o dentista pra quinta"), cancela ("desmarca o almoço com a Carla"), conclui ("já fiz a reunião") e exclui ("apaga o lembrete da vacina"). Cancelar muda o status do item; excluir apaga. Antes de cancelar ou excluir, a Uni pergunta se pode. Responda "sim" ou "não". Compromisso não tem card.

Para consultar a agenda, pergunte "o que tenho amanhã?", "tenho reunião hoje?", "estou livre sexta?" ou "que horas é a reunião com o João?". A Uni lê a agenda na hora, inclusive os eventos que vieram do Google Agenda. Sem dia na pergunta, ela lista os compromissos de hoje em diante, até dez. Os demais ficam na tela Agenda.

**Perguntas financeiras** (saldo, gastos do mês, etc.) são respondidas com base nos dados reais do espaço ativo.

**Perguntas sobre previsão/tendência futura** não são respondidas pela IA generativa — para evitar números inventados, esse tipo de pergunta é tratado de forma determinística ou direcionado para a tela de Visão de Futuro.

**Histórico de conversas**: fica salvo e sincronizado com a conta, e não se perde ao trocar de dispositivo quando você está online. Toque em "Ver histórico" para abrir uma conversa antiga ou apagar uma conversa inteira. Toque em "Nova conversa" para começar do zero.

## Diferenças PF/PJ

As respostas da Uni consideram os dados do espaço ativo no momento da pergunta — mudar de espaço muda o contexto das respostas.

## Desktop / mobile

Mesma experiência de chat em ambos.

## Permissões

Cada usuário só acessa suas próprias conversas.

## Pré-requisitos

Sessão autenticada. A geração de respostas por IA depende de configuração de servidor (chave da OpenAI) — se não estiver configurada, a Uni ainda responde por regras determinísticas para as perguntas mais comuns, mas não gera texto livre.

## Limitações atuais

- A Uni pede confirmação antes de qualquer ação. A única exceção é o lançamento direto com Desfazer, descrito em "Como a Uni escolhe a categoria".
- A Uni não acessa dados de outro espaço ou de outro usuário.
- Pela conversa não dá para alterar ou excluir transferências, ajustes de saldo, parcelas nem movimentações importadas, nem trocar despesa por receita. Faça isso na tela Financeiro.
- A Uni exclui uma movimentação por vez. Exclusão em lote só na tela Financeiro.
- Pela conversa não dá para excluir conta, acertar saldo nem criar cartão de crédito, que pede dia de fechamento e vencimento. Contas do Open Finance também só mudam pela tela Contas.
- Mudar um único lançamento de uma série recorrente só na tela Financeiro. Pela conversa, a mudança vale do próximo previsto em diante.
- A Uni procura entre as movimentações mais recentes. Para uma movimentação mais antiga, diga o dia em que ela foi feita.
- Não há memória psicológica ou perfil comportamental ilimitado sendo usado nas respostas do chat nesta fase.
- O botão de atalho "Perguntar à Uni" em várias telas (CRM, Clientes, Agenda, Relatórios, Configurações, Projetos) ainda está desabilitado ("Disponível em breve") — hoje a conversa acontece na Home, na tela de voz e em `/app/uni`.

## Mensagens de erro conhecidas

Quando a IA não está configurada ou falha, a Uni informa que não conseguiu gerar uma resposta no momento e sugere tentar novamente, sem inventar uma resposta.

## Funcionalidades ainda não disponíveis

- Atalhos de "Perguntar à Uni" a partir de outras telas do produto.
- Execução de ações fora do fluxo de confirmação explícita, além do lançamento direto com Desfazer.
