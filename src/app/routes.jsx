import { lazy, Suspense } from 'react';
import DashboardPage from '../features/dashboard';
import AgendaPage from '../pages/AgendaPage';
import ClientesPage from '../pages/ClientesPage';
import CRMPage from '../pages/CRMPage';
import FinancePage from '../pages/FinancePage';
import LoginPage from '../pages/LoginPage';
import ObjetivosPage from '../pages/ObjetivosPage';
import OnboardingPage from '../pages/OnboardingPage';
import ProjectsPage from '../pages/ProjectsPage';
import ReportsPage from '../pages/ReportsPage';
import SettingsPage from '../pages/SettingsPage';
import UniAIPage from '../pages/UniAIPage';

const UniAudioLibraryPage = import.meta.env.DEV
  ? lazy(() => import('../pages/dev/uni-audio-library'))
  : null;

export const publicRoutes = [
  {
    path: '/login',
    label: 'Login',
    title: 'Login',
    element: <LoginPage />,
  },
  {
    path: '/onboarding',
    label: 'Onboarding',
    title: 'Onboarding',
    element: <OnboardingPage />,
  },
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev/uni-audio-library',
          label: 'Biblioteca de Voz da Uni',
          title: 'Biblioteca de Voz da Uni',
          element: (
            <Suspense fallback={null}>
              <UniAudioLibraryPage />
            </Suspense>
          ),
        },
      ]
    : []),
];

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
    path: '/clientes',
    label: 'Clientes',
    title: 'Clientes',
    element: <ClientesPage />,
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
