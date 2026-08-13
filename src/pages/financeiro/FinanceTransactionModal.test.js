// BLOCO REGISTROS iOS (refino visual + descrição opcional): testes
// estruturais (source-regex) sobre FinanceTransactionModal.jsx, mesmo
// padrão já usado no projeto para componentes React (sem
// @testing-library/react disponível -- ver financeTransactionModalFilters.test.js).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Descrição opcional (Valor e Data continuam obrigatórios; Categoria/Conta
// seguem a regra já existente).
// ============================================================================

test('campo Descrição nunca tem "required" e é claramente marcado como opcional', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const fieldStart = modal.indexOf('id="finance-transaction-description"');
  const fieldSlice = modal.slice(fieldStart, fieldStart + 300);
  assert.doesNotMatch(fieldSlice, /required/);
  assert.match(fieldSlice, /label="Descrição \(opcional\)"/);
  assert.match(fieldSlice, /placeholder=/);
});

test('Valor e Data continuam obrigatórios (required no JSX e em canSubmit)', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const amountStart = modal.indexOf('id="finance-transaction-amount"');
  assert.match(modal.slice(amountStart, amountStart + 400), /required/);
  const dateStart = modal.indexOf('id="finance-transaction-date"');
  assert.match(modal.slice(dateStart, dateStart + 400), /required/);

  const canSubmitStart = modal.indexOf('const canSubmit = Boolean(');
  const canSubmitSlice = modal.slice(canSubmitStart, modal.indexOf(');', canSubmitStart));
  assert.doesNotMatch(canSubmitSlice, /form\.description/);
  assert.match(canSubmitSlice, /form\.account_id/);
  assert.match(canSubmitSlice, /Number\(form\.amount\) > 0/);
  assert.match(canSubmitSlice, /form\.transaction_date/);
});

// ============================================================================
// Reorganização visual em 4 blocos (Dados principais / Informações
// opcionais / Ação / Lançamentos existentes) -- nunca um formulário longo
// único, sem alterar nenhuma função existente (criar/editar/duplicar/
// excluir/buscar/filtrar/exportar).
// ============================================================================

test('formulário é dividido em blocos com aria-label (Dados principais, Informações opcionais, Ação)', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /<section className={styles\.formBlock} aria-label="Dados principais">/);
  assert.match(modal, /<section className={styles\.formBlock} aria-label="Informações opcionais">/);
  assert.match(modal, /<section className={styles\.formBlock} aria-label="Ação">/);
  assert.match(modal, /<div className={styles\.formBlock} aria-label="Lançamentos existentes">/);
});

test('Bloco "Dados principais" contém Tipo, Conta, Categoria, Valor e Data', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const start = modal.indexOf('aria-label="Dados principais"');
  const slice = modal.slice(start, modal.indexOf('</section>', start));
  assert.match(slice, /finance-transaction-type/);
  assert.match(slice, /finance-transaction-account/);
  assert.match(slice, /finance-transaction-category/);
  assert.match(slice, /finance-transaction-amount/);
  assert.match(slice, /finance-transaction-date/);
  assert.doesNotMatch(slice, /finance-transaction-description/);
});

// Tela simplificada demais (feedback direto do usuário): Forma de pagamento
// e Observação foram removidas do formulário -- só Descrição sobrevive
// (é o texto usado como título de cada lançamento na lista de histórico).
test('Bloco "Informações opcionais" contém Descrição, Parcelas e Recorrência -- Forma de pagamento e Observação foram removidas', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const start = modal.indexOf('aria-label="Informações opcionais"');
  const slice = modal.slice(start, modal.indexOf('aria-label="Ação"', start));
  assert.match(slice, /finance-transaction-description/);
  assert.doesNotMatch(slice, /finance-transaction-payment-method/);
  assert.doesNotMatch(slice, /finance-transaction-notes/);
  assert.match(slice, /finance-transaction-installments/);
  assert.match(slice, /Lançamento recorrente/);
});

test('Bloco "Ação" contém o botão principal (criar/salvar lançamento)', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const start = modal.indexOf('aria-label="Ação"');
  const slice = modal.slice(start, modal.indexOf('</section>', start));
  assert.match(slice, /disabled=\{!canSubmit\}/);
  assert.match(slice, /editingId \? 'Salvar lançamento' : 'Criar lançamento'/);
});

