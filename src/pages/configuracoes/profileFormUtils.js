// Logica pura do perfil real em Configuracoes (CFG3): nome exibido (com
// fallback), valores iniciais do formulario de edicao, validacao e
// montagem do payload de atualizacao. Sem dependencia de React/Supabase --
// testavel via node --test. Mesmo padrao de clientFormUtils.js/
// agendaFormUtils.js/projectFormUtils.js (cada dominio duplica sua propria
// copia, sem compartilhamento entre modulos).

const SAFE_ERROR_CODES = new Set([
  'SUPABASE_NOT_CONFIGURED',
  'USER_REQUIRED',
  'PROFILE_UPDATE_NO_ROWS',
]);

export function getProfileErrorMessage(error, fallbackMessage) {
  if (!error) return '';
  return SAFE_ERROR_CODES.has(error.code) ? error.message : fallbackMessage;
}

/**
 * Nome exibido: profile.full_name (real, prioridade) -> user_metadata.full_name
 * do Supabase Auth (fallback quando o profile ainda nao tem nome) -> 'Usuário'
 * (fallback final, nunca nome de mock). Nunca retorna string vazia.
 */
export function getProfileDisplayName(profile, user) {
  const fullName = profile?.full_name?.trim();
  if (fullName) return fullName;

  const metadataName = user?.user_metadata?.full_name?.trim();
  if (metadataName) return metadataName;

  return 'Usuário';
}

/**
 * Valores iniciais do formulario de edicao. E-mail nao entra aqui -- e
 * somente leitura na modal, lido direto de user.email, nunca editavel
 * nesta fase. avatar_url tambem nao entra -- somente leitura nesta fase
 * (sem infraestrutura de upload/validacao de URL externa no projeto).
 */
export function createProfileEditForm(profile, user) {
  return {
    full_name: profile?.full_name ?? user?.user_metadata?.full_name ?? '',
    phone: profile?.phone ?? '',
  };
}

/**
 * Retorna null quando o formulario e valido, ou uma mensagem de erro (a
 * primeira violacao encontrada) caso contrario. E a barreira real antes da
 * mutacao, nao depende de required/disabled no JSX. Telefone e opcional --
 * sem validacao de formato (nenhum helper de telefone existe no projeto;
 * mesmo padrao ja aceito em clientFormUtils.js/agendaFormUtils.js). Sem
 * limite de tamanho para nome -- a coluna profiles.full_name e `text` sem
 * constraint de tamanho, entao nenhum limite e inventado aqui.
 */
export function validateProfileForm(form) {
  if (!form.full_name?.trim()) {
    return 'Nome é obrigatório.';
  }

  return null;
}

/**
 * Lista fechada de campos, montada por atribuicao explicita (nunca por
 * spread do form inteiro) -- garante estruturalmente que email,
 * avatar_url, user_mode, current_workspace_id, onboarding_* e demais
 * campos de profiles jamais sejam produzidos aqui, mesmo que o form algum
 * dia ganhe outras chaves. Mesmo padrao de buildClientMutationPayload/
 * buildProjectPayload/buildAgendaItemCreationPayload. Deve ser chamado
 * somente apos validateProfileForm(form) retornar null.
 */
export function buildProfileUpdatePayload(form) {
  return {
    full_name: form.full_name.trim(),
    phone: form.phone?.trim() ? form.phone.trim() : null,
  };
}
