import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const codeOnly = (content) => content
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ============================================================================
// RELATORIO-SPREADSHEET1 -- Tela 1 (SimplifiedReportPage) virou só o
// resumo do mês + o CTA que abre a planilha (Tela 2,
// SimplifiedReportSpreadsheetPage). A fonte de dados/atualização em tempo
// real mudou de lugar para useMonthlyReport.js (compartilhada pelas duas
// telas) -- ver useMonthlyReport.test.js para essa cobertura.
// ============================================================================

test('rota registrada, mesmo padrão de Agenda -- fora da barra inferior', async () => {
  const routes = await source('./simplifiedRoutes.js');
  assert.match(routes, /RELATORIO: '\/app\/relatorio',/);
  const appRoutes = await source('../../app/routes.jsx');
  assert.match(appRoutes, /path: SIMPLIFIED_ROUTES\.RELATORIO,\n\s*label: 'Relatório da Uni',\n\s*title: 'Relatório da Uni',\n\s*simplified: true,\n\s*element: <SimplifiedReportPage \/>,/);
});

test('cabeçalho próprio (← Relatório da Uni) -- shell nunca duplica o header genérico por cima', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /\|\| location\.pathname === SIMPLIFIED_ROUTES\.RELATORIO\n/);
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /<h1>Relatório da Uni<\/h1>/);
  assert.match(page, /onClick=\{\(\) => navigate\(SIMPLIFIED_ROUTES\.HOME\)\}/);
});

test('usa useMonthlyReport() -- fonte única compartilhada com a planilha, nunca uma segunda cópia', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /import \{ useMonthlyReport \} from '\.\/useMonthlyReport\.js';/);
  assert.match(page, /const \{ report, moveMonth \} = useMonthlyReport\(\);/);
  assert.doesNotMatch(page, /useTransactions|useAgenda\(|useCategories/);
});

test('RESUMO nunca mostra Saldo/Patrimônio/Balance', async () => {
  const files = ['./SimplifiedReportPage.jsx', './simplifiedReport.module.css'];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(codeOnly(content), /\bSaldo\b/i, `${file} não pode mencionar Saldo`);
    assert.doesNotMatch(codeOnly(content), /\bPatrim[oô]nio\b/i);
    assert.doesNotMatch(codeOnly(content), /\bBalance\b/i);
  }
});

test('terminologia pública: Entradas/Saídas, nunca Receita/Despesa no resumo', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, />Entradas</);
  assert.match(page, />Saídas</);
  assert.doesNotMatch(page, />Receita</);
  assert.doesNotMatch(page, />Despesa</);
});

test('RESUMO tem SOMENTE os 4 indicadores -- nenhuma lista de movimentações/Agenda restante nesta tela', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, />Entradas</);
  assert.match(page, />Saídas</);
  assert.match(page, />Movimentações</);
  assert.match(page, />Compromissos</);
  assert.doesNotMatch(page, /transactionsByDay|report\.agenda\.map|report\.transactions\.map/);
  assert.doesNotMatch(page, /Nenhuma movimentação neste mês|Nenhum compromisso neste mês/);
});

test('CTA "Ver relatório" navega para a rota da planilha, com subtexto pedido', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /import \{ ChevronRightIcon, SpreadsheetIcon \} from '\.\/SimplifiedIcons\.jsx';/);
  assert.match(page, /onClick=\{\(\) => navigate\(SIMPLIFIED_ROUTES\.RELATORIO_PLANILHA\)\}/);
  assert.match(page, />Ver relatório</);
  assert.match(page, /Veja todos os seus dados organizados em uma planilha\./);
});

test('nenhum XLSX/exceljs referenciado na Tela 1 -- a geração vive só na planilha, sob demanda', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.doesNotMatch(codeOnly(page), /exceljs|xlsx|Baixar planilha/i);
});

test('SEM "Uni dentro do relatório": nenhum chat, campo de pergunta ou sugestão de IA', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.doesNotMatch(page, /UniChat|ChatInput|Pergunte sobre|insight/i);
});

test('CSS usa só tokens semânticos --uf-app-*, nunca hex fixo', async () => {
  const css = await source('./simplifiedReport.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
});

test('back button e setas de mês têm 44px/40px+ de área de toque', async () => {
  const css = await source('./simplifiedReport.module.css');
  assert.match(css, /\.backButton \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
});
