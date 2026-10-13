import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAssinaturaCache, resumirAssinatura } from './assinaturaCache.js';

function buscaControlada() {
  const chamadas = [];
  const buscar = (args) => new Promise((resolve) => { chamadas.push({ args, resolve }); });
  return { buscar, chamadas };
}

const ATIVA = { exists: true, internal_status: 'active' };
const CANCELADA = { exists: true, internal_status: 'canceled' };
const OK = (data) => ({ data, error: null });
const FALHA = { data: null, error: { code: 'NETWORK' } };

async function cacheCom(assinatura) {
  const cache = createAssinaturaCache({ buscar: async () => OK(assinatura) });
  await cache.atualizar('ws-1');
  return cache;
}

test('sem valor guardado, ler devolve vazio', () => {
  const cache = createAssinaturaCache({ buscar: async () => OK(ATIVA) });
  assert.deepEqual(cache.ler('ws-1'), { temDado: false, assinatura: null, erro: null, carregando: false });
});

test('atualizar busca só o status do banco (localOnly) e guarda o resultado', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  const promessa = cache.atualizar('ws-1');
  assert.deepEqual(chamadas[0].args, { workspaceId: 'ws-1', localOnly: true });
  assert.equal(cache.ler('ws-1').carregando, true);
  chamadas[0].resolve(OK(ATIVA));
  assert.deepEqual(await promessa, OK(ATIVA));
  assert.deepEqual(cache.ler('ws-1'), { temDado: true, assinatura: ATIVA, erro: null, carregando: false });
});

test('valor guardado continua na tela enquanto revalida', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  const primeira = cache.atualizar('ws-1');
  chamadas[0].resolve(OK(ATIVA));
  await primeira;
  const segunda = cache.atualizar('ws-1');
  assert.equal(cache.ler('ws-1').temDado, true);
  assert.equal(cache.ler('ws-1').assinatura, ATIVA);
  chamadas[1].resolve(OK(CANCELADA));
  await segunda;
  assert.equal(cache.ler('ws-1').assinatura, CANCELADA);
});

test('falha na revalidação não apaga o valor guardado', async () => {
  let resposta = OK(ATIVA);
  const cache = createAssinaturaCache({ buscar: async () => resposta });
  await cache.atualizar('ws-1');
  resposta = FALHA;
  await cache.atualizar('ws-1');
  assert.equal(cache.ler('ws-1').assinatura, ATIVA);
  assert.equal(cache.ler('ws-1').temDado, true);
  assert.equal(cache.ler('ws-1').carregando, false);
});

test('busca que lança vira erro e não deixa a entrada presa em carregando', async () => {
  const cache = createAssinaturaCache({ buscar: () => { throw new Error('auth'); } });
  const resultado = await cache.atualizar('ws-1');
  assert.equal(resultado.error.code, 'NETWORK');
  assert.equal(cache.ler('ws-1').carregando, false);
  assert.equal(cache.ler('ws-1').erro.code, 'NETWORK');
});

test('sem opções, reaproveita a busca em andamento', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  const primeira = cache.atualizar('ws-1');
  const segunda = cache.atualizar('ws-1');
  assert.equal(chamadas.length, 1);
  assert.equal(primeira, segunda);
  chamadas[0].resolve(OK(ATIVA));
  await primeira;
});

test('forcar faz busca nova, e a resposta antiga não sobrescreve a mais recente', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  const antiga = cache.atualizar('ws-1');
  const nova = cache.atualizar('ws-1', { forcar: true });
  assert.equal(chamadas.length, 2);
  chamadas[1].resolve(OK(CANCELADA));
  await nova;
  chamadas[0].resolve(OK(ATIVA));
  // Quem chamou recebe a própria resposta; o cache fica com a mais recente.
  assert.deepEqual(await antiga, OK(ATIVA));
  assert.equal(cache.ler('ws-1').assinatura, CANCELADA);
});

