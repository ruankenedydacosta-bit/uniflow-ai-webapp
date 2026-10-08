# Chat da Uni

## Finalidade

Conversar em linguagem natural com a assistente Uni para tirar dúvidas e registrar movimentações financeiras.

## Onde encontrar

`/app/uni`. Para abrir a conversa, toque em "Ver conversa completa" na Home ou em "Conversa" na tela de voz.

No topo da conversa ficam a Uni, o espaço ativo ("Espaço Pessoal") e dois botões: "Ver histórico" e "Nova conversa". Embaixo fica o campo "Escreva ou fale com a Uni". Com o campo vazio, o botão à direita grava sua voz. Depois que você digita, o mesmo botão envia a mensagem.

## Passo a passo

**Registrar uma movimentação por chat**: descreva a movimentação em linguagem natural (ex.: "gastei 50 reais no mercado"). A Uni mostra um card de rascunho com o tipo ("Saída · rascunho" ou "Entrada · rascunho"), a categoria, o valor, a conta, a descrição e a data. Confira os dados e toque em **Confirmar** para salvar. **Editar** abre os campos no próprio card e **Cancelar** descarta o rascunho. **Nada é salvo antes de você tocar em Confirmar.** A Uni nunca registra, edita ou apaga uma movimentação sem a sua confirmação.

**Alterar uma movimentação já salva**: diga qual é a movimentação e o que muda. Por exemplo:

- "corrige o mercado de ontem pra 50 reais";
- "muda a categoria do iFood de sexta pra Lazer";
- "o Uber de segunda foi no Nubank".

A Uni procura a movimentação pelo nome, pelo dia, pelo valor ou pela conta que você disser e mostra um card "Alteração · rascunho" com o valor de antes e o de depois (por exemplo, "R$ 32,00 → R$ 50,00"). Toque em **Confirmar** para salvar ou em **Cancelar** para deixar como estava. Para ajustar antes de confirmar, diga só a mudança ("não, pra 60").

- Se mais de uma movimentação combinar com o que você disse, a Uni lista até cinco e pergunta qual. Responda com o número ("a segunda") ou com um detalhe ("a de 85", "a do Nubank").
- Logo depois de confirmar uma movimentação, "corrige pra 50" ou "na verdade foi 50" altera essa mesma movimentação.
- Dá para mudar valor, data, conta, categoria e descrição. A categoria nova precisa ser do mesmo tipo (despesa ou receita) e já existir.

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
- Pela conversa não dá para alterar transferências, ajustes de saldo, parcelas nem movimentações importadas, nem apagar movimentações ou trocar despesa por receita. Faça isso na tela Financeiro.
- A Uni procura entre as movimentações mais recentes. Para uma movimentação mais antiga, diga o dia em que ela foi feita.
- Não há memória psicológica ou perfil comportamental ilimitado sendo usado nas respostas do chat nesta fase.
- O botão de atalho "Perguntar à Uni" em várias telas (CRM, Clientes, Agenda, Relatórios, Configurações, Projetos) ainda está desabilitado ("Disponível em breve") — hoje a conversa acontece na Home, na tela de voz e em `/app/uni`.

## Mensagens de erro conhecidas

Quando a IA não está configurada ou falha, a Uni informa que não conseguiu gerar uma resposta no momento e sugere tentar novamente, sem inventar uma resposta.

## Funcionalidades ainda não disponíveis

- Atalhos de "Perguntar à Uni" a partir de outras telas do produto.
- Execução de ações fora do fluxo de confirmação explícita.
