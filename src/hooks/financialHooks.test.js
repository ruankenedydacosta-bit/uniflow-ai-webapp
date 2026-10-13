import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useAccounts } from './useAccounts.js';
import { useCategories } from './useCategories.js';
import { useTransactions } from './useTransactions.js';
import { useFinancialBalances } from './useFinancialBalances.js';
import { buildTransactionUpdatePayload } from '../services/transactionService.js';
import {
  cloneRecords,
  createDemoRecord,
  removeRecord,
  upsertRecord,
} from './financialHookUtils.js';
import { getFinanceErrorMessage } from '../pages/financeiro/financeUiUtils.js';
import {
  buildTransactionMutationPayload,
  createTransactionDuplicateForm,
  createTransactionEditForm,
  getSelectableTransactionAccounts,
  localDateKey,
  resolveTransactionDescription,
} from '../pages/financeiro/transactionFormUtils.js';

function renderHook(useHook, props) {
  let observedState;

  function HookProbe() {
    observedState = useHook(props);
    return null;
  }

  renderToStaticMarkup(createElement(HookProbe));
  return observedState;
}

test('useAccounts inicia com contas e tipos do fallback demo', () => {
  const state = renderHook(useAccounts, {
    fallbackAccounts: [{ id: 'account-1', name: 'Conta principal' }],
    fallbackAccountTypes: [{ code: 'checking', name: 'Conta corrente' }],
  });

  assert.equal(state.isDemoMode, true);
  assert.equal(state.accounts[0].name, 'Conta principal');
  assert.equal(state.accountTypes[0].code, 'checking');
  assert.equal(typeof state.saveAccount, 'function');
  assert.equal(typeof state.archiveAccount, 'function');
  assert.equal(typeof state.removeAccount, 'function');
});

test('useCategories inicia com catalogo global do fallback', () => {
  const state = renderHook(useCategories, {
    fallbackCategories: [
      { id: 'category-1', name: 'Alimentação', is_system: true },
    ],
  });

  assert.equal(state.isDemoMode, true);
  assert.equal(state.categories[0].is_system, true);
  assert.equal(typeof state.saveCategory, 'function');
  assert.equal(typeof state.removeCategory, 'function');
});

test('useTransactions inicia com lancamentos locais', () => {
  const state = renderHook(useTransactions, {
    fallbackTransactions: [
      { id: 'transaction-1', description: 'Mercado', amount: 120 },
    ],
  });

  assert.equal(state.isDemoMode, true);
  assert.equal(state.transactions[0].description, 'Mercado');
  assert.equal(typeof state.saveTransaction, 'function');
  assert.equal(typeof state.removeTransaction, 'function');
});

test('helpers mantem CRUD local imutavel', () => {
  const original = [{ id: 'one', name: 'Original' }];
  const cloned = cloneRecords(original);
  const inserted = createDemoRecord('demo', { name: 'Nova' });
  const withInsert = upsertRecord(cloned, inserted);
  const withUpdate = upsertRecord(withInsert, { ...inserted, name: 'Atualizada' });
  const withoutRecord = removeRecord(withUpdate, inserted.id);

  assert.notEqual(cloned, original);
  assert.equal(original[0].name, 'Original');
  assert.equal(withInsert.length, 2);
  assert.equal(withUpdate[0].name, 'Atualizada');
  assert.deepEqual(withoutRecord, original);
});

test('mensagens tecnicas recebem fallback humano', () => {
  const technicalError = {
    code: '23503',
    message: 'insert or update violates foreign key constraint',
  };

  assert.equal(
    getFinanceErrorMessage(technicalError, 'Não foi possível concluir.'),
    'Não foi possível concluir.',
  );
  assert.equal(
    getFinanceErrorMessage(
      { code: 'INVALID_TRANSACTION_REQUEST', message: 'Valor inválido.' },
      'Fallback',
    ),
    'Valor inválido.',
  );
});

test('useFinancialBalances expõe o contrato de atualização derivada', () => {
  const state = renderHook(useFinancialBalances, { workspaceId: null });

  assert.deepEqual(state.accountBalances, []);
  assert.equal(state.workspaceBalance, null);
  assert.equal(typeof state.refresh, 'function');
});

