import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const codeOnly = (content) => content
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ============================================================================
// RELATORIO-SPREADSHEET1 -- Tela 2: planilha imersiva (UM workbook visual,
// abas Movimentações/Agenda), read-only, mesma fonte de useMonthlyReport().
// ============================================================================

test('rota registrada, própria (não é subrota de Registros/Agenda)', async () => {
  const routes = await source('./simplifiedRoutes.js');
  assert.match(routes, /RELATORIO_PLANILHA: '\/app\/relatorio\/planilha',/);
  const appRoutes = await source('../../app/routes.jsx');
  assert.match(appRoutes, /path: SIMPLIFIED_ROUTES\.RELATORIO_PLANILHA,/);
  assert.match(appRoutes, /element: <SimplifiedReportSpreadsheetPage \/>,/);
});

test('cabeçalho próprio -- shell nunca duplica o header genérico por cima', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /\|\| location\.pathname === SIMPLIFIED_ROUTES\.RELATORIO_PLANILHA;/);
});

test('IMERSIVA: bottom nav some SÓ nesta rota -- nenhuma outra rota é afetada', async () => {
  const shell = await source('./SimplifiedAppShell.jsx');
  assert.match(shell, /const isSpreadsheetRoute = location\.pathname === SIMPLIFIED_ROUTES\.RELATORIO_PLANILHA;/);
  assert.match(shell, /<SimplifiedBottomNavigation hidden=\{isUniChatKeyboardOpen \|\| isSpreadsheetRoute\} \/>/);
});

test('usa useMonthlyReport() -- MESMA fonte da Tela 1, nunca uma segunda cópia', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /import \{ useMonthlyReport \} from '\.\/useMonthlyReport\.js';/);
  assert.match(page, /const \{ report, moveMonth \} = useMonthlyReport\(\);/);
  assert.doesNotMatch(page, /useTransactions|useAgenda\(|useCategories/);
});

test('UMA planilha, DUAS abas (Movimentações/Agenda) -- nunca duas páginas/downloads separados', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /const \[activeSheet, setActiveSheet\] = useState\('transactions'\);/);
  assert.match(page, />\s*Movimentações\s*</);
  assert.match(page, />\s*Agenda\s*</);
  assert.match(page, /role="tablist"/);
  // Troca de aba é só um setState local -- nunca navega/monta outra rota.
  assert.doesNotMatch(page, /navigate\([^)]*tab|navigate\([^)]*sheet/i);
});

test('Movimentações abre por padrão', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /useState\('transactions'\)/);
});

test('estrutura de tabela real: table/thead/tbody/th -- nunca cards por linha', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /<table className=\{styles\.sheetTable\}>/g);
  assert.match(page, /<thead>/);
  assert.match(page, /<tbody>/);
  assert.match(page, /scope="col"/);
});

test('linha de letras de coluna (A B C D...) -- reforça a sensação de planilha', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /const TRANSACTIONS_COLUMN_LETTERS = \['A', 'B', 'C', 'D', 'E', 'F', 'G'\];/);
  assert.match(page, /const AGENDA_COLUMN_LETTERS = \['A', 'B', 'C', 'D', 'E', 'F'\];/);
  assert.match(page, /className=\{styles\.letterRow\}/);
});

test('Movimentações: colunas #, Data, Hora, Tipo, Descrição, Categoria, Valor', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  const block = page.slice(page.indexOf('function TransactionsTable'), page.indexOf('function AgendaTable'));
  assert.match(block, /<th scope="col">Data<\/th>/);
  assert.match(block, /<th scope="col">Hora<\/th>/);
  assert.match(block, /<th scope="col">Tipo<\/th>/);
  assert.match(block, /<th scope="col">Descrição<\/th>/);
  assert.match(block, /<th scope="col">Categoria<\/th>/);
  assert.match(block, /<th scope="col">Valor<\/th>/);
});

test('Agenda: colunas #, Data, Hora, Compromisso, Lembrete, Status', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  const block = page.slice(page.indexOf('function AgendaTable'), page.indexOf('function SimplifiedReportSpreadsheetPage'));
  assert.match(block, /<th scope="col">Data<\/th>/);
  assert.match(block, /<th scope="col">Hora<\/th>/);
  assert.match(block, /<th scope="col">Compromisso<\/th>/);
  assert.match(block, /<th scope="col">Lembrete<\/th>/);
  assert.match(block, /<th scope="col">Status<\/th>/);
});

