import PageScaffold from './PageScaffold';

function ProjectsPage() {
  return (
    <PageScaffold
      title="Projetos"
      description="Base para acompanhar entregas, prioridades, responsáveis e impacto financeiro de cada iniciativa."
      badge="Execução em construção"
      cards={[
        {
          title: 'Projetos ativos',
          badge: 'Mock',
          metric: '5 iniciativas',
          description: 'Visão inicial para acompanhar status sem criar um dashboard complexo ainda.',
          variant: 'glass',
          badgeVariant: 'secondary',
        },
        {
          title: 'Prazos críticos',
          badge: 'Atenção',
          metric: '2 prazos',
          description: 'Espaço para a Uni destacar entregas que merecem foco.',
          badgeVariant: 'warning',
        },
        {
          title: 'Orçamento',
          badge: 'Planejado',
          metric: 'R$ 34.500',
          description: 'Resumo simulado para conectar execução e saúde financeira.',
          badgeVariant: 'primary',
        },
      ]}
    />
  );
}

export default ProjectsPage;
