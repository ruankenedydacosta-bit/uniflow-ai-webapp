export const USER_NAME = 'Ruan';

export const SUGGESTIONS_PESSOAL = [
  { icon: '💸', label: 'Registrar uma despesa', intent: 'registrar_despesa' },
  { icon: '💰', label: 'Ver meu saldo', intent: 'ver_saldo' },
  { icon: '📊', label: 'Quanto gastei este mês?', intent: 'gastos_mes' },
  { icon: '🎯', label: 'Planejar uma meta', intent: 'planejar_meta' },
];

export const SUGGESTIONS_EMPRESA = [
  { icon: '💸', label: 'Registrar uma despesa', intent: 'registrar_despesa' },
  { icon: '🏢', label: 'Analisar minha empresa', intent: 'analisar_empresa' },
  { icon: '📊', label: 'Quanto gastei este mês?', intent: 'gastos_mes' },
  { icon: '🎯', label: 'Planejar uma meta', intent: 'planejar_meta' },
];

let idCounter = 1;
export function nextId() {
  idCounter += 1;
  return `msg-${idCounter}`;
}

function now() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function generateUniResponse(userText, mode) {
  const text = userText.toLowerCase();

  if (text.includes('despesa') || text.includes('gastei um') || text.includes('paguei')) {
    return [
      {
        id: nextId(),
        from: 'uni',
        type: 'confirmation',
        text: 'Encontrei os detalhes. Pode confirmar o registro abaixo:',
        time: now(),
        confirmation: {
          title: 'Nova despesa',
          status: 'pending',
          rows: [
            { label: 'Categoria', value: mode === 'empresa' ? 'Fornecedores' : 'Alimentação' },
            { label: 'Descrição', value: mode === 'empresa' ? 'Compra de insumos' : 'Almoço' },
            { label: 'Valor', value: 'R$ 84,90', emphasis: true },
            { label: 'Data', value: 'Hoje' },
          ],
        },
      },
    ];
  }

  if (text.includes('saldo')) {
    return [
      {
        id: nextId(),
        from: 'uni',
        type: 'text',
        time: now(),
        highlight: mode === 'empresa' ? 'R$ 18.430,00' : 'R$ 3.240,00',
        text:
          mode === 'empresa'
            ? 'O saldo atual da sua empresa é R$ 18.430,00, considerando as contas conectadas.'
            : 'Seu saldo disponível hoje é R$ 3.240,00, considerando as contas conectadas.',
      },
    ];
  }

  if (text.includes('gastei') || text.includes('gasto')) {
    return [
      {
        id: nextId(),
        from: 'uni',
        type: 'text',
        time: now(),
        highlight: mode === 'empresa' ? 'R$ 6.120,00' : 'R$ 1.180,00',
        text:
          mode === 'empresa'
            ? 'Este mês sua empresa já gastou R$ 6.120,00, 12% a mais que o mês anterior.'
            : 'Este mês você já gastou R$ 1.180,00, 8% a mais que o mês anterior.',
      },
      {
        id: nextId(),
        from: 'uni',
        type: 'alert',
        time: now(),
        text: 'Os gastos com "Assinaturas" cresceram bastante. Quer que eu detalhe essa categoria?',
      },
    ];
  }

  if (text.includes('meta')) {
    return [
      {
        id: nextId(),
        from: 'uni',
        type: 'suggestion',
        time: now(),
        text: 'Posso criar uma meta de economia mensal para você. Que tal começarmos com R$ 500,00 por mês, ajustável quando quiser?',
      },
    ];
  }

  if (text.includes('empresa') || text.includes('analis')) {
    return [
      {
        id: nextId(),
        from: 'uni',
        type: 'text',
        time: now(),
        highlight: 'R$ 12.310,00',
        text: 'Sua empresa fechou o mês com receita de R$ 12.310,00 e margem estável. Posso montar um resumo completo se quiser.',
      },
    ];
  }

  return [
    {
      id: nextId(),
      from: 'uni',
      type: 'text',
      time: now(),
      text: 'Entendi. Posso te ajudar a registrar isso, consultar seu saldo ou planejar uma meta — é só me dizer.',
    },
  ];
}
