import DashboardPage from '../features/dashboard';
import AgendaPage from '../pages/AgendaPage';
import CRMPage from '../pages/CRMPage';
import FinancePage from '../pages/FinancePage';
import ObjetivosPage from '../pages/ObjetivosPage';
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
    path: '/objetivos',
    label: 'Objetivos',
    title: 'Objetivos',
    element: <ObjetivosPage />,
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
