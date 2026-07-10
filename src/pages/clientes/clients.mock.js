export const clientsMock = {
  business: {
    workspaceLabel: 'Empresarial',
    subtitle: 'Acompanhe relacionamentos, cobranças e oportunidades sem perder contexto.',
    attention:
      'Três clientes merecem atenção hoje: um pagamento previsto, uma proposta sem retorno e um relacionamento parado há 12 dias.',
    clients: [
      {
        name: 'Cliente Alfa',
        type: 'ativo',
        value: 18400,
        lastContact: 'há 2 dias',
        nextAction: 'Confirmar pagamento previsto.',
        status: 'Pagamento previsto',
        variant: 'success',
      },
      {
        name: 'Mercado Oliveira',
        type: 'potencial',
        value: 12600,
        lastContact: 'há 5 dias',
        nextAction: 'Enviar proposta revisada.',
        status: 'Proposta aberta',
        variant: 'primary',
      },
      {
        name: 'Studio Norte',
        type: 'em risco',
        value: 8200,
        lastContact: 'há 12 dias',
        nextAction: 'Fazer follow-up com contexto.',
        status: 'Sem retorno',
        variant: 'warning',
      },
      {
        name: 'Clínica Vida',
        type: 'ativo',
        value: 15300,
        lastContact: 'há 1 dia',
        nextAction: 'Confirmar reunião da semana.',
        status: 'Reunião marcada',
        variant: 'secondary',
      },
      {
        name: 'Tech Ramos',
        type: 'parado',
        value: 6400,
        lastContact: 'há 18 dias',
        nextAction: 'Revisar contrato antes de novo contato.',
        status: 'Relacionamento parado',
        variant: 'outline',
      },
    ],
    nextActions: [
      'Cobrar pagamento previsto com tom consultivo.',
      'Enviar proposta revisada para oportunidade aberta.',
      'Fazer follow-up com cliente sem retorno.',
      'Confirmar reunião antes do fechamento da semana.',
      'Revisar contrato parado antes de insistir no contato.',
    ],
    uniReading:
      'Clientes com maior potencial estão concentrados em propostas sem retorno. A Uni recomenda priorizar follow-ups antes de buscar novos contatos.',
  },
};
