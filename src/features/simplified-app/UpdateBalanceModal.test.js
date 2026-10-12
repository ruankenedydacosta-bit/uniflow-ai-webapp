// BLOCO FINAL DO MVP (Saldo manual) + CONTA-OPCIONAL (fase 2) + BLOCO
// SALDO/RECEITA/DESPESA EDITAVEIS -- testes estruturais (source-regex)
// sobre UpdateBalanceModal.jsx, mesmo padrão já usado no projeto para
// componentes React (sem @testing-library/react disponível -- ver
// src/features/uni-chat/components/ChatInput.test.js). A lógica pura de
// máscara/delta já é coberta por balanceAdjustmentFormUtils.test.js e
// balanceAdjustmentService.test.js.
//
// CONTA-OPCIONAL (fase 2): "Atualizar saldo" deixou de exigir escolher uma
// conta -- o sub-fluxo "Criar conta"/FinanceAccountModal e o estado vazio
// "Nenhuma conta disponível" foram removidos inteiramente.
//
// BLOCO SALDO/RECEITA/DESPESA EDITAVEIS: a modal deixou de ser exclusiva do
// card Saldo -- prop `target` ('balance'|'income'|'expense') decide qual
// card ela ajusta, `currentValue` substitui workspaceBalance como nome
// genérico. Ganhou também o atalho "Zerar".
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('modal reaproveita a RPC de ajuste já existente, nunca escreve direto na tabela transactions', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /import \{ submitBalanceAdjustment \} from '\.\.\/\.\.\/services\/balanceAdjustmentService\.js';/);
  assert.doesNotMatch(modal, /supabase\.from\('transactions'\)/);
});

test('nenhuma referência a conta sobrevive no componente -- nem seletor, nem "Criar conta", nem FinanceAccountModal', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.doesNotMatch(modal, /accountState/);
  assert.doesNotMatch(modal, /selectedAccount/);
  assert.doesNotMatch(modal, /FinanceAccountModal/);
  assert.doesNotMatch(modal, /Criar conta/);
  assert.doesNotMatch(modal, /Selecione uma conta/);
  assert.doesNotMatch(modal, /Nenhuma conta disponível/);
  assert.doesNotMatch(modal, /getActiveAccountsForAdjustment/);
});

test('modal é genérica: target decide qual card (balance/income/expense) ela ajusta, currentValue é o total atual daquele card', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  // #182: `accountId` opcional -- o detalhe da conta em Organizar ajusta o
  // saldo de uma conta; sem ele, o ajuste segue sobre o total.
  assert.match(modal, /function UpdateBalanceModal\(\{ target = 'balance', accountId = null, currentValue, onChanged, onClose, open \}\)/);
  assert.match(modal, /const currentValueNumber = Number\(currentValue \?\? 0\);/);
  // Com accountId, os textos falam do saldo de uma conta (ACCOUNT_COPY).
  assert.match(modal, /const copy = accountId \? ACCOUNT_COPY : \(TARGET_COPY\[target\] \?\? TARGET_COPY\.balance\);/);
});

