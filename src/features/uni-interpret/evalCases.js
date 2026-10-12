// Conjunto de avaliação da interpretação de lançamentos (épico #104, F0 e F1).
//
// Cada caso é uma frase como o usuário fala ou digita e o resultado que uma
// pessoa atenta daria. Serve para medir as regras atuais e, depois, comparar
// os modelos candidatos do uni-interpret com a mesma régua.
//
// esperado.intent: lancar_saida | lancar_entrada | transferir | saldo |
//   meta | consulta | agenda | categoria | conversa.
// esperado.categoria: nome do catálogo do workspace; null quando a frase não
//   dá base para escolher e a Uni deve perguntar. `aceitas` lista outras
//   respostas igualmente corretas.
// esperado.novaCategoria: nome que o card deve propor criar, quando a pessoa
//   pede pelo nome uma categoria que não está no catálogo.
// esperado.data: ISO; ausente quando a frase não fala de data (vale hoje).
// esperado.titulo: em agenda, palavras que o título precisa ter (#142).
// esperado.pedido: em categoria, a ação (criar, renomear, excluir) e,
//   quando importa, o nome e o alvo, sem acento e caixa. Em agenda (#191), a
//   ação (editar, cancelar, concluir, excluir) e as palavras que o alvo
//   precisa ter. Em exclusao (#189), acao 'excluir_lancamento' com as
//   palavras que o alvo precisa ter e, quando importa, data, valor, ultimo e
//   lote.
//
// Data de referência de todos os casos: sexta, 02/10/2026.
//
// reservado: true marca o conjunto reservado. Ele nunca é usado para mexer no
// prompt: só para medir no fim, e por isso não pode ser lido para ajustar
// instruções nem exemplos. As 60 primeiras frases já foram vistas durante o
// ajuste e ficam fora da reserva.
//
// Limitação: a régua mede só a primeira operação da resposta. Frases com
// várias operações e correções de rascunho ficam fora do conjunto até a régua
// medir operação por operação.

export const DATA_REFERENCIA = '2026-10-02';

