// Memória de categoria por descrição (#79): quando a pessoa confirma o card
// de um lançamento, a Uni lembra em que categoria ela pôs aquela descrição.
// A próxima interpretação recebe essas memórias no prompt (uni-interpret) e
// escolhe a categoria entre os ids do catálogo, como sempre.
//
// Fica em uni_financial_memories (migration 005), tipo
// merchant_category_mapping. A RLS deixa cada pessoa ler e gravar só as
// próprias memórias, dentro de um espaço de que ela é membro: num espaço com
// várias pessoas, a correção de uma não muda a Uni da outra.
//
// A chave é um hash do tipo (saída ou entrada) com a descrição sem acento e
// sem caixa: "Aluguel" pago e "Aluguel" recebido são memórias diferentes. Hash
// porque a tabela recusa
// chave com certas palavras ("audio", "token"...) e limita o tamanho, e uma
// descrição como "Fone de áudio" não pode ficar sem memória por isso. O texto
// vai no valor, que é o que o prompt mostra.

import { normalizeSearchText } from '../../utils/searchText.js';
import {
  correctExplicitFinancialMemory,
  createExplicitMemoryCandidate,
  findActiveFinancialMemoryByKey,
} from '../../services/uniMemoryService.js';

export const TIPO_MEMORIA_DE_CATEGORIA = 'merchant_category_mapping';
// Eventos guardados por descrição: dão a medida de "correções repetidas da
// mesma descrição caem" (o n-ésimo uso troca menos que o primeiro).
export const MAX_EVENTOS_DA_MEMORIA = 20;
export const MAX_DESCRICAO_DA_MEMORIA = 80;

const TIPOS_COM_MEMORIA = new Set(['expense', 'income']);
// Descrição que não diz do que se trata não vira memória: "Compra" em Lazer
// uma vez puxaria toda compra descrita assim para Lazer.
const DESCRICOES_GENERICAS = new Set([
  'despesa', 'despesas', 'receita', 'receitas', 'entrada', 'saida', 'gasto', 'gastos',
  'pagamento', 'compra', 'compras', 'transferencia', 'lancamento', 'pix', 'boleto',
  'conta', 'outros', 'outras', 'diversos',
]);