test('linhas usam report.transactions/report.agenda (flat, todas as linhas do mês) -- nunca .slice(0,2)', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /rows=\{report\.transactions\}/);
  assert.match(page, /rows=\{report\.agenda\}/);
  assert.doesNotMatch(page, /\.slice\(0,\s*2\)/);
});

test('RESUMO/planilha nunca mostram Saldo/Patrimônio/Balance', async () => {
  const files = ['./SimplifiedReportSpreadsheetPage.jsx', './simplifiedReportSpreadsheet.module.css'];
  for (const file of files) {
    const content = await source(file);
    assert.doesNotMatch(codeOnly(content), /\bSaldo\b/i, `${file} não pode mencionar Saldo`);
    assert.doesNotMatch(codeOnly(content), /\bPatrim[oô]nio\b/i);
    assert.doesNotMatch(codeOnly(content), /\bBalance\b/i);
  }
});

test('terminologia pública: Entrada/Saída (via typeLabel), nunca income/expense expostos', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.doesNotMatch(page, />income<|>expense</);
});

test('SEM "Uni dentro do relatório": nenhum chat, campo de pergunta, botão de sugestão/insight', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.doesNotMatch(page, /UniChat|ChatInput|Pergunte sobre|insight/i);
});

test('NÃO EDITÁVEL: nenhum input/contentEditable/onChange na tabela -- só leitura', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.doesNotMatch(page, /<input|contentEditable|onChange=/);
});

// -------------------------------------------------------------- download

test('botão "Baixar planilha" existe e só gera após interação (dentro do handler de clique)', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /Baixar planilha/);
  assert.match(page, /async function handleDownload\(\)/);
  assert.match(page, /onClick=\{handleDownload\}/);
});

test('LAZY LOAD: exceljs (via monthlyReportWorkbook.js) só é importado dinamicamente dentro do handler, nunca no topo do arquivo', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.doesNotMatch(page, /^import .*monthlyReportWorkbook/m);
  assert.match(page, /await import\('\.\/monthlyReportWorkbook\.js'\)/);
  const handlerStart = page.indexOf('async function handleDownload');
  const dynamicImportIndex = page.indexOf("await import('./monthlyReportWorkbook.js')");
  assert.ok(dynamicImportIndex > handlerStart, 'o import dinâmico precisa estar DENTRO do handler de download');
});

test('download usa o `report` MAIS RECENTE (estado vivo do hook) -- nunca um snapshot de quando a tela abriu', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /buildMonthlyReportWorkbookBlob\(report\)/);
  assert.match(page, /buildMonthlyReportFilename\(report\.period\)/);
});

test('erro de geração mostra mensagem clara, nunca falso sucesso nem loading infinito', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /catch \{\s*\n\s*setDownloadState\('error'\);\s*\n\s*\}/);
  assert.match(page, /Não foi possível gerar a planilha agora\. Tente novamente\./);
  assert.match(page, /role="alert"/);
});

test('estado "Preparando…" enquanto gera, botão desabilitado nesse meio-tempo', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /disabled=\{downloadState === 'preparing'\}/);
  assert.match(page, /Preparando…/);
});

test('mês selecionado governa o nome do arquivo (via report.period, já ligado ao mês selecionado)', async () => {
  const page = await source('./SimplifiedReportSpreadsheetPage.jsx');
  assert.match(page, /buildMonthlyReportFilename\(report\.period\)/);
});

// ---------------------------------------------------------------- layout

test('mobile: scroll horizontal intencional -- min-width alto, container com overflow:auto', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.sheetTable \{[\s\S]*?min-width: 780px;/);
  assert.match(css, /\.sheetScroll \{[\s\S]*?overflow: auto;/);
});

test('cabeçalho sticky (linha de letras + linha semântica)', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.letterRow th \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(css, /\.headRow th \{[\s\S]*?position: sticky;/);
});

test('só a coluna # congela à esquerda -- nunca múltiplas colunas presas', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.rowNumCell \{[\s\S]*?position: sticky;[\s\S]*?left: 0;/);
  const stickyLeftMatches = [...codeOnly(css).matchAll(/position:\s*sticky;\s*\n\s*left:/g)];
  assert.equal(stickyLeftMatches.length, 1, 'só uma classe deveria fixar coluna à esquerda');
});

test('descrição/título longos truncam -- nunca quebram a linha', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.descriptionCell \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;/);
});

test('CSS usa só tokens semânticos --uf-app-*, nunca hex fixo -- claro/escuro/UniFlow', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
});

test('safe-area respeitada -- tabs nunca ficam atrás da barra/home-indicator', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('back button e setas de mês têm área de toque adequada', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.backButton \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
});