// Feedback direto do usuário: excluir só existia na lista "Lançamentos
// existentes" mais abaixo -- ao editar um lançamento era preciso sair da
// edição e procurar a mesma linha na lista. Agora o bloco "Ação" (mesma
// linha de Cancelar edição/Salvar lançamento) também oferece Excluir,
// reaproveitando DeleteActions (confirmação em dois passos, nunca
// window.confirm) e handleDelete -- nenhum mecanismo de exclusão novo.
// Botões explícitos (variant="danger"/"outline") em vez de DeleteActions
// (variant="ghost") -- Excluir precisa ser reconhecível como destrutivo já
// no primeiro toque, não só depois de confirmar (feedback de usuário: "tem
// que estar mais nítido o botão excluir, tem que estar vermelho").
test('Bloco "Ação" oferece Excluir alinhado e abre a confirmação centralizada -- nunca injeta ações soltas no formulário', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const start = modal.indexOf('aria-label="Ação"');
  const slice = modal.slice(start, modal.indexOf('</section>', start));
  assert.match(slice, /editingId && editingTransaction && canDeleteTransaction\(editingTransaction\)/);
  assert.match(slice, /className=\{styles\.deleteButton\}[\s\S]*?variant="danger"[\s\S]*?Excluir/);
  assert.match(slice, /onClick=\{\(\) => handleRequestDelete\(editingId\)\}/);
  assert.doesNotMatch(slice, /Confirmar exclusão/);
  assert.doesNotMatch(slice, /pendingDeleteId === editingId/);
});

test('confirmação de exclusão usa alertdialog em portal, overlay com blur e somente ações Cancelar/Confirmar exclusão', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const css = await source('./FinanceTransactionModal.module.css');
  const start = modal.indexOf('function DeleteConfirmationDialog(');
  const end = modal.indexOf('// `className`/`overlayClassName`', start);
  const slice = modal.slice(start, end);
  assert.match(slice, /createPortal\(/);
  assert.match(slice, /role="alertdialog"/);
  assert.match(slice, /aria-modal="true"/);
  assert.match(slice, /Excluir lançamento\?/);
  assert.match(slice, /Essa ação não poderá ser desfeita\./);
  assert.match(slice, />\s*Cancelar\s*</);
  assert.match(slice, />\s*Confirmar exclusão\s*</);
  assert.match(css, /\.deleteConfirmOverlay \{[\s\S]*?backdrop-filter: blur\(10px\)/);
  assert.match(css, /\.deleteConfirmCard \{[\s\S]*?place-items|\.deleteConfirmOverlay \{[\s\S]*?place-items: center/);
});

test('Cancelar fecha somente a confirmação e preserva a edição; confirmar executa handleDelete real', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const cancelStart = modal.indexOf('function handleCancelDelete()');
  const cancelSlice = modal.slice(cancelStart, modal.indexOf('async function handleSubmit', cancelStart));
  assert.match(cancelSlice, /setPendingDeleteId\(null\)/);
  assert.doesNotMatch(cancelSlice, /removeTransaction|resetForm\(\)|onClose/);
  assert.match(modal, /onConfirm=\{\(\) => handleDelete\(pendingDeleteId\)\}/);
  assert.match(modal, /const result = await transactionState\.removeTransaction\(id\)/);
});

test('"Cancelar edição" usa contorno neutro (outline), nunca ghost invisível ao lado dos botões coloridos', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /<Button variant="outline" onClick=\{resetForm\} disabled=\{transactionState\.isMutating\}>\s*\n\s*Cancelar edição/);
});

// ============================================================================
// Identidade escura (opt-in, sem afetar FinanceiroPage.jsx desktop).
// ============================================================================

test('className/overlayClassName são opcionais e repassados ao Modal via cx -- default undefined não muda o comportamento existente', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /className,\s*\n\s*overlayClassName,/);
  assert.match(modal, /className=\{cx\(styles\.transactionDialog, className\)\}/);
  assert.match(modal, /overlayClassName=\{overlayClassName\}/);
});

test('FinanceiroPage (desktop) nunca passa className/overlayClassName -- continua reativo ao tema do site', async () => {
  const financeiroPage = await source('../FinanceiroPage.jsx');
  const start = financeiroPage.indexOf('<FinanceTransactionModal');
  assert.ok(start > -1);
  const end = financeiroPage.indexOf('/>', start);
  const slice = financeiroPage.slice(start, end);
  assert.doesNotMatch(slice, /overlayClassName|className=/);
});

