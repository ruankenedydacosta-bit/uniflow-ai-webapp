import PageScaffold from './PageScaffold';

function ReportsPage() {
  return (
    <PageScaffold
      title="Relatórios"
      description="Área para transformar dados financeiros em leitura executiva, tendências e decisões claras."
      badge="Análises em construção"
      cards={[
        {
          title: 'Resumo mensal',
          badge: 'Mock',
          metric: '+8,4%',
          description: 'Indicador simulado para validar a linguagem visual dos relatórios.',
          variant: 'glass',
          badgeVariant: 'success',
        },
        {
          title: 'Categorias',
          badge: 'Em análise',
          metric: '6 grupos',
          description: 'Base para cruzar receitas, despesas e comportamento por período.',
          badgeVariant: 'primary',
        },
        {
          title: 'Exportações',
          badge: 'Futuro',
          metric: 'PDF e CSV',
          description: 'Ponto de partida para relatórios compartilháveis nas próximas etapas.',
          badgeVariant: 'outline',
        },
      ]}
    />
  );
}

export default ReportsPage;
