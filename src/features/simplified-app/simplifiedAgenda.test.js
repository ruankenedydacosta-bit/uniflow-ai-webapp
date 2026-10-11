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

test('navegação é fixa em Hoje | Financeiro | Falar | Agenda | Mais independente de flags', () => {
  const flags = resolveSimplifiedFeatureFlags({});
  assert.equal(flags.agendaEnabled, false);
  assert.deepEqual(SIMPLIFIED_NAVIGATION.map(({ label }) => label), ['Hoje', 'Financeiro', 'Falar', 'Agenda', 'Mais']);
  assert.deepEqual(
    resolveSimplifiedNavigation().map(({ label, path }) => ({ label, path })),
    [
      { label: 'Hoje', path: '/app/home' },
      { label: 'Financeiro', path: '/app/registros' },
      { label: 'Falar', path: null },
      { label: 'Agenda', path: '/app/agenda' },
      { label: 'Mais', path: '/app/conta' },
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
  // LOTE AGENDA VISUAL: o wrapper simplificado deixou de embutir a lista
  // legada e passou a ser o calendário visual. A página completa segue na
  // rota legada /agenda (routes.jsx) e continua com o contrato real.
  assert.doesNotMatch(wrapper, /<AgendaPage \/>/);
  assert.match(wrapper, /useAgenda\(\{/);
  assert.match(wrapper, /SimplifiedAgendaFormModal/);
  assert.match(wrapper, /AgendaDeleteConfirmModal/);
  assert.match(routes, /path: '\/agenda'/);
  assert.match(agenda, /useAgenda\(\{/);
  assert.match(agenda, /Carregando agenda/);
  assert.match(agenda, /Não foi possível carregar a agenda/);
  assert.match(agenda, /AgendaFormModal/);
  assert.match(agenda, /AgendaDeleteConfirmModal/);
  assert.match(agenda, /AgendaStatusConfirmModal/);
});

test('Épico #99: Agenda entra na barra inferior; Suporte continua fora', async () => {
  const navigation = await source('./SimplifiedBottomNavigation.jsx');
  assert.match(navigation, /PhCalendarBlankIcon/);
  assert.match(navigation, /--simplified-navigation-count/);
  assert.deepEqual(SIMPLIFIED_NAVIGATION.map(({ label }) => label), ['Hoje', 'Financeiro', 'Falar', 'Agenda', 'Mais']);
});