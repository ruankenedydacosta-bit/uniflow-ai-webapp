// ETAPA 4: SimplifiedSupportPage.jsx é um componente React real (hooks,
// dados reais via listOwnSupportRequests) -- mesmo padrão já usado no
// projeto para telas sem Testing Library/jsdom instalados: cobertura
// estrutural por leitura de fonte (readFileSync/regex), igual a
// simplifiedMyAccounts.test.js e simplifiedSecurity.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// routes.jsx -- suporte usa a tela real, demais subrotas continuam
// placeholders.
// ============================================================================

test('routes.jsx renderiza SimplifiedSupportPage na rota de suporte', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /SimplifiedSupportPage/);
  assert.match(
    content,
    /ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SUPPORT\]\.path[\s\S]{0,200}<SimplifiedSupportPage \/>/,
  );
});

test('routes.jsx filtra as 6 rotas com tela real da lista de placeholders genéricos', async () => {
  const content = await source('../../app/routes.jsx');
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.EDIT_PROFILE\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SECURITY\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PLAN\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.PAYMENTS\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.MY_ACCOUNTS\]\.path/);
  assert.match(content, /subroute\.path !== ACCOUNT_SUBROUTES\[ACCOUNT_SUBROUTE_IDS\.SUPPORT\]\.path/);
});

test('index.js exporta SimplifiedSupportPage', async () => {
  const content = await source('./index.js');
  assert.match(content, /export \{ default as SimplifiedSupportPage \} from '\.\/SimplifiedSupportPage\.jsx';/);
});

// ============================================================================
// Cabeçalho.
// ============================================================================

test('cabeçalho tem botão voltar, título "Suporte" e Falar com a Uni real', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /aria-label="Voltar para Conta"/);
  assert.match(content, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(content, /<h1>Suporte<\/h1>/);
});

// ============================================================================
// Canais -- Uni real, atendente via WhatsApp (nunca telefone/e-mail).
// ============================================================================

test('canal Uni navega para a rota pessoal real, sem chatbot paralelo', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  const uniOccurrences = content.match(/navigate\(SIMPLIFIED_ROUTES\.UNI\)/g) ?? [];
  assert.ok(uniOccurrences.length >= 2);
});

test('nunca menciona telefone, ligação ou e-mail como canal de suporte', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  // Ignora o bloco de comentario explicativo no topo do arquivo (que cita
  // "telefone e e-mail" ao explicar que foram removidos) e verifica so o
  // corpo real do componente, a partir da declaracao da funcao.
  const componentBody = content.slice(content.indexOf('function SimplifiedSupportPage'));
  assert.doesNotMatch(componentBody, /telefone|Telefone|liga[çc][ãa]o|e-mail|E-mail|email/i);
});

test('atendente humano é exclusivamente via WhatsApp', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /Falar com um atendente/);
  assert.match(content, /Nossa equipe pode ajudar você pelo WhatsApp\./);
});

// ============================================================================
// WhatsApp -- número oficial real, link gerado com segurança, sem API do
// WhatsApp e sem envio automático de mensagem.
// ============================================================================

test('constante do número oficial de WhatsApp é exatamente 5547920008797', async () => {
  const config = await source('./simplifiedSupportConfig.js');
  assert.match(config, /export const SUPPORT_WHATSAPP_NUMBER = '5547920008797';/);
});

test('buildSupportWhatsAppUrl gera o link wa.me com o número oficial e mensagem inicial codificada via URLSearchParams', async () => {
  const config = await source('./simplifiedSupportConfig.js');
  assert.match(config, /https:\/\/wa\.me\/\$\{SUPPORT_WHATSAPP_NUMBER\}/);
  assert.match(config, /new URLSearchParams\(\{ text: SUPPORT_WHATSAPP_MESSAGE \}\)/);
  assert.match(config, /Olá! Estou entrando em contato pelo suporte da UniFlow AI\./);

  const { buildSupportWhatsAppUrl, SUPPORT_WHATSAPP_NUMBER } = await import('./simplifiedSupportConfig.js');
  const url = buildSupportWhatsAppUrl();
  assert.equal(SUPPORT_WHATSAPP_NUMBER, '5547920008797');
  assert.match(url, /^https:\/\/wa\.me\/5547920008797\?text=/);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('text'), 'Olá! Estou entrando em contato pelo suporte da UniFlow AI.');
});

