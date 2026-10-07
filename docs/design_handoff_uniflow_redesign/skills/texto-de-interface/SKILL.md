---
name: texto-de-interface
description: A voz do texto que o usuário final lê — rótulo, placeholder, estado vazio, aviso, mensagem de erro, descrição de card, artigo de ajuda. Traz a régua de 19 padrões extraída de uma revisão real (o que um segundo modelo mudou ao reescrever a plataforma inteira), a causa de o texto sair autoral por padrão (o modelo imita a voz dos docs internos, que é densa e aforística de propósito), e os três guarda-corpos que impedem a concisão de comer informação que o leitor precisa. Use ao escrever ou editar qualquer texto de tela, ao entregar feature nova, ao criar artigo de ajuda ou descrição de área, ao revisar os textos de um produto inteiro, e ao escrever corpo de PR ou de commit (seção própria, com a régua adaptada a leitor dev). Gatilhos: descrição de PR, corpo de PR, mensagem de commit, microcopy, copy, texto da tela, rótulo, label, placeholder, estado vazio, empty state, mensagem de erro, aviso, tooltip, título de seção, descrição, frontmatter, manifest, artigo de ajuda, onboarding, revisar textos, texto robótico, texto pouco natural.
---

# Texto de interface: escrever para quem opera, não para quem construiu

