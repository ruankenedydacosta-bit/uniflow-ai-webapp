export const settingsMock = {
  profile: {
    name: 'UniFlow Demo',
    email: 'uniflow.ai.acesso@gmail.com',
  },
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
  uniPreferences: [
    { label: 'Tom da Uni', value: 'Tranquilo e objetivo' },
    { label: 'Nível de explicação', value: 'Didático' },
    { label: 'Frequência de alertas', value: 'Somente quando houver valor real' },
    { label: 'Prioridade', value: 'Clareza sem ansiedade' },
  ],
  voiceInteraction: [
    { label: 'Respostas por voz', value: 'Ativo', variant: 'success' },
    { label: 'Registro por voz', value: 'Ativo', variant: 'success' },
    { label: 'Atalho rápido futuro', value: 'Planejado', variant: 'secondary' },
    { label: 'Widget mobile futuro', value: 'Planejado', variant: 'secondary' },
  ],
  notifications: [
    'Vencimentos importantes',
    'Metas próximas',
    'Riscos financeiros',
    'Oportunidades relevantes',
  ],
  privacy: [
    'Dados protegidos por padrão',
    'Controle do usuário sobre preferências',
    'Nenhuma chave sensível exposta no frontend',
    'Futuro Supabase Auth com RLS',
  ],
  spaces: [
    {
      label: 'Espaço pessoal',
      description: 'Dados pessoais, objetivos e rotina financeira individual.',
      variant: 'secondary',
    },
    {
      label: 'Espaço empresarial',
      description: 'Empresa demo, caixa, cobranças e decisões operacionais.',
      variant: 'primary',
    },
    {
      label: 'Empresa demo',
      description: 'Ambiente mockado para validar modo Business.',
      variant: 'glass',
    },
  ],
  personal: {
    workspaceLabel: 'Pessoal',
    uniReading:
      'Suas configurações devem priorizar clareza, poucas interrupções e recomendações úteis para decisões pessoais.',
  },
  business: {
    workspaceLabel: 'Empresarial',
    uniReading:
      'Suas configurações devem manter espaços separados, alertas relevantes e controle claro sobre decisões da empresa.',
  },
};