test('não expõe o número cru em nenhum console.log/console.error', async () => {
  const config = await source('./simplifiedSupportConfig.js');
  const page = await source('./SimplifiedSupportPage.jsx');
  assert.doesNotMatch(`${config}\n${page}`, /console\.(log|error|warn|info)\([^)]*5547920008797/);
});

test('os dois botões de WhatsApp usam o link real, abrem em nova aba com proteção noopener/noreferrer e têm aria-label acessível', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /import \{ buildSupportWhatsAppUrl \} from '\.\/simplifiedSupportConfig\.js';/);
  assert.match(content, /const whatsAppUrl = buildSupportWhatsAppUrl\(\);/);
  const whatsAppButtonOccurrences = content.match(/href=\{whatsAppUrl\}/g) ?? [];
  assert.equal(whatsAppButtonOccurrences.length, 2);
  assert.equal((content.match(/target="_blank"/g) ?? []).length, 2);
  assert.equal((content.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
  assert.equal(
    (content.match(/aria-label="Abrir atendimento da UniFlow AI no WhatsApp"/g) ?? []).length,
    2,
  );
});

test('placeholder/modal de "WhatsApp em breve" foi removido', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.doesNotMatch(content, /WhatsApp em breve/);
  assert.doesNotMatch(content, /ainda não está disponível nesta versão/);
  assert.doesNotMatch(content, /showWhatsAppModal/);
  assert.doesNotMatch(content, /import Modal from/);
});

// ============================================================================
// Meus atendimentos -- dados reais de support_requests, nunca fabricados.
// ============================================================================

test('usa listOwnSupportRequests real (tabela support_requests), nunca tickets fictícios', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /import \{ listOwnSupportRequests \} from '\.\.\/uni-support\/supportRequestService\.js';/);
  assert.doesNotMatch(content, /Problema no login|Dúvida sobre pagamento|Cancelar assinatura.*11:20/);
});

test('estado vazio honesto "Nenhum atendimento encontrado." quando não há solicitações reais', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /Nenhum atendimento encontrado\./);
});

test('status reais mapeados (open/in_review/resolved/closed), nunca "Respondido" inventado', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /open: 'Aberto'/);
  assert.match(content, /in_review: 'Em andamento'/);
  assert.match(content, /resolved: 'Resolvido'/);
  assert.match(content, /closed: 'Encerrado'/);
  assert.doesNotMatch(content, /'Respondido'/);
});

test('"Ver todos" expande a lista localmente, sem navegar para uma subpágina nova', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /setShowAll\(\(current\) => !current\)/);
  assert.doesNotMatch(content, /navigate\(['"]\/app\/conta\/atendimentos/);
});

// ============================================================================
// Horário -- texto honesto pedido, nunca horários específicos inventados.
// ============================================================================

test('horário de atendimento usa exatamente o texto honesto pedido', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /Segunda a Domingo/);
  assert.match(content, /Horário comercial/);
  assert.doesNotMatch(content, /8h às 20h|8h às 14h/);
});

// ============================================================================
// Fluxo do suporte -- só 2 etapas (Uni + WhatsApp), sem telefone/e-mail/equipe técnica extra.
// ============================================================================

test('fluxo do suporte mostra só as 2 etapas pedidas (Uni primeiro, depois WhatsApp)', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.match(content, /A Uni tenta resolver/);
  assert.match(content, /Atendente pelo WhatsApp/);
  assert.doesNotMatch(content, /Equipe técnica|Especialista/);
});

// ============================================================================
// Acessibilidade e responsividade.
// ============================================================================

test('CSS oferece foco visível, prefers-reduced-motion e responsividade', async () => {
  const css = await source('./simplifiedSupport.module.css');
  assert.match(css, /\.backButton:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(min-width: 1024px\)/);
});

test('página de Suporte não usa window.confirm nem solicita dados pessoais antes de abrir o WhatsApp', async () => {
  const content = await source('./SimplifiedSupportPage.jsx');
  assert.doesNotMatch(content, /window\.confirm/);
  assert.doesNotMatch(content, /<input|<form/);
});
