// ETAPA 4: rotas internas da área de Conta -- centralizadas aqui para que
// routes.jsx e SimplifiedAccountPage.jsx nunca declarem os mesmos paths em
// dois lugares (fonte única, mesmo padrão de simplifiedRoutes.js).
//
// BLOCO FINAL DO MVP (Sobre a UniFlow AI): "Privacidade e dados" foi
// removida TOTALMENTE (id + rota) do menu Conta -- será implementada no
// futuro junto de LGPD, exportação/exclusão de conta e permissões.
// "Notificações" voltou na Fase 3 do redesign (#90) como página própria
// (tela 13 do handoff); o sino do header segue abrindo o painel rápido.
// #290: MY_ACCOUNTS e PAYMENTS só redirecionam (para Organizar → Contas e
// para Seu plano), para não quebrar link salvo.
export const ACCOUNT_SUBROUTE_IDS = Object.freeze({
  EDIT_PROFILE: 'edit-profile',
  SECURITY: 'security',
  PLAN: 'plan',
  PAYMENTS: 'payments',
  PAYMENT_HISTORY: 'payment-history',
  MY_ACCOUNTS: 'my-accounts',
  VOICE: 'voice',
  SUPPORT: 'support',
  THEME: 'theme',
  ABOUT: 'about',
  // Fase 3 do redesign (#90): a tela 13 do handoff é uma página própria de
  // notificações, alcançada pelo item "Notificações" do Mais. O sino do
  // header continua abrindo o painel rápido nas telas que o têm.
  NOTIFICATIONS: 'notifications',
  // Épico #98 (#99): conexão com o Google Agenda. Fora do Mais: a entrada
  // fica em Configurações → Preferências. A mesma tela abre pelo topo da
  // Agenda em SIMPLIFIED_ROUTES.AGENDA_GOOGLE.
  GOOGLE_CALENDAR: 'google-calendar',
});

export const ACCOUNT_SUBROUTES = Object.freeze({
  [ACCOUNT_SUBROUTE_IDS.EDIT_PROFILE]: Object.freeze({
    path: '/app/conta/editar-perfil',
    title: 'Editar perfil',
  }),
  [ACCOUNT_SUBROUTE_IDS.SECURITY]: Object.freeze({
    path: '/app/conta/seguranca',
    title: 'Segurança',
  }),
  [ACCOUNT_SUBROUTE_IDS.PLAN]: Object.freeze({
    path: '/app/conta/plano',
    title: 'Seu plano',
  }),
  [ACCOUNT_SUBROUTE_IDS.PAYMENTS]: Object.freeze({
    path: '/app/conta/pagamentos',
    title: 'Pagamento e assinatura',
  }),
  // BLOCO FINAL DO MVP (Histórico de pagamentos): tela real única que serve
  // tanto "Ver histórico de pagamentos" quanto "Notas fiscais e recibos"
  // (Seu plano) -- mesmos dados (billing_payments), cada item já traz seu
  // próprio comprovante (invoice_url) quando existe.
  [ACCOUNT_SUBROUTE_IDS.PAYMENT_HISTORY]: Object.freeze({
    path: '/app/conta/pagamentos/historico',
    title: 'Histórico de pagamentos',
  }),
  [ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS]: Object.freeze({
    path: '/app/conta/minhas-contas',
    title: 'Minhas contas',
  }),
  [ACCOUNT_SUBROUTE_IDS.VOICE]: Object.freeze({
    path: '/app/conta/voz',
    title: 'Estilo das respostas',
  }),
  [ACCOUNT_SUBROUTE_IDS.SUPPORT]: Object.freeze({
    path: '/app/conta/suporte',
    title: 'Suporte',
  }),
  [ACCOUNT_SUBROUTE_IDS.THEME]: Object.freeze({
    path: '/app/conta/tema',
    title: 'Tema',
  }),
  // BLOCO FINAL DO MVP (Sobre a UniFlow AI): tela institucional real,
  // primeira versão oficial do MVP (v1.0.0) -- ver appIdentity.js.
  [ACCOUNT_SUBROUTE_IDS.ABOUT]: Object.freeze({
    path: '/app/conta/sobre',
    title: 'Sobre a UniFlow AI',
  }),
  [ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS]: Object.freeze({
    path: '/app/conta/notificacoes',
    title: 'Notificações',
  }),
  [ACCOUNT_SUBROUTE_IDS.GOOGLE_CALENDAR]: Object.freeze({
    path: '/app/conta/google-agenda',
    title: 'Google Agenda',
  }),
});
