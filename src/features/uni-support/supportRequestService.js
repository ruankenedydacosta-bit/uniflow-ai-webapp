// SUPORTE1: acesso a dados de support_requests -- mesmo contrato de
// serviços já estabelecidos no projeto (ex.: goalService.js): sempre
// resolve { data, error }, nunca lança. RLS garante que o usuário só vê e
// só cria as PRÓPRIAS solicitações -- nenhum filtro extra é necessário
// aqui além de deixar o Supabase aplicar a policy.
import { supabase } from '../../services/supabaseClient';

const TABLE = 'support_requests';

export function isSupportRequestsConfigured() {
  return Boolean(supabase);
}

export async function createSupportRequest(payload) {
  if (!supabase) return { data: null, error: { message: 'not_configured' } };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(payload)
    .select('id, category, subject, description, impact, platform, status, created_at, updated_at')
    .single();

  if (error) return { data: null, error };
  return { data, error: null };
}

export async function listOwnSupportRequests() {
  if (!supabase) return { data: [], error: { message: 'not_configured' } };

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, category, subject, description, impact, platform, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return { data: [], error };
  return { data: data ?? [], error: null };
}
