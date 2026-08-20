import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// RELATORIO1 -- card premium abaixo do gráfico, no lugar do antigo CTA
// "Pergunte à Uni sobre seus dados". Leve de propósito: reaproveita a
// contagem de transações já buscada pelo gráfico (prop), e só adiciona
// UMA consulta própria mínima (Agenda do mês) para a contagem de
// compromissos -- nunca busca o relatório inteiro só para o card.
// ============================================================================

test('navega para a rota do relatório ao ser tocado, nunca abre um modal', async () => {
  const card = await source('./SimplifiedReportCard.jsx');
  assert.match(card, /import \{ SIMPLIFIED_ROUTES \} from '\.\/simplifiedRoutes\.js';/);
  assert.match(card, /onClick=\{\(\) => navigate\(SIMPLIFIED_ROUTES\.RELATORIO\)\}/);
  assert.doesNotMatch(card, /import Modal/);
});

test('título e subtexto exatos pedidos pelo produto', async () => {
  const card = await source('./SimplifiedReportCard.jsx');
  assert.match(card, /Relatório da Uni/);
  assert.match(card, /Seu mês organizado automaticamente\./);
  assert.match(card, />Ver relatório</);
});

test('contagem de transações vem por PROP (do gráfico) -- nunca um segundo fetch financeiro aqui', async () => {
  const card = await source('./SimplifiedReportCard.jsx');
  assert.match(card, /function SimplifiedReportCard\(\{ transactionCount = 0 \}\)/);
  assert.doesNotMatch(card, /useTransactions/);
});

test('contagem de compromissos usa useAgenda com o mesmo intervalo de mês da Agenda visual', async () => {
  const card = await source('./SimplifiedReportCard.jsx');
  assert.match(card, /import \{ useAgenda \} from '\.\.\/\.\.\/hooks\/useAgenda\.js';/);
  assert.match(card, /import \{ buildMonthRange \} from '\.\/simplifiedAgendaCalendar\.js';/);
  assert.match(card, /useAgenda\(\{ workspaceId, startsFrom: month\.startsFrom, startsTo: month\.startsTo \}\)/);
});

test('linha de contexto usa dados reais (contagens), nunca texto fixo -- e some quando os dois são zero', async () => {
  const card = await source('./SimplifiedReportCard.jsx');
  assert.match(card, /const hasContext = transactionCount > 0 \|\| agendaCount > 0;/);
  assert.match(card, /\{hasContext \? \(/);
});

test('não coloca ainda XLSX/PDF/WhatsApp no card (pertencem à Fase 2\\/3)', async () => {
  const card = await source('./SimplifiedReportCard.jsx');
  assert.doesNotMatch(card, /XLSX|PDF|WhatsApp|Baixar/i);
});

test('CSS: mesma largura/box-sizing do elemento que substitui -- nunca reabre o estouro horizontal já corrigido', async () => {
  const css = await source('./SimplifiedReportCard.module.css');
  assert.match(css, /\.reportCard \{[\s\S]*?width: 100%;[\s\S]*?box-sizing: border-box;/);
});

test('CSS: usa tokens semânticos --uf-app-*, nunca hex fixo -- funciona em claro/escuro/UniFlow', async () => {
  const css = await source('./SimplifiedReportCard.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
});

test('CSS: destaque de marca (violeta/azul/ciano) só como borda/ícone -- nunca fundo inteiro colorido (não deve parecer propaganda)', async () => {
  const css = await source('./SimplifiedReportCard.module.css');
  const cardRule = /\.reportCard \{([\s\S]*?)\n\}/.exec(css)[1];
  assert.doesNotMatch(cardRule, /^\s*background: linear-gradient\(135deg/m, 'o gradiente de marca não pode ser o fundo do card inteiro');
});

test('CSS: nenhuma animação contínua -- a microentrada é herdada do wrapper .enter do gráfico (uma vez só)', async () => {
  const css = await source('./SimplifiedReportCard.module.css');
  assert.doesNotMatch(css, /animation:/);
  assert.doesNotMatch(css, /@keyframes/);
});

test('ícone reaproveita DocumentIcon existente -- nunca uma nova interpretação de marca/símbolo', async () => {
  const card = await source('./SimplifiedReportCard.jsx');
  assert.match(card, /import \{ DocumentIcon \} from '\.\/SimplifiedIcons\.jsx';/);
  assert.match(card, /<DocumentIcon \/>/);
});
