import MainLayout from '../../components/Layout/MainLayout';
import { useAuth } from '../../hooks/useAuth';
import ChatWindow from '../../features/chat';

export default function ChatPage() {
  const { user } = useAuth();

  return (
    <MainLayout
      navItems={[{ id: 'uni', label: 'Uni', href: '/uni' }]}
      activeNavId="uni"
      topbarProps={{ title: 'Uni' }}
    >
      <ChatWindow userId={user?.id} />
    </MainLayout>
  );
}
