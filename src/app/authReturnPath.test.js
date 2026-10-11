import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeAuthReturnPath,
  getSafeAuthReturnPath,
  readAuthReturnPath,
  saveAuthReturnPath,
} from './authReturnPath.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('preserva rota simplificada válida e query string', () => {
  assert.equal(getSafeAuthReturnPath('/app/registros?periodo=mes'), '/app/registros?periodo=mes');
});

// REGRESSÃO (redirecionamento pós-login abrindo o shell legado): o destino
// padrão sem `from`/rota inválida é a Home simplificada, nunca '/dashboard'.
test('usa a Home simplificada (nunca o dashboard legado) sem destino ou para rota inválida', () => {
  assert.equal(getSafeAuthReturnPath(), '/app/home');
  assert.equal(getSafeAuthReturnPath('/rota-inexistente'), '/app/home');
});

// MVP FECHAMENTO: um return path antigo (salvo antes do fechamento do MVP,
// ou de um usuário com um deep link legado guardado) nunca pode contornar
// o novo fluxo -- nenhuma rota de navigationItems (dashboard, financeiro,
// crm, clientes, projetos, agenda, relatórios, configurações) é mais aceita
// como destino seguro, mesmo estando registrada em routes.jsx/appRoutes.
test('return path legado (ex.: /dashboard, /financeiro, /crm) nunca é aceito como destino -- sempre cai na Home simplificada', () => {
  for (const legacyPath of ['/dashboard', '/financeiro', '/crm', '/clientes', '/projetos', '/agenda', '/relatorios', '/configuracoes', '/uni-ai', '/objetivos', '/metas', '/categorias', '/open-finance', '/futuro', '/suporte']) {
    assert.equal(getSafeAuthReturnPath(legacyPath), '/app/home');
    assert.equal(getSafeAuthReturnPath(`${legacyPath}?from=old-session`), '/app/home');
  }
});

test('bloqueia redirects externos e URLs protocol-relative', () => {
  assert.equal(getSafeAuthReturnPath('https://evil.example/financeiro'), '/app/home');
  assert.equal(getSafeAuthReturnPath('//evil.example/financeiro'), '/app/home');
});

test('preserva rotas simplificadas válidas (Home, Registros, Conta e subpáginas de Conta)', () => {
  assert.equal(getSafeAuthReturnPath('/app/registros'), '/app/registros');
  assert.equal(getSafeAuthReturnPath('/app/conta'), '/app/conta');
  assert.equal(getSafeAuthReturnPath('/app/conta/seguranca'), '/app/conta/seguranca');
});

test('salva, lê e consome destino OAuth em storage efêmero', () => {
  const storage = createStorage();
  saveAuthReturnPath('/app/registros?origem=login', storage);
  assert.equal(readAuthReturnPath(storage), '/app/registros?origem=login');
  assert.equal(consumeAuthReturnPath(storage), '/app/registros?origem=login');
  assert.equal(readAuthReturnPath(storage), '/app/home');
});
