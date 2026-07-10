export const dashboardMock = {
  personal: {
    workspaceLabel: 'Espaço pessoal',
    subtitle: 'Veja o que mudou, o que merece atenção e qual próximo passo tomar.',
    direction: {
      title: 'Rota financeira pessoal',
      status: 'Rota saudável',
      variant: 'success',
      message: 'Você está em rota saudável. Mantendo o ritmo atual, sua reserva deve completar em cerca de 4 meses.',
      forecast: 'Reserva completa em 4 meses',
      signal: 'Gastos variáveis subiram nos últimos 7 dias',
      nextStep: 'Revisar despesas variáveis antes de assumir novos compromissos',
    },
    attentionSignals: [
      {
        title: 'Gastos variáveis subiram',
        description: 'Transporte e alimentação concentraram a maior mudança da semana.',
        status: 'Atenção',
        variant: 'warning',
      },
      {
        title: 'Assinatura recorrente',
        description: 'Uma assinatura segue ativa e pode ser revisada sem afetar o essencial.',
        status: 'Revisar',
        variant: 'secondary',
      },
      {
        title: 'Objetivo principal no prazo',
        description: 'A reserva continua avançando dentro da rota prevista.',
        status: 'Saudável',
        variant: 'success',
      },
    ],
    nextStep: 'Revise gastos variáveis dos últimos 7 dias antes de assumir novos compromissos.',
    smartSummary: [
      {
        label: 'Saldo projetado',
        value: 'R$ 18.450',
      },
      {
        label: 'Evolução do objetivo',
        value: '80% da reserva',
      },
      {
        label: 'Sinais ativos',
        value: '3 em acompanhamento',
      },
      {
        label: 'Próximo compromisso',
        value: 'Fatura em 5 dias',
      },
    ],
    uniReading:
      'A Uni percebeu que seu ritmo segue positivo, mas pequenas despesas recorrentes podem atrasar sua meta se não forem revisadas.',
    shortcuts: [
      { label: 'Falar com a Uni', path: '/uni-ai', variant: 'primary' },
      { label: 'Ver Financeiro', path: '/financeiro', variant: 'outline' },
      { label: 'Ver Objetivos', path: '/objetivos', variant: 'outline' },
      { label: 'Ver Agenda', path: '/agenda', variant: 'outline' },
    ],
  },
  business: {
    workspaceLabel: 'Espaço empresarial',
    subtitle: 'Acompanhe caixa, clientes, entregas e decisões importantes da empresa.',
    direction: {
      title: 'Rota financeira da empresa',
      status: 'Caixa positivo',
      variant: 'success',
      message: 'O caixa segue positivo, mas fornecedores e impostos concentram atenção nos próximos dias.',
      forecast: 'Caixa protegido por 30 dias',
      signal: 'Compromissos operacionais concentrados',
      nextStep: 'Confirmar recebimentos previstos antes de abrir novos custos',
    },
    attentionSignals: [
      {
        title: 'Fornecedor vence em breve',
        description: 'Uma saída operacional pode pressionar a margem da semana.',
        status: 'Atenção',
        variant: 'warning',
      },
      {
        title: 'Cliente precisa de follow-up',
        description: 'Uma proposta sem retorno pode virar recebimento ainda neste ciclo.',
        status: 'Comercial',
        variant: 'primary',
      },
      {
        title: 'Projeto próximo do prazo',
        description: 'Uma entrega depende de confirmação antes de assumir novos marcos.',
        status: 'Entrega',
        variant: 'secondary',
      },
    ],
    nextStep: 'Confirme recebimentos previstos antes de abrir novos custos operacionais.',
    smartSummary: [
      {
        label: 'Caixa projetado',
        value: 'R$ 48.200',
      },
      {
        label: 'Clientes em atenção',
        value: '3 relacionamentos',
      },
      {
        label: 'Sinais ativos',
        value: '3 prioridades',
      },
      {
        label: 'Próximo compromisso',
        value: 'Fornecedor em 4 dias',
      },
    ],
    uniReading:
      'A Uni percebeu boa entrada de caixa, mas há concentração de compromissos no curto prazo. O ideal é proteger margem antes de novos gastos.',
    shortcuts: [
      { label: 'Falar com a Uni', path: '/uni-ai', variant: 'primary' },
      { label: 'Ver Financeiro', path: '/financeiro', variant: 'outline' },
      { label: 'Ver Objetivos', path: '/objetivos', variant: 'outline' },
      { label: 'Ver Agenda', path: '/agenda', variant: 'outline' },
      { label: 'Ver Clientes', path: '/clientes', variant: 'secondary' },
      { label: 'Ver CRM', path: '/crm', variant: 'secondary' },
      { label: 'Ver Projetos', path: '/projetos', variant: 'secondary' },
    ],
  },
};