test('Registros simplificado passa className/overlayClassName escuros', async () => {
  const records = await source('../../features/simplified-app/SimplifiedRecordsPage.jsx');
  const start = records.indexOf('<FinanceTransactionModal');
  const end = records.indexOf('/>', start);
  const slice = records.slice(start, end);
  assert.match(slice, /className=\{styles\.transactionDialogDark\}/);
  assert.match(slice, /overlayClassName=\{styles\.darkOverlay\}/);
});

test('CSS de Registros redefine os tokens --uf-* com a paleta escura oficial (não o cinza genérico do tema dark)', async () => {
  const css = await source('../../features/simplified-app/simplifiedRecords.module.css');
  const start = css.indexOf('.transactionDialogDark {');
  const slice = css.slice(start, css.indexOf('}', start));
  assert.match(slice, /--uf-color-bg-elevated: linear-gradient\(145deg, var\(--uf-app-surface-2\), var\(--uf-app-surface\)\);/);
  assert.match(slice, /--uf-color-text-primary: var\(--uf-app-text\);/);
});

test('CSS de FinanceTransactionModal usa tokens --uf-* (reativo ao tema em qualquer contexto) para os blocos e o tamanho do diálogo', async () => {
  const css = await source('./FinanceTransactionModal.module.css');
  assert.match(css, /\.formBlock \{[\s\S]*?background: var\(--uf-color-bg-sunken\);/);
  assert.match(css, /\.transactionDialog \{/);
  assert.match(css, /100dvh/);
  assert.match(css, /100svh/);
});

// ============================================================================
// Histórico ("Lançamentos existentes"): cada item mostra descrição, tipo,
// valor, data, conta e categoria (quando houver), com indicador visual de
// receita/despesa/ajuste; ações Editar/Duplicar/Excluir ficam compactas
// (agrupadas), exclusão continua exigindo confirmação (DeleteActions), e
// ajustes manuais ficam visualmente distintos de receita/despesa.
// ============================================================================

test('cada item do histórico mostra tipo, valor, data, conta e categoria (quando houver)', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const start = modal.indexOf('listedTransactions.map((transaction) => {');
  const slice = modal.slice(start, modal.indexOf('})}', start));
  assert.match(slice, /HISTORY_TYPE_LABELS\[transaction\.transaction_type\]/);
  assert.match(slice, /formatCurrency\(transaction\.amount\)/);
  assert.match(slice, /transaction\.transaction_date/);
  assert.match(slice, /accountsById\.get\(transaction\.account_id\)\?\.name/);
  assert.match(slice, /categoriesById\.get\(transaction\.category_id\)\?\.name/);
});

test('indicador visual distingue receita/despesa/transferência/ajuste -- ajuste nunca herda a cor de receita ou despesa', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /const isAdjustment = transaction\.transaction_type === 'adjustment';/);
  assert.match(modal, /historyDot_\$\{isAdjustment \? 'adjustment' : typeTone\}/);
  const css = await source('./FinanceTransactionModal.module.css');
  assert.match(css, /\.historyDot_income \{[\s\S]*?--uf-color-success/);
  assert.match(css, /\.historyDot_expense \{[\s\S]*?--uf-color-danger/);
  assert.match(css, /\.historyDot_adjustment \{[\s\S]*?--uf-color-warning/);
});

test('ações Editar/Duplicar/Excluir ficam agrupadas em .historyActions e Excluir abre a mesma confirmação central', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const start = modal.indexOf('<div className={styles.historyActions}>');
  assert.ok(start > -1);
  const fullBlockEnd = modal.indexOf('</CrudRow>', start);
  const fullSlice = modal.slice(start, fullBlockEnd);
  assert.match(fullSlice, />\s*Editar\s*</);
  assert.match(fullSlice, />\s*Duplicar\s*</);
  assert.match(fullSlice, /variant="danger"[\s\S]*?onClick=\{\(\) => handleRequestDelete\(transaction\.id\)\}/);
});

test('exclusão continua exigindo confirmação central -- nunca window.confirm nem DeleteActions inline', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.doesNotMatch(modal, /window\.confirm/);
  assert.doesNotMatch(modal, /<DeleteActions/);
  assert.match(modal, /const isDeleteConfirmOpen = Boolean\(pendingDeleteId && pendingDeleteTransaction\);/);
  assert.match(modal, /open=\{isDeleteConfirmOpen\}/);
  assert.match(modal, /onConfirm=\{\(\) => handleDelete\(pendingDeleteId\)\}/);
});

