import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAssinaturaCache } from './assinaturaCache.js';

function buscaControlada() {
  const chamadas = [];
  const buscar = (args) => new Promise((resolve) => { chamadas.push({ args, resolve }); });
  return { buscar, chamadas };
}

const ATIVA = { exists: true, internal_status: 'active' };
const CANCELADA = { exists: true, internal_status: 'canceled' };

test('sem valor guardado, ler devolve vazio', () => {
  const cache = createAssinaturaCache({ buscar: async () => ({ data: ATIVA, error: null }) });
  assert.deepEqual(cache.ler('ws-1'), { temDado: false, assinatura: null, erro: null, carregando: false });
});

test('atualizar busca só o status do banco (localOnly) e guarda o resultado', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  const promessa = cache.atualizar('ws-1');
  assert.deepEqual(chamadas[0].args, { workspaceId: 'ws-1', localOnly: true });
  assert.equal(cache.ler('ws-1').carregando, true);
  chamadas[0].resolve({ data: ATIVA, error: null });
  await promessa;
  assert.deepEqual(cache.ler('ws-1'), { temDado: true, assinatura: ATIVA, erro: null, carregando: false });
});

test('valor guardado continua na tela enquanto revalida', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  cache.guardar('ws-1', ATIVA);
  cache.atualizar('ws-1');
  assert.equal(cache.ler('ws-1').assinatura, ATIVA);
  assert.equal(cache.ler('ws-1').temDado, true);
  chamadas[0].resolve({ data: CANCELADA, error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(cache.ler('ws-1').assinatura, CANCELADA);
});

test('falha na revalidação não apaga o valor guardado', async () => {
  const cache = createAssinaturaCache({ buscar: async () => ({ data: null, error: { code: 'NETWORK' } }) });
  cache.guardar('ws-1', ATIVA);
  await cache.atualizar('ws-1');
  assert.equal(cache.ler('ws-1').assinatura, ATIVA);
  assert.equal(cache.ler('ws-1').temDado, true);
});

test('resposta de busca antiga não sobrescreve a mais recente', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  const antiga = cache.atualizar('ws-1');
  const nova = cache.atualizar('ws-1');
  chamadas[1].resolve({ data: CANCELADA, error: null });
  await nova;
  chamadas[0].resolve({ data: ATIVA, error: null });
  await antiga;
  assert.equal(cache.ler('ws-1').assinatura, CANCELADA);
});

test('guardar invalida busca em andamento iniciada antes', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  const antiga = cache.atualizar('ws-1');
  cache.guardar('ws-1', CANCELADA);
  chamadas[0].resolve({ data: ATIVA, error: null });
  await antiga;
  assert.equal(cache.ler('ws-1').assinatura, CANCELADA);
  assert.equal(cache.ler('ws-1').carregando, false);
});

test('workspaces não se misturam', () => {
  const cache = createAssinaturaCache({ buscar: async () => ({ data: null, error: null }) });
  cache.guardar('ws-1', ATIVA);
  assert.equal(cache.ler('ws-2').temDado, false);
});

test('limpar apaga tudo e descarta a busca em andamento', async () => {
  const { buscar, chamadas } = buscaControlada();
  const cache = createAssinaturaCache({ buscar });
  cache.guardar('ws-1', ATIVA);
  const emAndamento = cache.atualizar('ws-1');
  cache.limpar();
  chamadas[0].resolve({ data: ATIVA, error: null });
  await emAndamento;
  assert.equal(cache.ler('ws-1').temDado, false);
});

test('ouvintes são avisados a cada mudança e podem sair', () => {
  const cache = createAssinaturaCache({ buscar: async () => ({ data: null, error: null }) });
  let avisos = 0;
  const sair = cache.ouvir(() => { avisos += 1; });
  cache.guardar('ws-1', ATIVA);
  assert.equal(avisos, 1);
  sair();
  cache.guardar('ws-1', CANCELADA);
  assert.equal(avisos, 1);
});

test('sem workspace, nada é buscado nem guardado', async () => {
  let chamou = false;
  const cache = createAssinaturaCache({ buscar: async () => { chamou = true; return { data: ATIVA, error: null }; } });
  assert.equal(await cache.atualizar(null), null);
  cache.guardar(undefined, ATIVA);
  assert.equal(chamou, false);
});

test('o logout limpa a assinatura guardada', () => {
  const session = readFileSync(new URL('../app/SessionContext.jsx', import.meta.url), 'utf8');
  assert.match(session, /import \{ limparAssinaturas \} from '\.\.\/services\/assinaturaCache\.js';/);
  assert.match(session, /limparAssinaturas\(\);\s*\n\s*const result = await signOutService\(\);/);
});

test('o guarda de acesso abastece o cache com a resposta que já buscou', () => {
  const guard = readFileSync(new URL('../features/personal-plan/usePersonalPlanAccessGuard.js', import.meta.url), 'utf8');
  const guardadas = guard.match(/if \(!error\) guardarAssinatura\(workspaceId, data\);/g) ?? [];
  assert.equal(guardadas.length, 2);
});

test('o hook só mostra carregando quando ainda não há valor guardado', () => {
  const hook = readFileSync(new URL('../features/simplified-app/useAssinatura.js', import.meta.url), 'utf8');
  assert.match(hook, /carregando: Boolean\(workspaceId\) && !estado\.temDado && \(estado\.carregando \|\| !estado\.erro\)/);
  assert.match(hook, /erro: estado\.temDado \? null : estado\.erro/);
});
