export const crmMock = {
  business: {
    workspaceLabel: 'Empresarial',
    subtitle: 'Acompanhe oportunidades, follow-ups e próximos movimentos comerciais.',
    attention:
      'A Uni encontrou três oportunidades que merecem ação hoje: uma proposta sem retorno, um cliente parado e um recebimento possível para esta semana.',
    pipeline: [
      {
        stage: 'Novo contato',
        opportunities: [
          {
            client: 'Tech Ramos',
            value: 6400,
            status: 'Reativação',
            lastInteraction: 'há 18 dias',
            nextStep: 'Retomar conversa com proposta objetiva.',
            priority: 'Média',
            variant: 'secondary',
          },
        ],
      },
      {
        stage: 'Em conversa',
        opportunities: [
          {
            client: 'Clínica Vida',
            value: 15300,
            status: 'Reunião marcada',
            lastInteraction: 'há 1 dia',
            nextStep: 'Confirmar reunião e escopo.',
            priority: 'Alta',
            variant: 'primary',
          },
        ],
      },
      {
        stage: 'Proposta enviada',
        opportunities: [
          {
            client: 'Mercado Oliveira',
            value: 12600,
            status: 'Sem retorno',
            lastInteraction: 'há 7 dias',
            nextStep: 'Fazer follow-up antes de buscar novo lead.',
            priority: 'Alta',
            variant: 'warning',
          },
          {
            client: 'Studio Norte',
            value: 8200,
            status: 'Aguardando decisão',
            lastInteraction: 'há 9 dias',
            nextStep: 'Enviar resumo do valor entregue.',
            priority: 'Alta',
            variant: 'warning',
          },
        ],
      },
      {
        stage: 'Negociação',
        opportunities: [
          {
            client: 'Cliente Alfa',
            value: 18400,
            status: 'Pagamento possível',
            lastInteraction: 'há 2 dias',
            nextStep: 'Confirmar recebimento previsto.',
            priority: 'Alta',
            variant: 'success',
          },
        ],
      },
      {
        stage: 'Fechado',
        opportunities: [
          {
            client: 'Consultoria Prisma',
            value: 9800,
            status: 'Contrato fechado',
            lastInteraction: 'hoje',
            nextStep: 'Registrar próximo marco de entrega.',
            priority: 'Baixa',
            variant: 'glass',
          },
        ],
      },
    ],
    followUps: [
      'Ligar para Mercado Oliveira sobre proposta enviada.',
      'Enviar proposta ajustada para Studio Norte.',
      'Confirmar orçamento com Clínica Vida.',
      'Revisar contrato antes de reativar Tech Ramos.',
      'Acompanhar decisão do Cliente Alfa nesta semana.',
    ],
    uniReading:
      'As oportunidades com maior chance estão em proposta enviada, mas duas estão sem retorno há mais de 7 dias. A Uni recomenda priorizar follow-ups antes de buscar novos leads.',
    nextAction: 'Retome as propostas paradas antes de iniciar novas negociações.',
  },
};
