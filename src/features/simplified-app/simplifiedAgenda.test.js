import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  resolveSimplifiedFeatureFlags,
  SIMPLIFIED_FEATURE_FLAG_KEYS,
} from './simplifiedFeatureFlags.js';
import {
  resolveSimplifiedNavigation,
  SIMPLIFIED_NAVIGATION,
  SIMPLIFIED_ROUTES,
} from './simplifiedRoutes.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Agenda simplificada nasce desligada e mantém a navegação atual intacta', () => {
  const flags = resolveSimplifiedFeatureFlags({});
  assert.equal(flags.agendaEnabled, false);
  assert.deepEqual(SIMPLIFIED_NAVIGATION.map(({ label }) => label), ['Home', 'Registros', 'Conta']);
  assert.equal(SIMPLIFIED_FEATURE_FLAG_KEYS.AGENDA, 'VITE_SIMPLIFIED_AGENDA_ENABLED');
});

test('somente o valor literal true habilita a Agenda', () => {
  assert.equal(resolveSimplifiedFeatureFlags({ VITE_SIMPLIFIED_AGENDA_ENABLED: 'false' }).agendaEnabled, false);
  assert.equal(resolveSimplifiedFeatureFlags({ VITE_SIMPLIFIED_AGENDA_ENABLED: 'TRUE' }).agendaEnabled, false);
  assert.equal(resolveSimplifiedFeatureFlags({ VITE_SIMPLIFIED_AGENDA_ENABLED: 'true' }).agendaEnabled, true);
});

test('flag ligada insere Agenda sem remover as rotas existentes', () => {
  const navigation = resolveSimplifiedNavigation({ agendaEnabled: true });
  assert.deepEqual(navigation.map(({ label, path }) => ({ label, path })), [
    { label: 'Home', path: '/app/home' },
    { label: 'Registros', path: '/app/registros' },
    { label: 'Agenda', path: '/app/agenda' },
    { label: 'Conta', path: '/app/conta' },
  ]);
  assert.equal(Object.isFrozen(navigation), true);
  assert.equal(SIMPLIFIED_ROUTES.AGENDA, '/app/agenda');
});

test('rota condicional carrega a Agenda existente sem reconstruir CRUD ou dados', async () => {
  const [routes, wrapper, agenda] = await Promise.all([
    source('../../app/routes.jsx'),
    source('./SimplifiedAgendaPage.jsx'),
    source('../../pages/AgendaPage.jsx'),
  ]);

  assert.match(routes, /SIMPLIFIED_FEATURE_FLAGS\.agendaEnabled/);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.AGENDA/);
  assert.match(wrapper, /<AgendaPage \/>/);
  assert.match(agenda, /useAgenda\(\{/);
  assert.match(agenda, /Carregando agenda/);
  assert.match(agenda, /Não foi possível carregar a agenda/);
  assert.match(agenda, /AgendaFormModal/);
  assert.match(agenda, /AgendaDeleteConfirmModal/);
  assert.match(agenda, /AgendaStatusConfirmModal/);
});

test('navegação com quatro itens e wrapper preservam responsividade e safe areas', async () => {
  const [navigation, css] = await Promise.all([
    source('./SimplifiedBottomNavigation.jsx'),
    source('./simplifiedApp.module.css'),
  ]);

  assert.match(navigation, /CalendarIcon/);
  assert.match(navigation, /--simplified-navigation-count/);
  assert.match(css, /repeat\(var\(--simplified-navigation-count, 3\), minmax\(0, 1fr\)\)/);
  assert.match(css, /\.agendaPage[\s\S]*env\(safe-area-inset-left\)/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.agendaPage/);
});
