// BLOCO FINAL DO MVP (Saldo manual) + CONTA-OPCIONAL (fase 2) -- testes
// estruturais (source-regex) sobre UpdateBalanceModal.jsx, mesmo padrão já
// usado no projeto para componentes React (sem @testing-library/react
// disponível -- ver src/features/uni-chat/components/ChatInput.test.js). A
// lógica pura de máscara/delta já é coberta por
// balanceAdjustmentFormUtils.test.js e balanceAdjustmentService.test.js.
//
// CONTA-OPCIONAL (fase 2): "Atualizar saldo" deixou de exigir escolher uma
// conta -- ajusta o saldo TOTAL do workspace (prop workspaceBalance,
// derivado via get_derived_workspace_balance()), nunca o saldo de uma conta
// específica. O sub-fluxo "Criar conta"/FinanceAccountModal e o estado
// vazio "Nenhuma conta disponível" foram removidos inteiramente -- a modal
// agora está sempre disponível e sempre mostra o formulário direto.
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

test('saldo atual vem da prop workspaceBalance (saldo TOTAL do workspace), nunca de uma conta específica', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /function UpdateBalanceModal\(\{ workspaceBalance, onChanged, onClose, open \}\)/);
  assert.match(modal, /const currentBalance = Number\(workspaceBalance \?\? 0\);/);
});

test('SimplifiedRecordsPage passa balanceState.workspaceBalance para a modal, não mais accountState', async () => {
  const records = await source('./SimplifiedRecordsPage.jsx');
  const start = records.indexOf('<UpdateBalanceModal');
  const slice = records.slice(start, records.indexOf('/>', start));
  assert.match(slice, /workspaceBalance=\{balanceState\.workspaceBalance\}/);
  assert.doesNotMatch(slice, /accountState=/);
});

test('"Salvar saldo" fica desabilitado só até o valor ser digitado (touched) -- nunca depende de conta', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  assert.match(modal, /<Button type="submit" disabled=\{!touched\}>/);
});

test('fluxo exige confirmação explícita: "Salvar saldo" só avança para o resumo, não persiste', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const reviewStart = modal.indexOf('function handleReviewSubmit(event) {');
  const reviewEnd = modal.indexOf('\n  }', reviewStart);
  const reviewSlice = modal.slice(reviewStart, reviewEnd);
  assert.doesNotMatch(reviewSlice, /submitBalanceAdjustment/);
  assert.match(reviewSlice, /setStep\('confirm'\)/);
  assert.match(reviewSlice, /if \(!touched\) return;/);
});

test('somente "Confirmar" no resumo chama submitBalanceAdjustment, sem accountId', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf('async function handleConfirm() {');
  assert.ok(confirmStart > -1);
  const confirmSlice = modal.slice(confirmStart, modal.indexOf('\n  }', confirmStart));
  assert.match(confirmSlice, /submitBalanceAdjustment\(\{/);
  assert.doesNotMatch(confirmSlice, /accountId:/);
});

test('clique duplo/repetido no Confirmar nunca dispara uma segunda chamada (guarda isSubmitting)', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf('async function handleConfirm() {');
  const confirmSlice = modal.slice(confirmStart, confirmStart + 120);
  assert.match(confirmSlice, /if \(isSubmitting\) return;/);
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

test('confirmação mostra saldo atual, novo saldo, ajuste e (se houver) descrição -- nunca uma linha de conta', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const confirmStart = modal.indexOf("step === 'confirm' ? (");
  const confirmSlice = modal.slice(confirmStart, modal.indexOf("Concluir", confirmStart));
  assert.match(confirmSlice, /<dt>Saldo atual<\/dt>/);
  assert.match(confirmSlice, /formatCurrency\(currentBalance\)/);
  assert.match(confirmSlice, /<dt>Novo saldo<\/dt>/);
  assert.match(confirmSlice, /<dt>Ajuste registrado<\/dt>/);
  assert.doesNotMatch(confirmSlice, /<dt>Conta<\/dt>/);
  assert.match(confirmSlice, /note\.trim\(\) \? \(/);
});

test('cada abertura da modal gera um novo client_operation_id (idempotência por tentativa) -- via remontagem por key no pai', async () => {
  const modal = await source('./UpdateBalanceModal.jsx');
  const records = await source('./SimplifiedRecordsPage.jsx');
  assert.match(modal, /operationIdRef\.current = generateOperationId\(\);/);
  assert.match(records, /key=\{balanceModalOpen \? 'balance-modal-open' : 'balance-modal-closed'\}/);
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

test('.darkOverlay força fundo escuro com blur, mesmo se a folha de estilo do Modal compartilhado carregar depois', async () => {
  const css = await source('./UpdateBalanceModal.module.css');
  const overlayStart = css.indexOf('.darkOverlay {');
  const overlaySlice = css.slice(overlayStart, css.indexOf('}', overlayStart));
  assert.match(overlaySlice, /background: rgba\(3, 8, 20, \.68\) !important;/);
  assert.match(overlaySlice, /backdrop-filter: blur\(8px\) !important;/);
});
