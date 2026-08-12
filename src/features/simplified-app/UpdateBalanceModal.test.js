// BLOCO FINAL DO MVP (Saldo manual) + correção (Bloco Saldo + Cobrança) --
// testes estruturais (source-regex) sobre UpdateBalanceModal.jsx, mesmo
// padrão já usado no projeto para componentes React (sem
// @testing-library/react disponível -- ver
// src/features/uni-chat/components/ChatInput.test.js). A lógica pura de
// máscara/delta/filtro de contas já é coberta por
// balanceAdjustmentFormUtils.test.js e balanceAdjustmentService.test.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('modal reaproveita a RPC de ajuste já existente, nunca escreve direto na tabela transactions', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /import \{ submitBalanceAdjustment \} from '\.\.\/\.\.\/services\/balanceAdjustmentService\.js';/);
  assert.doesNotMatch(modal, /supabase\.from\('transactions'\)/);
});

test('a conta NUNCA é escolhida automaticamente -- nenhum resolvePrimaryAccountForAdjustment, só filtro de contas ativas', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.doesNotMatch(modal, /resolvePrimaryAccountForAdjustment/);
  assert.match(modal, /import \{[\s\S]*getActiveAccountsForAdjustment[\s\S]*\} from '\.\/balanceAdjustmentFormUtils\.js';/);
  assert.match(modal, /const activeAccounts = getActiveAccountsForAdjustment\(accountState\?\.activeAccounts \?\? \[\]\);/);
});

test('com exatamente 1 conta ativa ela aparece pré-selecionada, mas continua um <select> real (visível/editável) -- com 2+ o campo nasce vazio', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /const effectiveSelectedId = selectedAccountId\s*\n\s*\|\| \(activeAccounts\.length === 1 \? activeAccounts\[0\]\.id : ''\);/);
  assert.match(modal, /<select\s*\n\s*id="update-balance-account"/);
  assert.match(modal, /<option value="" disabled>Selecione uma conta<\/option>/);
});

test('campo Conta é obrigatório: "Salvar saldo" fica desabilitado sem conta selecionada', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /<Button type="submit" disabled=\{!touched \|\| !selectedAccount\}>/);
});

test('"Criar conta" fica na mesma linha do label "Conta" (nunca abaixo do seletor, nunca um bloco grande)', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const rowStart = modal.indexOf('<div className={styles.accountLabelRow}>');
  assert.ok(rowStart > -1);
  const selectStart = modal.indexOf('<select', rowStart);
  const rowSlice = modal.slice(rowStart, selectStart);
  assert.match(rowSlice, /<span>Conta<\/span>/);
  assert.match(rowSlice, /Criar conta/);
  assert.match(rowSlice, /onClick=\{openCreateAccount\}/);
});

test('"Criar conta" reaproveita o FinanceAccountModal já existente -- nenhuma tela nova, fecha automaticamente ao criar', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /import FinanceAccountModal from '\.\.\/\.\.\/pages\/financeiro\/FinanceAccountModal\.jsx';/);
  assert.match(modal, /<FinanceAccountModal\s*\n\s*accountState=\{accountState\}\s*\n\s*autoCloseOnCreate\s*\n\s*open=\{Boolean\(open\) && showCreateAccount\}/);
});

test('abrir "Criar conta" esconde a modal de saldo (sem desmontar -- valor e descrição preservados) em vez de empilhar duas visíveis', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /open=\{Boolean\(open\) && !showCreateAccount\}/);
});

test('estado sem contas: mostra "Criar conta" como ação principal e nunca renderiza o formulário de saldo', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const emptyStart = modal.indexOf('activeAccounts.length === 0 ? (');
  assert.ok(emptyStart > -1);
  const emptySlice = modal.slice(emptyStart, modal.indexOf(') : step ===', emptyStart));
  assert.match(emptySlice, /Nenhuma conta disponível\./);
  assert.match(emptySlice, /onClick=\{openCreateAccount\}/);
  assert.doesNotMatch(emptySlice, /id="update-balance-amount"/);
});

test('fluxo exige confirmação explícita: "Salvar saldo" só avança para o resumo, não persiste', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /function handleReviewSubmit\(event\) \{/);
  const reviewStart = modal.indexOf('function handleReviewSubmit(event) {');
  const reviewEnd = modal.indexOf('\n  }', reviewStart);
  const reviewSlice = modal.slice(reviewStart, reviewEnd);
  assert.doesNotMatch(reviewSlice, /submitBalanceAdjustment/);
  assert.match(reviewSlice, /setStep\('confirm'\)/);
  assert.match(reviewSlice, /if \(!touched \|\| !selectedAccount\) return;/);
});

