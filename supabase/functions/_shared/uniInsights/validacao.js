// Confere o que o modelo escreveu antes de a Leitura do mês chegar à tela
// (#122). Leitura com valor em reais ou porcentagem que não estava na entrada
// é descartada inteira: número inventado na tela inicial é pior que uma
// leitura a menos.

import { MAX_DETALHE, MAX_LEITURAS, MAX_TITULO, TIPOS } from './contrato.js';

const REAIS = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/g;
const PORCENTAGEM = /\d+(?:,\d+)?\s?%/g;

function normalizarReais(escrito) {
  return escrito.replace(/^R\$\s?/, 'R$ ');
}

/** Valores citados num texto, escritos como em montarMensagem. */
export function extrairValores(texto) {
  const reais = [...texto.matchAll(REAIS)].map(([escrito]) => normalizarReais(escrito));
  const porcentagens = [...texto.matchAll(PORCENTAGEM)].map(([escrito]) => escrito.replace(/\s/g, ''));
  return [...reais, ...porcentagens];
}

function limpar(valor) {
  if (typeof valor !== 'string') return '';
  // eslint-disable-next-line no-control-regex -- texto do modelo vai direto para a tela
  return valor.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Lê a resposta do modelo (já como objeto) e devolve só as leituras que
 * passam: tipo conhecido, texto dentro do tamanho, categoria da lista e
 * nenhum valor fora de `permitidos`. Uma categoria aparece uma vez só.
 */
export function validarLeituras(resposta, { permitidos, idsDeCategorias }) {
  const lista = Array.isArray(resposta?.leituras) ? resposta.leituras : [];
  const usadas = new Set();
  const descartes = [];
  const leituras = [];

  for (const item of lista) {
    if (leituras.length >= MAX_LEITURAS) break;
    const titulo = limpar(item?.titulo);
    const detalhe = limpar(item?.detalhe);
    const tipo = TIPOS.includes(item?.tipo) ? item.tipo : null;
    const categoriaId = typeof item?.categoriaId === 'string' && item.categoriaId ? item.categoriaId : null;

    let motivo = null;
    if (!tipo) motivo = 'tipo';
    else if (titulo.length < 8 || titulo.length > MAX_TITULO || detalhe.length > MAX_DETALHE) motivo = 'tamanho';
    else if (categoriaId && !idsDeCategorias.has(categoriaId)) motivo = 'categoria';
    else if (categoriaId && usadas.has(categoriaId)) motivo = 'repetida';
    else if (extrairValores(`${titulo} ${detalhe}`).some((valor) => !permitidos.has(valor))) motivo = 'valor';

    if (motivo) {
      descartes.push(motivo);
      continue;
    }
    if (categoriaId) usadas.add(categoriaId);
    leituras.push({ tipo, categoriaId, titulo, detalhe });
  }

  return { leituras, descartes };
}
