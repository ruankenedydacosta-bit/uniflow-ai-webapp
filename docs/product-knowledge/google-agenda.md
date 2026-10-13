# Google Agenda

## Finalidade

Ver os compromissos do UniFlow no Google Agenda e trazer para o UniFlow os eventos das suas agendas do Google.

## Onde encontrar

Mais → Configurações → Preferências → Integrações → Google Agenda (`/app/conta/google-agenda`).

## Passo a passo

1. Toque em **Conectar ao Google Agenda**, entre na sua conta Google e permita todos os acessos pedidos. Ao voltar, a tela mostra o e-mail da conta conectada.
2. Ao conectar, o UniFlow cria na sua conta Google a agenda **"UniFlow · <nome do espaço>"**. Cada espaço tem a sua agenda. Se você conectar a mesma conta Google no espaço Pessoal e no espaço Empresa, aparecem duas agendas no Google.
3. Os compromissos futuros que você criou no espaço vão para o Google logo depois de conectar. A partir daí, cada compromisso que você criar, alterar ou cancelar no UniFlow é atualizado no Google.
4. Em **Agenda de destino**, escolha para qual agenda do Google vão os compromissos novos. A agenda "UniFlow · <nome do espaço>" vem marcada. Ao trocar de agenda, só os compromissos novos vão para a agenda escolhida. Os que já estão no Google continuam onde estão.
5. Em **Agendas lidas**, marque as agendas do Google cujos eventos devem aparecer no UniFlow. A agenda "UniFlow · <nome do espaço>" vem marcada. Ao desmarcar uma agenda, o UniFlow para de trazer eventos dela, e os eventos já trazidos continuam no app.
6. Em **Sincronização**, confira a hora da última sincronização. Para trazer as mudanças do Google na hora, toque em **Sincronizar agora**. Depois de sincronizar, aguarde 30 segundos para sincronizar de novo.

## O que vai para o Google

- Compromissos e lembretes que **você** criou no espaço. Compromisso criado por outra pessoa do espaço vai para o Google dela, se ela também tiver conectado.
- Contas a pagar e a receber da agenda vão como evento de dia inteiro.
- Compromisso com horário e sem horário de fim vai com 30 minutos de duração.
- Item sem autor registrado não vai para o Google.

## O que vem do Google

- Eventos das agendas marcadas em **Agendas lidas**, de 30 dias atrás até 1 ano à frente.
- Só agendas da sua própria conta podem ser lidas. Agenda compartilhada com você por outra pessoa aparece na lista com a caixa desabilitada.
- Evento marcado como privado no Google não entra no UniFlow.
- Ao alterar no Google um compromisso do UniFlow que está numa agenda lida, a mudança volta para o UniFlow.

## Excluir e desconectar

- Cancelar ou excluir no UniFlow um compromisso criado no UniFlow apaga o evento no Google.
- Excluir no UniFlow um evento que veio do Google **não** o apaga no Google.
- Ao tocar em **Desconectar**, o UniFlow para de sincronizar. Os compromissos continuam no UniFlow. A agenda "UniFlow · <nome do espaço>" e os eventos continuam na sua conta Google. Para apagá-los, exclua a agenda no próprio Google Agenda.

## Diferenças PF/PJ

A conexão é feita em cada espaço. Cada espaço tem a sua agenda "UniFlow · <nome do espaço>" e as suas escolhas de destino e de leitura.

## Desktop / mobile

Mesma tela nos dois, com layout adaptado.

## Permissões

Cada pessoa conecta a própria conta Google. Ninguém do espaço vê nem altera a conexão de outra pessoa.

## Pré-requisitos

Uma conta Google e um espaço ativo no UniFlow.

## Mensagens de erro conhecidas

- **"O Google não autoriza mais o acesso a esta conta. Conecte de novo para continuar."** O acesso foi removido na conta Google. Toque em **Conectar de novo**.
- **"Faltam permissões do Google. Conecte de novo e marque todas as permissões pedidas."** Toque em **Conectar de novo** e marque todas as caixas na tela do Google.
- **"A agenda de destino não existe mais no Google. Conecte de novo para continuar."** A agenda de destino foi excluída no Google. Toque em **Conectar de novo**.
- **"O Google não respondeu. Tente sincronizar de novo em alguns minutos."** O Google ficou fora do ar por um momento. A sincronização automática continua.

## Limitações atuais

O Google Agenda está disponível só para algumas contas nesta fase. Nas demais, a linha Google Agenda não aparece em Preferências, ou a tela mostra "O Google Agenda ainda não está disponível para a sua conta." ao tocar em Conectar ao Google Agenda.
