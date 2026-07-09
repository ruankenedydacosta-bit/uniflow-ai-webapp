import { supabase } from './client';

/**
 * ATENÇÃO — SEM DOCX ESPECÍFICO PARA CRM
 * Nenhum documento enviado descreve campos/fluxo de "Clientes". Por
 * instrução explícita, uso aqui um padrão mínimo coerente de CRM
 * (nome/email/telefone/empresa/status/tags — o vocabulário universal de
 * qualquer CRM), não uma funcionalidade inventada especificamente para
 * a UniFlow AI. Três tabelas assumidas:
 *
 *   - "clientes" (id, usuario_id, nome, email, telefone, empresa, cargo,
 *     status, tags[], criado_em, atualizado_em)
 *   - "cliente_notas" (id, cliente_id, usuario_id, conteudo, criado_em)
 *   - "cliente_atividades" (id, cliente_id, tipo, descricao, criado_em)
 *     — timeline: criação, mudança de status, nota adicionada
 *
 * Ajuste aqui se o schema real divergir — nenhum componente conhece
 * nomes de tabela diretamente.
 */
const CUSTOMERS_TABLE = 'clientes';
const NOTES_TABLE = 'cliente_notas';
const ACTIVITIES_TABLE = 'cliente_atividades';

export const crmService = {
  async listCustomers(userId, { search, status } = {}) {
    let query = supabase.from(CUSTOMERS_TABLE).select('*').eq('usuario_id', userId);
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`nome.ilike.%${search}%,email.ilike.%${search}%,empresa.ilike.%${search}%`);
    const { data, error } = await query.order('atualizado_em', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getCustomer(customerId) {
    const { data, error } = await supabase.from(CUSTOMERS_TABLE).select('*').eq('id', customerId).single();
    if (error) throw error;
    return data;
  },

  async createCustomer(userId, payload) {
    const { data, error } = await supabase
      .from(CUSTOMERS_TABLE)
      .insert({ usuario_id: userId, status: 'lead', tags: [], ...payload })
      .select()
      .single();
    if (error) throw error;
    await logActivity(data.id, 'criacao', 'Cliente cadastrado.');
    return data;
  },

  async updateCustomer(customerId, changes) {
    const { data, error } = await supabase
      .from(CUSTOMERS_TABLE)
      .update({ ...changes, atualizado_em: new Date().toISOString() })
      .eq('id', customerId)
      .select()
      .single();
    if (error) throw error;

    if (changes.status) {
      await logActivity(customerId, 'status', `Status alterado para "${changes.status}".`);
    }
    return data;
  },

  async deleteCustomer(customerId) {
    const { error } = await supabase.from(CUSTOMERS_TABLE).delete().eq('id', customerId);
    if (error) throw error;
  },

  async listNotes(customerId) {
    const { data, error } = await supabase
      .from(NOTES_TABLE)
      .select('*')
      .eq('cliente_id', customerId)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  },

  async addNote(customerId, userId, conteudo) {
    const { data, error } = await supabase
      .from(NOTES_TABLE)
      .insert({ cliente_id: customerId, usuario_id: userId, conteudo })
      .select()
      .single();
    if (error) throw error;
    await logActivity(customerId, 'nota', 'Nova nota adicionada.');
    return data;
  },

  async listActivities(customerId) {
    const { data, error } = await supabase
      .from(ACTIVITIES_TABLE)
      .select('*')
      .eq('cliente_id', customerId)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return data;
  },
};

async function logActivity(customerId, tipo, descricao) {
  await supabase.from(ACTIVITIES_TABLE).insert({ cliente_id: customerId, tipo, descricao });
}