test('TARGET_COPY define título/rótulos próprios para balance, income e expense -- nenhum texto genérico "saldo" vaza pros outros dois', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const start = modal.indexOf('const TARGET_COPY');
  const slice = modal.slice(start, modal.indexOf('});', start));
  assert.match(slice, /balance: Object\.freeze\(\{[\s\S]*?title: 'Atualizar saldo',/);
  assert.match(slice, /income: Object\.freeze\(\{[\s\S]*?title: 'Atualizar entradas',/);
  assert.match(slice, /expense: Object\.freeze\(\{[\s\S]*?title: 'Atualizar saídas',/);
});

test('SimplifiedRecordsPage abre a modal somente para Entradas/Saídas; Agenda reutiliza a rota existente', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const start = records.indexOf('<UpdateBalanceModal');
  const slice = records.slice(start, records.indexOf('/>', start));
  assert.match(slice, /target=\{summaryModalTarget \?\? 'income'\}/);
  assert.match(slice, /summaryModalTarget === 'income'\s*\n\s*\? summary\.income/);
  assert.match(slice, /: summary\.expense/);
  assert.doesNotMatch(slice, /balanceState\.workspaceBalance/);
  assert.doesNotMatch(slice, /accountState=/);
  assert.match(records, /if \(target === 'agenda'\) \{\s*navigate\(SIMPLIFIED_ROUTES\.AGENDA\);/);
});

test('MonthlySummary: Entradas, Saídas e Agenda são os três cards; não existe card público de Saldo', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const start = records.indexOf('function MonthlySummary(');
  const slice = records.slice(start, records.indexOf('function CategoryGrid('));
  assert.match(slice, /onClick=\{\(\) => onCardClick\(card\.id\)\}/);
  assert.match(slice, /id: 'agenda', label: 'Agenda', detail: 'Ver compromissos'/);
  assert.doesNotMatch(slice, /label: 'Saldo'/);
});

test('"Zerar" preenche o valor com 0 sem persistir sozinho -- a confirmação continua exigida no passo seguinte', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const start = modal.indexOf('function handleZero() {');
  const slice = modal.slice(start, modal.indexOf('\n  }', start));
  assert.match(slice, /setCents\(0\);/);
  assert.doesNotMatch(slice, /submitBalanceAdjustment|setStep/);
  assert.match(modal, /<OutlineButton variant="ghost" className=\{styles\.zeroButton\} onClick=\{handleZero\}>/);
});

// UX: o campo nasce preenchido com o valor atual do card (amountToCents),
// não com "R$ 0,00" -- evita o usuário ver um valor errado antes de mexer.
test('campo de valor nasce preenchido com currentValue, nunca zerado por padrão', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /import \{\s*amountToCents,/);
  assert.match(modal, /const \[cents, setCents\] = useState\(\(\) => amountToCents\(currentValue\)\);/);
});

test('"Salvar" fica desabilitado até o valor realmente mudar (delta zero é rejeitado pela RPC) -- nunca depende de conta', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /const hasChange = delta !== 0;/);
  assert.match(modal, /<OutlineButton type="submit" className=\{styles\.primaryAction\} disabled=\{!hasChange\}>/);
});

test('fluxo exige confirmação explícita: enviar o formulário só avança para o resumo, não persiste', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const reviewStart = modal.indexOf('function handleReviewSubmit(event) {');
  const reviewEnd = modal.indexOf('\n  }', reviewStart);
  const reviewSlice = modal.slice(reviewStart, reviewEnd);
  assert.doesNotMatch(reviewSlice, /submitBalanceAdjustment/);
  assert.match(reviewSlice, /setStep\('confirm'\)/);
  assert.match(reviewSlice, /if \(!hasChange\) return;/);
});

test('somente "Confirmar" no resumo chama submitBalanceAdjustment, repassando target e o accountId da prop (null por padrão)', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf('async function handleConfirm() {');
  assert.ok(confirmStart > -1);
  const confirmSlice = modal.slice(confirmStart, modal.indexOf('\n  }', confirmStart));
  assert.match(confirmSlice, /submitBalanceAdjustment\(\{/);
  assert.match(confirmSlice, /target,/);
  assert.match(confirmSlice, /accountId,/);
  // Nenhum seletor de conta na modal: o accountId só vem de quem a abre.
  assert.doesNotMatch(modal, /useState\([^)]*account/i);
});

test('clique duplo/repetido no Confirmar nunca dispara uma segunda chamada (guarda isSubmitting)', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf('async function handleConfirm() {');
  const confirmSlice = modal.slice(confirmStart, confirmStart + 120);
  assert.match(confirmSlice, /if \(isSubmitting\) return;/);
  assert.match(modal, /<OutlineButton className=\{styles\.primaryAction\} onClick=\{handleConfirm\} loading=\{isSubmitting\}>/);
});

test('modal nunca pode ser fechada (overlay/ESC) enquanto a persistência está em andamento', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /closeOnOverlayClick=\{!isSubmitting\}/);
  assert.match(modal, /closeOnEsc=\{!isSubmitting\}/);
  assert.match(modal, /function handleClose\(\) \{\s*if \(isSubmitting\) return;/);
});

test('erro de persistência nunca altera o valor -- estado permanece em "confirm" com a mensagem exibida', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf('async function handleConfirm() {');
  const confirmSlice = modal.slice(confirmStart, modal.indexOf('\n  }', confirmStart));
  assert.match(confirmSlice, /if \(result\.error\) \{/);
  assert.match(confirmSlice, /setError\(result\.error\);\s*return;/);
  assert.doesNotMatch(confirmSlice.slice(0, confirmSlice.indexOf('if (result.error)')), /setStep\('success'\)/);
});