test('Financeiro usa workspace da sessao nos quatro hooks de dados + useWorkspaceRole', async () => {
  const source = await readFile(
    new URL('../pages/FinanceiroPage.jsx', import.meta.url),
    'utf8',
  );
  const workspaceBindings = source.match(/workspaceId: workspace\?\.id/g) ?? [];

  assert.match(source, /useSession\(\)/);
  // 4 hooks de dados (accounts/categories/transactions/balances) + 1
  // useWorkspaceRole (gate de permissao, Subfase 10.2) = 5 bindings.
  assert.equal(workspaceBindings.length, 5);
});

test('saldo derivado usa RPCs sem receber workspace arbitrário', async () => {
  const source = await readFile(
    new URL('../services/financialBalanceService.js', import.meta.url),
    'utf8',
  );

  assert.match(source, /get_derived_account_balances/);
  assert.match(source, /get_derived_workspace_balance/);
  assert.doesNotMatch(source, /workspaceId|p_workspace_id/);
});

test('modal de conta preserva initial_balance internamente sem expor Saldo na UI', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /initial_balance: balance/);
  assert.doesNotMatch(source, /Saldo inicial|derived_balance/);
  assert.doesNotMatch(source, /current_balance/);
});

test('edicao preserva conta arquivada vinculada e monta payload seguro', () => {
  const transaction = {
    id: 'transaction-id',
    workspace_id: 'workspace-id',
    account_id: 'archived-account',
    destination_account_id: null,
    category_id: 'category-id',
    transaction_type: 'expense',
    description: 'Mercado original',
    amount: '120.50',
    transaction_date: '2026-07-10',
    status: 'pending',
    source_type: 'manual',
  };
  const form = createTransactionEditForm(transaction);
  const selectableAccounts = getSelectableTransactionAccounts(
    [
      { id: 'active-account', is_active: true },
      { id: 'archived-account', is_active: false },
      { id: 'other-archived-account', is_active: false },
    ],
    transaction.id,
    form,
  );
  const modalPayload = buildTransactionMutationPayload({
    ...form,
    description: 'Mercado atualizado',
    amount: '145.90',
  });
  const servicePayload = buildTransactionUpdatePayload({
    ...transaction,
    ...modalPayload,
    external_provider: 'nao-enviar',
    created_by: 'nao-enviar',
  });

  assert.deepEqual(
    selectableAccounts.map((account) => account.id),
    ['active-account', 'archived-account'],
  );
  assert.equal(form.account_id, 'archived-account');
  assert.equal(servicePayload.description, 'Mercado atualizado');
  assert.equal(servicePayload.amount, '145.90');
  assert.equal(servicePayload.status, 'pending');
  assert.equal('id' in servicePayload, false);
  assert.equal('workspace_id' in servicePayload, false);
  assert.equal('source_type' in servicePayload, false);
  assert.equal('external_provider' in servicePayload, false);
  assert.equal('created_by' in servicePayload, false);
});

test('exclusao de conta verifica dependencias no mesmo workspace', async () => {
  const accountService = await readFile(
    new URL('../services/accountService.js', import.meta.url),
    'utf8',
  );
  const accountModal = await readFile(
    new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );

  assert.match(accountService, /\.eq\('workspace_id', workspaceId\)/);
  assert.match(accountService, /account_id\.eq\.\$\{accountId\}/);
  assert.match(accountService, /destination_account_id\.eq\.\$\{accountId\}/);
  assert.match(accountService, /ACCOUNT_HAS_DEPENDENCIES/);
  assert.match(accountModal, /accountState\.removeAccount\(accountId\)/);
  assert.match(accountModal, /Confirmar exclusão/);
});

