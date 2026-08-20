import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// RELATORIO-FLATTEN1 -- SimplifiedReportSpreadsheet.jsx: componente puro
// de apresentação (tabs + grid), extraído da antiga
// SimplifiedReportSpreadsheetPage.jsx (rota /app/relatorio/planilha,
// removida) para ser reaproveitado DENTRO do Relatório da Uni, nunca
// copiado/colado. Recebe `report` pronto por prop -- nenhuma fonte de
// dados própria.
// ============================================================================

test('componente puro: recebe `report` por prop, nenhuma fonte de dados própria (nenhum hook de fetch)', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.match(component, /function SimplifiedReportSpreadsheet\(\{ report \}\)/);
  assert.doesNotMatch(component, /useTransactions|useAgenda\(|useCategories|useMonthlyReport/);
});

test('UMA planilha, DUAS abas (Movimentações/Agenda) -- nunca duas páginas/downloads separados', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.match(component, /const \[activeSheet, setActiveSheet\] = useState\('transactions'\);/);
  assert.match(component, />\s*Movimentações\s*</);
  assert.match(component, />\s*Agenda\s*</);
  assert.match(component, /role="tablist"/);
});

test('Movimentações abre por padrão', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.match(component, /useState\('transactions'\)/);
});

test('estrutura de tabela real: table/thead/tbody/th -- nunca cards por linha', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.match(component, /<table className=\{styles\.sheetTable\}>/g);
  assert.match(component, /<thead>/);
  assert.match(component, /<tbody>/);
  assert.match(component, /scope="col"/);
});

test('linha de letras de coluna (A B C D...) -- reforça a sensação de planilha', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.match(component, /const TRANSACTIONS_COLUMN_LETTERS = \['A', 'B', 'C', 'D', 'E', 'F', 'G'\];/);
  assert.match(component, /const AGENDA_COLUMN_LETTERS = \['A', 'B', 'C', 'D', 'E', 'F'\];/);
  assert.match(component, /className=\{styles\.letterRow\}/);
});

test('Movimentações: colunas #, Data, Hora, Tipo, Descrição, Categoria, Valor', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  const block = component.slice(component.indexOf('function TransactionsTable'), component.indexOf('function AgendaTable'));
  assert.match(block, /<th scope="col">Data<\/th>/);
  assert.match(block, /<th scope="col">Hora<\/th>/);
  assert.match(block, /<th scope="col">Tipo<\/th>/);
  assert.match(block, /<th scope="col">Descrição<\/th>/);
  assert.match(block, /<th scope="col">Categoria<\/th>/);
  assert.match(block, /<th scope="col">Valor<\/th>/);
});

test('Agenda: colunas #, Data, Hora, Compromisso, Lembrete, Status', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  const block = component.slice(component.indexOf('function AgendaTable'), component.indexOf('function SimplifiedReportSpreadsheet('));
  assert.match(block, /<th scope="col">Data<\/th>/);
  assert.match(block, /<th scope="col">Hora<\/th>/);
  assert.match(block, /<th scope="col">Compromisso<\/th>/);
  assert.match(block, /<th scope="col">Lembrete<\/th>/);
  assert.match(block, /<th scope="col">Status<\/th>/);
});

test('linhas usam report.transactions/report.agenda (flat, todas as linhas do mês) -- nunca .slice(0,2)', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.match(component, /rows=\{report\.transactions\}/);
  assert.match(component, /rows=\{report\.agenda\}/);
  assert.doesNotMatch(component, /\.slice\(0,\s*2\)/);
});

test('estados vazios: linha/mensagem adequada para cada sheet, sem esconder o relatório inteiro', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.match(component, /Nenhuma movimentação neste mês\./);
  assert.match(component, /Nenhum compromisso neste mês\./);
});

test('terminologia pública: Entrada/Saída (via typeLabel), nunca income/expense expostos', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.doesNotMatch(component, />income<|>expense</);
});

test('NÃO EDITÁVEL: nenhum input/contentEditable/onChange na tabela -- só leitura', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.doesNotMatch(component, /<input|contentEditable|onChange=/);
});

test('SEM "Uni dentro do relatório": nenhum chat, campo de pergunta, botão de sugestão/insight', async () => {
  const component = await source('./SimplifiedReportSpreadsheet.jsx');
  assert.doesNotMatch(component, /UniChat|ChatInput|Pergunte sobre|insight/i);
});

// ---------------------------------------------------------------- layout

test('mobile: scroll horizontal intencional -- min-width alto, container com overflow:auto', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.sheetTable \{[\s\S]*?min-width: 780px;/);
  assert.match(css, /\.sheetScroll \{[\s\S]*?overflow: auto;/);
});

test('a caixa da planilha é sua PRÓPRIA área de scroll (2D) -- evita conflito entre o gesto vertical da página e o horizontal da tabela', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.sheetScroll \{[\s\S]*?flex: 1 1 auto;/);
});

test('cabeçalho sticky (linha de letras + linha semântica) -- preservado conforme implementação anterior', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.letterRow th \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(css, /\.headRow th \{[\s\S]*?position: sticky;/);
});

test('só a coluna # congela à esquerda -- nunca múltiplas colunas presas', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.rowNumCell \{[\s\S]*?position: sticky;[\s\S]*?left: 0;/);
});

test('descrição/título longos truncam -- nunca quebram a linha', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.match(css, /\.descriptionCell \{[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;/);
});

test('CSS usa só tokens semânticos --uf-app-*, nunca hex fixo -- claro/escuro/UniFlow', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
});

test('CSS não repete estilos de chrome de página (header/backButton/monthNav/downloadButton) -- isso já vive em simplifiedReport.module.css, nunca duplicado', async () => {
  const css = await source('./simplifiedReportSpreadsheet.module.css');
  assert.doesNotMatch(css, /\.header\s*\{|\.backButton\s*\{|\.monthNav\s*\{|\.downloadButton\s*\{/);
});
