// Correção (Bloco Saldo + Cobrança): testes estruturais (source-regex) sobre
// a extensão aditiva `autoCloseOnCreate` em FinanceAccountModal.jsx -- mesmo
// padrão já usado no projeto para componentes React (sem
// @testing-library/react disponível).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('autoCloseOnCreate nasce false -- comportamento padrão (gerenciar contas) intocado', async () => {
  const modal = await source('./FinanceAccountModal.jsx');
  assert.match(modal, /autoCloseOnCreate = false,/);
});

test('autoCloseOnCreate só fecha em CRIAÇÃO (isCreate), nunca ao editar uma conta existente', async () => {
  const modal = await source('./FinanceAccountModal.jsx');
  const fnStart = modal.indexOf('async function handleSubmit(event) {');
  const fnSlice = modal.slice(fnStart, modal.indexOf('\n  }', fnStart));
  assert.match(fnSlice, /const isCreate = !editingId;/);
  assert.match(fnSlice, /if \(autoCloseOnCreate && isCreate\) \{\s*\n\s*onClose\(\);/);
});

test('consumidores existentes (Financeiro desktop e Minhas Contas simplificado) nunca passam autoCloseOnCreate -- zero mudança de comportamento para eles', async () => {
  const [financeiroPage, simplifiedMyAccounts] = await Promise.all([
    source('../FinanceiroPage.jsx'),
    source('../../features/simplified-app/SimplifiedMyAccountsPage.jsx'),
  ]);
  assert.doesNotMatch(financeiroPage, /autoCloseOnCreate/);
  assert.doesNotMatch(simplifiedMyAccounts, /autoCloseOnCreate/);
});

// ============================================================================
// BLOCO REGISTROS iOS (refino visual): className/overlayClassName são
// aditivos (default undefined) -- FinanceiroPage.jsx e
// SimplifiedMyAccountsPage.jsx continuam reativos ao tema --uf-* do site,
// só o sub-fluxo "Criar conta" de UpdateBalanceModal.jsx força a
// identidade escura.
// ============================================================================

test('className/overlayClassName são opcionais e repassados ao Modal compartilhado via cx', async () => {
  const modal = await source('./FinanceAccountModal.jsx');
  assert.match(modal, /className,\s*\n\s*overlayClassName,/);
  assert.match(modal, /className=\{cx\(styles\.accountDialog, className\)\}/);
  assert.match(modal, /overlayClassName=\{overlayClassName\}/);
});

function sliceJsxTag(content, openTagNeedle) {
  const start = content.indexOf(openTagNeedle);
  assert.ok(start > -1, `${openTagNeedle} deve existir`);
  const closeSelf = content.indexOf('/>', start);
  const closeOpen = content.indexOf('>', start);
  const end = closeSelf > -1 && closeSelf < closeOpen + 20 ? closeSelf : closeOpen;
  return content.slice(start, end);
}

test('consumidores existentes (Financeiro desktop e Minhas Contas simplificado) nunca passam className/overlayClassName -- continuam reativos ao tema do site', async () => {
  const [financeiroPage, simplifiedMyAccounts] = await Promise.all([
    source('../FinanceiroPage.jsx'),
    source('../../features/simplified-app/SimplifiedMyAccountsPage.jsx'),
  ]);
  assert.doesNotMatch(sliceJsxTag(financeiroPage, '<FinanceAccountModal'), /overlayClassName|className=/);
  assert.doesNotMatch(sliceJsxTag(simplifiedMyAccounts, '<FinanceAccountModal'), /overlayClassName|className=/);
});
