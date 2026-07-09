import AppShell from '../components/layout/AppShell';
import DashboardPage from '../features/dashboard';

function App() {
  return (
    <AppShell title="Dashboard">
      <DashboardPage />
    </AppShell>
  );
}

export default App;