test('edição e exclusão de transação atualizam dados financeiros derivados', async () => {
  const transactionModal = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  const financePage = await readFile(
    new URL('../pages/FinanceiroPage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(transactionModal, /transactionState\.saveTransaction/);
  assert.match(transactionModal, /transactionState\.removeTransaction/);
  assert.match(transactionModal, /await onChanged\?\.\(\)/);
  assert.match(financePage, /transactionState\.refresh\(\)/);
  assert.match(financePage, /balanceState\.refresh\(\)/);
  assert.match(financePage, /const mobileError = activeDialog\s*\? null/);
});


test('duplicar lançamento pré-popula um formulário de criação sem reaproveitar id/status/data', () => {
  const original = {
    id: 'transaction-original',
    workspace_id: 'workspace-id',
    account_id: 'account-1',
    destination_account_id: null,
    category_id: 'category-1',
    transaction_type: 'expense',
    description: 'Aluguel',
    amount: '1500.00',
    transaction_date: '2026-01-05',
    status: 'completed',
    payment_method: 'Pix',
    notes: 'Referente a janeiro',
  };

  const duplicateForm = createTransactionDuplicateForm(original);
  // Data local: depois das 21h em São Paulo o UTC já está no dia seguinte.
  const today = localDateKey();

  assert.equal(duplicateForm.description, 'Aluguel');
  assert.equal(duplicateForm.amount, '1500.00');
  assert.equal(duplicateForm.account_id, 'account-1');
  assert.equal(duplicateForm.category_id, 'category-1');
  assert.equal(duplicateForm.payment_method, 'Pix');
  assert.equal(duplicateForm.notes, 'Referente a janeiro');
  assert.equal(duplicateForm.transaction_date, today);
  assert.equal(duplicateForm.status, 'completed');
  assert.equal('id' in duplicateForm, false);

  const payload = buildTransactionMutationPayload(duplicateForm);
  assert.equal('id' in payload, false);
  assert.equal(payload.description, 'Aluguel');
  assert.equal(payload.transaction_date, today);
});

test('payment_method e notes vazios viram null no payload (colunas reais, opcionais)', () => {
  const form = {
    account_id: 'account-1',
    destination_account_id: '',
    category_id: '',
    transaction_type: 'income',
    description: 'Salário',
    amount: '5000',
    transaction_date: '2026-07-05',
    status: 'completed',
    payment_method: '   ',
    notes: '',
  };

  const payload = buildTransactionMutationPayload(form);
  assert.equal(payload.payment_method, null);
  assert.equal(payload.notes, null);
});

// --- Subfase 10.2: bloqueio de fechamento/duplo submit no FinanceTransactionModal ----

test('handleClose retorna cedo durante mutacao (nao fecha)', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /function handleClose\(\) \{\s*\n\s*if \(transactionState\.isMutating\) return;/,
  );
});

test('Modal do lancamento bloqueia ESC e overlay durante mutacao ou confirmacao destrutiva', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /closeOnOverlayClick=\{!transactionState\.isMutating && !isDeleteConfirmOpen\}/);
  assert.match(source, /closeOnEsc=\{!transactionState\.isMutating && !isDeleteConfirmOpen\}/);
});

test('handleSubmit retorna cedo durante mutacao (guarda explicita, nao depende so do disabled visual)', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /async function handleSubmit\(event\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*if \(transactionState\.isMutating \|\| !canManage\) return;/,
  );
});

test('canSubmit inclui !transactionState.isMutating e canManage -- o botao de submit fica realmente desabilitado durante mutacao, nao so visualmente (loading)', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /const canSubmit = Boolean\(\s*\n\s*canManage &&\s*\n\s*!transactionState\.isMutating &&/,
  );
  assert.match(source, /<Button\s*\n\s*type="submit"\s*\n\s*loading=\{transactionState\.isMutating\}\s*\n\s*disabled=\{!canSubmit\}/);
});

test('clique duplo nao inicia duas operacoes: submit e handlers secundarios (editar\\/duplicar\\/excluir\\/cancelar edicao) ficam desabilitados durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /disabled=\{transactionState\.isMutating \|\| !canManage\}\s*\n\s*title=\{!canManage \? MANAGE_BLOCKED_TITLE : undefined\}\s*\n\s*onClick=\{\(\) => handleEdit\(transaction\)\}/);
  assert.match(source, /disabled=\{transactionState\.isMutating \|\| !canManage\}\s*\n\s*title=\{!canManage \? MANAGE_BLOCKED_TITLE : undefined\}\s*\n\s*onClick=\{\(\) => handleDuplicate\(transaction\)\}/);
  assert.match(source, /<Button variant="outline" onClick=\{resetForm\} disabled=\{transactionState\.isMutating\}>/);
});

