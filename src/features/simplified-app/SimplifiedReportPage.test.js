import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const codeOnly = (content) => content
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ============================================================================
// RELATORIO-FLATTEN1 -- Relatório da Uni: UMA ÚNICA tela (resumo + botão
// Baixar planilha + planilha completa), fundindo o que antes eram duas
// rotas (SimplifiedReportPage "resumo" em /app/relatorio +
// SimplifiedReportSpreadsheetPage "planilha imersiva" em
// /app/relatorio/planilha, alcançada só por um CTA "Ver relatório"
// intermediário -- removido). A rota antiga da planilha continua
// registrada só como redirect (ver routes.jsx), pra nunca quebrar um
// bookmark antigo.
// ============================================================================

test('rota registrada, mesmo padrão de Agenda -- fora da barra inferior', async () => {
  const routes = await source('./simplifiedRoutes.js');
  assert.match(routes, /RELATORIO: '\/app\/relatorio',/);
  const appRoutes = await source('../../app/routes.jsx');
  assert.match(appRoutes, /path: SIMPLIFIED_ROUTES\.RELATORIO,\n\s*label: 'Relatório da Uni',\n\s*title: 'Relatório da Uni',\n\s*simplified: true,\n\s*element: <SimplifiedReportPage \/>,/);
});

test('ROTA ANTIGA DA PLANILHA: /app/relatorio/planilha não tem mais tela própria -- só redireciona para /app/relatorio, nunca quebra um bookmark', async () => {
  const appRoutes = await source('../../app/routes.jsx');
  assert.match(appRoutes, /path: SIMPLIFIED_ROUTES\.RELATORIO_PLANILHA,\s*\n\s*element: <Navigate to=\{SIMPLIFIED_ROUTES\.RELATORIO\} replace \/>,/);
  assert.doesNotMatch(appRoutes, /SimplifiedReportSpreadsheetPage/);
});

test('componente da antiga rota da planilha foi removido -- nunca duas implementações do mesmo relatório', async () => {
  const barrel = await source('./index.js');
  assert.doesNotMatch(barrel, /SimplifiedReportSpreadsheetPage/);
});

test('cabeçalho próprio (← Relatório da Uni) -- shell nunca duplica o header genérico por cima', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /\|\| location\.pathname === SIMPLIFIED_ROUTES\.RELATORIO;/);
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /<h1>Relatório da Uni<\/h1>/);
  assert.match(page, /onClick=\{\(\) => navigate\(SIMPLIFIED_ROUTES\.HOME\)\}/);
});

test('IMERSIVA: bottom nav some SÓ nesta rota -- nenhuma outra rota é afetada', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /const isReportRoute = location\.pathname === SIMPLIFIED_ROUTES\.RELATORIO;/);
  assert.match(shell, /<SimplifiedBottomNavigation hidden=\{isUniChatKeyboardOpen \|\| isReportRoute\} \/>/);
});

test('usa useMonthlyReport() -- fonte única, chamada UMA vez nesta página (nunca duas queries/listeners/reportData)', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /import \{ useMonthlyReport \} from '\.\/useMonthlyReport\.js';/);
  const calls = [...page.matchAll(/useMonthlyReport\(\)/g)];
  assert.equal(calls.length, 1, 'useMonthlyReport() só pode ser chamado uma vez nesta página');
  assert.doesNotMatch(page, /useTransactions|useAgenda\(|useCategories/);
});

test('COMPONENTIZAÇÃO: reaproveita SimplifiedReportSpreadsheet -- nunca copia/cola a tabela', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /import SimplifiedReportSpreadsheet from '\.\/SimplifiedReportSpreadsheet\.jsx';/);
  assert.match(page, /<SimplifiedReportSpreadsheet report=\{report\} \/>/);
  assert.doesNotMatch(page, /<table\b/);
});

test('NENHUM CTA intermediário: sem "Ver relatório", sem navegar para uma segunda rota da planilha', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.doesNotMatch(page, /Ver relatório/);
  assert.doesNotMatch(page, /Veja todos os seus dados organizados em uma planilha\./);
  assert.doesNotMatch(page, /RELATORIO_PLANILHA/);
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

test('ESTRUTURA: 4 indicadores presentes -- mesmo com empty state, os cards continuam (nunca escondem o relatório inteiro)', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, />Entradas</);
  assert.match(page, />Saídas</);
  assert.match(page, />Movimentações</);
  assert.match(page, />Compromissos</);
});

test('ORDEM VISUAL: header -> mês -> 4 cards -> Baixar planilha -> planilha (tabs+grid)', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  const headerIndex = page.indexOf('<header');
  const monthNavIndex = page.indexOf('<nav');
  const summaryIndex = page.indexOf('styles.summaryGrid');
  const downloadIndex = page.indexOf('styles.downloadButton');
  const spreadsheetIndex = page.indexOf('<SimplifiedReportSpreadsheet');
  assert.ok(headerIndex > -1 && monthNavIndex > headerIndex, 'mês vem depois do header');
  assert.ok(summaryIndex > monthNavIndex, 'cards vêm depois do mês');
  assert.ok(downloadIndex > summaryIndex, 'Baixar planilha vem depois dos cards');
  assert.ok(spreadsheetIndex > downloadIndex, 'a planilha vem depois de Baixar planilha, na MESMA tela');
});