export function descricaoMemorizavel(descricao) {
  const normalizada = normalizeSearchText(descricao);
  return normalizada.length >= 3 && !DESCRICOES_GENERICAS.has(normalizada);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paraHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// "Mensalidade Escolar" e "mensalidade escolar" são a mesma chave; a mesma
// descrição em entrada e em saída não.
export async function chaveDaDescricao(descricao, tipo) {
  const normalizada = normalizeSearchText(descricao);
  if (!normalizada || !TIPOS_COM_MEMORIA.has(tipo)) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${tipo}:${normalizada}`));
  return `descricao:${paraHex(digest).slice(0, 32)}`;
}

function inteiroNaoNegativo(valor) {
  return Number.isInteger(valor) && valor >= 0 ? valor : 0;
}

// Valor da memória depois de uma confirmação, ou null quando a mesma
// transação já foi contada (a confirmação repetida devolve o mesmo id).
//
// confirmacoes: quantas vezes seguidas a pessoa confirmou esta categoria sem
// trocar. Trocar a categoria no card zera a contagem; confirmar uma categoria
// diferente da memória sem trocar (o rascunho já veio com ela) recomeça em 1.
export function memoriaDepoisDaConfirmacao(atual, {
  descricao, categoriaId, tipo, trocou, transacaoId, data,
}) {
  const anterior = atual && typeof atual === 'object' && !Array.isArray(atual) ? atual : {};
  if (anterior.ultima_transacao_id && anterior.ultima_transacao_id === transacaoId) return null;

  const mesmaCategoria = anterior.categoria_id === categoriaId;
  let confirmacoes = 1;
  if (trocou) confirmacoes = 0;
  else if (mesmaCategoria) confirmacoes = inteiroNaoNegativo(anterior.confirmacoes) + 1;

  const total = inteiroNaoNegativo(anterior.total) + 1;
  const eventos = Array.isArray(anterior.eventos) ? anterior.eventos : [];
  return {
    descricao: String(descricao ?? '').trim().slice(0, MAX_DESCRICAO_DA_MEMORIA).trim(),
    categoria_id: categoriaId,
    tipo,
    confirmacoes,
    total,
    trocas: inteiroNaoNegativo(anterior.trocas) + (trocou ? 1 : 0),
    desfeitos: inteiroNaoNegativo(anterior.desfeitos),
    ultima_transacao_id: transacaoId,
    eventos: [...eventos, { n: total, data, trocou: Boolean(trocou) }].slice(-MAX_EVENTOS_DA_MEMORIA),
  };
}

const SERVICO_PADRAO = Object.freeze({
  buscar: findActiveFinancialMemoryByKey,
  criar: createExplicitMemoryCandidate,
  corrigir: correctExplicitFinancialMemory,
});

// Grava a confirmação de um lançamento de entrada ou saída. Nunca lança e
// nunca bloqueia o lançamento: falha de rede, papel sem escrita (leitor) ou
// descrição vazia só deixam de lembrar.
// trocou: a categoria confirmada é outra que a do primeiro rascunho.
export async function registrarConfirmacaoNaMemoria({
  workspaceId,
  descricao,
  categoriaId,
  tipo,
  trocou = false,
  transacaoId,
  data,
  servico = SERVICO_PADRAO,
} = {}) {
  try {
    if (!UUID.test(workspaceId ?? '') || !UUID.test(categoriaId ?? '') || !UUID.test(transacaoId ?? '')) {
      return { registrada: false, motivo: 'dados_incompletos' };
    }
    if (!TIPOS_COM_MEMORIA.has(tipo)) return { registrada: false, motivo: 'tipo_sem_memoria' };
    if (!descricaoMemorizavel(descricao)) return { registrada: false, motivo: 'descricao_generica' };
    const chave = await chaveDaDescricao(descricao, tipo);

    const sessao = { workspace: { id: workspaceId } };
    const existente = await servico.buscar(sessao, TIPO_MEMORIA_DE_CATEGORIA, chave);
    if (existente.error) return { registrada: false, motivo: 'leitura' };

    const valor = memoriaDepoisDaConfirmacao(existente.data?.memory_value, {
      descricao, categoriaId, tipo, trocou, transacaoId, data,
    });
    if (!valor) return { registrada: false, motivo: 'ja_contada' };

    if (existente.data) {
      const corrigida = await servico.corrigir(sessao, existente.data.id, valor);
      return corrigida.error ? { registrada: false, motivo: 'gravacao' } : { registrada: true, valor };
    }
    const criada = await servico.criar(sessao, {
      type: TIPO_MEMORIA_DE_CATEGORIA,
      key: chave,
      value: valor,
      source: trocou ? 'user_correction' : 'explicit_user',
    }, { userInitiated: true });
    if (!criada.error) return { registrada: true, valor };

    // Outra confirmação da mesma descrição criou a memória no meio do caminho
    // (o índice único recusa a segunda): soma nela, uma vez.
    const nova = await servico.buscar(sessao, TIPO_MEMORIA_DE_CATEGORIA, chave);
    if (nova.error || !nova.data) return { registrada: false, motivo: 'gravacao' };
    const valorNovo = memoriaDepoisDaConfirmacao(nova.data.memory_value, {
      descricao, categoriaId, tipo, trocou, transacaoId, data,
    });
    if (!valorNovo) return { registrada: false, motivo: 'ja_contada' };
    const corrigida = await servico.corrigir(sessao, nova.data.id, valorNovo);
    return corrigida.error ? { registrada: false, motivo: 'gravacao' } : { registrada: true, valor: valorNovo };
  } catch {
    return { registrada: false, motivo: 'erro' };
  }
}

// Lançamento direto (#81): conta como mais uma vez da descrição, sem somar
// confirmação (ninguém conferiu o card). O evento marcado automatico dá a
// taxa de Desfazer.
export function memoriaDepoisDoLancamentoDireto(atual, { transacaoId, data }) {
  if (!atual || typeof atual !== 'object' || Array.isArray(atual)) return null;
  if (atual.ultima_transacao_id === transacaoId) return null;
  const total = inteiroNaoNegativo(atual.total) + 1;
  const eventos = Array.isArray(atual.eventos) ? atual.eventos : [];
  return {
    ...atual,
    total,
    ultima_transacao_id: transacaoId,
    eventos: [...eventos, { n: total, data, trocou: false, automatico: true }].slice(-MAX_EVENTOS_DA_MEMORIA),
  };
}

// Desfazer um lançamento direto zera a contagem: a próxima vez volta ao card.
// null quando a memória já mudou depois daquele lançamento.
export function memoriaDepoisDoDesfazer(atual, { transacaoId }) {
  if (!atual || typeof atual !== 'object' || Array.isArray(atual)) return null;
  if (atual.ultima_transacao_id !== transacaoId) return null;
  const eventos = Array.isArray(atual.eventos) ? [...atual.eventos] : [];
  const ultimo = eventos.at(-1);
  if (ultimo?.automatico) eventos[eventos.length - 1] = { ...ultimo, desfeito: true };
  return {
    ...atual,
    confirmacoes: 0,
    desfeitos: inteiroNaoNegativo(atual.desfeitos) + 1,
    eventos,
  };
}

// A memória ativa da descrição, ou null. Nunca lança.
export async function lerMemoriaDaDescricao({ workspaceId, descricao, tipo, servico = SERVICO_PADRAO } = {}) {
  try {
    if (!UUID.test(workspaceId ?? '')) return null;
    const chave = await chaveDaDescricao(descricao, tipo);
    if (!chave) return null;
    const { data, error } = await servico.buscar({ workspace: { id: workspaceId } }, TIPO_MEMORIA_DE_CATEGORIA, chave);
    if (error || !data?.id) return null;
    return { id: data.id, valor: data.memory_value ?? null };
  } catch {
    return null;
  }
}

async function atualizarMemoriaExistente({ workspaceId, descricao, tipo, servico, transformar }) {
  try {
    const memoria = await lerMemoriaDaDescricao({ workspaceId, descricao, tipo, servico });
    if (!memoria) return { registrada: false, motivo: 'sem_memoria' };
    const valor = transformar(memoria.valor);
    if (!valor) return { registrada: false, motivo: 'ja_contada' };
    const gravada = await servico.corrigir({ workspace: { id: workspaceId } }, memoria.id, valor);
    if (gravada.error) return { registrada: false, motivo: 'gravacao' };
    return { registrada: true, valor };
  } catch {
    return { registrada: false, motivo: 'erro' };
  }
}

export function registrarLancamentoDiretoNaMemoria({ workspaceId, descricao, tipo, transacaoId, data, servico = SERVICO_PADRAO } = {}) {
  return atualizarMemoriaExistente({
    workspaceId,
    descricao,
    tipo,
    servico,
    transformar: (valor) => memoriaDepoisDoLancamentoDireto(valor, { transacaoId, data }),
  });
}

export function registrarDesfazerNaMemoria({ workspaceId, descricao, tipo, transacaoId, servico = SERVICO_PADRAO } = {}) {
  return atualizarMemoriaExistente({
    workspaceId,
    descricao,
    tipo,
    servico,
    transformar: (valor) => memoriaDepoisDoDesfazer(valor, { transacaoId }),
  });
}
