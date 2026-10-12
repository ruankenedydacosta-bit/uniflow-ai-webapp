# Roteiro de teste por voz: as 16 operações (épico #187)

Roteiro para conferir, numa conversa por voz real em produção, que tudo o que a tela faz em lançamentos, categorias, metas e agenda também sai pela Uni. Um teste por operação: a frase dita, o que a Uni precisa fazer e o que ela fala.

A conversa por voz não decide nada. Ela passa a frase ao chat (`enviar_para_uni`) e confirma o card (`responder_rascunho`). Por isso o roteiro vale também digitado em `/app/uni`: a diferença é só que, por voz, a confirmação é falada.

## Antes de começar

- Janela anônima, usuário de teste, espaço Pessoal.
- Pelo menos duas contas (ex.: Nubank e Itaú), três lançamentos recentes de Uber em dias diferentes, uma categoria sem uso (ex.: Pets) e uma meta em aberto sem valor inicial e sem aporte (ex.: Viagem).
- Confira em Conta → Seu plano que ainda há minutos de voz. Sem minutos, a conversa por voz não abre e o roteiro todo fica "não testado", não "falhou".
- Abra a conversa por voz pelo orb da Uni na barra inferior. Fale com pausas naturais.
- Registre o resultado de cada linha na issue #193: ok, falhou (com o que a Uni falou) ou não testado.

## Lançamentos

| # | Diga | A Uni faz | A Uni fala |
|---|---|---|---|
| 1 | "Gastei 48 reais de Uber hoje no Nubank" | Card "Saída · rascunho" com categoria, valor, conta e data. | O valor, o que é e a conta, e pergunta se pode confirmar. Diga "pode". |
| 2 | "Quais foram os meus gastos com Uber esse mês?" | Na tela: lista até 5 lançamentos com data, descrição, valor e conta, mais o total (o total só aparece quando todos são do mesmo tipo). | O essencial em uma frase, como o total e a quantidade. Nada que não esteja na resposta da tela. |
| 3 | "Corrige o Uber de hoje pra 52" | Card "Alteração · rascunho" com antes e depois. | O campo que muda, como estava e como fica. Diga "confirma". |
| 4 | "Apaga o Uber de hoje" | Card de exclusão com o lançamento, o valor, o dia e a conta. Depois de confirmar: "Desfazer" na tela por 20 segundos. | O que é, o valor e o dia, e pergunta se pode excluir. Diga "pode". Em seguida diga "desfazer": o lançamento volta. |
| 4b | "Apaga todos os Uber" | Não exclui nada. | Que pela conversa exclui um lançamento por vez e que o lote é na tela Financeiro. |
| 4c | "Apaga o Uber" (com três Uber recentes) | Lista até 5 candidatos. | Pergunta qual. Diga "o de ontem" ou "o número 2". |

## Categorias

| # | Diga | A Uni faz | A Uni fala |
|---|---|---|---|
| 5 | "Cria a categoria Pets" | Card "Criar categoria", tipo Saída. | O nome exato e pergunta se pode criar. Diga "pode". |
| 6 | "Quais são as minhas categorias?" | Lista as categorias por tipo. | A lista. |
| 7 | "Troca o nome de Pets para Animais" | Card "Renomear categoria". | De qual para qual, e pergunta se pode confirmar. |
| 8 | "Tira a categoria Animais" | Card "Excluir categoria". Categoria padrão do app ou sem permissão: recusa antes do card. | O nome e pergunta se pode excluir. |

## Metas

| # | Diga | A Uni faz | A Uni fala |
|---|---|---|---|
| 9 | "Quero juntar 5 mil para a viagem até dezembro" | Card de criar meta com nome, valor e prazo. | Nome, valor e prazo, e pergunta se pode criar. Depois de criar, avisa que o aporte se registra na tela Metas. |
| 10 | "Como está a meta da viagem?" | Responde sem card. | Quanto está guardado, quanto falta e o prazo. Sem alvo ("como estão as minhas metas?"), resume até 4 metas em aberto. |
| 11 | "Muda a meta da viagem para 8 mil" | Card de alterar meta com antes e depois. | O que muda e pergunta se pode confirmar. |
| 12 | "Apaga a meta da viagem" | Meta sem dinheiro guardado (sem aporte e sem valor inicial): card de excluir. Meta com dinheiro guardado: não exclui e manda para a tela Metas. | O nome e pergunta se pode excluir, ou explica que a meta tem dinheiro guardado e que a exclusão é na tela Metas. |

Aporte e retirada pela conversa ficam para depois da #158.

## Agenda

| # | Diga | A Uni faz | A Uni fala |
|---|---|---|---|
| 13 | "Marca dentista sexta às 15 horas" | Cria o compromisso. | Confirma o título, o dia e a hora. Compromisso não tem card. |
| 14 | "O que eu tenho essa semana?" | Lista os itens da agenda do período. | A lista. |
| 15 | "Passa o dentista pra segunda às 10" | Localiza pelo título e remarca na hora, sem perguntar. Ambíguo: pergunta qual. | "Pronto. Atualizei" com a data e a hora novas. Não há card nem pergunta de confirmação. |
| 16a | "Desmarca o dentista" | Pergunta "Quer mesmo cancelar dentista?" e muda o status para cancelado. | A pergunta; diga "sim". Depois, "Cancelei dentista". |
| 16b | "Já fiz a reunião" | Marca como concluído. | "Marquei reunião como concluído". |
| 16c | "Apaga o lembrete da vacina" | Pergunta se pode excluir e apaga de verdade. | A pergunta; diga "pode". Depois, "Excluí ... da sua agenda". |

## O que não pode acontecer

- A Uni dizer que registrou, alterou ou excluiu sem a resposta da ferramenta dizer isso.
- A Uni inventar valor, data, categoria ou conta que não veio na resposta.
- Exclusão sem card e sem pergunta.
- Exclusão em lote por qualquer frase.
- Pedido feito num espaço aparecer no outro.

## Se algo falhar

Anote a frase exata, o que a Uni falou e o que apareceu na tela. Frase mal interpretada vira caso novo em `src/features/uni-interpret/evalCases.js` e ajuste no prompt de `supabase/functions/_shared/uniInterpret/prompt.js`, avaliado com 2 rodadas de `scripts/uni-eval/avaliar-modelo.js`. Resposta falada errada com interpretação certa é instrução da sessão em `supabase/functions/uni-voice-realtime-session/index.ts`.
