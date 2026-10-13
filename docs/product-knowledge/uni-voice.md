# Voz da Uni

## Finalidade

Falar com a Uni e ouvir respostas escolhidas pelo usuário.

## Onde encontrar

Toque na Uni, no centro da barra inferior, para abrir a tela de voz. Na
conversa (`/app/uni`), use o microfone do campo "Escreva ou fale com a Uni" e o
botão "Ouvir" abaixo das respostas.

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
Uni Voz 60, Uni Voz Plus 180). Os minutos restantes ficam em Conta → Seu plano.
Quando eles acabam, use o texto, que não tem limite.

1. Tocar em "Ouvir" abaixo de uma resposta da Uni.
2. O áudio é gerado (ou reaproveitado do cache) e tocado automaticamente após esse toque — **não existe reprodução automática sem essa ação do usuário**.
3. É possível pausar, retomar ou parar a reprodução a qualquer momento.
4. Iniciar a reprodução de outra mensagem interrompe automaticamente a que estava tocando.

**Entrada por voz**: tocar no microfone inicia uma gravação curta. Tocar
novamente encerra e envia para transcrição. O texto reconhecido aparece na
conversa e segue as mesmas regras da digitação. Ações financeiras de receita e
despesa exigem confirmação, fora o lançamento direto com Desfazer; consultas de saldo, resumo do mês e objetivos
não escrevem dados.

**Reaproveitamento de áudio (cache)**: se a mesma resposta (mesmo texto, mesma voz, mesmo usuário) já foi gerada antes, o aplicativo reproduz o áudio já existente em vez de gerar de novo — isso significa que ouvir a mesma resposta outra vez, mesmo depois de atualizar a página ou de sair e entrar novamente na conta, **não consome créditos adicionais de geração de voz**. O cache é privado por usuário — outro usuário nunca tem acesso ao áudio já gerado por você, mesmo com o texto idêntico.

**Desativar a voz**: em Configurações → Preferências, desligar o interruptor "Permitir voz nas respostas da Uni". Com a voz desativada, o botão "Ouvir" some das respostas.

## Diferenças PF/PJ

O recurso é o mesmo, mas toda consulta ou ação usa exclusivamente o espaço
PF/PJ ativo. Uma captura iniciada em um espaço não pode operar no outro.

## Desktop / mobile

Mesma experiência em ambos.

## Permissões

Cada usuário só ouve e reaproveita o próprio áudio em cache; nunca o de outro usuário.

## Pré-requisitos

Saída de voz precisa estar habilitada nas Preferências. Entrada de voz depende
da permissão do microfone e da Edge de transcrição configurada no servidor. Se
um desses recursos estiver indisponível, a digitação continua funcionando.

## Limitações atuais

- Fora da conversa por voz em tempo real, ouvir uma resposta exige tocar em "Ouvir".
- Gravações do microfone na conversa por texto são curtas e não são armazenadas pela aplicação.
- Transferências e pagamentos não podem ser executados por voz nesta versão.
  Alterar ou excluir transferências, ajustes de saldo, parcelas e movimentações
  importadas também não.
- A Uni exclui uma movimentação por vez.
- O cache de áudio tem validade de 30 dias; depois disso, uma nova geração pode ocorrer mesmo para o mesmo texto.
- Configurações adicionais de voz (além do interruptor liga/desliga) ainda não estão disponíveis ("Voz e interação" está marcado "em breve").

## Mensagens de erro conhecidas

Se a geração de voz falhar ou não estiver configurada no servidor, a interface indica isso de forma clara, sem travar o restante do chat.

## Funcionalidades ainda não disponíveis

- Reprodução automática de respostas.
- Configurações avançadas de voz e interação.
