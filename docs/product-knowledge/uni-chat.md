# Chat da Uni

## Finalidade

Conversar em linguagem natural com a assistente Uni para tirar dúvidas e registrar movimentações financeiras.

## Onde encontrar

`/app/uni`. Para abrir a conversa, toque em **Mais** na barra inferior e depois em **Conversa com a Uni**. Na tela de voz, toque em **Conversa**.

No topo da conversa ficam a Uni, o espaço ativo ("Espaço Pessoal") e dois botões: "Ver histórico" e "Nova conversa". Embaixo fica o campo "Escreva ou fale com a Uni". Com o campo vazio, o botão à direita grava sua voz. Depois que você digita, o mesmo botão envia a mensagem.

## Passo a passo

**Registrar uma movimentação por chat**: descreva a movimentação em linguagem natural (ex.: "gastei 50 reais no mercado"). A Uni mostra um card de rascunho com o tipo ("Saída · rascunho" ou "Entrada · rascunho"), a categoria, o valor, a conta, a descrição e a data. Confira os dados e toque em **Confirmar** para salvar. **Editar** abre os campos no próprio card e **Cancelar** descarta o rascunho. **Nada é salvo antes de você tocar em Confirmar.** A Uni nunca registra, edita ou apaga uma movimentação sem a sua confirmação.

**Alterar uma movimentação já salva**: diga qual é a movimentação e o que muda. Por exemplo:

- "corrige o mercado de ontem pra 50 reais";
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

**Categorias**: a Uni cria, renomeia e exclui categorias pela conversa. Por exemplo, "cria a categoria Pets", "troca o nome de Moradia para Casa" ou "tira a categoria Dívidas". A Uni mostra um card com o que vai mudar e só salva depois de **Confirmar**. "Quais são as minhas categorias" lista as categorias por tipo. Categorias padrão do app não podem ser renomeadas nem excluídas.

**Metas**: a Uni cria, altera, exclui e consulta metas. Por exemplo, "quero juntar 5 mil para a viagem até dezembro", "muda a meta da viagem para 8 mil", "apaga a meta do carro" ou "como está a meta da viagem". Criar, alterar e excluir passam por um card de confirmação. Uma meta que já tem dinheiro guardado (aporte ou valor inicial) só pode ser excluída na tela Metas.

**Aporte e retirada de meta**: diga quanto guardou ou tirou, como "guardei 400 na viagem" ou "tirei 200 do casamento". O card mostra o valor, a data, a transferência que entra no Financeiro e quanto fica guardado. Se houver mais de uma conta possível, a Uni pergunta de qual saiu o dinheiro. Para não lançar no Financeiro, diga "só na meta".

**Agenda**: além de marcar um compromisso, a Uni remarca ("passa o dentista pra quinta"), cancela ("desmarca o almoço com a Carla"), conclui ("já fiz a reunião") e exclui ("apaga o lembrete da vacina"). Cancelar muda o status do item; excluir apaga. Antes de cancelar ou excluir, a Uni pergunta se pode. Responda "sim" ou "não". Compromisso não tem card.

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

- A Uni não executa ações sozinha — sempre pede confirmação.
- A Uni não acessa dados de outro espaço ou de outro usuário.
- Pela conversa não dá para alterar ou excluir transferências, ajustes de saldo, parcelas nem movimentações importadas, nem trocar despesa por receita. Faça isso na tela Financeiro.
- A Uni exclui uma movimentação por vez. Exclusão em lote só na tela Financeiro.
- A Uni procura entre as movimentações mais recentes. Para uma movimentação mais antiga, diga o dia em que ela foi feita.
- Não há memória psicológica ou perfil comportamental ilimitado sendo usado nas respostas do chat nesta fase.
- O botão de atalho "Perguntar à Uni" em várias telas (CRM, Clientes, Agenda, Relatórios, Configurações, Projetos) ainda está desabilitado ("Disponível em breve") — hoje a conversa acontece na Home, na tela de voz e em `/app/uni`.

## Mensagens de erro conhecidas

Quando a IA não está configurada ou falha, a Uni informa que não conseguiu gerar uma resposta no momento e sugere tentar novamente, sem inventar uma resposta.

## Funcionalidades ainda não disponíveis

- Atalhos de "Perguntar à Uni" a partir de outras telas do produto.
- Execução de ações fora do fluxo de confirmação explícita.
