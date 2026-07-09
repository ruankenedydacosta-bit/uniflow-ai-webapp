import PageScaffold from './PageScaffold';

function AgendaPage() {
  return (
    <PageScaffold
      title="Agenda"
      description="Central futura para compromissos, vencimentos e lembretes financeiros que pedem atenção."
      badge="Tempo e prioridades"
      cards={[
        {
          title: 'Hoje',
          badge: 'Mock',
          metric: '4 eventos',
          description: 'Compromissos simulados para validar a experiência de navegação.',
          variant: 'glass',
          badgeVariant: 'secondary',
        },
        {
          title: 'Vencimentos',
          badge: 'Atenção',
          metric: '2 itens',
          description: 'Espaço reservado para alertas financeiros úteis, sem urgência artificial.',
          badgeVariant: 'warning',
        },
        {
          title: 'Planejamento',
          badge: 'Próximo',
          metric: '7 dias',
          description: 'Resumo futuro para orientar a semana com menos esforço manual.',
          badgeVariant: 'primary',
        },
      ]}
    />
  );
}

export default AgendaPage;