Régua extraída de uma revisão real: a plataforma-insejec teve os textos
reescritos por um segundo modelo, em [PR #689](https://github.com/jonatasoc/plataforma-insejec/pull/689)
(10 telas) e no commit `f7ab1a6` (Central de Ajuda inteira), 2026-09-22. Os 19
padrões abaixo são o que mudou, item a item. Vale em qualquer produto para
usuário final em pt-BR.

## Por que sai errado por padrão

O modelo escreve microcopy imitando a única voz que o repositório mostra: a do
`CLAUDE.md`, das rules e dos `docs/`. Essa voz é densa e aforística **de
propósito** — travessão emendando oração, imagem no lugar da definição, "é isso
que separa X de Y". Ela é ótima num documento interno dirigido a um dev, que lê
uma vez e precisa lembrar. E é errada num rótulo dirigido a uma secretária de 54
anos que abre a tela às 20h de quarta para fechar o mês.

O resultado não é "texto ruim" — é **texto autoral**. Ele comenta a tela em vez
de instruir a pessoa. O sintoma que o dono percebe é "o outro modelo escreveu
mais natural"; a causa é que o outro modelo não tinha esses docs por perto.

## Onde vale — e onde não vale

**Vale** em tudo que o usuário final lê: rótulo, placeholder, dica de campo,
título e descrição de card, estado vazio, aviso, toast, mensagem de erro,
artigo de ajuda, descrição de área, `description` de frontmatter, e-mail
transacional, página legal.

**Vale com adaptação** em corpo de PR e de commit: o leitor é dev, mas lê fora
da sessão que produziu o texto. Ver [Corpo de PR e de commit](#corpo-de-pr-e-de-commit).

**Não vale** em `.claude/rules/`, `docs/`, ADR, comentário de código e prompt
de sistema. Ali o leitor é um dev, o travessão comprime bem e o aforismo é o que
faz a regra grudar. **A troca de registro é público ↔ interno**, não "conciso ↔
prolixo": os dois são concisos, e só um pode ser autoral.

---

## A. A frase

**1. Travessão emendando oração explicativa vira ponto final.** É o padrão mais
frequente — apareceu em 9 dos 10 arquivos da PR.

> ❌ Os números abaixo são os que foram congelados no fechamento — é o balancete que foi apresentado, e ele não muda mais.
> ✅ Estes valores foram fechados e não mudam mais.

**2. Aposto com dois-pontos também vira frase.** Mesma regra, outro sinal.

> ❌ A estrutura de ensino da igreja: escolas, cursos, turmas e aulas.
> ✅ Organize escolas, cursos, turmas e aulas.

**3. Uma ideia por frase.** Se a frase tem três orações empilhadas, são três
frases. Quem lê microcopy não relê.

**4. Instrução positiva: diga o que fazer, não o que evitar.**

> ❌ Tente o nome da tarefa em vez do nome do menu — "lançar presença", "transferir membro".
> ✅ Procure pela tarefa que você quer realizar, como "lançar presença" ou "transferir membro".

## B. A voz

**5. Instrua a pessoa, não descreva a tela.** O texto de apoio de um card
responde "o que eu faço com isto", não "o que isto é".

> ❌ Onde o dinheiro estava no fim do mês — é o que se confere contra o extrato do banco.
> ✅ Confira os saldos das contas com o extrato bancário.

**6. Segunda pessoa, não terceira impessoal.**

> ❌ Nenhuma conversa por aqui ainda.
> ✅ Você ainda não tem conversas salvas.

**7. Regra, não aforismo.** A imagem é mais bonita e explica menos.

> ❌ Fundo **restrito** é o que o doador carimbou — a liderança não remaneja.
> ✅ Um fundo **restrito** só pode ser usado na finalidade definida pelo doador.

**8. Sem ênfase retórica.** Negação enfática, posse retórica e reforço moral
saem — eles tranquilizam o autor, não o leitor.

> ❌ Nada foi apagado nem escondido — só o cadastro de **novos** membros fica pausado.
> ✅ Os dados continuam disponíveis, mas o cadastro de **novos** membros fica pausado.

> ❌ Não reescreve nada, e não salva — quem salva é você.
> ✅ O conteúdo não é reescrito nem salvo automaticamente.

**9. Não defenda a decisão de produto.** O usuário não está julgando o design;
ele quer saber o que a tela faz. "E isso é de propósito" é o autor se
antecipando a uma crítica que ninguém fez.

> ❌ A lista **não está em ordem alfabética**, e isso é de propósito: a turma com **Chamada atrasada** vem primeiro. É por ela que se abre esta tela.
> ✅ A lista **não fica em ordem alfabética**: a turma com **Chamada atrasada** vem primeiro para facilitar o acompanhamento.

**10. A plataforma não tem vontade.** Antropomorfismo vira verbo neutro.

> ❌ a plataforma calcula sozinha · a plataforma não insiste · a plataforma põe o vencimento aqui sozinha
> ✅ A plataforma mostra esse aviso quando… · aulas passadas não geram esse aviso · os próximos vencimentos são criados automaticamente

## C. O vocabulário

**11. Termo padrão, não termo de casa.** O jargão interno é invisível para quem
o inventou.

> ❌ teto de membros · visão da federação · o pacote que vai ao contador
> ✅ limite de membros · dados consolidados · informações para a contabilidade

**12. Nomeie cada coisa pelo rótulo que está na tela.**

> ❌ Seu progresso na **documentação**
> ✅ Leitura da **Central de Ajuda**

**13. Um verbo por ação em todo o produto — e o estado vazio casa com o cheio.**

> ❌ "Digite duas letras para **buscar**" ao lado de "**Pesquise** pelo que você precisa"
> ❌ "ainda não **abriu** nenhum dos 84" ao lado de "já **leu** 12 de 84"
> ✅ pesquisar/Pesquise · "ainda não **leu** nenhum dos 84" / "**leu** 12 de 84"

## D. O trato com a pessoa

**14. Título de seção é nome, sem possessivo e sem instrução.**

> ❌ Seu progresso na documentação · Escolha a área
> ✅ Leitura da Central de Ajuda · Encontre o assunto

**15. Pergunte pelo que a pessoa não achou, não pelo que o produto falhou.**

> ❌ Faltou alguma coisa sobre Financeiro? · Nenhum destes resolve o seu caso?
> ✅ Não encontrou o que precisava em Financeiro? · Ainda não encontrou o que precisava?

**16. Estado final oferece o próximo passo, não elogio nem agradecimento.**
Parabenizar alguém por ler um artigo é ruído; "Obrigado pelo feedback" encerra
a conversa no ponto em que a pessoa ainda está com o problema.

> ❌ Que bom! Bom trabalho. · Anotado. Obrigado pelo feedback.
> ✅ Que bom! · Tudo bem. Se quiser, procure outro artigo na Central de Ajuda.

**17. Promessa feita em nome de gente leva ressalva.** "A gente escreve o
artigo" vira dívida da equipe com todo mundo que leu a frase.

> ❌ Conte pelo WhatsApp — a gente responde e escreve o artigo. · A secretaria responde no horário comercial.
> ✅ A gente ajuda e atualiza o artigo **quando for preciso**. · A secretaria nacional **atende** em horário comercial.

## E. Campo, metadado e descrição

**18. Descrição é tarefa com verbo, não inventário de substantivos.** Teto de
~20 palavras e no máximo 4 itens. A lista exaustiva é o autor provando que o
módulo faz muita coisa.

> ❌ Livro caixa, contas e fundos, comprovante, contas a pagar e a receber, fechamento do mês, balancete, o pacote que vai ao contador, os relatórios da tesouraria, o gasto por ministério e o orçamento do ano. (10 itens)
> ✅ Cuide do caixa, das contas, dos comprovantes e do balancete. Encontre também relatórios, informações para a contabilidade e o orçamento anual.

**19. Campo que o usuário lê não carrega nota de implementação.** Se a
explicação é para o próximo dev, ela é comentário de código.

> ❌ `manifest.descricao`: "Passo a passo de tudo que se faz na plataforma. A ordem das áreas e dos artigos aqui é a fonte da verdade da navegação; título e descrição de cada artigo vêm do frontmatter do próprio .md."
> ✅ "Passo a passo para usar a Plataforma INSEJEC." (o resto vira comentário no arquivo)

---

## Três guarda-corpos — o que a concisão NÃO pode comer

Cortar é fácil demais, e a mesma passada que tira o comentário autoral tira
informação de que o leitor precisa. Os três abaixo foram perdas reais da
revisão.

**a) Em artigo de ajuda, enumerar é o serviço.** Quem lê está com a tela aberta
conferindo item a item.

> ❌ (depois da revisão) Ali estão o professor, o horário, o período, **as métricas da turma** e as abas Alunos e Aulas.
> ✅ (antes) …as quatro métricas (**aulas dadas, matriculados, frequência média e quantos estão abaixo do combinado**)…

A régua corta **comentário sobre a tela**; ela não corta **item que o leitor
confere na tela**. Na dúvida, o parêntese fica.

**b) Termo que sai por concisão entra no campo de busca.** Descrição de artigo
costuma alimentar três consumidores ao mesmo tempo: o card, a busca da ajuda e
o corpus do RAG. Encurtar a `description` estreita recuperação, não só texto.
O que for cortado por elegância vai para `perguntas:` / keywords do
frontmatter. (Descrição de **área**, que em geral não é campo de busca, pode
encolher à vontade — confira antes qual é o seu caso.)

