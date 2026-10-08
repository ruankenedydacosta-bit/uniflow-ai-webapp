// Confere o que o modelo escreveu antes de a Leitura do mês chegar à tela
// (#122). Leitura com valor em reais ou porcentagem que não estava na entrada
// é descartada inteira: número inventado na tela inicial é pior que uma
// leitura a menos.

import { MAX_DETALHE, MAX_LEITURAS, MAX_TITULO, TIPOS } from './contrato.js';

const REAIS = /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/g;
const PORCENTAGEM = /\d+(?:,\d+)?\s?%/g;

// Número que não vem como "R$ 1.234,56" nem como "86%": "812 reais",
// "812,00" solto ou um inteiro grande demais para ser dia do mês ou contagem
// de categorias ("dia 8 de 31", "3 de 4 categorias" continuam valendo).
const MAIOR_CONTAGEM = 60;
function temNumeroSolto(texto, nomesDeCategorias = []) {
  if (/\breais\b/i.test(texto)) return true;
  // Nome de categoria pode ter número ("Carro 2020") e não é valor.
  const semNomes = nomesDeCategorias.reduce((atual, nome) => atual.split(nome).join(' '), texto);
  const semValores = semNomes.replace(REAIS, ' ').replace(PORCENTAGEM, ' ');
  if (/\d,\d/.test(semValores)) return true;
  return [...semValores.matchAll(/\d[\d.]*/g)]
    .some(([numero]) => Number(numero.replace(/\./g, '')) > MAIOR_CONTAGEM);
}

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
export function validarLeituras(resposta, { permitidos, idsDeCategorias, nomesDeCategorias = [] }) {
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
    else if (temNumeroSolto(`${titulo} ${detalhe}`, nomesDeCategorias)) motivo = 'valor';

    if (motivo) {
      descartes.push(motivo);
      continue;
    }
    if (categoriaId) usadas.add(categoriaId);
    leituras.push({ tipo, categoriaId, titulo, detalhe });
  }

  return { leituras, descartes };
}
