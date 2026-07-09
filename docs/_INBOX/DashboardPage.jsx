import MainLayout from '../../components/Layout/MainLayout';
import MainDashboard from '../../features/dashboard';

/**
 * DashboardPage — envolve MainDashboard no MainLayout já existente
 * (Sidebar/Topbar). navItems/onNavSelect ficam a cargo de quem já monta
 * a navegação real do produto — aqui só a config mínima para não deixar
 * o layout quebrado.
 */
export default function DashboardPage() {
  return (
    <MainLayout
      navItems={[{ id: 'clareza', label: 'Clareza', href: '/' }]}
      activeNavId="clareza"
      topbarProps={{ title: 'Painel de Clareza' }}
    >
      <MainDashboard />
    </MainLayout>
  );
}
