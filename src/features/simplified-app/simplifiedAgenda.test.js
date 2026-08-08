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

test('navegação é fixa em Home | Registros | Conta independente de flags', () => {
  const flags = resolveSimplifiedFeatureFlags({});
  assert.equal(flags.agendaEnabled, false);
  assert.deepEqual(SIMPLIFIED_NAVIGATION.map(({ label }) => label), ['Home', 'Registros', 'Conta']);
  assert.deepEqual(
    resolveSimplifiedNavigation().map(({ label, path }) => ({ label, path })),
    [
      { label: 'Home', path: '/app/home' },
      { label: 'Registros', path: '/app/registros' },
      { label: 'Conta', path: '/app/conta' },
    ],
  );
  assert.equal(SIMPLIFIED_FEATURE_FLAG_KEYS.AGENDA, 'VITE_SIMPLIFIED_AGENDA_ENABLED');
  assert.equal(SIMPLIFIED_ROUTES.AGENDA, '/app/agenda');
});

test('Lote D: rota de Agenda é SEMPRE registrada (acesso interno, não barra inferior)', async () => {
  const [routes, wrapper, agenda] = await Promise.all([
    source('../../app/routes.jsx'),
    source('./SimplifiedAgendaPage.jsx'),
    source('../../pages/AgendaPage.jsx'),
  ]);

  assert.match(routes, /path: SIMPLIFIED_ROUTES\.AGENDA/);
  assert.doesNotMatch(routes, /SIMPLIFIED_FEATURE_FLAGS\.agendaEnabled/);
  assert.match(wrapper, /<AgendaPage \/>/);
  assert.match(agenda, /useAgenda\(\{/);
  assert.match(agenda, /Carregando agenda/);
  assert.match(agenda, /Não foi possível carregar a agenda/);
  assert.match(agenda, /AgendaFormModal/);
  assert.match(agenda, /AgendaDeleteConfirmModal/);
  assert.match(agenda, /AgendaStatusConfirmModal/);
});

test('LOTE D: Agenda e Suporte não estão na barra inferior (três itens fixos)', async () => {
  const navigation = await source('./SimplifiedBottomNavigation.jsx');
  assert.match(navigation, /CalendarIcon/);
  assert.match(navigation, /--simplified-navigation-count/);
  assert.deepEqual(SIMPLIFIED_NAVIGATION.map(({ label }) => label), ['Home', 'Registros', 'Conta']);
});