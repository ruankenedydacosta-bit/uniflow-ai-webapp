/* global process */
// Mede o uni-interpret com um modelo de verdade contra o conjunto de
// avaliação (épico #104, F1), com a mesma régua das regras atuais
// (avaliar-regras-atuais.js). Cada frase custa uma chamada ao provedor.
//
// Uso:
//   npm run uni:eval:modelo -- --provedor anthropic --modelo claude-haiku-5-5
//   npm run uni:eval:modelo -- --provedor openai --modelo gpt-5.4-mini
// Opções: --conjunto ajuste|reservado|todos (padrão todos; o reservado só
//   serve para medir no fim, nunca para ajustar o prompt), --erros (só casos
//   com erro), --temperatura padrao (OpenAI: omite o
//   parâmetro, exigido pela família gpt-5.6), --limiar 0.7 (confiança mínima para a
//   categoria contar como resolvida), --preco-entrada/--preco-saida (US$ por
//   milhão de tokens, para estimar custo por frase).
// Chaves: ANTHROPIC_API_KEY (ou perfil do `ant auth login`) e OPENAI_API_KEY,
//   no ambiente ou em .env.eval.local (fora do git).

import Anthropic from '@anthropic-ai/sdk';

import { validarInterpretacao } from '../../supabase/functions/_shared/uniInterpret/contrato.js';
import { INSTRUCOES, montarMensagemUsuario } from '../../supabase/functions/_shared/uniInterpret/prompt.js';
import { interpretarComAnthropic, interpretarComOpenAi } from '../../supabase/functions/_shared/uniInterpret/provedores.js';
import { catalogoDoWorkspace } from '../../src/features/uni-interpret/evalCatalog.js';
import { CASOS, DATA_REFERENCIA } from '../../src/features/uni-interpret/evalCases.js';
import { avaliarCaso, normalizarInterpretacao, resumirAvaliacao } from '../../src/features/uni-interpret/evalScoring.js';

const TEMPO_LIMITE_MS = 20_000;

function argumento(nome, padrao = null) {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : padrao;
}

const provedor = argumento('provedor');
const modelo = argumento('modelo');
const limiarConfianca = Number(argumento('limiar', '0.7'));
const precoEntrada = Number(argumento('preco-entrada', 'NaN'));
const precoSaida = Number(argumento('preco-saida', 'NaN'));
const soErros = process.argv.includes('--erros');
const CONJUNTOS = ['ajuste', 'reservado', 'todos'];
const conjunto = argumento('conjunto', 'todos');
const temperaturaArgumento = argumento('temperatura', '0');
const temperatura = temperaturaArgumento === 'padrao' ? null : Number(temperaturaArgumento);

if (!['anthropic', 'openai'].includes(provedor) || !modelo) {
  console.error('Informe --provedor anthropic|openai e --modelo <id>.');
  process.exit(1);
}
if (!CONJUNTOS.includes(conjunto)) {
  console.error('Informe --conjunto ajuste|reservado|todos.');
  process.exit(1);
}
if (provedor === 'openai' && !process.env.OPENAI_API_KEY) {
  console.error('Falta OPENAI_API_KEY (ambiente ou .env.eval.local).');
  process.exit(1);
}

const clienteAnthropic = provedor === 'anthropic' ? new Anthropic() : null;

async function chamar(mensagem) {
  const sinal = AbortSignal.timeout(TEMPO_LIMITE_MS);
  if (provedor === 'anthropic') {
    return interpretarComAnthropic({ cliente: clienteAnthropic, modelo, instrucoes: INSTRUCOES, mensagem, sinal });
  }
  return interpretarComOpenAi({ chave: process.env.OPENAI_API_KEY, modelo, instrucoes: INSTRUCOES, mensagem, sinal, temperatura });
}

function marca(veredito) {
  if (veredito === null) return '·';
  return veredito ? 'ok' : 'XX';
}

function percentil(valores, p) {
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1)];
}

const vereditos = [];
const latencias = [];
const falhas = [];
let tokensEntrada = 0;
let tokensSaida = 0;

const casosDoConjunto = CASOS.filter((caso) => (
  conjunto === 'todos' || (conjunto === 'reservado') === Boolean(caso.reservado)
));

