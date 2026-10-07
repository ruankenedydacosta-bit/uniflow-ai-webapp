// Fase 3 do redesign (#90): página de notificações (tela 13 do handoff).
// Cobertura estrutural por leitura de fonte, igual a simplifiedAccount.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('rota /app/conta/notificacoes registrada com a página real, fora do loop de placeholders', async () => {
  assert.equal(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.NOTIFICATIONS].path, '/app/conta/notificacoes');
  const routes = await source('../../app/routes.jsx');
  assert.match(routes, /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.NOTIFICATIONS\]\.path[\s\S]{0,200}<SimplifiedNotificationsPage \/>/);
  assert.match(routes, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.NOTIFICATIONS\]\.path/);
  const barrel = await source('./index.js');
  assert.match(barrel, /export \{ default as SimplifiedNotificationsPage \} from '\.\/SimplifiedNotificationsPage\.jsx';/);
});

test('usa a mesma fonte do sino (useNotifications) -- nunca um segundo serviço ou estado de lista', async () => {
  const page = await source('./SimplifiedNotificationsPage.jsx');
  assert.match(page, /import \{ useNotifications \} from '\.\.\/notifications\/useNotifications\.js';/);
  assert.match(page, /markAsRead\(notification\.id\)/);
  assert.match(page, /onClick=\{\(\) => markAllAsRead\(\)\}/);
  assert.doesNotMatch(page, /notificationsService|supabase/);
});

test('tocar num item só navega para rota interna segura (isSafeInternalUrl)', async () => {
  const page = await source('./SimplifiedNotificationsPage.jsx');
  assert.match(page, /if \(isSafeInternalUrl\(notification\.action_url\)\) \{\s*\n\s*navigate\(notification\.action_url\);/);
});

test('cabeçalho: título Notificações, volta para o Mais e "Marcar todas como lidas" só com não lidas', async () => {
  const page = await source('./SimplifiedNotificationsPage.jsx');
  assert.match(page, /title="Notificações"/);
  assert.match(page, /onBack=\{\(\) => navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)\}/);
  assert.match(page, /action=\{unreadCount > 0 \? \(/);
  assert.match(page, /Marcar todas como lidas/);
});

test('agrupa por dia (Hoje/Ontem/data) com a hora em cada item e ponto de não lida', async () => {
  const page = await source('./SimplifiedNotificationsPage.jsx');
  assert.match(page, /groupNotificationsByDay\(notifications\)/);
  assert.match(page, /formatNotificationTime\(notification\.created_at\)/);
  assert.match(page, /\{unread \? <span className=\{styles\.unreadDot\} aria-hidden="true" \/> : null\}/);
});

test('estados de carregando, erro (com Tentar novamente) e vazio -- os mesmos textos do painel do sino', async () => {
  const page = await source('./SimplifiedNotificationsPage.jsx');
  assert.match(page, /Carregando notificações…/);
  assert.match(page, /Não foi possível carregar suas notificações\./);
  assert.match(page, /Tentar novamente/);
  assert.match(page, /Nenhuma notificação por enquanto\./);
});

test('ativação do push reaproveita useWebPush() e só aparece no estado DEFAULT; a nota do handoff some quando o push já está ativo', async () => {
  const page = await source('./SimplifiedNotificationsPage.jsx');
  assert.match(page, /import \{ PUSH_STATUS, useWebPush \} from '\.\.\/mobile-push\/useWebPush\.js';/);
  assert.match(page, /const showPushCta = pushStatus === PUSH_STATUS\.DEFAULT;/);
  assert.match(page, /\{isPushEnabled \? null : \(/);
  assert.match(page, /Por enquanto, as notificações aparecem só aqui no app\. Elas não chegam por e-mail nem por push\./);
});

test('CSS usa só tokens --uf-app-*, nunca hex fixo, e números com tabular-nums', async () => {
  const css = await source('./simplifiedNotifications.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(css, /font-variant-numeric: tabular-nums;/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
