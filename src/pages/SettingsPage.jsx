import PageScaffold from './PageScaffold';

function SettingsPage() {
  return (
    <PageScaffold
      title="Configurações"
      description="Espaço para preferências do produto, dados da conta e ajustes futuros da experiência com a Uni."
      badge="Preferências"
      cards={[
        {
          title: 'Perfil',
          badge: 'Mock',
          metric: 'Conta inicial',
          description: 'Configurações simuladas enquanto autenticação e Supabase ainda não entram.',
          variant: 'glass',
          badgeVariant: 'secondary',
        },
        {
          title: 'Notificações',
          badge: 'Planejado',
          metric: '3 canais',
          description: 'Base para alertas úteis, respeitosos e conectados ao contexto financeiro.',
          badgeVariant: 'primary',
        },
        {
          title: 'Segurança',
          badge: 'Futuro',
          metric: 'Aguardando auth',
          description: 'Área reservada para controles quando a autenticação real for criada.',
          badgeVariant: 'outline',
        },
      ]}
    />
  );
}

export default SettingsPage;