test('handleDuplicate e handleEdit retornam cedo durante mutacao ou sem permissao (segunda camada, nao depende so do disabled)', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /function handleEdit\(transaction\) \{\s*\n\s*if \(transactionState\.isMutating \|\| !canManage\) return;/,
  );
  assert.match(
    source,
    /function handleDuplicate\(transaction\) \{\s*\n\s*if \(transactionState\.isMutating \|\| !canManage\) return;/,
  );
});

test('handleDelete retorna cedo durante mutacao e nunca dispara duas vezes -- reusa a mesma trava de isMutating', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /async function handleDelete\(transactionId\) \{\s*\n\s*if \(transactionState\.isMutating\) return;/,
  );
});

test('parcelamento cria todas as parcelas num insert só: falha no meio não deixa a compra pela metade (#221)', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /const result = await transactionState\.saveTransactions\(payloads\);/);
  assert.doesNotMatch(source, /for \(const payload of payloads\)/);
  const service = await readFile(new URL('../services/transactionService.js', import.meta.url), 'utf8');
  assert.match(service, /\.insert\(payloads\)\s*\.select\(TRANSACTION_FIELDS\);/);
});

test('a correcao de concorrencia nao interrompe chamadas sequenciais legitimas: useTransactions documenta explicitamente por que o loop de parcelas continua funcionando com mutationRef', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  assert.match(source, /Chamadas sequenciais aguardadas/);
  assert.match(source, /o loop so avanca depois que a Promise\s*\n\s*\/\/ anterior resolve/);
});

// --- Subfase 10.2: trava sincrona em useTransactions ---------------------------------

test('useTransactions usa mutationRef como trava sincrona -- mesmo padrao de useClients.js/useCrmPipeline.js/useAgenda.js', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  assert.match(source, /const mutationRef = useRef\(false\);/);
});

test('mutacao concorrente externa e bloqueada: performMutation retorna TRANSACTION_MUTATION_IN_PROGRESS sem chamar mutationFn quando mutationRef.current e true', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /if \(mutationRef\.current\) \{\s*\n\s*return \{\s*\n\s*data: null,\s*\n\s*error: \{\s*\n\s*code: 'TRANSACTION_MUTATION_IN_PROGRESS',/,
  );
});

test('a trava e liberada em finally -- tanto apos sucesso quanto apos erro', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /\} finally \{\s*\n\s*mutationRef\.current = false;\s*\n\s*setIsMutating\(false\);\s*\n\s*\}/,
  );
});

test('performMutation centraliza saveTransaction/removeTransaction -- setIsMutating(true) aparece uma unica vez no arquivo', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  const occurrences = source.match(/setIsMutating\(true\)/g) ?? [];
  assert.equal(occurrences.length, 1);
});

test('API publica de useTransactions preservada apos o refactor (mesmos nomes, sem refresh novo pos-mutacao)', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  // saveTransactions entrou para as parcelas de uma compra (#221) e as
  // mutações da série recorrente (#222) depois; os nomes anteriores seguem iguais.
  assert.match(source, /refresh,\s*\n\s*removeTransaction,\s*\n\s*saveTransaction,\s*\n\s*saveTransactions,\s*\n\s*createSeries,\s*\n\s*saveSeriesTransactions,\s*\n\s*removeSeriesTransactions,\s*\n\s*clearError: \(\) => setError\(null\),/);
  assert.doesNotMatch(source, /applyLocalUpdate[\s\S]{0,80}refresh\(\)/);
});

// --- R2: janela de periodo/status opcionais em useTransactions ------------

test('useTransactions aceita status/dateFrom/dateTo opcionais, sem quebrar o contrato existente (workspaceId/fallbackTransactions/limit preservados)', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /export function useTransactions\(\{\s*\n\s*workspaceId,\s*\n\s*fallbackTransactions = EMPTY_ARRAY,\s*\n\s*limit = 50,\s*\n\s*status,\s*\n\s*dateFrom,\s*\n\s*dateTo,\s*\n\s*\} = \{\}\) \{/,
  );
});

