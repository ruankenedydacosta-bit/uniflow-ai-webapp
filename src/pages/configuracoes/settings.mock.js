// CFG4: contém somente conteúdo estático real (não fictício) ainda em uso
// por SettingsPage.jsx -- descrições de opções que de fato existem
// (usageModes) e o rótulo do workspace atual (personal/business). Dados de
// identidade (profile), preferências inexistentes (uniPreferences,
// voiceInteraction, notifications) e workspaces fictícios (spaces, ex.:
// "Empresa demo") foram removidos por não corresponderem a nenhum dado ou
// funcionalidade real.
export const settingsMock = {
  usageModes: [
    {
      label: 'Pessoal',
      value: 'personal',
      description: 'Vida financeira, objetivos e decisões pessoais.',
    },
    {
      label: 'Empresarial',
      value: 'business',
      description: 'Caixa, cobranças, clientes e decisões da empresa.',
    },
    {
      label: 'Pessoal + Empresa',
      value: 'both',
      description: 'Dois espaços separados, sem misturar dados.',
    },
  ],
  // Afirmações genéricas e verificáveis (não específicas do usuário) --
  // substituem o texto anterior desatualizado ("Futuro Supabase Auth com
  // RLS"): autenticação e isolamento por workspace via RLS já estão em
  // produção em todo o app, confirmado em auditorias anteriores.
  privacy: [
    'Acesso protegido por autenticação.',
    'Os dados são isolados por workspace.',
    'Nenhuma chave sensível exposta no frontend.',
  ],
  personal: {
    workspaceLabel: 'Pessoal',
  },
  business: {
    workspaceLabel: 'Empresarial',
  },
};
