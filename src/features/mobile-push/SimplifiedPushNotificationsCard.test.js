import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// PUSH1 (ajuste de UX) -- SimplifiedPushNotificationsCard.jsx. Mesmo padrão
// de cobertura estrutural usado no resto do projeto (sem Testing Library/
// jsdom): o componente usa useWebPush() diretamente -- toda a lógica de
// ativar/desativar/testar já é coberta por useWebPush.test.js; aqui só
// cobrimos a apresentação e a fiação com o hook.
// ============================================================================

test('usa useWebPush() -- fonte única de lógica, nunca uma segunda implementação de subscribe/unsubscribe/test', async () => {
  const content = await source('SimplifiedPushNotificationsCard.jsx');
  assert.match(content, /import \{ PUSH_STATUS, useWebPush \} from '\.\/useWebPush\.js';/);
  assert.match(content, /const \{[\s\S]*?\} = useWebPush\(\);/);
});

test('iOS fora do standalone mostra a orientação exata pedida, nunca um botão que só vai falhar', async () => {
  const content = await source('SimplifiedPushNotificationsCard.jsx');
  assert.match(content, /Para receber notificações no iPhone, adicione a UniFlow à Tela de Início\./);
  const disabledExpr = content.slice(content.indexOf('disabled={'), content.indexOf('onClick={() => enableNotifications()}'));
  assert.match(disabledExpr, /capabilities\.needsAddToHomeScreen/);
});

test('estado desativado mostra badge "Desativadas" e CTA "Ativar notificações"', async () => {
  const content = await source('SimplifiedPushNotificationsCard.jsx');
  assert.match(content, /isEnabled \? 'Ativadas' : 'Desativadas'/);
  assert.match(content, /'Ativando…' : 'Ativar notificações'/);
});

test('estado ativado mostra "Ativadas neste dispositivo", botão de teste e desativar -- nunca pede pra voltar aqui de novo', async () => {
  const content = await source('SimplifiedPushNotificationsCard.jsx');
  assert.match(content, /Ativadas neste dispositivo\./);
  assert.match(content, /Enviar notificação de teste/);
  assert.match(content, /Desativar notificações/);
});

test('titulo e descricao exatos pedidos para o card', async () => {
  const content = await source('SimplifiedPushNotificationsCard.jsx');
  assert.match(content, /<h2>Notificações no celular<\/h2>/);
  assert.match(content, /Receba lembretes importantes da Uni mesmo com o app fechado\./);
});
