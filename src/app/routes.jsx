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
import MetaDetalhePage from '../pages/MetaDetalhePage';
import ProjectsPage from '../pages/ProjectsPage';
import ReportsPage from '../pages/ReportsPage';
import ResetPasswordPage from '../pages/ResetPasswordPage';
import { PrivacidadePage, PRIVACIDADE_ROUTE } from '../features/legal';
import SettingsPage from '../pages/SettingsPage';
import OpenFinancePage from '../pages/OpenFinancePage';
import {
  CategoriaDetalhePage,
  CategoriasListaPage,
  CategoriesPage,
  OrganizarPage,
} from '../features/categories';
import { ContaDetalhePage, ContasListaPage } from '../features/contas';
import { FuturePage } from '../features/future';
import { PresentationPage } from '../features/presentation';
import { PERSONAL_PLAN_RETURN_ROUTE, PersonalPlanPage, PersonalPlanReturnPage } from '../features/personal-plan';
import { PLATFORM_ADMIN_ROUTE, PlatformAdminPage } from '../features/platform-admin';
import {
  ACCOUNT_SUBROUTE_IDS,
  ACCOUNT_SUBROUTES,
  SIMPLIFIED_ROUTES,
  SimplifiedAgendaPage,
  SimplifiedAboutPage,
  SimplifiedAccountPage,
  SimplifiedAccountSubpagePlaceholder,
  SimplifiedEditProfilePage,
  SimplifiedGoogleAgendaPage,
  SimplifiedNotificationsPage,
  SimplifiedPaymentHistoryPage,
  SimplifiedPaymentsPage,
  SimplifiedPlanPage,
  SimplifiedRecordsPage,
  SimplifiedReportPage,
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

const UniRealtimePrototypePage = import.meta.env.DEV
  ? lazy(() => import('../pages/dev/uni-realtime'))
  : null;

const RedesignShowcasePage = import.meta.env.DEV
  ? lazy(() => import('../pages/dev/redesign'))
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
    // Pública para quem está logado ou não. O HTML desta rota é
    // pré-renderizado no build (scripts/prerender-legal.mjs).
    path: PRIVACIDADE_ROUTE,
    label: 'Política de Privacidade',
    title: 'Política de Privacidade',
    element: <PrivacidadePage />,
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
        {
          path: '/dev/uni-realtime',
          label: 'Conversa contínua com a Uni',
          title: 'Conversa contínua com a Uni',
          element: (
            <Suspense fallback={null}>
              <UniRealtimePrototypePage />
            </Suspense>
          ),
        },
        {
          path: '/dev/redesign',
          label: 'Base do redesign',
          title: 'Base do redesign',
          element: (
            <Suspense fallback={null}>
              <RedesignShowcasePage />
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
    label: 'Financeiro',
    title: 'Financeiro',
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
  // RELATORIO1: rota interna sempre registrada, mesmo padrão de Agenda --
  // fora da barra inferior, alcançada pelo card "Relatório da Uni" na Home.
  {
    path: SIMPLIFIED_ROUTES.RELATORIO,
    label: 'Relatório da Uni',
    title: 'Relatório da Uni',
    simplified: true,
    element: <SimplifiedReportPage />,
  },
  // RELATORIO-FLATTEN1: a rota da planilha imersiva foi FUNDIDA em
  // SIMPLIFIED_ROUTES.RELATORIO (resumo + planilha na mesma tela, ver
  // SimplifiedReportPage.jsx) -- esta rota deixou de ter tela própria,
  // mas continua registrada só como redirect, para nunca quebrar um
  // bookmark/link antigo apontando pra /app/relatorio/planilha.
  {
    path: SIMPLIFIED_ROUTES.RELATORIO_PLANILHA,
    element: <Navigate to={SIMPLIFIED_ROUTES.RELATORIO} replace />,
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
  // #182: as contas vivem em Organizar. A rota antiga de minhas-contas só
  // redireciona, para não quebrar link ou bookmark salvo.
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS].path,
    simplified: true,
    element: <Navigate to={SIMPLIFIED_ROUTES.CONTAS} replace />,
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
  // Fase 3 do redesign (#90): página de notificações (tela 13), alcançada
  // pelo item Notificações do Mais.
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS].title,
    simplified: true,
    element: <SimplifiedNotificationsPage />,
  },
  {
    // Painel da equipe da UniFlow. A tela confere is_platform_admin() e as
    // funções admin_* do banco recusam quem não é admin.
    path: PLATFORM_ADMIN_ROUTE,
    label: 'Administração',
    title: 'Administração',
    simplified: true,
    element: <PlatformAdminPage />,
  },
  // Épico #98 (#99): Google Agenda, fora do menu. O callback do OAuth volta
  // para esta rota com ?google_agenda=.
  {
    path: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR].path,
    label: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR].title,
    title: ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR].title,
    simplified: true,
    element: <SimplifiedGoogleAgendaPage />,
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
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS].path
      && subroute.path !== ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR].path
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
  // Organizar (handoff 10): hub, lista e detalhe de categoria.
  {
    path: SIMPLIFIED_ROUTES.ORGANIZAR,
    label: 'Organizar',
    title: 'Organizar',
    simplified: true,
    element: <OrganizarPage />,
  },
  {
    path: SIMPLIFIED_ROUTES.CATEGORIAS,
    label: 'Categorias',
    title: 'Categorias',
    simplified: true,
    element: <CategoriasListaPage />,
  },
  {
    path: SIMPLIFIED_ROUTES.CATEGORIA,
    label: 'Categoria',
    title: 'Categoria',
    simplified: true,
    element: <CategoriaDetalhePage />,
  },
  {
    path: SIMPLIFIED_ROUTES.CONTAS,
    label: 'Contas',
    title: 'Contas',
    simplified: true,
    element: <ContasListaPage />,
  },
  {
    path: SIMPLIFIED_ROUTES.CONTA,
    label: 'Conta',
    title: 'Conta',
    simplified: true,
    element: <ContaDetalhePage />,
  },
  {
    path: SIMPLIFIED_ROUTES.METAS,
    moduleId: MODULE_IDS.OBJETIVOS,
    label: 'Metas',
    title: 'Metas',
    simplified: true,
    element: <ObjetivosPage />,
  },
  {
    path: SIMPLIFIED_ROUTES.META,
    moduleId: MODULE_IDS.OBJETIVOS,
    label: 'Meta',
    title: 'Meta',
    simplified: true,
    element: <MetaDetalhePage />,
  },
  // Rotas antigas de Metas: mantêm links e bookmarks anteriores funcionando.
  // `simplified` é necessário: só rotas simplificadas renderizam, o resto
  // cai na Home antes de o redirect rodar.
  {
    path: '/objetivos',
    simplified: true,
    element: <Navigate to={SIMPLIFIED_ROUTES.METAS} replace />,
  },
  {
    path: '/metas',
    simplified: true,
    element: <Navigate to={SIMPLIFIED_ROUTES.METAS} replace />,
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
