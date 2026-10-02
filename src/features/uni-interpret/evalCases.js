// Conjunto de avaliação da interpretação de lançamentos (épico #104, F0).
//
// Cada caso é uma frase como o usuário fala ou digita e o resultado que uma
// pessoa atenta daria. Serve para medir as regras atuais e, depois, comparar
// os modelos candidatos do uni-interpret com a mesma régua.
//
// esperado.intent: lancar_saida | lancar_entrada | transferir | consulta |
//   agenda | conversa.
// esperado.categoria: nome do catálogo do workspace; null quando a frase não
//   dá base para escolher e a Uni deve perguntar. `aceitas` lista outras
//   respostas igualmente corretas.
// esperado.data: ISO; ausente quando a frase não fala de data (vale hoje).
//
// Data de referência de todos os casos: sexta, 02/10/2026.

export const DATA_REFERENCIA = '2026-10-02';

export const CASOS = [
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
    esperado: { intent: 'consulta' },
  },
  {
    id: 'consulta-saldo',
    frase: 'Qual é o meu saldo?',
    esperado: { intent: 'consulta' },
  },
  {
    id: 'agenda-dentista',
    frase: 'Marca dentista amanhã às 10',
    esperado: { intent: 'agenda' },
  },
  {
    id: 'agenda-lembrete-conta',
    frase: 'Me lembra de pagar a conta de luz dia 10',
    esperado: { intent: 'agenda' },
  },
  {
    id: 'conversa',
    frase: 'Bom dia, Uni!',
    esperado: { intent: 'conversa' },
  },
];
