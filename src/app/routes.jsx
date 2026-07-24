import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import DashboardPage from '../features/dashboard';
import AgendaPage from '../pages/AgendaPage';
import AuthCallbackPage from '../pages/AuthCallbackPage';
import ClientesPage from '../pages/ClientesPage';
import CRMPage from '../pages/CRMPage';
import FinancePage from '../pages/FinancePage';
import LoginPage from '../pages/LoginPage';
import ObjetivosPage from '../pages/ObjetivosPage';
import { OnboardingPage } from '../features/onboarding';
import ProjectsPage from '../pages/ProjectsPage';
import ReportsPage from '../pages/ReportsPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import SettingsPage from '../pages/SettingsPage';
import OpenFinancePage from '../pages/OpenFinancePage';
import { CategoriesPage } from '../features/categories';
import { FuturePage } from '../features/future';
const UniChatPage = lazy(() => import('../features/uni-chat/UniChatPage'));
import { MobileWelcomePage } from '../features/auth-mobile';
import { MODULE_IDS } from './moduleAccess.js';

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
    path: '/redefinir-senha',
    label: 'Redefinir senha',
    title: 'Redefinir senha',
    element: <ResetPasswordPage />,
  },
  {
    // AUTH4: rota de retorno do login com Google -- pública (não exige
    // sessão antes de processar o retorno), decide para onde navegar
    // reaproveitando o mesmo fluxo de sessão da AUTH2, sem redirecionamento
    // silencioso.
    path: '/auth/callback',
    label: 'Concluindo acesso',
    title: 'Concluindo acesso',
    element: <AuthCallbackPage />,
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
    moduleId: MODULE_IDS.DASHBOARD,
    label: 'Dashboard',
    title: 'Dashboard',
    element: <DashboardPage />,
  },
  {
    path: '/uni-ai',
    moduleId: MODULE_IDS.UNI_AI,
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
    moduleId: MODULE_IDS.FINANCEIRO,
    label: 'Financeiro',
    title: 'Financeiro',
    element: <FinancePage />,
  },
  {
    path: '/categorias',
    moduleId: MODULE_IDS.CATEGORIAS,
    label: 'Categorias',
    title: 'Categorias',
    element: <CategoriesPage />,
  },
  {
    path: '/open-finance',
    moduleId: MODULE_IDS.OPEN_FINANCE,
    label: 'Open Finance',
    title: 'Open Finance',
    element: <OpenFinancePage />,
  },
  {
    path: '/objetivos',
    moduleId: MODULE_IDS.OBJETIVOS,
    label: 'Objetivos',
    title: 'Objetivos',
    element: <ObjetivosPage />,
  },
  {
    path: '/futuro',
    moduleId: MODULE_IDS.FUTURO,
    label: 'Visão de Futuro',
    title: 'Visão de Futuro',
    element: <FuturePage />,
  },
  {
    path: '/crm',
    moduleId: MODULE_IDS.CRM,
    label: 'CRM',
    title: 'CRM',
    element: <CRMPage />,
  },
  {
    path: '/clientes',
    moduleId: MODULE_IDS.CLIENTES,
    label: 'Clientes',
    title: 'Clientes',
    element: <ClientesPage />,
  },
  {
    path: '/projetos',
    moduleId: MODULE_IDS.PROJETOS,
    label: 'Projetos',
    title: 'Projetos',
    element: <ProjectsPage />,
  },
  {
    path: '/agenda',
    moduleId: MODULE_IDS.AGENDA,
    label: 'Agenda',
    title: 'Agenda',
    element: <AgendaPage />,
  },
  {
    path: '/relatorios',
    moduleId: MODULE_IDS.RELATORIOS,
    label: 'Relatórios',
    title: 'Relatórios',
    element: <ReportsPage />,
  },
  {
    path: '/configuracoes',
    moduleId: MODULE_IDS.CONFIGURACOES,
    label: 'Configurações',
    title: 'Configurações',
    element: <SettingsPage />,
  },
];