test('confirmação preserva snapshot visual enquanto a lista atualiza após a remoção', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /const \[pendingDeleteSnapshot, setPendingDeleteSnapshot\] = useState\(null\);/);
  assert.match(modal, /transactionState\.transactions\.find\([\s\S]*?\?\? pendingDeleteSnapshot/);
  assert.match(modal, /setPendingDeleteSnapshot\(transaction\)/);
  assert.match(modal, /await onChanged\?\.\(\);[\s\S]*?setPendingDeleteSnapshot\(null\);[\s\S]*?await onDeleted\(transaction\)/);
});

test('Registros fecha a edição após delete, volta ao Histórico e mantém o toast de exclusão por 2 segundos', async () => {
  const records = await source('../../features/simplified-app/SimplifiedRecordsPage.jsx');
  const handlerStart = records.indexOf('function completeTransactionMutation(message)');
  const handlerEnd = records.indexOf('function handleTransactionDeleted()', handlerStart);
  const handler = records.slice(handlerStart, handlerEnd);
  assert.match(records, /const TRANSACTION_SUCCESS_NOTICE_MS = 2000;/);
  assert.match(handler, /setTransactionDialog\(null\)/);
  assert.match(handler, /setActiveTab\('history'\)/);
  assert.match(handler, /setTransactionSuccessNotice\(message\)/);
  assert.match(handler, /window\.setTimeout\([\s\S]*?TRANSACTION_SUCCESS_NOTICE_MS/);
  assert.match(records, /completeTransactionMutation\('Lançamento excluído com sucesso\.'\)/);
  assert.match(records, /className=\{styles\.transactionSuccessToast\}[\s\S]*?role="status"[\s\S]*?aria-live="polite"/);
  assert.match(records, /onDeleted=\{handleTransactionDeleted\}/);
});

test('sucesso da exclusão chama onDeleted e não zera o formulário antes de a tela de Registros assumir', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const start = modal.indexOf('async function handleDelete(transactionId)');
  const end = modal.indexOf('// CONTA-OPCIONAL', start);
  const slice = modal.slice(start, end);
  assert.match(slice, /await onChanged\?\.\(\)/);
  assert.match(slice, /if \(onDeleted\) \{\s*await onDeleted\(transaction\);\s*return;/);
  assert.ok(slice.indexOf('await onDeleted(transaction)') < slice.lastIndexOf('resetForm()'));
});

test('edição simples atualiza dados, entrega sucesso ao Registros e nunca cai no formulário novo zerado', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const submitStart = modal.indexOf('async function handleSubmit(event)');
  const submitEnd = modal.indexOf('async function handleDelete(transactionId)', submitStart);
  const submit = modal.slice(submitStart, submitEnd);
  assert.match(submit, /saveTransaction\(\s*buildTransactionMutationPayload\(form\),\s*editingId,\s*\)/);
  assert.match(submit, /if \(!result\.error\) \{\s*await onChanged\?\.\(\);\s*if \(editingId && onEdited\) \{\s*await onEdited\(editingTransaction\);\s*return;\s*\}\s*resetForm\(\);/);
  assert.ok(submit.indexOf('await onEdited(editingTransaction)') < submit.lastIndexOf('resetForm()'));
});

test('edição de grupo parcelado também fecha pelo callback sem converter o modal em criação', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const submitStart = modal.indexOf('async function handleSubmit(event)');
  const installmentCreateStart = modal.indexOf('// Criação de compra parcelada', submitStart);
  const groupEdit = modal.slice(submitStart, installmentCreateStart);
  assert.match(groupEdit, /resolveInstallmentScope\(/);
  assert.match(groupEdit, /await onChanged\?\.\(\);\s*if \(onEdited\) \{\s*await onEdited\(editingTransaction\);\s*return;\s*\}\s*resetForm\(\);/);
});

test('Registros fecha após edição, volta ao Histórico e mostra toast de edição por 2 segundos', async () => {
  const records = await source('../../features/simplified-app/SimplifiedRecordsPage.jsx');
  assert.match(records, /function handleTransactionEdited\(\) \{\s*completeTransactionMutation\('Lançamento editado com sucesso\.'\);\s*\}/);
  assert.match(records, /onEdited=\{handleTransactionEdited\}/);
  assert.match(records, /const TRANSACTION_SUCCESS_NOTICE_MS = 2000;/);
  assert.match(records, /setTransactionDialog\(null\)/);
  assert.match(records, /setActiveTab\('history'\)/);
});

test('Número de parcelas continua legítimo na criação, mas é impossível durante edição e no pós-save', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const installmentsStart = modal.indexOf('id="finance-transaction-installments"');
  const guardStart = modal.lastIndexOf('{!editingId', installmentsStart);
  assert.ok(guardStart > -1);
  assert.match(modal.slice(guardStart, installmentsStart + 100), /!editingId && form\.transaction_type !== 'transfer'/);
  assert.match(modal, /if \(editingId && onEdited\) \{\s*await onEdited\(editingTransaction\);\s*return;/);
});

test('criação simples e parcelada preservam resetForm e nunca disparam onEdited', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const submitStart = modal.indexOf('async function handleSubmit(event)');
  const submitEnd = modal.indexOf('async function handleDelete(transactionId)', submitStart);
  const submit = modal.slice(submitStart, submitEnd);
  assert.match(submit, /if \(!editingId && isInstallmentPurchase\(form\)\)[\s\S]*?await onChanged\?\.\(\);\s*resetForm\(\);\s*return;/);
  assert.match(submit, /if \(editingId && onEdited\)/);
});

