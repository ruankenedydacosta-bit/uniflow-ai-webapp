import DashboardPage from '../features/dashboard';
import AgendaPage from '../pages/AgendaPage';
import CRMPage from '../pages/CRMPage';
import FinancePage from '../pages/FinancePage';
import ProjectsPage from '../pages/ProjectsPage';
import ReportsPage from '../pages/ReportsPage';
import SettingsPage from '../pages/SettingsPage';
import UniAIPage from '../pages/UniAIPage';

export const appRoutes = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    element: <DashboardPage />,
  },
  {
    path: '/uni-ai',
    label: 'Uni AI',
    title: 'Uni AI',
    element: <UniAIPage />,
  },
  {
    path: '/financeiro',
    label: 'Financeiro',
    title: 'Financeiro',
    element: <FinancePage />,
  },
  {
    path: '/crm',
    label: 'CRM',
    title: 'CRM',
    element: <CRMPage />,
  },
  {
    path: '/projetos',
    label: 'Projetos',
    title: 'Projetos',
    element: <ProjectsPage />,
  },
  {
    path: '/agenda',
    label: 'Agenda',
    title: 'Agenda',
    element: <AgendaPage />,
  },
  {
    path: '/relatorios',
    label: 'Relatórios',
    title: 'Relatórios',
    element: <ReportsPage />,
  },
  {
    path: '/configuracoes',
    label: 'Configurações',
    title: 'Configurações',
    element: <SettingsPage />,
  },
];

export const navigationItems = appRoutes.map(({ path, label }) => ({ path, label }));
