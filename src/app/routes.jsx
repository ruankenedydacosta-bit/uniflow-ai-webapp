import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import DashboardPage from '../features/dashboard';
import AgendaPage from '../pages/AgendaPage';
import AuthCallbackPage from '../pages/AuthCallbackPage';
import ClientesPage from '../pages/ClientesPage';
import CRMPage from '../pages/CRMPage';
import FinancePage from '../pages/FinancePage';
import LoginPage from '../pages/LoginPage';
import { WelcomeDecisionPage } from '../features/auth-mobile';
import ObjetivosPage from '../pages/ObjetivosPage';
import ProjectsPage from '../pages/ProjectsPage';
import ReportsPage from '../pages/ReportsPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import SettingsPage from '../pages/SettingsPage';
import OpenFinancePage from '../pages/OpenFinancePage';
import { CategoriesPage } from '../features/categories';
import { FuturePage } from '../features/future';
import { PresentationPage } from '../features/presentation';
import { PERSONAL_PLAN_RETURN_ROUTE, PersonalPlanPage, PersonalPlanReturnPage } from '../features/personal-plan';
import {
  ACCOUNT_SUBROUTE_IDS,
  ACCOUNT_SUBROUTES,
  SIMPLIFIED_ROUTES,
  SimplifiedAgendaPage,
  SimplifiedAboutPage,
  SimplifiedAccountPage,
  SimplifiedAccountSubpagePlaceholder,
  SimplifiedEditProfilePage,
  SimplifiedMyAccountsPage,
  SimplifiedPaymentHistoryPage,
  SimplifiedPaymentsPage,
  SimplifiedPlanPage,
  SimplifiedRecordsPage,
  SimplifiedSecurityPage,
  SimplifiedSupportPage,
  SimplifiedThemePage,
  SimplifiedUniSupportPage,
  SimplifiedVoicePage,
} from '../features/simplified-app';
// eslint-disable-next-line react-refresh/only-export-components -- lazy route component kept beside route declarations
const UniChatPage = lazy(() => import('../features/uni-chat/UniChatPage'));
// eslint-disable-next-line react-refresh/only-export-components -- mesmo padrao pre-existente da linha acima (UniChatPage)
const SupportCenterPage = lazy(() => import('../features/uni-support/SupportCenterPage'));
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
    // SIMPLIFICAÇÃO DA PRIMEIRA TELA: /welcome deixou de redirecionar direto
    // para /login -- agora é a própria tela de decisão (2 cards: "Já tenho
    // conta" / "Criar conta"), pensada para reduzir a confusão de quem tem
    // pouca familiaridade digital. A escolha de provedor (Google/e-mail) só
    // aparece depois, já dentro de /login ou /cadastro.
    path: '/welcome',
    label: 'Boas-vindas',
    title: 'Boas-vindas',
    element: <WelcomeDecisionPage />,
  },
  {
    path: '/login',
    label: 'Login',
    title: 'Login',
    element: <LoginPage />,
  },
  {
    // Card "Criar conta" -- reaproveita o MESMO MobileAuthPage/mecanismo de
    // ?mode=signup já existente e testado (nunca duplica o formulário de
    // cadastro num componente separado).
    path: '/cadastro',
    label: 'Criar conta',
    title: 'Criar conta',
    element: <Navigate to="/login?mode=signup" replace />,
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
    path: '/apresentacao',
    label: 'Apresentação',
    title: 'Apresentação',
    standalone: true,
    element: <PresentationPage />,
  },
  {
    path: '/plano-pessoal',
    label: 'Plano Pessoal',
    title: 'Plano Pessoal',
    standalone: true,
    element: <PersonalPlanPage />,
  },
  {
    // BLOCO ASAAS CHECKOUT: rota de retorno do Asaas Checkout hospedado
    // (cartão) -- nunca considera o plano ativo só por chegar aqui, sempre
    // consulta billing-get-subscription (ver PersonalPlanReturnPage.jsx).
    path: PERSONAL_PLAN_RETURN_ROUTE,
    label: 'Retorno do pagamento',
    title: 'Retorno do pagamento',
    standalone: true,
    element: <PersonalPlanReturnPage />,
  },
  {
    path: SIMPLIFIED_ROUTES.HOME,
    label: 'Home',
    title: 'Home',
    simplified: true,
    element: (
      <Suspense fallback={null}>
        <UniChatPage variant="simplified-home" />
      </Suspense>
    ),
  },
  {
    path: SIMPLIFIED_ROUTES.UNI,
    label: 'Uni',
    title: 'Uni',
    simplified: true,
    element: (
      <Suspense fallback={null}>
        <UniChatPage variant="simplified" />
      </Suspense>
    ),
  },
  {
    path: SIMPLIFIED_ROUTES.RECORDS,
    label: 'Registros',
    title: 'Registros',
    simplified: true,
    element: <SimplifiedRecordsPage />,
  },
  // LOTE D: rota interna de Agenda é SEMPRE registrada (a barra inferior
  // não a expõe; o acesso é por fluxos internos, ex. card da Uni). A flag
  // VITE_SIMPLIFIED_AGENDA_ENABLED deixou de controlar a existência da
  // rota -- só ajustes programáticos futuros usariam a flag.
  {
    path: SIMPLIFIED_ROUTES.AGENDA,
    label: 'Agenda',
    title: 'Agenda',
    simplified: true,
    element: <SimplifiedAgendaPage />,
  },
  // LOTE D: rota interna da conversa de Suporte da Uni é SEMPRE registrada
  // -- o acesso é via Conta > Suporte (o item "Falar com a Uni"), não pela
  // barra inferior.
  // LOTE E: a rota agora monta a experiência DEDICADA de "Uni Suporte"
  // (SimplifiedUniSupportPage) -- compacta, no shell escuro do Lote F, com
  // a MESMA base de suporte (useUniSupportChat / conversation_type='support'
  // / orquestrador e prompt existentes). A Central de Suporte legada segue
  // disponível na rota do app legado (/suporte).
  {
    path: SIMPLIFIED_ROUTES.SUPPORT_CHAT,
    label: 'Uni Suporte',
    title: 'Uni Suporte',
    simplified: true,
    element: (
      <Suspense fallback={null}>
        <SimplifiedUniSupportPage />
      </Suspense>
    ),
  },
  {
    path: SIMPLIFIED_ROUTES.ACCOUNT,
    label: 'Conta',
    title: 'Conta',
    simplified: true,
    element: <SimplifiedAccountPage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE].title,
    simplified: true,
    element: <SimplifiedEditProfilePage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SECURITY].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SECURITY].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SECURITY].title,
    simplified: true,
    element: <SimplifiedSecurityPage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PLAN].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PLAN].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PLAN].title,
    simplified: true,
    element: <SimplifiedPlanPage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENTS].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENTS].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENTS].title,
    simplified: true,
    element: <SimplifiedPaymentsPage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].title,
    simplified: true,
    element: <SimplifiedPaymentHistoryPage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS].title,
    simplified: true,
    element: <SimplifiedMyAccountsPage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].title,
    simplified: true,
    element: <SimplifiedSupportPage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.VOICE].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.VOICE].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.VOICE].title,
    simplified: true,
    element: <SimplifiedVoicePage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.THEME].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.THEME].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.THEME].title,
    simplified: true,
    element: <SimplifiedThemePage />,
  },
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.ABOUT].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.ABOUT].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.ABOUT].title,
    simplified: true,
    element: <SimplifiedAboutPage />,
  },
  // ETAPA 4 (Fase 8): demais rotas internas de Conta -- placeholders
  // honestos e consistentes (título + botão voltar + mensagem curta),
  // nunca uma tela em branco. A construção completa de cada uma acontece
  // em tarefas futuras, usando as respectivas referências visuais
  // aprovadas.
  ...Object.values(ACCOUNT_SUBROUTES)
    .filter((subroute) => (
      subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SECURITY].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PLAN].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENTS].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.SUPPORT].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.VOICE].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.THEME].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.ABOUT].path
    ))
    .map((subroute) => ({
      path: subroute.path,
      label: subroute.title,
      title: subroute.title,
      simplified: true,
      element: (
        <SimplifiedAccountSubpagePlaceholder
          title={subroute.title}
          description={subroute.description}
        />
      ),
    })),
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
  {
    path: '/suporte',
    moduleId: MODULE_IDS.SUPORTE,
    label: 'Suporte',
    title: 'Central de Suporte',
    element: (
      <Suspense fallback={null}>
        <SupportCenterPage />
      </Suspense>
    ),
  },
];