test('useTransactions usa listTransactionsForPeriod (paginado) quando dateFrom ou dateTo sao informados -- nunca depende do limit padrao nesse caso', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  assert.match(source, /import \{[\s\S]*?listTransactionsForPeriod,[\s\S]*?\} from '\.\.\/services\/transactionService\.js';/);
  assert.match(
    source,
    /const result = dateFrom \|\| dateTo\s*\n\s*\? await listTransactionsForPeriod\(workspaceId, \{ dateFrom, dateTo, status \}\)\s*\n\s*: await listTransactions\(workspaceId, \{ limit, status \}\);/,
  );
});

test('useTransactions sem dateFrom/dateTo mantem o comportamento historico (listTransactions com limit) -- Financeiro/Uni/Dashboard nao mudam', async () => {
  const source = await readFile(new URL('./useTransactions.js', import.meta.url), 'utf8');
  assert.match(source, /: await listTransactions\(workspaceId, \{ limit, status \}\);/);
});

test('service transactionService.js permanece intocado pelo refactor do hook', async () => {
  const source = await readFile(new URL('../services/transactionService.js', import.meta.url), 'utf8');
  assert.match(source, /export async function createTransaction/);
  assert.match(source, /export async function updateTransaction/);
  assert.match(source, /export async function deleteTransaction/);
});

// --- Subfase 10.2: gates de permissao no Financeiro -----------------------------------

test('FinanceiroPage deriva canManageFinance de workspaceRole.canUpdate (owner/admin/member), isLoading e mutacao de qualquer um dos 3 estados', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ useAccounts, useCategories, useFinancialBalances, useTransactions, useWorkspaceRole \} from '\.\.\/hooks';/);
  assert.match(
    source,
    /const canManageFinance =\s*\n\s*workspaceRole\.canUpdate === true && !workspaceRole\.isLoading && !isAnyFinanceMutating;/,
  );
});

test('exclusao de transacao/categoria soma canDelete OU created_by === user.id (RLS mais permissiva que canDelete puro); contas usam somente canDelete (sem carve-out de criador)', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(
    source,
    /function canDeleteTransaction\(transaction\) \{\s*\n\s*return workspaceRole\.canDelete === true \|\| transaction\?\.created_by === user\?\.id;/,
  );
  assert.match(
    source,
    /function canDeleteCategory\(category\) \{\s*\n\s*return workspaceRole\.canDelete === true \|\| category\?\.created_by === user\?\.id;/,
  );
  assert.match(source, /const canDeleteAccount = workspaceRole\.canDelete === true;/);
});

test('openDialog, duplicateTransaction e os handlers mobile de editar\\/excluir\\/duplicar retornam cedo sem permissao (viewer nao abre criacao/edicao/duplicacao por chamada direta ao handler)', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /function openDialog\(dialog, requestedTransactionType = 'expense'\) \{\s*\n\s*if \(!canManageFinance\) return;/);
  assert.match(source, /function duplicateTransaction\(transaction\) \{\s*\n\s*if \(!canManageFinance\) return;/);
  assert.match(source, /if \(!transaction \|\| !canDeleteTransaction\(transaction\)\) return;/);
  assert.match(source, /onEditTransaction=\{\(transaction\) => \{\s*\n\s*if \(!canManageFinance\) return;/);
});

test('member (canUpdate true) consegue abrir criacao/edicao; owner/admin mantem acesso -- mesma fonte de verdade de workspaceRoleUtils.js', async () => {
  const roleUtils = await readFile(new URL('./workspaceRoleUtils.js', import.meta.url), 'utf8');
  assert.match(roleUtils, /UPDATE_ROLES = Object\.freeze\(\['owner', 'admin', 'member'\]\)/);
  assert.match(roleUtils, /DELETE_ROLES = Object\.freeze\(\['owner', 'admin'\]\)/);
});

test('botoes de gerenciamento (Contas/Categorias/Novo lançamento) ficam desabilitados com title explicativo quando bloqueados', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /disabled=\{!canManageFinance\}\s*\n\s*title=\{getManageFinanceTitle\(\)\}\s*\n\s*onClick=\{\(\) => openDialog\('accounts'\)\}/);
  assert.match(source, /disabled=\{!canManageFinance\}\s*\n\s*title=\{getManageFinanceTitle\(\)\}\s*\n\s*onClick=\{\(\) => openDialog\('categories'\)\}/);
  assert.match(source, /disabled=\{!canManageFinance\}\s*\n\s*title=\{getManageFinanceTitle\(\)\}\s*\n\s*onClick=\{\(\) => openDialog\('transactions'\)\}/);
});

test('role loading bloqueia mutacoes: getManageFinanceTitle informa "Carregando permissões..." e canManageFinance considera workspaceRole.isLoading', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(workspaceRole\.isLoading\) return 'Carregando permissões\.\.\.';/);
});