export const CASOS = [
  // Parcelamento e recorrência (#80): a régua confere que o modelo marca
  // compra parcelada e valor que se repete, e só eles.
  {
    id: 'geladeira-parcelada',
    frase: 'Comprei uma geladeira de 3.600 em 12x no cartão',
    esperado: { intent: 'lancar_saida', valor: 3600, categoria: 'Moradia', aceitas: ['Outras despesas'], parcelas: 12 },
  },
  {
    id: 'celular-parcelas-de',
    frase: 'peguei um celular novo, 10 parcelas de 250',
    esperado: { intent: 'lancar_saida', valor: 2500, categoria: 'Outras despesas', parcelas: 10 },
  },
  {
    id: 'terceira-parcela-notebook',
    frase: 'paguei a terceira parcela do notebook, 400',
    esperado: { intent: 'lancar_saida', valor: 400, categoria: 'Outras despesas', aceitas: ['Dívidas'] },
  },
  {
    id: 'academia-todo-mes',
    frase: 'pago 120 de academia todo mês',
    esperado: { intent: 'lancar_saida', valor: 120, categoria: 'Saúde', aceitas: ['Lazer'], recorrente: true },
  },
  {
    id: 'aluguel-recebido-todo-mes',
    // Sem dia do mês: numa recorrência, "todo dia 5" não diz quando foi o
    // lançamento, e a régua não tem como esperar uma data só.
    frase: 'recebo 2.000 do aluguel do apartamento todo mês',
    esperado: { intent: 'lancar_entrada', valor: 2000, categoria: 'Aluguel recebido', recorrente: true },
  },
  // Falsos positivos conhecidos das regras de palavra-chave.
  {
    id: 'escola-das-criancas',
    frase: 'Lance 300 reais referente a mensalidade escolar das crianças.',
    esperado: { intent: 'lancar_saida', valor: 300, categoria: 'Educação' },
  },
  {
    id: 'das-preposicao-luz',
    frase: 'Paguei 180 da conta de luz das duas casas',
    esperado: { intent: 'lancar_saida', valor: 180, categoria: 'Moradia' },
  },
  {
    id: 'pagamento-dentista',
    frase: 'Fiz o pagamento de 250 do dentista',
    esperado: { intent: 'lancar_saida', valor: 250, categoria: 'Saúde' },
  },
  {
    id: 'casa-mercado',
    frase: 'Gastei 90 no mercado perto de casa',
    esperado: { intent: 'lancar_saida', valor: 90, categoria: 'Alimentação' },
  },
  {
    id: 'cliente-almoco',
    frase: 'Paguei 120 no almoço com um cliente',
    esperado: { intent: 'lancar_saida', valor: 120, categoria: 'Alimentação' },
  },
  {
    id: '99-numero',
    frase: 'Comprei um tênis de 99 reais',
    esperado: { intent: 'lancar_saida', valor: 99, categoria: 'Outras despesas' },
  },
  {
    id: 'casa-reforma',
    frase: 'Gastei 1200 com a reforma da casa',
    esperado: { intent: 'lancar_saida', valor: 1200, categoria: 'Moradia' },
  },

  // Despesas do dia a dia, sem palavra-chave óbvia.
  {
    id: 'material-escolar',
    frase: 'Comprei o material escolar do Pedro, deu 340',
    esperado: { intent: 'lancar_saida', valor: 340, categoria: 'Educação' },
  },
  {
    id: 'ingles',
    frase: 'Paguei 450 do inglês da Ana',
    esperado: { intent: 'lancar_saida', valor: 450, categoria: 'Educação' },
  },
  {
    id: 'remedio',
    frase: 'Gastei 63,90 de remédio',
    esperado: { intent: 'lancar_saida', valor: 63.9, categoria: 'Saúde' },
  },
  {
    id: 'plano-de-saude',
    frase: 'Saiu 780 do plano de saúde',
    esperado: { intent: 'lancar_saida', valor: 780, categoria: 'Saúde' },
  },
  {
    id: 'academia',
    frase: 'Paguei a academia, 110 reais',
    esperado: { intent: 'lancar_saida', valor: 110, categoria: 'Saúde', aceitas: ['Lazer'] },
  },
  {
    id: 'ifood',
    frase: 'Pedi um ifood de 58',
    esperado: { intent: 'lancar_saida', valor: 58, categoria: 'Alimentação' },
  },
  {
    id: 'padaria-ontem',
    frase: 'Ontem gastei 22 na padaria',
    esperado: { intent: 'lancar_saida', valor: 22, categoria: 'Alimentação', data: '2026-10-01' },
  },
  {
    id: 'acougue',
    frase: 'Deixei 145 no açougue',
    esperado: { intent: 'lancar_saida', valor: 145, categoria: 'Alimentação' },
  },
  {
    id: 'uber',
    frase: 'Uber de 32 reais pro aeroporto',
    esperado: { intent: 'lancar_saida', valor: 32, categoria: 'Transporte' },
  },
  {
    id: 'estacionamento',
    frase: 'Paguei 25 de estacionamento',
    esperado: { intent: 'lancar_saida', valor: 25, categoria: 'Transporte' },
  },
  {
    id: 'pedagio',
    frase: 'Gastei 18,40 de pedágio',
    esperado: { intent: 'lancar_saida', valor: 18.4, categoria: 'Transporte' },
  },
  {
    id: 'oficina',
    frase: 'A revisão do carro na oficina custou 890',
    esperado: { intent: 'lancar_saida', valor: 890, categoria: 'Transporte' },
  },
  {
    id: 'ipva',
    frase: 'Paguei o IPVA, 1.430 reais',
    esperado: { intent: 'lancar_saida', valor: 1430, categoria: 'Transporte', aceitas: ['Outras despesas'] },
  },
  {
    id: 'aluguel-pessoal',
    frase: 'Paguei o aluguel, 2.100',
    esperado: { intent: 'lancar_saida', valor: 2100, categoria: 'Moradia' },
  },
  {
    id: 'condominio',
    frase: 'Saiu 650 de condomínio',
    esperado: { intent: 'lancar_saida', valor: 650, categoria: 'Moradia' },
  },
  {
    id: 'internet',
    frase: 'Paguei 99,90 da internet',
    esperado: { intent: 'lancar_saida', valor: 99.9, categoria: 'Moradia' },
  },
  {
    id: 'gas',
    frase: 'Comprei um botijão de gás por 120',
    esperado: { intent: 'lancar_saida', valor: 120, categoria: 'Moradia' },
  },
  {
    id: 'iptu',
    frase: 'Primeira parcela do IPTU, 230 reais',
    esperado: { intent: 'lancar_saida', valor: 230, categoria: 'Moradia', aceitas: ['Outras despesas'] },
  },
  {
    id: 'diarista',
    frase: 'Paguei 180 pra diarista',
    esperado: { intent: 'lancar_saida', valor: 180, categoria: 'Moradia' },
  },
  {
    id: 'netflix',
    frase: 'Netflix 55,90',
    esperado: { intent: 'lancar_saida', valor: 55.9, categoria: 'Assinaturas' },
  },
  {
    id: 'celular',
    frase: 'Paguei 60 do plano do celular',
    esperado: { intent: 'lancar_saida', valor: 60, categoria: 'Assinaturas', aceitas: ['Moradia'] },
  },
  {
    id: 'cinema',
    frase: 'Fomos ao cinema, gastei 76',
    esperado: { intent: 'lancar_saida', valor: 76, categoria: 'Lazer' },
  },
  {
    id: 'presente-aniversario',
    frase: 'Comprei um presente de aniversário pra minha mãe de 150',
    esperado: { intent: 'lancar_saida', valor: 150, categoria: 'Outras despesas', aceitas: ['Lazer'] },
  },
  {
    id: 'racao',
    frase: 'Gastei 210 de ração pro cachorro',
    esperado: { intent: 'lancar_saida', valor: 210, categoria: 'Outras despesas' },
  },
  {
    id: 'parcela-emprestimo',
    frase: 'Paguei 800 da parcela do empréstimo',
    esperado: { intent: 'lancar_saida', valor: 800, categoria: 'Dívidas' },
  },
  {
    id: 'fatura-cartao-atrasada',
    frase: 'Quitei 400 da fatura atrasada do cartão',
    esperado: { intent: 'lancar_saida', valor: 400, categoria: 'Dívidas' },
  },
  {
    id: 'dizimo',
    frase: 'Dei 300 de dízimo',
    esperado: { intent: 'lancar_saida', valor: 300, categoria: 'Outras despesas' },
  },
  {
    id: 'valor-por-extenso',
    frase: 'Gastei cinquenta reais de farmácia',
    esperado: { intent: 'lancar_saida', valor: 50, categoria: 'Saúde' },
  },
  {
    id: 'mil-e-duzentos',
    frase: 'Paguei mil e duzentos da escola',
    esperado: { intent: 'lancar_saida', valor: 1200, categoria: 'Educação' },
  },

  // Sem base para escolher categoria: a Uni deve perguntar.
  {
    id: 'sem-descricao',
    frase: 'Gastei 50',
    esperado: { intent: 'lancar_saida', valor: 50, categoria: null },
  },
  {
    id: 'descricao-vaga',
    frase: 'Paguei 200 pro João',
    esperado: { intent: 'lancar_saida', valor: 200, categoria: null },
  },

  // Entradas.
  {
    id: 'salario',
    frase: 'Caiu meu salário, 4.500',
    esperado: { intent: 'lancar_entrada', valor: 4500, categoria: 'Salário' },
  },
  {
    id: 'freela-site',
    frase: 'Recebi 1.500 de um site que fiz',
    esperado: { intent: 'lancar_entrada', valor: 1500, categoria: 'Freelance' },
  },
  {
    id: 'pagamento-recebido',
    frase: 'Recebi o pagamento do cliente, 2 mil',
    esperado: { intent: 'lancar_entrada', valor: 2000, categoria: 'Freelance', aceitas: ['Outras entradas'] },
  },
  {
    id: 'reembolso-empresa',
    frase: 'A empresa me devolveu 340 da viagem',
    esperado: { intent: 'lancar_entrada', valor: 340, categoria: 'Reembolso' },
  },
  {
    id: 'aluguel-recebido',
    frase: 'O inquilino pagou o aluguel, 1.800',
    esperado: { intent: 'lancar_entrada', valor: 1800, categoria: 'Aluguel recebido' },
  },
  {
    id: 'rendimento-cdb',
    frase: 'Rendeu 87 no CDB esse mês',
    esperado: { intent: 'lancar_entrada', valor: 87, categoria: 'Rendimentos' },
  },
  {
    id: 'pix-presente',
    frase: 'Minha avó me mandou 200 de presente',
    esperado: { intent: 'lancar_entrada', valor: 200, categoria: 'Presente' },
  },

  // Workspace empresa: as mesmas palavras mudam de categoria.
  {
    id: 'das-mei',
    workspace: 'business',
    frase: 'Paguei o DAS do MEI, 75 reais',
    esperado: { intent: 'lancar_saida', valor: 75, categoria: 'Impostos' },
  },
  {
    id: 'aluguel-sala',
    workspace: 'business',
    frase: 'Paguei 1.900 do aluguel da sala',
    esperado: { intent: 'lancar_saida', valor: 1900, categoria: 'Aluguel' },
  },
  {
    id: 'anuncio-instagram',
    workspace: 'business',
    frase: 'Investi 300 em anúncio no Instagram',
    esperado: { intent: 'lancar_saida', valor: 300, categoria: 'Marketing' },
  },
  {
    id: 'notebook',
    workspace: 'business',
    frase: 'Comprei um notebook para a empresa por 4.200',
    esperado: { intent: 'lancar_saida', valor: 4200, categoria: 'Equipamentos' },
  },
  {
    id: 'salario-funcionario',
    workspace: 'business',
    frase: 'Paguei o salário da Júlia, 2.300',
    esperado: { intent: 'lancar_saida', valor: 2300, categoria: 'Folha' },
  },
  {
    id: 'materia-prima',
    workspace: 'business',
    frase: 'Paguei 860 ao fornecedor de tecido',
    esperado: { intent: 'lancar_saida', valor: 860, categoria: 'Fornecedores' },
  },
  {
    id: 'venda-balcao',
    workspace: 'business',
    frase: 'Vendi 3 bolos, entrou 270',
    esperado: { intent: 'lancar_entrada', valor: 270, categoria: 'Receita de vendas' },
  },
  {
    id: 'servico-prestado',
    workspace: 'business',
    frase: 'Recebi 1.200 da instalação que fiz ontem',
    esperado: { intent: 'lancar_entrada', valor: 1200, categoria: 'Prestação de serviços' },
  },

  // Transferência, consulta, agenda e conversa: não podem virar lançamento.
  {
    id: 'transferencia',
    frase: 'Transferi 500 da conta corrente pra poupança',
    esperado: { intent: 'transferir', valor: 500, categoria: 'Transferência' },
  },
  {
    id: 'consulta-gasto-mes',
    frase: 'Quanto eu gastei com mercado esse mês?',
    esperado: {
      intent: 'consulta',
      consulta: { tipo: 'saidas', filtros: [{ termo: 'mercado' }, { categoria: 'Alimentação', termo: 'mercado' }] },
    },
  },
  {
    id: 'consulta-saldo',
    frase: 'Qual é o meu saldo?',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'agenda-dentista',
    frase: 'Marca dentista amanhã às 10',
    esperado: { intent: 'agenda', titulo: ['dentista'] },
  },
  {
    id: 'agenda-lembrete-conta',
    frase: 'Me lembra de pagar a conta de luz dia 10',
    esperado: { intent: 'agenda', titulo: ['pagar', 'conta de luz'] },
  },
  {
    // Transcrição real (#142): "Uni" virou "O meu", e a regex gravou "meu que
    // eu vou ter que pagar a mensalidade das escolas no valor de 2500 reais".
    id: 'agenda-mensalidade-transcrita',
    frase: 'O meu me lembra que amanhã eu vou ter que pagar a mensalidade das escolas no valor de 2500 reais.',
    esperado: { intent: 'agenda', titulo: ['pagar', 'mensalidade', 'escolas'] },
  },
  {
    id: 'agenda-vacina-cachorro',
    frase: 'me lembra que daqui duas semanas o cachorro tem que tomar vacina',
    esperado: { intent: 'agenda', titulo: ['vacina'] },
  },
  {
    id: 'conversa',
    frase: 'Bom dia, Uni!',
    esperado: { intent: 'conversa' },
  },

  // --- Ampliação da F1 (#106): frases mais difíceis. ---
  // Voz coloquial, transcrição imperfeita e gíria de valor.
  {
    id: 'voz-mercado-tipo',
    frase: 'tipo assim eu fui no mercado ontem e aí deu cento e trinta e dois reais',
    esperado: { intent: 'lancar_saida', valor: 132, categoria: 'Alimentação', data: '2026-10-01' },
  },
  {
    id: 'ifud-transcricao',
    reservado: true,
    frase: 'pedi um ifud de quarenta e cinco',
    esperado: { intent: 'lancar_saida', valor: 45, categoria: 'Alimentação' },
  },
  {
    id: 'netiflix-transcricao',
    frase: 'netiflix trinta e nove e noventa',
    esperado: { intent: 'lancar_saida', valor: 39.9, categoria: 'Assinaturas' },
  },
  {
    id: 'uber-acento-conto',
    reservado: true,
    frase: 'peguei um úber de vinte e oito conto pra ir pro trabalho',
    esperado: { intent: 'lancar_saida', valor: 28, categoria: 'Transporte' },
  },
  {
    id: 'pila-gasolina',
    frase: 'botei cem pila de gasolina',
    esperado: { intent: 'lancar_saida', valor: 100, categoria: 'Transporte' },
  },
  {
    id: 'conto-cabeleireiro',
    reservado: true,
    frase: 'cortei o cabelo foi cinquenta conto',
    esperado: { intent: 'lancar_saida', valor: 50, categoria: 'Outras despesas', aceitas: ['Saúde'] },
  },
  {
    id: 'amazon-praime',
    frase: 'amazon praime 19 e 90',
    esperado: { intent: 'lancar_saida', valor: 19.9, categoria: 'Assinaturas' },
  },
  {
    id: 'luz-ne',
    reservado: true,
    frase: 'aí eu paguei a luz né deu cento e noventa e oito',
    esperado: { intent: 'lancar_saida', valor: 198, categoria: 'Moradia' },
  },
  {
    id: 'bar-uns-oitenta',
    frase: 'saí com os amigos no bar gastei uns oitenta',
    esperado: { intent: 'lancar_saida', valor: 80, categoria: 'Lazer', aceitas: ['Alimentação'] },
  },
  {
    id: 'cartao-minimo-conto',
    reservado: true,
    frase: 'paguei o mínimo do cartão 500 conto',
    esperado: { intent: 'lancar_saida', valor: 500, categoria: 'Dívidas' },
  },
  // Datas relativas (referência: sexta, 02/10/2026).
  {
    id: 'anteontem-drogaria',
    frase: 'anteontem gastei 47 na drogaria',
    esperado: { intent: 'lancar_saida', valor: 47, categoria: 'Saúde', data: '2026-09-30' },
  },
  {
    id: 'sexta-passada-pizza',
    reservado: true,
    frase: 'sexta passada a gente pediu pizza deu 89',
    esperado: { intent: 'lancar_saida', valor: 89, categoria: 'Alimentação', data: '2026-09-25' },
  },
  {
    id: 'dia-28-luz',
    frase: 'a conta de luz eu paguei dia 28, foi 213 e 40',
    esperado: { intent: 'lancar_saida', valor: 213.4, categoria: 'Moradia', data: '2026-09-28' },
  },
  {
    id: 'segunda-veterinario',
    reservado: true,
    frase: 'segunda eu levei o cachorro no veterinário e gastei 320',
    esperado: { intent: 'lancar_saida', valor: 320, categoria: 'Outras despesas', aceitas: ['Saúde'], data: '2026-09-28' },
  },
  {
    id: 'viagem-julho-hotel',
    frase: 'paguei o hotel da viagem de julho, 1.100',
    esperado: { intent: 'lancar_saida', valor: 1100, categoria: 'Lazer' },
  },
  // Despesas pessoais sem palavra-chave óbvia.
  {
    id: 'van-escolar',
    frase: 'paguei a van escolar dos meninos trezentos e cinquenta',
    esperado: { intent: 'lancar_saida', valor: 350, categoria: 'Educação', aceitas: ['Transporte'] },
  },
  {
    id: 'livros-faculdade',
    reservado: true,
    frase: 'comprei os livros da faculdade 280 reais',
    esperado: { intent: 'lancar_saida', valor: 280, categoria: 'Educação' },
  },
  {
    id: 'curso-fotografia',
    frase: 'assinei um curso online de fotografia por 197',
    esperado: { intent: 'lancar_saida', valor: 197, categoria: 'Educação', aceitas: ['Lazer'] },
  },
  {
    id: 'mensalidade-pos',
    reservado: true,
    frase: 'mensalidade da pós 890',
    esperado: { intent: 'lancar_saida', valor: 890, categoria: 'Educação' },
  },
  {
    id: 'galao-agua',
    frase: 'comprei dois galão de água 24 reais',
    esperado: { intent: 'lancar_saida', valor: 24, categoria: 'Alimentação', aceitas: ['Moradia'] },
  },
  {
    id: 'aluguel-com-juros',
    reservado: true,
    frase: 'acabei de pagar o aluguel atrasado com juros deu 2340',
    esperado: { intent: 'lancar_saida', valor: 2340, categoria: 'Moradia' },
  },
  {
    id: 'seguro-carro',
    frase: 'parcela do seguro do carro 260',
    esperado: { intent: 'lancar_saida', valor: 260, categoria: 'Transporte', aceitas: ['Outras despesas'] },
  },
  {
    id: 'pneus',
    reservado: true,
    frase: 'troquei dois pneu 780 reais',
    esperado: { intent: 'lancar_saida', valor: 780, categoria: 'Transporte' },
  },
  {
    id: 'cartao-onibus',
    frase: 'recarreguei o cartão do ônibus com 50',
    esperado: { intent: 'lancar_saida', valor: 50, categoria: 'Transporte' },
  },
  {
    id: 'metro-centavos',
    reservado: true,
    frase: 'gastei 10 e 40 de metrô hoje',
    esperado: { intent: 'lancar_saida', valor: 10.4, categoria: 'Transporte' },
  },
  {
    id: 'psicologa',
    frase: 'sessão com a psicóloga 180',
    esperado: { intent: 'lancar_saida', valor: 180, categoria: 'Saúde' },
  },
  {
    id: 'exame-sangue',
    reservado: true,
    frase: 'fiz os exames de sangue no laboratório paguei 145',
    esperado: { intent: 'lancar_saida', valor: 145, categoria: 'Saúde' },
  },
  {
    id: 'oculos-grau',
    frase: 'comprei um óculos de grau 650',
    esperado: { intent: 'lancar_saida', valor: 650, categoria: 'Saúde' },
  },
  {
    id: 'ingresso-show',
    reservado: true,
    frase: 'comprei ingresso pro show do sábado 240',
    esperado: { intent: 'lancar_saida', valor: 240, categoria: 'Lazer' },
  },
  {
    id: 'jogo-videogame',
    frase: 'comprei um jogo no videogame 249',
    esperado: { intent: 'lancar_saida', valor: 249, categoria: 'Lazer' },
  },
  {
    id: 'disney-plus',
    reservado: true,
    frase: 'disney plus 33,90',
    esperado: { intent: 'lancar_saida', valor: 33.9, categoria: 'Assinaturas' },
  },
  {
    id: 'chat-gpt',
    frase: 'assinatura do chat gpt 110',
    esperado: { intent: 'lancar_saida', valor: 110, categoria: 'Assinaturas' },
  },
  {
    id: 'acordo-divida',
    reservado: true,
    frase: 'fiz um acordo da dívida e paguei a primeira parcela de 150',
    esperado: { intent: 'lancar_saida', valor: 150, categoria: 'Dívidas' },
  },
  {
    id: 'consignado',
    frase: 'desconto do consignado 412',
    esperado: { intent: 'lancar_saida', valor: 412, categoria: 'Dívidas' },
  },
  {
    id: 'roupa-filho',
    reservado: true,
    frase: 'comprei roupa pro meu filho 230',
    esperado: { intent: 'lancar_saida', valor: 230, categoria: 'Outras despesas' },
  },
  {
    id: 'presente-casamento',
    frase: 'dei um presente de casamento de 300',
    esperado: { intent: 'lancar_saida', valor: 300, categoria: 'Outras despesas', aceitas: ['Lazer'] },
  },
  {
    id: 'campanha-agasalho',
    reservado: true,
    frase: 'doei 50 pra campanha do agasalho',
    esperado: { intent: 'lancar_saida', valor: 50, categoria: 'Outras despesas' },
  },
  {
    id: 'oferta-igreja',
    frase: 'dei 100 de oferta na igreja',
    esperado: { intent: 'lancar_saida', valor: 100, categoria: 'Outras despesas' },
  },
  {
    id: 'manicure',
    reservado: true,
    frase: 'fiz a unha 45',
    esperado: { intent: 'lancar_saida', valor: 45, categoria: 'Outras despesas', aceitas: ['Saúde'] },
  },
  {
    id: 'material-obra',
    frase: 'comprei cimento e areia pra obra 860',
    esperado: { intent: 'lancar_saida', valor: 860, categoria: 'Moradia' },
  },
  {
    id: 'sofa-novo',
    reservado: true,
    frase: 'comprei um sofá novo 2.400',
    esperado: { intent: 'lancar_saida', valor: 2400, categoria: 'Moradia', aceitas: ['Outras despesas'] },
  },
  {
    id: 'eletricista',
    frase: 'paguei o eletricista 200',
    esperado: { intent: 'lancar_saida', valor: 200, categoria: 'Moradia' },
  },
  // Sem base para escolher categoria: a Uni deve perguntar.
  {
    id: 'vago-pix',
    reservado: true,
    frase: 'mandei um pix de 300',
    esperado: { intent: 'lancar_saida', valor: 300, categoria: null },
  },
  {
    id: 'vago-gastei-hoje',
    frase: 'hoje eu gastei cento e vinte',
    esperado: { intent: 'lancar_saida', valor: 120, categoria: null },
  },
  {
    id: 'vago-aquela-coisa',
    reservado: true,
    frase: 'paguei aquela coisa lá 75',
    esperado: { intent: 'lancar_saida', valor: 75, categoria: null },
  },
  {
    id: 'vago-carlos',
    frase: 'dei 50 pro Carlos',
    esperado: { intent: 'lancar_saida', valor: 50, categoria: null },
  },
  {
    id: 'vago-entrou',
    reservado: true,
    frase: 'entrou 800 na conta',
    esperado: { intent: 'lancar_entrada', valor: 800, categoria: null },
  },
  // Entradas pessoais.
  {
    id: 'salario-gracas',
    frase: 'caiu o salário aí graças a deus 3 mil e duzentos',
    esperado: { intent: 'lancar_entrada', valor: 3200, categoria: 'Salário' },
  },
  {
    id: 'adiantamento',
    reservado: true,
    frase: 'recebi o adiantamento do salário 1.400',
    esperado: { intent: 'lancar_entrada', valor: 1400, categoria: 'Salário' },
  },
  {
    id: 'decimo-terceiro',
    frase: 'caiu a primeira parcela do décimo terceiro 1.900',
    esperado: { intent: 'lancar_entrada', valor: 1900, categoria: 'Salário' },
  },
  {
    id: 'logo-cliente',
    reservado: true,
    frase: 'um cliente me pagou 600 por um logo que eu fiz',
    esperado: { intent: 'lancar_entrada', valor: 600, categoria: 'Freelance', aceitas: ['Outras entradas'] },
  },
  {
    id: 'bico-fim-de-semana',
    frase: 'fiz um bico no fim de semana e ganhei 250',
    esperado: { intent: 'lancar_entrada', valor: 250, categoria: 'Freelance' },
  },
  {
    id: 'reembolso-plano',
    reservado: true,
    frase: 'o plano de saúde me reembolsou 180 da consulta',
    esperado: { intent: 'lancar_entrada', valor: 180, categoria: 'Reembolso' },
  },
  {
    id: 'estorno-cartao',
    frase: 'estornaram aquela compra de 89 no cartão',
    esperado: { intent: 'lancar_entrada', valor: 89, categoria: 'Reembolso' },
  },
  {
    id: 'dividendos',
    reservado: true,
    frase: 'caíram 42 de dividendos',
    esperado: { intent: 'lancar_entrada', valor: 42, categoria: 'Rendimentos' },
  },
  {
    id: 'poupanca-rendeu',
    frase: 'a poupança rendeu 15 e 30',
    esperado: { intent: 'lancar_entrada', valor: 15.3, categoria: 'Rendimentos' },
  },
  {
    id: 'aluguel-kitnet',
    reservado: true,
    frase: 'recebi o aluguel da kitnet 950',
    esperado: { intent: 'lancar_entrada', valor: 950, categoria: 'Aluguel recebido' },
  },
  {
    id: 'aniversario-tia',
    frase: 'ganhei 100 de aniversário da minha tia',
    esperado: { intent: 'lancar_entrada', valor: 100, categoria: 'Presente' },
  },
  {
    id: 'venda-bicicleta',
    reservado: true,
    frase: 'vendi minha bicicleta velha por 400',
    esperado: { intent: 'lancar_entrada', valor: 400, categoria: 'Outras entradas' },
  },
  {
    id: 'cashback',
    frase: 'ganhei 12 de cashback',
    esperado: { intent: 'lancar_entrada', valor: 12, categoria: 'Outras entradas', aceitas: ['Reembolso', 'Rendimentos'] },
  },
  // Transferências entre contas do usuário.
  {
    id: 'joguei-poupanca',
    reservado: true,
    frase: 'joguei 200 pra poupança',
    esperado: { intent: 'transferir', valor: 200, categoria: 'Transferência' },
  },
  {
    id: 'reserva-emergencia',
    frase: 'guardei 500 na reserva de emergência',
    esperado: { intent: 'transferir', valor: 500, categoria: 'Transferência' },
  },
  // Consulta, agenda que fala de dinheiro e conversa: não viram lançamento.
  {
    id: 'consulta-sobrou',
    reservado: true,
    frase: 'quanto sobrou pro resto do mês',
    esperado: { intent: 'consulta' },
  },
  {
    id: 'consulta-uber-setembro',
    frase: 'quanto que eu gastei de uber em setembro',
    esperado: {
      intent: 'consulta',
      consulta: {
        tipo: 'saidas', inicio: '2026-09-01', fim: '2026-09-30',
        filtros: [{ termo: 'uber' }, { categoria: 'Transporte', termo: 'uber' }],
      },
    },
  },
  // #190: ver os lançamentos em si, não o total.
  {
    id: 'consulta-lista-uber',
    frase: 'quais foram meus gastos com uber esse mês?',
    esperado: {
      intent: 'consulta',
      consulta: { tipo: 'lancamentos', filtros: [{ termo: 'uber' }, { categoria: 'Transporte', termo: 'uber' }] },
    },
  },
  {
    id: 'consulta-lista-ontem',
    frase: 'o que eu paguei ontem?',
    esperado: {
      intent: 'consulta',
      consulta: { tipo: 'lancamentos', inicio: '2026-10-01', fim: '2026-10-01' },
    },
  },
  {
    id: 'consulta-lista-entradas-setembro',
    reservado: true,
    frase: 'me mostra as entradas de setembro',
    esperado: {
      intent: 'consulta',
      consulta: { tipo: 'lancamentos', inicio: '2026-09-01', fim: '2026-09-30' },
    },
  },
  {
    id: 'consulta-categorias',
    frase: 'quais categorias eu tenho?',
    esperado: { intent: 'consulta', consulta: { tipo: 'categorias' } },
  },
  {
    id: 'consulta-maior-gasto',
    reservado: true,
    frase: 'qual foi meu maior gasto essa semana',
    esperado: { intent: 'consulta' },
  },
  {
    id: 'consulta-conta-pendente',
    frase: 'tenho alguma conta pra pagar ainda?',
    esperado: { intent: 'consulta', consulta: { tipo: 'outra' } },
  },
  {
    id: 'consulta-comparar-meses',
    reservado: true,
    frase: 'gastei mais com comida esse mês ou no passado',
    esperado: { intent: 'consulta' },
  },
  {
    id: 'agenda-iptu',
    frase: 'me lembra de pagar o IPTU dia 15',
    esperado: { intent: 'agenda', titulo: ['pagar', 'iptu'] },
  },
  {
    id: 'agenda-buscar-criancas',
    reservado: true,
    frase: 'Uni, sexta eu tenho que buscar as crianças na escola às cinco',
    esperado: { intent: 'agenda', titulo: ['buscar', 'crianças'] },
  },
  {
    id: 'agenda-aluguel-valor',
    reservado: true,
    frase: 'me avisa dia 5 pra pagar o aluguel de mil e duzentos',
    esperado: { intent: 'agenda', titulo: ['pagar', 'aluguel'] },
  },
  {
    id: 'agenda-cobrar-rafael',
    reservado: true,
    frase: 'anota pra eu cobrar o Rafael dos 200 que ele me deve na segunda',
    esperado: { intent: 'agenda', titulo: ['cobrar', 'rafael'] },
  },
  {
    id: 'agenda-gerente',
    frase: 'marca reunião com o gerente do banco quinta às 3',
    esperado: { intent: 'agenda', titulo: ['reunião', 'gerente'] },
  },
  {
    id: 'agenda-vencimento-cartao',
    reservado: true,
    frase: 'o cartão vence dia 10, me avisa um dia antes',
    esperado: { intent: 'agenda' },
  },
  {
    id: 'conversa-valeu',
    frase: 'valeu Uni, obrigado',
    esperado: { intent: 'conversa' },
  },
  {
    id: 'conversa-tudo-bem',
    reservado: true,
    frase: 'e aí, tudo bem com você?',
    esperado: { intent: 'conversa' },
  },
  // Conversa por voz de 11/10/2026: pedir uma categoria sem valor virava
  // lançamento, e a Uni perguntava "Qual foi o valor dessa movimentação?".
  {
    id: 'categoria-criar-sem-valor',
    frase: 'Vamos criar uma categoria chamada Impostos.',
    esperado: { intent: 'categoria', pedido: { acao: 'criar', nome: 'Impostos' } },
  },
  {
    id: 'categoria-renomear',
    frase: 'renomeia a categoria Lazer para Diversão',
    esperado: { intent: 'categoria', pedido: { acao: 'renomear', alvo: 'Lazer', nome: 'Diversão' } },
  },
  {
    id: 'categoria-excluir',
    frase: 'pode apagar a categoria Educação',
    esperado: { intent: 'categoria', pedido: { acao: 'excluir', alvo: 'Educação' } },
  },
  {
    id: 'categoria-criar-entrada',
    reservado: true,
    frase: 'quero uma categoria nova de receita chamada Aulas particulares',
    esperado: { intent: 'categoria', pedido: { acao: 'criar', nome: 'Aulas particulares' } },
  },
  // Exclusão de lançamento já salvo (#189): o modelo só diz qual; quem acha
  // e confirma é o app.
  {
    id: 'exclusao-uber-ontem',
    frase: 'apaga o Uber de ontem',
    esperado: { intent: 'exclusao', pedido: { acao: 'excluir_lancamento', palavras: ['uber'], data: '2026-10-01', lote: false } },
  },
  {
    id: 'exclusao-mercado-valor-sabado',
    frase: 'exclui o lançamento do mercado de 85 reais de sábado',
    esperado: { intent: 'exclusao', pedido: { acao: 'excluir_lancamento', palavras: ['mercado'], data: '2026-09-26', valor: 85 } },
  },
  {
    id: 'exclusao-ultimo-engano',
    frase: 'pode tirar esse último lançamento, foi engano',
    esperado: { intent: 'exclusao', pedido: { acao: 'excluir_lancamento', ultimo: true, lote: false } },
  },
  {
    id: 'exclusao-lote-setembro',
    reservado: true,
    frase: 'apaga todos os gastos de setembro',
    esperado: { intent: 'exclusao', pedido: { acao: 'excluir_lancamento', lote: true } },
  },
  {
    id: 'categoria-nova-com-valor',
    frase: 'registrar uma despesa de cinco mil e quinhentos reais no dia primeiro de outubro com a categoria Impostos',
    esperado: { intent: 'lancar_saida', valor: 5500, novaCategoria: 'Impostos', data: '2026-10-01' },
  },
  // Ação sobre um compromisso já marcado (#191): a régua confere a ação e as
  // palavras do alvo; data e hora seguem com o parser da agenda.
  {
    id: 'agenda-cancelar-dentista',
    frase: 'Cancela a consulta no dentista de quinta',
    esperado: { intent: 'agenda', pedido: { acao: 'cancelar', alvo: ['dentista'] } },
  },
  {
    id: 'agenda-remarcar-contador',
    frase: 'Remarca a reunião com o contador pra terça às 14h',
    esperado: { intent: 'agenda', pedido: { acao: 'editar', alvo: ['reunião', 'contador'] } },
  },
  {
    id: 'agenda-concluir-reuniao',
    frase: 'Pode marcar a reunião de ontem como concluída',
    esperado: { intent: 'agenda', pedido: { acao: 'concluir', alvo: ['reunião'] } },
  },
  {
    id: 'agenda-excluir-vacina',
    frase: 'Apaga o lembrete da vacina do cachorro',
    esperado: { intent: 'agenda', pedido: { acao: 'excluir', alvo: ['vacina'] } },
  },
  {
    id: 'agenda-desmarcar-almoco',
    reservado: true,
    frase: 'desmarca o jantar com a Bia de sábado',
    esperado: { intent: 'agenda', pedido: { acao: 'cancelar', alvo: ['jantar', 'bia'] } },
  },
  // Workspace empresa.
  {
    id: 'emp-simples',
    workspace: 'business',
    frase: 'paguei a guia do simples nacional 1.230',
    esperado: { intent: 'lancar_saida', valor: 1230, categoria: 'Impostos' },
  },
  {
    id: 'emp-iss',
    workspace: 'business',
    reservado: true,
    frase: 'recolhi o ISS do mês 340',
    esperado: { intent: 'lancar_saida', valor: 340, categoria: 'Impostos' },
  },
  {
    id: 'emp-contador',
    workspace: 'business',
    frase: 'paguei o contador 450',
    esperado: { intent: 'lancar_saida', valor: 450, categoria: 'Operacional', aceitas: ['Fornecedores'] },
  },
  {
    id: 'emp-luz-loja',
    workspace: 'business',
    reservado: true,
    frase: 'conta de luz da loja 612',
    esperado: { intent: 'lancar_saida', valor: 612, categoria: 'Operacional' },
  },
  {
    id: 'emp-internet-escritorio',
    workspace: 'business',
    frase: 'internet do escritório 149,90',
    esperado: { intent: 'lancar_saida', valor: 149.9, categoria: 'Operacional', aceitas: ['Assinaturas'] },
  },
  {
    id: 'emp-impulsionar',
    workspace: 'business',
    reservado: true,
    frase: 'impulsionei um post por 80',
    esperado: { intent: 'lancar_saida', valor: 80, categoria: 'Marketing' },
  },
  {
    id: 'emp-panfletos',
    workspace: 'business',
    frase: 'mandei imprimir mil panfletos, 260',
    esperado: { intent: 'lancar_saida', valor: 260, categoria: 'Marketing' },
  },
  {
    id: 'emp-impressora',
    workspace: 'business',
    reservado: true,
    frase: 'comprei uma impressora pro escritório 1.150',
    esperado: { intent: 'lancar_saida', valor: 1150, categoria: 'Equipamentos' },
  },
  {
    id: 'emp-estoque',
    workspace: 'business',
    frase: 'comprei mercadoria pro estoque 3.800',
    esperado: { intent: 'lancar_saida', valor: 3800, categoria: 'Fornecedores' },
  },
  {
    id: 'emp-pro-labore',
    workspace: 'business',
    reservado: true,
    frase: 'tirei meu pró-labore 2.500',
    esperado: { intent: 'lancar_saida', valor: 2500, categoria: 'Folha', aceitas: ['Outras despesas'] },
  },
  {
    id: 'emp-vale-transporte',
    workspace: 'business',
    frase: 'paguei o vale transporte dos funcionários 640',
    esperado: { intent: 'lancar_saida', valor: 640, categoria: 'Folha' },
  },
  {
    id: 'emp-sistema-nota',
    workspace: 'business',
    reservado: true,
    frase: 'mensalidade do sistema de nota fiscal 89',
    esperado: { intent: 'lancar_saida', valor: 89, categoria: 'Assinaturas', aceitas: ['Operacional'] },
  },
  {
    id: 'emp-galpao',
    workspace: 'business',
    frase: 'aluguel do galpão 4.500',
    esperado: { intent: 'lancar_saida', valor: 4500, categoria: 'Aluguel' },
  },
  {
    id: 'emp-pix-pecas',
    workspace: 'business',
    reservado: true,
    frase: 'cliente pagou 380 no pix por duas peças',
    esperado: { intent: 'lancar_entrada', valor: 380, categoria: 'Receita de vendas' },
  },
  {
    id: 'emp-ifood-loja',
    workspace: 'business',
    frase: 'entrou 1.240 das vendas do ifood da loja',
    esperado: { intent: 'lancar_entrada', valor: 1240, categoria: 'Receita de vendas' },
  },
  {
    id: 'emp-ar-condicionado',
    workspace: 'business',
    reservado: true,
    frase: 'recebi 700 pela manutenção do ar condicionado do cliente',
    esperado: { intent: 'lancar_entrada', valor: 700, categoria: 'Prestação de serviços' },
  },
  {
    id: 'emp-comissao',
    workspace: 'business',
    frase: 'caiu minha comissão de 520 da venda do apartamento',
    esperado: { intent: 'lancar_entrada', valor: 520, categoria: 'Comissão' },
  },
  {
    id: 'emp-contrato-mensal',
    workspace: 'business',
    reservado: true,
    frase: 'o cliente do contrato mensal pagou 2.000',
    esperado: { intent: 'lancar_entrada', valor: 2000, categoria: 'Contratos', aceitas: ['Prestação de serviços', 'Recebimentos'] },
  },
  {
    id: 'emp-maquininha',
    workspace: 'business',
    frase: 'caiu o repasse da maquininha 1.870',
    esperado: { intent: 'lancar_entrada', valor: 1870, categoria: 'Recebimentos', aceitas: ['Receita de vendas'] },
  },
  {
    id: 'emp-vago',
    workspace: 'business',
    reservado: true,
    frase: 'paguei 90',
    esperado: { intent: 'lancar_saida', valor: 90, categoria: null },
  },
  // Saldo declarado e meta (#80, etapa 2b). "Tenho X" sem dizer que recebeu
  // também é saldo: não pode virar entrada.
  {
    id: 'saldo-nubank',
    frase: 'meu saldo no Nubank é 1.250',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'saldo-ajusta-carteira',
    frase: 'ajusta o saldo da carteira pra 80 reais',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'saldo-de-saldo',
    frase: 'tenho 3 mil de saldo na conta',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'saldo-ta-errado',
    frase: 'meu saldo tá errado, o certo é 412,30',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'saldo-tenho',
    frase: 'tenho mil reais',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'saldo-to-com',
    frase: 'to com 600 na poupança',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'recebi-nao-e-saldo',
    frase: 'recebi mil reais do meu pai',
    esperado: { intent: 'lancar_entrada', valor: 1000, categoria: 'Presente', aceitas: ['Outras entradas'] },
  },
  {
    id: 'consulta-saldo-conta',
    frase: 'quanto tenho de saldo no Inter?',
    esperado: { intent: 'saldo' },
  },
  // Frases de saldo que a trava por regex do chat não reconhece: só o
  // modelo as separa de um lançamento.
  {
    id: 'saldo-sem-palavra-nubank',
    frase: 'o Nubank está com 1.200',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'saldo-sem-palavra-pergunta',
    frase: 'qual o valor que está na minha conta do Inter?',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'saldo-sem-palavra-poupanca',
    frase: 'na poupança tem 3 mil',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'to-com-conta-a-pagar',
    frase: 'to com 300 de conta de luz pra pagar sexta',
    esperado: { intent: 'agenda' },
  },
  {
    id: 'meta-juntar',
    frase: 'quero juntar 10 mil pra viajar no ano que vem',
    esperado: { intent: 'meta' },
  },
  {
    id: 'meta-criar',
    frase: 'cria uma meta de reserva de emergência de 6 mil',
    esperado: { intent: 'meta' },
  },
  {
    id: 'meta-consulta',
    frase: 'quanto falta pra eu bater minha meta?',
    esperado: { intent: 'consulta', consulta: { tipo: 'outra' } },
  },
  {
    id: 'saldo-carteira-agora',
    reservado: true,
    frase: 'o saldo da carteira agora é 35',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'saldo-estou-com',
    reservado: true,
    frase: 'estou com 2 mil e quinhentos',
    esperado: { intent: 'saldo' },
  },
  {
    id: 'meta-carro',
    reservado: true,
    frase: 'quero economizar uns 40 mil pra trocar de carro',
    esperado: { intent: 'meta' },
  },
  // Parâmetros de consulta (#80, etapa 2c): o app soma as movimentações do
  // período com o filtro que o modelo devolve.
  {
    id: 'consulta-recebi-agosto',
    frase: 'quanto eu recebi em agosto?',
    esperado: { intent: 'consulta', consulta: { tipo: 'entradas', inicio: '2026-08-01', fim: '2026-08-31' } },
  },
  {
    id: 'consulta-resumo-mes-passado',
    frase: 'me dá um resumo do mês passado',
    esperado: { intent: 'consulta', consulta: { tipo: 'resumo', inicio: '2026-09-01', fim: '2026-09-30' } },
  },
  {
    id: 'consulta-moradia-semana',
    frase: 'quanto saiu com moradia essa semana',
    esperado: {
      intent: 'consulta',
      consulta: { tipo: 'saidas', inicio: '2026-09-28', fim: '2026-10-04', filtros: [{ categoria: 'Moradia' }] },
    },
  },
  {
    id: 'consulta-salario-ano',
    frase: 'quanto entrou de salário esse ano',
    esperado: {
      intent: 'consulta',
      consulta: { tipo: 'entradas', inicio: '2026-01-01', fim: '2026-12-31', filtros: [{ categoria: 'Salário' }] },
    },
  },
  {
    id: 'consulta-desde-julho',
    frase: 'quanto eu já gastei desde julho',
    esperado: { intent: 'consulta', consulta: { tipo: 'saidas', inicio: '2026-07-01', fim: '2026-10-02' } },
  },
  {
    id: 'consulta-ontem',
    frase: 'quanto gastei ontem?',
    esperado: { intent: 'consulta', consulta: { tipo: 'saidas', inicio: '2026-10-01', fim: '2026-10-01' } },
  },
  {
    id: 'consulta-farmacia-mes-passado',
    frase: 'quanto deu de farmácia no mês passado',
    esperado: {
      intent: 'consulta',
      consulta: {
        tipo: 'saidas', inicio: '2026-09-01', fim: '2026-09-30',
        filtros: [{ termo: 'farmácia' }, { categoria: 'Saúde', termo: 'farmácia' }],
      },
    },
  },
  {
    id: 'consulta-mes-que-vem',
    frase: 'quanto eu vou gastar mês que vem?',
    esperado: { intent: 'consulta', consulta: { tipo: 'outra' } },
  },
  {
    id: 'consulta-ultima-compra',
    frase: 'qual foi a última compra que eu lancei?',
    esperado: { intent: 'consulta', consulta: { tipo: 'outra' } },
  },
  {
    id: 'consulta-entrou-semana-passada',
    reservado: true,
    frase: 'quanto entrou na semana passada',
    esperado: { intent: 'consulta', consulta: { tipo: 'entradas', inicio: '2026-09-21', fim: '2026-09-27' } },
  },
  {
    id: 'consulta-lazer-junho',
    reservado: true,
    frase: 'quanto eu torrei com lazer em junho',
    esperado: {
      intent: 'consulta',
      consulta: { tipo: 'saidas', inicio: '2026-06-01', fim: '2026-06-30', filtros: [{ categoria: 'Lazer' }] },
    },
  },
  {
    id: 'consulta-como-foi-setembro',
    reservado: true,
    frase: 'como foi setembro pra mim, entrou mais do que saiu?',
    esperado: { intent: 'consulta', consulta: { tipo: 'resumo', inicio: '2026-09-01', fim: '2026-09-30' } },
  },
];