**c) A régua vale no arquivo inteiro.** A revisão reescreveu os parágrafos e
deixou intactos o heading `## "Chamada atrasada" não é um estado que alguém
escolhe` e o corpo do callout `> [!DIAGRAMA]` — os dois com a voz antiga, no
mesmo arquivo. Heading, legenda de diagrama, texto equivalente e `alt` passam
pela mesma régua que o corpo.

## Corpo de PR e de commit

A PR é lida depois, por quem não estava na sessão: o dono no dia seguinte, o
revisor, alguém procurando o porquê de uma linha pelo `git blame`. A voz
comprimida das rules sai ininteligível ali, porque se apoia em contexto que só
existia na conversa. O leitor continua sendo dev, então o vocabulário técnico
fica. O que muda é a frase.

**Valem as famílias A e C, mais os padrões 7, 8 e 9:**

- **Uma ideia por frase (1–3).** Cadeia de `→`, `;` e travessão vira frases
  curtas, na ordem em que as coisas acontecem.
- **Regra, não aforismo (7).** "O limite está fazendo o trabalho dele" não diz
  o que mudou.
- **Sem ênfase retórica nem defesa da decisão (8, 9).** "E isso é de propósito"
  sai. Se a alternativa descartada importa, diga qual foi e por que caiu.
