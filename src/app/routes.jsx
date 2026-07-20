import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import DashboardPage from '../features/dashboard';
import AgendaPage from '../pages/AgendaPage';
import ClientesPage from '../pages/ClientesPage';
import CRMPage from '../pages/CRMPage';
import FinancePage from '../pages/FinancePage';
import LoginPage from '../pages/LoginPage';
import ObjetivosPage from '../pages/ObjetivosPage';
import { OnboardingPage } from '../features/onboarding';
import ProjectsPage from '../pages/ProjectsPage';
import ReportsPage from '../pages/ReportsPage';
import SettingsPage from '../pages/SettingsPage';
import { FuturePage } from '../features/future';
const UniChatPage = lazy(() => import('../features/uni-chat/UniChatPage'));
import { MobileWelcomePage } from '../features/auth-mobile';

const UniAudioLibraryPage = import.meta.env.DEV
  ? lazy(() => import('../pages/dev/uni-audio-library'))
  : null;

export const publicRoutes = [
  {
    path: '/',
    label: 'Início',
    title: 'Início',
    element: <Navigate to="/welcome" replace />,
  },
  {
    path: '/welcome',
    label: 'Boas-vindas',
    title: 'Boas-vindas',
    element: <MobileWelcomePage />,
  },
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
  {
    path: '/uni-chat-proto',
    label: 'Uni Chat (Protótipo)',
    title: 'Uni Chat — Protótipo',
    element: (
      <Suspense fallback={null}>
        <UniChatPage />
      </Suspense>
    ),
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
    element: (
      <Suspense fallback={null}>
        <UniChatPage />
      </Suspense>
    ),
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
    path: '/futuro',
    label: 'Visão de Futuro',
    title: 'Visão de Futuro',
    element: <FuturePage />,
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