test('somente "Confirmar" no resumo chama submitBalanceAdjustment, sempre com a conta escolhida', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf('async function handleConfirm() {');
  assert.ok(confirmStart > -1);
  const confirmSlice = modal.slice(confirmStart, modal.indexOf('\n  }', confirmStart));
  assert.match(confirmSlice, /submitBalanceAdjustment\(\{/);
  assert.match(confirmSlice, /accountId: selectedAccount\.id,/);
});

test('clique duplo/repetido no Confirmar nunca dispara uma segunda chamada (guarda isSubmitting)', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf('async function handleConfirm() {');
  const confirmSlice = modal.slice(confirmStart, confirmStart + 120);
  assert.match(confirmSlice, /if \(isSubmitting \|\| !selectedAccount\) return;/);
  assert.match(modal, /<Button type="button" onClick=\{handleConfirm\} loading=\{isSubmitting\}>/);
});

test('modal nunca pode ser fechada (overlay/ESC) enquanto a persistência está em andamento', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /closeOnOverlayClick=\{!isSubmitting\}/);
  assert.match(modal, /closeOnEsc=\{!isSubmitting\}/);
  assert.match(modal, /function handleClose\(\) \{\s*if \(isSubmitting\) return;/);
});

test('erro de persistência nunca altera o saldo -- estado permanece em "confirm" com a mensagem exibida', async () => {
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

test('confirmação mostra obrigatoriamente saldo atual da conta escolhida, novo saldo, ajuste, conta e (se houver) descrição', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf("step === 'confirm' ? (");
  const confirmSlice = modal.slice(confirmStart, modal.indexOf("Concluir", confirmStart));
  assert.match(confirmSlice, /<dt>Saldo atual<\/dt>/);
  assert.match(confirmSlice, /formatCurrency\(currentBalance\)/);
  assert.match(confirmSlice, /<dt>Novo saldo<\/dt>/);
  assert.match(confirmSlice, /<dt>Ajuste registrado<\/dt>/);
  assert.match(confirmSlice, /<dt>Conta<\/dt>/);
  assert.match(confirmSlice, /<dd>\{selectedAccount\?\.name\}<\/dd>/);
  assert.match(confirmSlice, /note\.trim\(\) \? \(/);
});

test('saldo atual usado no cálculo é o da CONTA escolhida (derived_balance), nunca o agregado do workspace', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /const currentBalance = Number\(selectedAccount\?\.derived_balance \?\? selectedAccount\?\.initial_balance \?\? 0\);/);
  assert.doesNotMatch(modal, /currentBalance.*prop|props\.currentBalance/);
});

test('cada abertura da modal gera um novo client_operation_id (idempotência por tentativa) -- via remontagem por key no pai', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(modal, /operationIdRef\.current = generateOperationId\(\);/);
  assert.match(records, /key=\{balanceModalOpen \? 'balance-modal-open' : 'balance-modal-closed'\}/);
});

test('não adiciona campos fora do especificado: sem categoria, data ou tipo no formulário', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.doesNotMatch(modal, /id="update-balance-category"|id="update-balance-date"|id="update-balance-type"/);
});

// ============================================================================
// BLOCO REGISTROS iOS (refino visual): a modal compartilhada (Modal.jsx) usa
// tokens --uf-* que resolvem claros quando data-theme="light" -- redefinimos
// esses tokens localmente em .balanceDialog/.accountDialogDark para forçar a
// identidade escura oficial, sem alterar o Modal.jsx compartilhado (que
// continua reativo ao tema nas demais telas do produto).
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

test('.darkOverlay força fundo escuro com blur, mesmo se a folha de estilo do Modal compartilhado carregar depois', async () => {
  const css = await source('./UpdateBalanceModal.module.css');
  const overlayStart = css.indexOf('.darkOverlay {');
  const overlaySlice = css.slice(overlayStart, css.indexOf('}', overlayStart));
  assert.match(overlaySlice, /background: rgba\(3, 8, 20, \.68\) !important;/);
  assert.match(overlaySlice, /backdrop-filter: blur\(8px\) !important;/);
});

test('sub-fluxo "Criar conta" reaproveita os mesmos tokens escuros (className/overlayClassName), consistente com a modal de saldo', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const fmStart = modal.indexOf('<FinanceAccountModal');
  const fmSlice = modal.slice(fmStart, modal.indexOf('/>', fmStart));
  assert.match(fmSlice, /className=\{styles\.accountDialogDark\}/);
  assert.match(fmSlice, /overlayClassName=\{styles\.darkOverlay\}/);
});