test('descartar apaga o valor guardado: a tela volta a carregar e mostra o erro se falhar', async () => {
  let resposta = OK(ATIVA);
  const cache = createAssinaturaCache({ buscar: async () => resposta });
  await cache.atualizar('ws-1');
  resposta = FALHA;
  const promessa = cache.atualizar('ws-1', { descartar: true });
  assert.equal(resumirAssinatura(cache.ler('ws-1'), 'ws-1').carregando, true);
  assert.equal(cache.ler('ws-1').assinatura, null);
  await promessa;
  const resumo = resumirAssinatura(cache.ler('ws-1'), 'ws-1');
  assert.equal(resumo.carregando, false);
  assert.equal(resumo.erro.code, 'NETWORK');
  assert.equal(resumo.assinatura, null);
});

test('workspaces não se misturam', async () => {
  const cache = await cacheCom(ATIVA);
  assert.equal(cache.ler('ws-2').temDado, false);
});

test('limpar apaga tudo e descarta a busca em andamento', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  const emAndamento = cache.atualizar('ws-1');
  cache.limpar();
  chamadas[0].resolve(OK(ATIVA));
  await emAndamento;
  assert.equal(cache.ler('ws-1').temDado, false);
});

test('ouvintes são avisados a cada mudança e podem sair', async () => {
  const cache = createAssinaturaCache({ buscar: async () => OK(ATIVA) });
  let avisos = 0;
  const sair = cache.ouvir(() => { avisos += 1; });
  await cache.atualizar('ws-1');
  assert.equal(avisos, 2);
  sair();
  await cache.atualizar('ws-1');
  assert.equal(avisos, 2);
});

test('sem workspace, nada é buscado', async () => {
  let chamou = false;
  const cache = createAssinaturaCache({ buscar: async () => { chamou = true; return OK(ATIVA); } });
  assert.equal(await cache.atualizar(null), null);
  assert.equal(chamou, false);
});

test('resumo: sem valor guardado conta como carregando, inclusive antes da primeira busca', () => {
  const vazia = { temDado: false, assinatura: null, erro: null, carregando: false };
  assert.deepEqual(resumirAssinatura(vazia, 'ws-1'), { assinatura: null, carregando: true, erro: null });
});

test('resumo: sem workspace não fica carregando para sempre', () => {
  const vazia = { temDado: false, assinatura: null, erro: null, carregando: false };
  assert.equal(resumirAssinatura(vazia, undefined).carregando, false);
});

test('resumo: com valor guardado, revalidar não mostra carregando nem erro', () => {
  const revalidando = { temDado: true, assinatura: ATIVA, erro: null, carregando: true };
  assert.deepEqual(resumirAssinatura(revalidando, 'ws-1'), { assinatura: ATIVA, carregando: false, erro: null });
  const falhou = { temDado: true, assinatura: ATIVA, erro: { code: 'NETWORK' }, carregando: false };
  assert.deepEqual(resumirAssinatura(falhou, 'ws-1'), { assinatura: ATIVA, carregando: false, erro: null });
});

test('resumo: sem valor guardado e com erro, mostra o erro', () => {
  const falhou = { temDado: false, assinatura: null, erro: { code: 'NETWORK' }, carregando: false };
  assert.deepEqual(resumirAssinatura(falhou, 'ws-1'), { assinatura: null, carregando: false, erro: { code: 'NETWORK' } });
});

test('a sessão encerrada ou trocada de usuário limpa a assinatura guardada', () => {
  const session = readFileSync(new URL('../app/SessionContext.jsx', import.meta.url), 'utf8');
  assert.match(session, /import \{ limparAssinaturas \} from '\.\.\/services\/assinaturaCache\.js';/);
  assert.match(session, /if \(!nextSession\?\.user\) \{\s*\n\s*latestUserIdRef\.current = null;[\s\S]{0,400}limparAssinaturas\(\);/);
  assert.match(session, /latestUserIdRef\.current !== nextSession\.user\.id\) \{\s*\n\s*limparAssinaturas\(\);/);
});
