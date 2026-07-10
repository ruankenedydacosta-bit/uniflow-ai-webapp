export const reportsMock = {
  personal: {
    workspaceLabel: 'Pessoal',
    subtitle: 'Veja sua evolução financeira sem precisar interpretar números sozinho.',
    periodLabel: 'Últimos 30 dias',
    evolution:
      'Nos últimos 30 dias, sua reserva evoluiu e seus gastos variáveis ficaram concentrados em transporte e assinaturas.',
    indicators: [
      {
        label: 'Evolução do saldo',
        value: '+8,4%',
        status: 'Em avanço',
        variant: 'success',
      },
      {
        label: 'Variação das despesas',
        value: '+6,2%',
        status: 'Acompanhar',
        variant: 'warning',
      },
      {
        label: 'Progresso dos objetivos',
        value: '72%',
        status: 'Saudável',
        variant: 'primary',
      },
      {
        label: 'Sinais de atenção',
        value: '2',
        status: 'Leve',
        variant: 'secondary',
      },
    ],
    chart: {
      title: 'Evolução do período',
      seriesLabel: 'Saldo projetado',
      previousLabel: 'Mês anterior',
      currentLabel: 'Mês atual',
      points: [
        { label: 'Semana 1', current: 14200, previous: 13600 },
        { label: 'Semana 2', current: 15100, previous: 13950 },
        { label: 'Semana 3', current: 16680, previous: 14800 },
        { label: 'Semana 4', current: 18450, previous: 15620 },
      ],
    },
    patterns: [
      'Gastos com transporte subiram nos fins de semana.',
      'Assinaturas continuam recorrentes sem mudança.',
      'Reserva segue em evolução constante.',
    ],
    uniReading:
      'Você está evoluindo. O ponto de atenção não é cortar tudo, mas revisar gastos recorrentes antes que virem hábito invisível.',
    nextAdjustment:
      'Revise as despesas recorrentes antes do fechamento e proteja o valor destinado aos objetivos.',
  },
  business: {
    workspaceLabel: 'Empresarial',
    subtitle: 'Entenda a evolução do caixa, despesas e decisões da empresa.',
    periodLabel: 'Últimos 30 dias',
    evolution:
      'Nos últimos 30 dias, o caixa cresceu, mas despesas operacionais e fornecedores concentraram pressão no curto prazo.',
    indicators: [
      {
        label: 'Evolução do caixa',
        value: '+11,8%',
        status: 'Em avanço',
        variant: 'success',
      },
      {
        label: 'Variação das despesas',
        value: '+9,1%',
        status: 'Atenção',
        variant: 'warning',
      },
      {
        label: 'Progresso dos objetivos',
        value: '64%',
        status: 'No plano',
        variant: 'primary',
      },
      {
        label: 'Sinais de atenção',
        value: '3',
        status: 'Monitorar',
        variant: 'secondary',
      },
    ],
    chart: {
      title: 'Evolução do caixa',
      seriesLabel: 'Caixa projetado',
      previousLabel: 'Mês anterior',
      currentLabel: 'Mês atual',
      points: [
        { label: 'Semana 1', current: 42300, previous: 39800 },
        { label: 'Semana 2', current: 44100, previous: 41200 },
        { label: 'Semana 3', current: 51800, previous: 43500 },
        { label: 'Semana 4', current: 56300, previous: 47800 },
      ],
    },
    patterns: [
      'Fornecedores concentram saídas no início do mês.',
      'Recebimentos melhoraram nos últimos 7 dias.',
      'Impostos exigem margem separada.',
    ],
    uniReading:
      'A empresa evoluiu em caixa, mas a próxima decisão deve proteger margem antes de ampliar compromissos.',
    nextAdjustment:
      'Separe margem para impostos e fornecedores antes de assumir novos gastos operacionais.',
  },
};
