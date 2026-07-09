import PageScaffold from './PageScaffold';

function CRMPage() {
  return (
    <PageScaffold
      title="CRM"
      description="Área inicial para organizar clientes, oportunidades e histórico comercial com apoio da Uni."
      badge="Relacionamentos"
      cards={[
        {
          title: 'Clientes ativos',
          badge: 'Mock',
          metric: '12 contas',
          description: 'Lista futura de clientes conectada ao contexto financeiro e operacional.',
          variant: 'glass',
          badgeVariant: 'secondary',
        },
        {
          title: 'Oportunidades',
          badge: 'Pipeline',
          metric: 'R$ 82.000',
          description: 'Espaço reservado para previsões comerciais e próximas ações.',
          badgeVariant: 'primary',
        },
        {
          title: 'Risco de churn',
          badge: 'Atenção',
          metric: '2 sinais',
          description: 'Indicadores simulados para priorizar relacionamento e retenção.',
          badgeVariant: 'warning',
        },
      ]}
    />
  );
}

export default CRMPage;