test('FinanceAccountModal e FinanceCategoryModal recebem canManage\\/canDelete(Category) como props de FinanceiroPage, derivando a permissao na pagina (nao espalhada)', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /<FinanceAccountModal[\s\S]{0,200}canManage=\{canManageFinance\}\s*\n\s*canDelete=\{canDeleteAccount\}/);
  assert.match(source, /<FinanceCategoryModal[\s\S]{0,200}canManage=\{canManageFinance\}\s*\n\s*canDeleteCategory=\{canDeleteCategory\}/);
  assert.match(source, /<FinanceTransactionModal[\s\S]{0,600}canManage=\{canManageFinance\}\s*\n\s*canDeleteTransaction=\{canDeleteTransaction\}/);
});

test('"Registrar por voz" fica desabilitado com title "Disponível em breve." (mesmo padrao de CRM/Clientes), sem novo handler', async () => {
  const source = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /<Button disabled title="Disponível em breve\.">Registrar por voz<\/Button>/);
});

// --- Subfase 10.3: robustez de fechamento/duplo submit em FinanceAccountModal -------

test('FinanceAccountModal: handleClose retorna cedo durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /function handleClose\(\) \{\s*\n\s*if \(accountState\.isMutating\) return;/);
});

test('FinanceAccountModal: Modal bloqueia ESC e overlay durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /closeOnOverlayClick=\{!accountState\.isMutating\}/);
  assert.match(source, /closeOnEsc=\{!accountState\.isMutating\}/);
});

test('FinanceAccountModal: submit fica desabilitado e retorna cedo durante mutacao (nao depende so de loading visual)', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /async function handleSubmit\(event\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*if \(accountState\.isMutating \|\| !canManage\) return;/,
  );
  assert.match(source, /disabled=\{!canManage \|\| accountState\.isMutating \|\| !form\.name\.trim\(\)\}/);
});

test('FinanceAccountModal: exclusao nao dispara duas vezes -- handleDelete retorna cedo durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /async function handleDelete\(accountId\) \{\s*\n\s*if \(accountState\.isMutating \|\| !canDelete\) return;/,
  );
});

test('FinanceAccountModal: cancelamento (Cancelar edição) fica bloqueado durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /<OutlineButton variant="ghost" onClick=\{resetForm\} disabled=\{accountState\.isMutating\}>\s*\n\s*Cancelar edição/,
  );
});

test('FinanceAccountModal: edicao (handleEdit/troca de registro) fica bloqueada durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /function handleEdit\(account\) \{\s*\n\s*if \(accountState\.isMutating \|\| !canManage\) return;/,
  );
  assert.match(source, /disabled=\{accountState\.isMutating \|\| !canManage\}\s*\n\s*title=\{!canManage \? MANAGE_BLOCKED_TITLE : undefined\}\s*\n\s*onClick=\{\(\) => handleEdit\(account\)\}/);
});

test('FinanceAccountModal: preserva a regra de exclusao apenas para owner/admin (canDelete sem carve-out de criador)', async () => {
  const financeiroPage = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(financeiroPage, /const canDeleteAccount = workspaceRole\.canDelete === true;/);
});

// --- Subfase 10.3: robustez de fechamento/duplo submit em FinanceCategoryModal ------

test('FinanceCategoryModal: handleClose retorna cedo durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceCategoryModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /function handleClose\(\) \{\s*\n\s*if \(categoryState\.isMutating\) return;/);
});