test('sucesso atualiza a interface imediatamente via onChanged (mesmo padrão de FinanceAccountModal/FinanceTransactionModal)', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf('async function handleConfirm() {');
  const confirmSlice = modal.slice(confirmStart, modal.indexOf('\n  }', confirmStart));
  assert.match(confirmSlice, /setStep\('success'\)/);
  assert.match(confirmSlice, /await onChanged\?\.\(\);/);
});

test('descrição é sempre opcional -- campo nunca tem "required"', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const descriptionStart = modal.indexOf("id=\"update-balance-description\"");
  const descriptionSlice = modal.slice(descriptionStart, descriptionStart + 300);
  assert.doesNotMatch(descriptionSlice, /required/);
});

test('confirmação mostra os rótulos de `copy` (atual/novo/ajuste) e (se houver) descrição -- nunca uma linha de conta', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf("step === 'confirm' ? (");
  const confirmSlice = modal.slice(confirmStart, modal.indexOf("Concluir", confirmStart));
  assert.match(confirmSlice, /<dt>\{copy\.currentLabel\}<\/dt>/);
  assert.match(confirmSlice, /formatCurrency\(currentValueNumber\)/);
  assert.match(confirmSlice, /<dt>\{copy\.newLabel\}<\/dt>/);
  // Tela 22b: a linha do ajuste se chama só "Ajuste".
  assert.match(confirmSlice, /<dt>Ajuste<\/dt>/);
  assert.doesNotMatch(confirmSlice, /<dt>Conta<\/dt>/);
  assert.match(confirmSlice, /note\.trim\(\) \? \(/);
});

test('cada abertura da modal gera um novo client_operation_id (idempotência por tentativa) -- via remontagem por key no pai', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(modal, /operationIdRef\.current = generateOperationId\(\);/);
  assert.match(records, /key=\{summaryModalTarget \?\? 'summary-modal-closed'\}/);
});

test('não adiciona campos fora do especificado: sem categoria, data, tipo ou conta no formulário', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.doesNotMatch(modal, /id="update-balance-category"|id="update-balance-date"|id="update-balance-type"|id="update-balance-account"/);
});

// ============================================================================
// BLOCO REGISTROS iOS (refino visual): a modal compartilhada (Modal.jsx) usa
// tokens --uf-* que resolvem claros quando data-theme="light" -- redefinimos
// esses tokens localmente em .balanceDialog para forçar a identidade escura
// oficial, sem alterar o Modal.jsx compartilhado (que continua reativo ao
// tema nas demais telas do produto).
// ============================================================================

test('label de Descrição é claramente marcada como opcional', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /label="Descrição \(opcional\)"/);
});

test('Modal principal recebe className e overlayClassName escuros -- nunca fica branco', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /className=\{styles\.balanceDialog\}/);
  assert.match(modal, /overlayClassName=\{styles\.darkOverlay\}/);
});

test('CSS redefine os tokens --uf-* de fundo/texto/borda em .balanceDialog com a paleta escura oficial (não o cinza genérico do tema dark)', async () => {
  const css = await source('./UpdateBalanceModal.module.css');
  const dialogStart = css.indexOf('.balanceDialog {');
  const dialogSlice = css.slice(dialogStart, css.indexOf('}', dialogStart));
  // THEME SYSTEM V2: a identidade continua sendo a mesma, mas agora vem do
  // token do tema ativo em vez de um literal. Fixar o hexadecimal aqui era o
  // que impedia o diálogo de acompanhar Claro / Escuro / UniFlow.
  assert.match(dialogSlice, /--uf-color-bg-elevated: linear-gradient\(145deg, var\(--uf-app-surface-2\), var\(--uf-app-surface\)\);/);
  assert.match(dialogSlice, /--uf-color-text-primary: var\(--uf-app-text\);/);
  assert.match(dialogSlice, /--uf-color-border-default: var\(--uf-app-border\);/);
});

test('.darkOverlay usa o overlay semântico do tema com blur, mesmo se a folha de estilo do Modal compartilhado carregar depois', async () => {
  const css = await source('./UpdateBalanceModal.module.css');
  const overlayStart = css.indexOf('.darkOverlay {');
  const overlaySlice = css.slice(overlayStart, css.indexOf('}', overlayStart));
  assert.match(overlaySlice, /background: var\(--uf-app-overlay-panel\) !important;/);
  assert.match(overlaySlice, /backdrop-filter: blur\(8px\) !important;/);
});
