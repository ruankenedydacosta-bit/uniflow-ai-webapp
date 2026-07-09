import MainLayout from '../../components/Layout/MainLayout';
import { useAuth } from '../../hooks/useAuth';
import CustomerBoard from '../../features/crm';

export default function CustomerPage() {
  const { user } = useAuth();

  return (
    <MainLayout
      navItems={[{ id: 'clientes', label: 'Clientes', href: '/clientes' }]}
      activeNavId="clientes"
      topbarProps={{ title: 'Clientes' }}
    >
      <CustomerBoard userId={user?.id} />
    </MainLayout>
  );
}