test('FinanceCategoryModal: Modal bloqueia ESC e overlay durante mutacao; botao "Fechar" do footer tambem fica desabilitado', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceCategoryModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /closeOnOverlayClick=\{!categoryState\.isMutating\}/);
  assert.match(source, /closeOnEsc=\{!categoryState\.isMutating\}/);
  assert.match(
    source,
    /<Button variant="ghost" onClick=\{handleClose\} disabled=\{categoryState\.isMutating\}>\s*\n\s*Fechar/,
  );
});

test('FinanceCategoryModal: submit fica desabilitado e retorna cedo durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceCategoryModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /async function handleSubmit\(event\) \{\s*\n\s*event\.preventDefault\(\);\s*\n\s*if \(categoryState\.isMutating \|\| !canManage\) return;/,
  );
  assert.match(source, /disabled=\{!canManage \|\| categoryState\.isMutating \|\| !form\.name\.trim\(\)\}/);
});

test('FinanceCategoryModal: exclusao nao dispara duas vezes -- handleDelete retorna cedo durante mutacao', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceCategoryModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /async function handleDelete\(categoryId\) \{\s*\n\s*if \(categoryState\.isMutating\) return;/,
  );
});

test('FinanceCategoryModal: cancelamento fica bloqueado durante mutacao; edicao/duplicacao de registro tambem', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceCategoryModal.jsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /<Button variant="ghost" onClick=\{resetForm\} disabled=\{categoryState\.isMutating\}>\s*\n\s*Cancelar edição/,
  );
  assert.match(
    source,
    /function handleEdit\(category\) \{\s*\n\s*if \(categoryState\.isMutating \|\| !canManage\) return;/,
  );
});

test('FinanceCategoryModal: preserva a regra confirmada de exclusao -- owner/admin OU o proprio criador (nao simplificada para um booleano global)', async () => {
  const source = await readFile(
    new URL('../pages/financeiro/FinanceCategoryModal.jsx', import.meta.url),
    'utf8',
  );
  const financeiroPage = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(source, /canDeleteCategory = \(\) => true/);
  assert.match(source, /const canDeleteThisCategory = canDeleteCategory\(category\);/);
  assert.match(
    financeiroPage,
    /function canDeleteCategory\(category\) \{\s*\n\s*return workspaceRole\.canDelete === true \|\| category\?\.created_by === user\?\.id;/,
  );
});

// --- Subfase 10.3: comportamento por papel (viewer/member/owner/admin) -------------------

test('viewer continua bloqueado nos tres modais: canManage=false desabilita submit/editar em Account, Category e Transaction', async () => {
  const accountSource = await readFile(new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url), 'utf8');
  const categorySource = await readFile(new URL('../pages/financeiro/FinanceCategoryModal.jsx', import.meta.url), 'utf8');
  const transactionSource = await readFile(new URL('../pages/financeiro/FinanceTransactionModal.jsx', import.meta.url), 'utf8');
  assert.match(accountSource, /disabled=\{!canManage \|\| accountState\.isMutating \|\| !form\.name\.trim\(\)\}/);
  assert.match(categorySource, /disabled=\{!canManage \|\| categoryState\.isMutating \|\| !form\.name\.trim\(\)\}/);
  assert.match(transactionSource, /canManage &&\s*\n\s*!transactionState\.isMutating &&/);
});

test('member mantem criacao e edicao (canManageFinance depende so de canUpdate, igual para os 3 modais)', async () => {
  const financeiroPage = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(
    financeiroPage,
    /const canManageFinance =\s*\n\s*workspaceRole\.canUpdate === true && !workspaceRole\.isLoading && !isAnyFinanceMutating;/,
  );
});

test('member nao exclui conta (canDeleteAccount usa canDelete puro, owner/admin apenas) mas pode excluir categoria propria (canDeleteCategory aceita created_by)', async () => {
  const financeiroPage = await readFile(new URL('../pages/FinanceiroPage.jsx', import.meta.url), 'utf8');
  assert.match(financeiroPage, /const canDeleteAccount = workspaceRole\.canDelete === true;/);
  assert.match(financeiroPage, /category\?\.created_by === user\?\.id/);
});

