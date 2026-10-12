# Metas

## Finalidade

Definir e acompanhar metas financeiras (ex.: reserva de emergência, uma viagem, um equipamento).

## Onde encontrar

Mais → Produto → Metas (`/app/metas`). A rota antiga `/objetivos` redireciona para ela.

## Passo a passo

1. Criar uma meta com nome, categoria, valor-alvo, valor inicial, aporte mensal planejado, datas de início e de alvo, prioridade e (opcional) conta vinculada.
2. Registrar aportes ao longo do tempo: tocar na meta e escolher "Registrar aporte".
3. Acompanhar o progresso na lista, separada em "Ativas" e "Concluídas". O topo mostra quanto está guardado nas metas ativas e o percentual do total; meta pausada fica fora dessa conta. Cada meta mostra o percentual, o valor guardado, um selo de ritmo — "No ritmo", "Atenção" ou "Atrasada" — e uma linha de apoio: o valor por mês e o mês do alvo, quanto falta, ou "Sem aporte há N meses" quando a meta está há 2 meses ou mais sem aporte.
4. Ajustar o plano quando a meta atrasa. Na meta com valor por mês definido, o selo compara esse valor com o que falta até a data: se faltar até um mês de aporte, a meta fica em "Atenção"; se faltar mais, fica "Atrasada". Na meta sem valor por mês, o selo compara o percentual guardado com o tempo que já passou desde o início. A meta só vence no dia seguinte à data-alvo. Em "Atenção" ou "Atrasada", abra a meta e toque em "Ajustar plano". Escolha uma opção, veja o efeito calculado e toque em "Salvar ajuste":
   - Guardar mais por mês: a data fica a mesma e o valor por mês sobe.
   - Mudar a data: o valor por mês fica o mesmo e a data vai para quando ele cobre o que falta.
   - Reduzir a meta: a data e o valor por mês ficam os mesmos e o valor da meta baixa.
   - Pausar a meta: os lembretes param até você retomar a meta pelo botão "Retomar meta".

## Diferenças PF/PJ

Metas existem em ambos os espaços, com dados independentes.

## Desktop / mobile

Mesma funcionalidade em ambos, com layout adaptado.

## Permissões

Criar/editar depende do papel no espaço (owner/admin/member).

## Pré-requisitos

Nenhum além de ter um espaço ativo.

## Limitações atuais

Pela conversa e pela voz, a Uni cria, altera, exclui e consulta metas, sempre com um card de confirmação antes de salvar. Uma meta que já tem dinheiro guardado (aporte ou valor inicial) só pode ser excluída na tela Metas.

A Uni também registra aporte e retirada: "guardei 400 na viagem" ou "tirei 200 do casamento". O card mostra o valor, a data, a transferência que entra no Financeiro e quanto fica guardado. As regras são as mesmas da tela: a transferência vai da conta de onde saiu o dinheiro para a conta vinculada à meta (na retirada, o inverso). Quando há mais de uma conta possível, a Uni pergunta de qual saiu. Para não lançar no Financeiro, diga "só na meta". Meta sem conta vinculada recebe o aporte sem transferência. Retirada maior que o valor guardado e meta concluída são recusadas. Meta pausada só aceita retirada.

## Mensagens de erro conhecidas

Nenhuma específica documentada nesta fase.

## Funcionalidades ainda não disponíveis

Nenhuma identificada.