for (const caso of casosDoConjunto) {
  const workspaceType = caso.workspace ?? 'personal';
  const categorias = catalogoDoWorkspace(workspaceType);
  const mensagem = montarMensagemUsuario({
    frase: caso.frase,
    dataReferencia: DATA_REFERENCIA,
    workspaceType,
    categorias,
  });

  const inicio = performance.now();
  const chamada = await chamar(mensagem);
  const duracao = Math.round(performance.now() - inicio);

  if (!chamada.ok) {
    falhas.push({ caso: caso.id, motivo: chamada.motivo, status: chamada.status, codigo: chamada.codigo });
    if (chamada.motivo === 'chave_invalida' || chamada.motivo === 'sem_cota') {
      console.error(`Parando: ${chamada.motivo}.`);
      process.exit(1);
    }
  } else {
    latencias.push(duracao);
    tokensEntrada += chamada.uso.entrada;
    tokensSaida += chamada.uso.saida;
  }

  const validada = chamada.ok
    ? validarInterpretacao(chamada.bruta, { categorias, dataReferencia: DATA_REFERENCIA })
    : { intent: 'nao_entendi', operacoes: [], resposta: '' };
  const resultado = normalizarInterpretacao(validada, { limiarConfianca });
  const veredito = avaliarCaso(caso, resultado);
  vereditos.push(veredito);

  const errou = Object.values(veredito).some((valor) => valor === false);
  if (soErros && !errou) continue;

  const operacao = validada.operacoes[0];
  const esperado = caso.esperado.categoria === undefined ? '' : ` | esperado: ${caso.esperado.categoria ?? '(perguntar)'}`;
  console.log(
    `${marca(veredito.intent).padEnd(2)} ${marca(veredito.valor).padEnd(2)} ${marca(veredito.data).padEnd(2)} ${marca(veredito.categoria).padEnd(2)} ${marca(veredito.modalidade).padEnd(2)} ${marca(veredito.titulo).padEnd(2)} ${marca(veredito.consulta).padEnd(2)} ${marca(veredito.pedido).padEnd(2)}  ${caso.id}  ${duracao}ms${chamada.ok ? '' : ` FALHA ${chamada.motivo}`}`,
  );
  console.log(
    `      ${resultado.intent} | ${resultado.valor ?? '-'} | ${resultado.data ?? '-'} | ${resultado.categoria ?? '-'} (${resultado.modoCategoria}${operacao ? ` ${operacao.confianca}` : ''})${esperado} | "${operacao?.descricao ?? ''}"${resultado.parcelas ? ` | ${resultado.parcelas}x` : ''}${resultado.recorrente ? ' | recorrente' : ''}${resultado.titulo ? ` | título: "${resultado.titulo}"` : ''}`,
  );
  if (resultado.pedido?.acao === 'excluir_lancamento') {
    const { alvo, data, valor, conta, ultimo, lote } = resultado.pedido;
    console.log(`      exclusao | alvo: ${alvo ?? '-'} | ${data ?? '-'} | ${valor ?? '-'} | ${conta ?? '-'}${ultimo ? ' | último' : ''}${lote ? ' | lote' : ''}`);
  } else if (resultado.pedido) {
    const { acao, nome, alvo } = resultado.pedido;
    console.log(`      ${resultado.intent} ${acao} | alvo: ${alvo ?? '-'} | nome: ${nome ?? '-'}`);
  }
  if (resultado.consulta) {
    const { tipo, inicio, fim, categoria, termo } = resultado.consulta;
    console.log(`      consulta ${tipo} | ${inicio ?? '-'}..${fim ?? '-'} | ${categoria ?? '-'} | ${termo ?? '-'}`);
  }
}

const chamadasOk = latencias.length;
console.log(`\n${provedor} ${modelo} — conjunto ${conjunto} (${casosDoConjunto.length} casos), limiar de confiança ${limiarConfianca}${temperatura === null ? ', temperatura padrão' : ''}`);
console.log('acertos por campo');
for (const [campo, { acertos, total }] of Object.entries(resumirAvaliacao(vereditos))) {
  const pct = total ? Math.round((acertos / total) * 100) : 0;
  console.log(`  ${campo.padEnd(10)} ${String(acertos).padStart(3)}/${total}  ${pct}%`);
}
if (chamadasOk > 0) {
  console.log(`latência  p50 ${percentil(latencias, 50)}ms  p95 ${percentil(latencias, 95)}ms`);
  const mediaEntrada = Math.round(tokensEntrada / chamadasOk);
  const mediaSaida = Math.round(tokensSaida / chamadasOk);
  console.log(`tokens por frase  entrada ${mediaEntrada}  saída ${mediaSaida}`);
  if (Number.isFinite(precoEntrada) && Number.isFinite(precoSaida)) {
    const custo = (mediaEntrada * precoEntrada + mediaSaida * precoSaida) / 1_000_000;
    console.log(`custo por frase  US$ ${custo.toFixed(5)}  (US$ ${(custo * 1000).toFixed(2)} por mil frases)`);
  }
}
if (falhas.length > 0) {
  console.log(`falhas: ${falhas.map((falhaItem) => `${falhaItem.caso} (${falhaItem.motivo}${falhaItem.status ? ` ${falhaItem.status}` : ''}${falhaItem.codigo ? ` ${falhaItem.codigo}` : ''})`).join(', ')}`);
}