test('mobile empilha os botões do formulário e mantém o card de confirmação dentro do viewport seguro', async () => {
  const css = await source('./FinanceTransactionModal.module.css');
  const mobileStart = css.indexOf('@media (max-width: 767px)');
  const mobile = css.slice(mobileStart, css.indexOf('@media (prefers-reduced-motion', mobileStart));
  assert.match(mobile, /\.actionRow,[\s\S]*?flex-direction: column/);
  assert.match(mobile, /\.deleteButton,[\s\S]*?width: 100%/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
});

// ============================================================================
// CONTA-ZERO (Registros simplificado): hideAccountFields/showExistingList --
// props aditivas, default preserva o comportamento desktop existente.
// ============================================================================

test('hideAccountFields/showExistingList nascem com defaults que preservam o comportamento desktop (false/true)', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /hideAccountFields = false,/);
  assert.match(modal, /showExistingList = true,/);
});

test('hideAccountFields remove Transferência do Tipo, os campos de Conta e a exigência de conta no submit', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /\{hideAccountFields \? null : <option value="transfer">Transferência<\/option>\}/);
  assert.match(modal, /\{!hideAccountFields && \(form\.transaction_type === 'transfer' \|\| form\.transaction_type === 'adjustment'\) \? \(/);
  assert.match(modal, /const accountRequiredForSubmit = !hideAccountFields\s*\n\s*&& \(form\.transaction_type === 'transfer' \|\| form\.transaction_type === 'adjustment'\);/);
});

test('showExistingList=false esconde o bloco "Lançamentos existentes" (lista/filtros/CSV de todo o espaço)', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /\{showExistingList \? \(\s*\n\s*<div className=\{styles\.formBlock\} aria-label="Lançamentos existentes">/);
});

test('SimplifiedRecordsPage passa hideAccountFields e showExistingList={false} -- nunca fala em conta, nunca mostra a lista redundante', async () => {
  const records = await source('../../features/simplified-app/SimplifiedRecordsPage.jsx');
  const start = records.indexOf('<FinanceTransactionModal');
  const slice = records.slice(start, records.indexOf('/>', start));
  assert.match(slice, /hideAccountFields\s*\n/);
  assert.match(slice, /showExistingList=\{false\}/);
});

test('FinanceiroPage (desktop) não passa hideAccountFields/showExistingList -- continua com o formulário completo', async () => {
  const financeiroPage = await source('../FinanceiroPage.jsx');
  const start = financeiroPage.indexOf('<FinanceTransactionModal');
  const slice = financeiroPage.slice(start, financeiroPage.indexOf('/>', start));
  assert.doesNotMatch(slice, /hideAccountFields|showExistingList/);
});