test('owner/admin mantem acesso total (canUpdate e canDelete ambos true na derivacao de deriveWorkspaceRole)', async () => {
  const roleUtils = await readFile(new URL('./workspaceRoleUtils.js', import.meta.url), 'utf8');
  assert.match(
    roleUtils,
    /canUpdate: Boolean\(role\) && UPDATE_ROLES\.includes\(role\),\s*\n\s*canDelete: Boolean\(role\) && DELETE_ROLES\.includes\(role\),/,
  );
});

test('comportamento normal (criar/editar/excluir contas e categorias) continua funcionando apos a mutacao terminar -- guardas checam isMutating, nunca bloqueiam permanentemente', async () => {
  const accountSource = await readFile(new URL('../pages/financeiro/FinanceAccountModal.jsx', import.meta.url), 'utf8');
  const categorySource = await readFile(new URL('../pages/financeiro/FinanceCategoryModal.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(accountSource, /if \(true\) return;/);
  assert.doesNotMatch(categorySource, /if \(true\) return;/);
  assert.match(accountSource, /accountState\.saveAccount\(/);
  assert.match(categorySource, /categoryState\.saveCategory\(form, editingId\)/);
});

test('useAccounts.js e useCategories.js permanecem intocados -- bloqueio integral nos modais ja elimina a concorrencia originada pela UI (unico ponto de entrada das mutacoes)', async () => {
  const useAccountsSource = await readFile(new URL('./useAccounts.js', import.meta.url), 'utf8');
  const useCategoriesSource = await readFile(new URL('./useCategories.js', import.meta.url), 'utf8');
  assert.doesNotMatch(useAccountsSource, /mutationRef/);
  assert.doesNotMatch(useCategoriesSource, /mutationRef/);
});

test('payment_method e notes preenchidos sao enviados com trim no payload', () => {
  const form = {
    account_id: 'account-1',
    destination_account_id: '',
    category_id: '',
    transaction_type: 'expense',
    description: 'Internet',
    amount: '120',
    transaction_date: '2026-07-05',
    status: 'completed',
    payment_method: '  Cartão de crédito  ',
    notes: '  Plano anual  ',
  };

  const payload = buildTransactionMutationPayload(form);
  assert.equal(payload.payment_method, 'Cartão de crédito');
  assert.equal(payload.notes, 'Plano anual');
});

// ============================================================================
// BLOCO REGISTROS iOS: descrição é opcional na UI, mas transactions.description
// no banco é NOT NULL + CHECK não-vazia (supabase/migrations/20260711000200_002_financial_core.sql).
// resolveTransactionDescription sintetiza um valor neutro e honesto só para
// persistência quando o usuário deixa o campo em branco -- nunca inventa
// detalhes, nunca obriga o usuário a digitar.
// ============================================================================

test('resolveTransactionDescription usa o texto digitado (com trim) quando presente', () => {
  assert.equal(
    resolveTransactionDescription({ description: '  Mercado do mês  ', transaction_type: 'expense' }),
    'Mercado do mês',
  );
});

test('resolveTransactionDescription sintetiza um rótulo neutro honesto por tipo quando o campo está vazio', () => {
  assert.equal(resolveTransactionDescription({ description: '', transaction_type: 'income' }), 'Entrada');
  assert.equal(resolveTransactionDescription({ description: '   ', transaction_type: 'expense' }), 'Saída');
  assert.equal(resolveTransactionDescription({ description: '', transaction_type: 'transfer' }), 'Transferência entre contas');
  assert.equal(resolveTransactionDescription({ description: '', transaction_type: 'adjustment' }), 'Ajuste de saldo');
});

test('buildTransactionMutationPayload nunca envia descrição vazia -- usa o fallback neutro quando o formulário não preenche', () => {
  const payload = buildTransactionMutationPayload({
    account_id: 'account-1',
    destination_account_id: '',
    category_id: '',
    transaction_type: 'expense',
    description: '',
    amount: '50',
    transaction_date: '2026-08-01',
    status: 'completed',
    payment_method: '',
    notes: '',
  });
  assert.equal(payload.description, 'Saída');
});