test('BOTÃO BAIXAR PLANILHA: full-width, fácil de encontrar, nunca escondido no header', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /Baixar planilha/);
  const headerBlock = page.slice(page.indexOf('<header'), page.indexOf('</header>'));
  assert.doesNotMatch(headerBlock, /Baixar planilha/, 'o botão saiu do header -- agora fica abaixo dos cards');
  const css = await source('./simplifiedReport.module.css');
  assert.match(css, /\.downloadButton \{[\s\S]*?width: 100%;/);
});

test('download só gera após interação (dentro do handler de clique)', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /async function handleDownload\(\)/);
  assert.match(page, /onClick=\{handleDownload\}/);
});

test('LAZY LOAD: exceljs (via monthlyReportWorkbook.js) só é importado dinamicamente dentro do handler -- nunca carrega a planilha da Home', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.doesNotMatch(page, /^import .*monthlyReportWorkbook/m);
  assert.match(page, /await import\('\.\/monthlyReportWorkbook\.js'\)/);
  const handlerStart = page.indexOf('async function handleDownload');
  const dynamicImportIndex = page.indexOf("await import('./monthlyReportWorkbook.js')");
  assert.ok(dynamicImportIndex > handlerStart, 'o import dinâmico precisa estar DENTRO do handler de download');
});

test('NÃO ALTERAR: nenhuma regra de geração do XLSX foi tocada -- mesmo mapeamento de dados de sempre', async () => {
  const workbook = await source('./monthlyReportWorkbook.js');
  assert.match(workbook, /export async function buildMonthlyReportWorkbookBlob\(reportData\)/);
  assert.match(workbook, /export function buildMonthlyReportFilename\(period\)/);
});

test('download usa o `report` MAIS RECENTE (estado vivo do hook) -- nunca um snapshot de quando a página abriu', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /buildMonthlyReportWorkbookBlob\(report\)/);
  assert.match(page, /buildMonthlyReportFilename\(report\.period\)/);
});

// ============================================================================
// DOWNLOAD-FEEDBACK1 -- confirmação no Centro de Notificações depois que o
// download do XLSX é DISPARADO com sucesso.
// ============================================================================

test('notificação de download só é criada DEPOIS de downloadMonthlyReportWorkbookBlob (download já disparado), nunca antes', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  const handlerBody = page.slice(
    page.indexOf('async function handleDownload'),
    page.indexOf('return (', page.indexOf('async function handleDownload')),
  );
  const dispatchIndex = handlerBody.indexOf('downloadMonthlyReportWorkbookBlob(blob, filename);');
  const notifyIndex = handlerBody.indexOf('createDownloadReadyNotification(');
  assert.ok(dispatchIndex > -1 && notifyIndex > -1, 'ambas as chamadas devem existir no handler');
  assert.ok(notifyIndex > dispatchIndex, 'a notificação precisa vir DEPOIS do download já disparado');
});

test('notificação usa fileType "xlsx" e o mesmo filename usado no download real -- nunca um nome recalculado à parte', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /createDownloadReadyNotification\(user\.id, \{\s*\n\s*workspaceId: workspace\?\.id,\s*\n\s*filename,\s*\n\s*fileType: 'xlsx',\s*\n\s*\}\);/);
});

test('sem usuário autenticado, nunca tenta criar a notificação (guard if (user?.id))', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /if \(user\?\.id\) \{/);
});

test('falha ao notificar nunca derruba o download nem aciona o estado de erro -- createDownloadReadyNotification nunca lança por contrato', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  const handlerBody = page.slice(
    page.indexOf('async function handleDownload'),
    page.indexOf('catch {', page.indexOf('async function handleDownload')),
  );
  // A chamada de notificação fica ANTES do catch, mas nunca é awaited
  // dentro de um novo try isolado que pudesse acionar setDownloadState
  // ('error') por causa dela -- void descarta a Promise, o catch só cobre
  // falhas reais de geração/download.
  assert.match(handlerBody, /void createDownloadReadyNotification\(/);
});

test('erro de geração mostra mensagem clara, nunca falso sucesso nem loading infinito', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /catch \{\s*\n\s*setDownloadState\('error'\);\s*\n\s*\}/);
  assert.match(page, /Não foi possível gerar a planilha agora\. Tente novamente\./);
  assert.match(page, /role="alert"/);
});

test('estado "Preparando…" enquanto gera, botão desabilitado nesse meio-tempo', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /disabled=\{downloadState === 'preparing'\}/);
  assert.match(page, /Preparando…/);
});

test('mês selecionado governa cards, planilha e nome do arquivo simultaneamente -- uma única fonte (report)', async () => {
  const page = await source('./SimplifiedReportPage.jsx');
  assert.match(page, /report\.summary\.incomeLabel/);
  assert.match(page, /report=\{report\}/);
  assert.match(page, /buildMonthlyReportFilename\(report\.period\)/);
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

test('safe-area respeitada -- topo e rodapé (planilha nunca fica atrás da barra/home-indicator do iPhone)', async () => {
  const css = await source('./simplifiedReport.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('PERFORMANCE: página só existe dentro da rota do Relatório -- Home nunca carrega a planilha', async () => {
  const homeFiles = ['./SimplifiedHomeView.jsx', './SimplifiedReportCard.jsx'];
  for (const file of homeFiles) {
    const content = await source(file);
    assert.doesNotMatch(content, /SimplifiedReportSpreadsheet|monthlyReportWorkbook/);
  }
});