- **Sem termo de casa (11).** Apelido criado durante a sessão ("o disjuntor",
  "a porta da feature", "o shell") só entra definido na primeira menção, ou sai.
- **Nome como aparece no código ou na tela (12).** Arquivo, função, rótulo de
  botão, rota.

**Não valem:** segunda pessoa (6) e próximo passo em vez de elogio (16) são
regras de tela.

**Ordem do corpo:** o que a pessoa via de errado, em termos observáveis. Depois
a causa. Depois a mudança. Depois como conferir. Começar pela causa técnica
obriga o leitor a adivinhar qual sintoma ela explica.

> ❌ Sem o `cleanUrls` (removido em 8f33e58), `/blog/<slug>` caía no catch-all → `app.html`; o Googlebot renderizava o SPA, ia para `/auth` e lia o `noindex`.
> ✅ Os posts são arquivos `.html`, mas a URL pública não tem a extensão. Desde que o `cleanUrls` saiu, em 8f33e58, `/blog/<slug>` caía no catch-all e recebia o `app.html`. O Googlebot rodava o app, era levado para `/auth` e lia o `noindex` de lá.

**Guarda-corpo, o mesmo de (a):** clareza não autoriza cortar informação.
Arquivo tocado, cenário concreto do bug, commit de origem, número de teste,
comando de verificação e risco pendente ficam. O que sai é a compressão, não o
dado.

## Revisar os textos de um produto inteiro

O procedimento que funcionou, em vez de "revise tudo":

1. **Inventarie por tipo, não por arquivo.** Estado vazio, dica de campo,
   descrição de card, aviso, título de seção, frontmatter. Cada tipo tem um
   defeito dominante — dica de campo adoece de aforismo, descrição adoece de
   inventário — e revisar por tipo faz o padrão aparecer.
2. **Uma passada por família (A–E), não uma por tela.** A consistência de verbo
   (13) e de rótulo (12) só se enxerga olhando todas as ocorrências juntas.
3. **Não toque no que é informação.** Número, nome de campo, condição,
   enumeração que o leitor confere. Se o diff tira um dado, é regressão.
4. **Releia o resultado procurando erro factual.** A revisão trocou "A sede
   concentra a visão de todas as INSEJECs… Isso é da igreja local" por "Na sede,
   este módulo mostra apenas dados consolidados" — numa tela cuja função é dizer
   que o módulo **não existe** na sede. Texto mais fluente que afirma outra coisa
   é pior que texto empolado.
5. **Regenere o que é derivado** (corpus do RAG, índice de busca) e rode o teste
   que compara a fonte com o gerado.

## Checklist antes de concluir

- [ ] Nenhum travessão nem dois-pontos emendando oração explicativa
- [ ] O texto instrui a pessoa (verbo) em vez de descrever a tela (substantivo)
- [ ] Segunda pessoa; nenhuma ênfase retórica, defesa do design ou "a plataforma quis"
- [ ] Nenhum termo de casa; cada coisa nomeada pelo rótulo que está na tela
- [ ] Um verbo por ação, e o estado vazio usando o mesmo do estado cheio
- [ ] Estado final com próximo passo; promessa em nome de gente com ressalva
- [ ] Descrição com verbo, ≤ ~20 palavras, ≤ 4 itens; zero nota de implementação
- [ ] Nenhuma enumeração que o leitor confere na tela foi cortada
- [ ] Termo cortado da descrição entrou em `perguntas:` / keywords
- [ ] Heading, callout, legenda e `alt` passaram pela mesma régua
- [ ] Nenhuma afirmação nova ficou factualmente errada
