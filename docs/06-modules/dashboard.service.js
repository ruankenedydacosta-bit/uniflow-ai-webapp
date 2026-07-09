import { supabase } from './client';

/**
 * ATENÇÃO — SUPOSIÇÃO DE SCHEMA
 * O docx não define views/RPCs de agregação. Assumi que "resumo
 * financeiro" e "próximo objetivo" vêm de queries diretas sobre
 * "movimentacoes" e "objetivos" (4.3/4.4 do Modelo Conceitual). Em
 * produção real, isso provavelmente deveria virar uma Postgres
 * function/view (performance — 4.5 do Modelo Conceitual fala em
 * milhões de linhas em "movimentacoes") em vez de agregação no cliente.
 * Documentado aqui, não escondido.
 */
export const dashboardService = {
  async getFinancialSummary(userId) {
    const { data, error } = await supabase
      .from('movimentacoes')
      .select('valor, tipo, data')
      .eq('usuario_id', userId)
      .gte('data', firstDayOfMonth());
    if (error) throw error;

    const receitas = sum(data, (m) => m.tipo === 'receita');
    const despesas = sum(data, (m) => m.tipo === 'despesa');

    return { receitas, despesas, economia: receitas - despesas };
  },

  async getGoals(userId, { limit = 3 } = {}) {
    const { data, error } = await supabase
      .from('objetivos')
      .select('id, titulo, categoria, progresso')
      .eq('usuario_id', userId)
      .order('criado_em', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async getRecentActivity(userId, { limit = 6 } = {}) {
    const { data, error } = await supabase
      .from('movimentacoes')
      .select('id, categoria, valor, tipo, data, descricao')
      .eq('usuario_id', userId)
      .order('data', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  /**
   * "Insights da Uni" (docx, wireframe 3.1) — nesta fase, sem o Motor de
   * Projeção Financeira implementado, retorna vazio propositalmente em
   * vez de simular dados falsos. UniInsightsCard trata a lista vazia
   * como estado normal, não como erro.
   */
  async getUniInsights() {
    return [];
  },
};

function firstDayOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function sum(rows, predicate) {
  return rows.filter(predicate).reduce((total, row) => total + Number(row.valor), 0);
}
