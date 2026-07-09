import PageScaffold from './PageScaffold';

function FinancePage() {
  return (
    <PageScaffold
      title="Financeiro"
      description="Visão operacional para receitas, despesas, saldo projetado e saúde financeira em construção."
      badge="Módulo financeiro"
      cards={[
        {
          title: 'Fluxo de caixa',
          badge: 'Mock',
          metric: 'R$ 48.200',
          description: 'Resumo temporário para validar a navegação antes das integrações reais.',
          variant: 'glass',
          badgeVariant: 'success',
        },
        {
          title: 'Despesas',
          badge: 'Atenção',
          metric: '3 categorias',
          description: 'Espaço reservado para detectar variações e organizar prioridades.',
          badgeVariant: 'warning',
        },
        {
          title: 'Recebíveis',
          badge: 'Em análise',
          metric: '7 dias',
          description: 'Base para previsões de entrada e decisões de curto prazo.',
          badgeVariant: 'primary',
        },
      ]}
    />
  );
}

export default FinancePage;
