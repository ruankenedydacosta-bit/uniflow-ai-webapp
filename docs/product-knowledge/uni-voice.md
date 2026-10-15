# Voz da Uni

## Finalidade

Conversar com a Uni por voz, em tempo real.

## Onde encontrar

Toque na Uni, no centro da barra inferior, para abrir a tela de voz. A voz da
Uni existe só nessa conversa. Na conversa por texto (`/app/uni`), o campo
recebe apenas texto e as respostas não são lidas em voz alta.

## Passo a passo

**Conversa por voz em tempo real**: tocar no orb da Uni na barra inferior abre
a conversa por voz. Fale normalmente, com pausas: a Uni responde quando você
termina e você pode interromper a Uni falando. Para registrar, consultar saldo
ou mexer na agenda, a Uni usa o mesmo caminho do texto, e lançamentos continuam
exigindo confirmação no card. A exceção é o lançamento direto: uma despesa ou
receita cuja descrição você já confirmou 3 vezes seguidas na mesma categoria é
lançada sem card. A Uni fala o que lançou, e você diz "desfazer" em até 60
segundos para apagar. Veja o artigo "Como a Uni escolhe a categoria". Para encerrar sem tocar na tela, diga "pode
desligar" ou "encerra a conversa": a Uni se despede e a conversa termina. A
conversa também termina depois de um minuto sem ninguém falar ou quando você
sai do app.

Na tela de voz, o status acima da Uni mostra o que está acontecendo:

- **Ouvindo**: a Uni está ouvindo você e as ondas se mexem. Quando você
  termina de falar, o que você disse aparece em letras grandes, entre aspas.
- **Entendendo**: a Uni está processando o pedido.
- **Rascunho pronto**: o card de rascunho apareceu. Confira os dados e toque em
  **Confirmar**. Nada é salvo antes disso.

Se você fechar a tela de voz com um rascunho esperando, o card fica na Home até
você confirmar ou cancelar.

Também dá para responder ao card só falando, sem tocar na tela:

- **Confirmar**: diga que pode confirmar, com as suas palavras ("pode
  lançar", "fechou", "manda ver").
- **Cancelar**: diga que quer cancelar. Para desistir também da conta ou
  categoria que seria criada, diga "cancela tudo".
- **Corrigir**: diga o que muda, por exemplo "muda o valor pra cento e
  cinquenta" ou "foi no Nubank". O card é atualizado e a Uni pergunta de novo
  se pode confirmar. Se você pedir uma categoria que ainda não existe ("a
  categoria é Animais de Estimação"), a Uni pergunta se pode criá-la. Depois
  de criar, o rascunho volta com a categoria nova para você confirmar.
- **Corrigir entrada e saída**: se a Uni entendeu uma entrada como saída, ou o
  contrário, diga "não é despesa, é receita". O rascunho volta no tipo certo,
  também quando o card na tela é o de criar a categoria.

Se a resposta não estiver clara, a Uni pergunta antes de confirmar.

Compra parcelada também vai pela voz: diga o total e o número de parcelas,
como "comprei uma TV de três mil em dez vezes". A Uni fala o número de
parcelas, o valor de cada uma e a data da primeira, e pergunta se pode
confirmar. As parcelas com data depois de hoje ficam previstas.

Lançamento recorrente também: diga o valor e de quanto em quanto tempo
repete, como "aluguel de mil e quinhentos todo dia dez". A Uni fala o valor,
a regra e a data do primeiro lançamento, e pergunta se pode confirmar. Ao
confirmar, ela cria os lançamentos dos próximos 3 meses, e os seguintes são
criados sozinhos.

Também dá para alterar uma movimentação já salva falando, por exemplo
"corrige o mercado de ontem pra cinquenta" ou "o Uber de segunda foi no
Nubank". A Uni mostra o card "Alteração · rascunho" com o antes e o depois e
pergunta se pode confirmar. Responda como no rascunho: confirme, cancele ou
diga o que muda. Se mais de uma movimentação combinar, a Uni lê a lista e
pergunta qual. Responda com o número ou com um detalhe ("a de oitenta e
cinco").

Pela voz também dá para excluir uma movimentação ("apaga o Uber de ontem"),
criar, renomear ou excluir uma categoria ("cria a categoria Pets"), criar,
alterar, excluir ou consultar uma meta ("quero juntar 5 mil para a viagem até
dezembro") e remarcar, cancelar, concluir ou excluir um compromisso ("desmarca
o dentista"). Movimentação, categoria e meta passam por um card: a Uni lê o
que vai mudar e pergunta se pode confirmar. Depois de excluir uma
movimentação, diga "desfazer" em até 20 segundos para trazê-la de volta.
Compromisso não tem card: a Uni pergunta se pode e você responde "sim" ou
"não". Para ver os itens, pergunte por eles: "quais foram os gastos com Uber
esse mês", "quais são as minhas categorias", "como estão as minhas metas".

Os três botões de baixo fazem:

- **Escrever**: fecha a voz e abre a conversa para você digitar.
- **Parar**: termina a conversa por voz.
- **Conversa**: fecha a voz e abre a conversa completa.

Cada plano tem uma cota mensal de minutos de conversa por voz (Essencial 20,
Uni Voz 60, Uni Voz Plus 180). Os minutos restantes ficam em Mais → Seu plano.
Quando eles acabam, use o texto, que não tem limite.

Para não usar a voz, escreva na conversa por texto: ela não fala nem gasta
minutos.

## Diferenças PF/PJ

O recurso é o mesmo, mas toda consulta ou ação usa exclusivamente o espaço
PF/PJ ativo. Uma captura iniciada em um espaço não pode operar no outro.

## Desktop / mobile

Mesma experiência em ambos.

## Permissões

A conversa por voz usa só os dados do usuário que está nela.

## Pré-requisitos

A conversa por voz precisa da permissão do microfone, de assinatura ativa e de
minutos de voz no plano. Sem eles, a digitação continua funcionando.

## Limitações atuais

- A conversa por texto não lê as respostas em voz alta. Não existe botão "Ouvir".
- Transferências e pagamentos não podem ser executados por voz nesta versão.
  Alterar ou excluir transferências, ajustes de saldo, parcelas e movimentações
  importadas também não.
- A Uni exclui uma movimentação por vez.
- Não é possível escolher outra voz para a Uni.

## Mensagens de erro conhecidas

Se a conversa por voz não conectar, a tela de voz mostra "Não consegui conectar". Toque na Uni para tentar de novo ou toque em Escrever para continuar pelo texto.

## Funcionalidades ainda não disponíveis

- Escolha de voz e configurações avançadas de voz.
