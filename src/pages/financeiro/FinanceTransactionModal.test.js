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

// Tela 22g: a confirmação deixou o portal próprio (card centralizado com
// "Confirmar exclusão" vermelho) e passou ao Modal compartilhado, que no
// celular sobe como a folha padrão.
test('confirmação de exclusão segue a 22g: Modal compartilhado sem cabeçalho, alertdialog e Excluir definitivamente/Cancelar', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const css = await source('./FinanceTransactionModal.module.css');
  const start = modal.indexOf('function DeleteConfirmationDialog(');
  const end = modal.indexOf('// `className`/`overlayClassName`', start);
  const slice = modal.slice(start, end);
  assert.doesNotMatch(slice, /createPortal\(/);
  assert.match(slice, /<Modal[\s\S]*?hideCloseButton[\s\S]*?role="alertdialog"/);
  assert.match(slice, /closeOnEsc=\{!isLoading\}/);
  assert.match(slice, /closeOnOverlayClick=\{!isLoading\}/);
  assert.match(slice, /<IconBox size=\{44\}><PhTrashIcon \/><\/IconBox>/);
  assert.match(slice, /Excluir movimentação\?/);
  assert.match(slice, /Não é possível desfazer\./);
  assert.match(slice, />\s*Excluir definitivamente\s*</);
  assert.match(slice, />\s*Cancelar\s*</);
  assert.doesNotMatch(slice, /variant="danger"/);
  assert.match(css, /\.deleteConfirmOverlay\.deleteConfirmOverlay \{[\s\S]*?z-index: calc\(var\(--uf-z-modal\) \+ 1\)/);
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

test('Registros fecha a edição após delete, volta ao Histórico e mantém o toast de exclusão o tempo de ler', async () => {
  const records = await source('../../features/simplified-app/SimplifiedRecordsPage.jsx');
  const noticeStart = records.indexOf('function showTransactionNotice(message)');
  const notice = records.slice(noticeStart, records.indexOf('function dismissTransactionNotice()', noticeStart));
  const handlerStart = records.indexOf('function completeTransactionMutation(message)');
  const handlerEnd = records.indexOf('function showCategorySuccessNotice()', handlerStart);
  const handler = records.slice(handlerStart, handlerEnd);
  assert.match(handler, /setTransactionDialog\(null\)/);
  assert.match(handler, /setActiveTab\('history'\)/);
  assert.match(handler, /showTransactionNotice\(message\)/);
  assert.match(notice, /setTransactionSuccessNotice\(message\)/);
  assert.match(notice, /window\.setTimeout\([\s\S]*?transactionNoticeDuration\(message\)/);
  assert.match(records, /aria-label="Dispensar aviso"/);
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
  assert.match(submit, /if \(!result\.error\) \{\s*const onDone = editingId\s*\? onEdited && \(\(\) => onEdited\(editingTransaction\)\)/);
  assert.match(submit, /await concludeSave\(onDone\);/);
  // Com quem receba o resultado, o formulário não volta zerado: só sem ele.
  const conclude = submit.slice(submit.indexOf('async function concludeSave(onDone)'));
  assert.match(conclude, /if \(!onDone\) \{\s*await onChanged\?\.\(\);\s*resetForm\(\);\s*return;\s*\}/);
  assert.equal(conclude.match(/resetForm\(\)/g).length, 1);
  assert.match(conclude, /if \(!isSheet\) \{\s*await onChanged\?\.\(\);\s*await onDone\(\);\s*return;\s*\}/);
});

test('edição de grupo parcelado também fecha pelo callback sem converter o modal em criação', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const submitStart = modal.indexOf('async function handleSubmit(event)');
  const installmentCreateStart = modal.indexOf('// Criação de compra parcelada', submitStart);
  const groupEdit = modal.slice(submitStart, installmentCreateStart);
  assert.match(groupEdit, /resolveInstallmentScope\(/);
  assert.match(groupEdit, /await concludeSave\(onEdited && \(\(\) => onEdited\(editingTransaction\)\)\);\s*return;/);
});

test('Registros fecha após edição, volta ao Histórico e mostra toast de edição o tempo de ler', async () => {
  const records = await source('../../features/simplified-app/SimplifiedRecordsPage.jsx');
  assert.match(records, /function handleTransactionEdited\(\) \{\s*completeTransactionMutation\('Lançamento editado com sucesso\.'\);\s*\}/);
  assert.match(records, /onEdited=\{handleTransactionEdited\}/);
  assert.match(records, /transactionNoticeDuration\(message\)/);
  assert.match(records, /setTransactionDialog\(null\)/);
  assert.match(records, /setActiveTab\('history'\)/);
});

test('Número de parcelas continua legítimo na criação, mas é impossível durante edição e no pós-save', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const installmentsStart = modal.indexOf('id="finance-transaction-installments"');
  const guardStart = modal.lastIndexOf('{!editingId', installmentsStart);
  assert.ok(guardStart > -1);
  assert.match(modal.slice(guardStart, installmentsStart + 100), /!editingId && form\.transaction_type !== 'transfer'/);
  assert.match(modal, /const onDone = editingId\s*\? onEdited && \(\(\) => onEdited\(editingTransaction\)\)/);
});

test('criação simples e parcelada entregam a movimentação a onCreated e nunca disparam onEdited', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const submitStart = modal.indexOf('async function handleSubmit(event)');
  const submitEnd = modal.indexOf('async function concludeSave(onDone)', submitStart);
  const submit = modal.slice(submitStart, submitEnd);
  assert.match(submit, /if \(!editingId && isInstallmentPurchase\(form\)\)[\s\S]*?const firstInstallment = result\.data\.find\(\(item\) => item\.installment_number === 1\) \?\? result\.data\[0\];[\s\S]*?await concludeSave\(onCreated && \(\(\) => onCreated\(firstInstallment\)\)\);\s*return;/);
  assert.match(submit, /: onCreated && \(\(\) => onCreated\(result\.data\)\);/);
  assert.doesNotMatch(submit.slice(submit.indexOf('// Criação de compra parcelada')), /onEdited\(firstInstallment|onEdited\(result/);
});

test('na folha, o botão comemora e a folha desce antes de quem abriu receber o resultado (#145)', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const conclude = modal.slice(
    modal.indexOf('async function concludeSave(onDone)'),
    modal.indexOf('async function handleDelete(transactionId)'),
  );
  const folha = conclude.slice(conclude.indexOf('setConcluindo(true)'));
  let anterior = -1;
  for (const trecho of ['setConcluindo(true)', 'const reload = onChanged?.()', 'celebrarSalvar(', 'await reload', 'fecharFolha(', 'await onDone()']) {
    const posicao = folha.indexOf(trecho);
    assert.ok(posicao > anterior, `${trecho} fora de ordem`);
    anterior = posicao;
  }
  // Faísca só no sucesso: concludeSave só é chamado depois de o save não ter erro.
  assert.match(modal, /if \(!result\.error\) \{\s*const onDone/);
  assert.match(modal, /function handleClose\(\) \{\s*if \(transactionState\.isMutating\) return;\s*if \(concluindo\) return;/);
  assert.match(modal, /data-salvar-rotulo/);
  assert.match(modal, /data-salvar-check aria-hidden="true"/);
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

// ============================================================================
// DOWNLOAD-FEEDBACK1 -- confirmação no Centro de Notificações depois que a
// exportação CSV é DISPARADA com sucesso (mesmo mecanismo do XLSX do
// Relatório, ver SimplifiedReportPage.jsx).
// ============================================================================

test('notificação de download só é criada DEPOIS de downloadTransactionsCsv (download já disparado), usa o filename retornado por ela -- nunca recalculado à parte', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const handlerStart = modal.indexOf('function handleExportCsv()');
  const handlerBody = modal.slice(handlerStart, modal.indexOf('}', modal.indexOf('void createDownloadReadyNotification(', handlerStart)) + 1);
  const dispatchIndex = handlerBody.indexOf('downloadTransactionsCsv(');
  const notifyIndex = handlerBody.indexOf('createDownloadReadyNotification(');
  assert.ok(dispatchIndex > -1 && notifyIndex > -1, 'ambas as chamadas devem existir no handler');
  assert.ok(notifyIndex > dispatchIndex, 'a notificação precisa vir DEPOIS do download já disparado');
  assert.match(handlerBody, /const filename = downloadTransactionsCsv\(/);
  assert.match(handlerBody, /filename,\s*\n\s*fileType: 'csv',/);
});

test('exportação CSV é protegida por cooldown por tempo -- toque duplo rápido nunca dispara dois downloads/duas notificações', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /const lastCsvExportAtRef = useRef\(0\);/);
  assert.match(modal, /const CSV_EXPORT_COOLDOWN_MS = 800;/);
  const handlerStart = modal.indexOf('function handleExportCsv()');
  const handlerBody = modal.slice(handlerStart, handlerStart + 400);
  assert.match(handlerBody, /if \(now - lastCsvExportAtRef\.current < CSV_EXPORT_COOLDOWN_MS\) return;/);
});

test('sem usuário autenticado, nunca tenta criar a notificação (guard if (user?.id))', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const handlerStart = modal.indexOf('function handleExportCsv()');
  const handlerBody = modal.slice(handlerStart, handlerStart + 700);
  assert.match(handlerBody, /if \(user\?\.id\) \{/);
});

// ============================================================================
// Lançamento recorrente (#222): criar a série e mexer nela por alcance.
// ============================================================================

test('recorrente cria a série pela RPC, e não um lançamento só marcado', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const submit = modal.slice(modal.indexOf('async function handleSubmit(event)'), modal.indexOf('async function concludeSave(onDone)'));
  assert.match(submit, /if \(!editingId && !transactionState\.isDemoMode && isRecurringSeriesForm\(form\)\) \{/);
  assert.match(submit, /transactionState\.createSeries\(\{\s*\.\.\.buildRecurringSeriesPayload\(form\),\s*clientOperationId: seriesOperationIdRef\.current,\s*\}\)/);
  // A chave só é trocada depois de dar certo: o retry devolve a mesma série.
  assert.match(submit, /seriesOperationIdRef\.current \?\?= globalThis\.crypto\.randomUUID\(\);[\s\S]*?if \(result\.error\) \{[\s\S]*?return;\s*\}\s*seriesOperationIdRef\.current = null;/);
  assert.doesNotMatch(modal, /nenhuma ocorrência futura é\s+criada/);
});

test('ocorrência de série: "este e os próximos" e "todos" vão pela RPC; "somente este" segue o update comum', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const submit = modal.slice(modal.indexOf('async function handleSubmit(event)'), modal.indexOf('async function concludeSave(onDone)'));
  assert.match(submit, /if \(editingId && editingIsSeries && editScope !== 'only'\) \{[\s\S]*?transactionState\.saveSeriesTransactions\(editingId, editScope, payload\)/);
  assert.match(modal, /<option value="forward">Este e os próximos da série<\/option>/);
  const remove = modal.slice(modal.indexOf('async function handleDelete(transactionId)'), modal.indexOf('const accountRequiredForSubmit'));
  assert.match(remove, /deleteScope !== 'only'\) \{\s*const result = await transactionState\.removeSeriesTransactions\(transactionId, deleteScope\);/);
});

test('bloco de recorrência só aparece na criação e traz a confirmação automática da série', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  const start = modal.indexOf('{!editingId && isRecurringSeriesForm(form) ? (');
  assert.ok(start > -1);
  const slice = modal.slice(start, modal.indexOf('{editingId && editingGroupId ? (', start));
  assert.match(slice, /Confirmar automaticamente na data/);
  assert.match(slice, /próximos 3 meses já entram como previstos/);
});

test('ocorrência de série é reconhecida pelo id da série no metadata, não pelo rótulo antigo is_recurring', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /const editingIsSeries = !editingGroupId && Boolean\(editingTransaction\?\.metadata\?\.recurring_series_id\);/);
  assert.match(modal, /pendingDeleteTransaction\?\.metadata\?\.recurring_series_id\) pendingDeleteGroupKind = 'series'/);
  assert.doesNotMatch(modal, /is_recurring === true/);
});

test('alcance da série só leva a confirmação automática quando a opção está na tela', async () => {
  const modal = await source('./FinanceTransactionModal.jsx');
  assert.match(modal, /auto_confirm: isPlanned \? Boolean\(form\.auto_confirm\) : null/);
});
