import { useState } from 'react';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import OutlineButton from '../../components/ui/OutlineButton';
import { PhCaretDownIcon } from '../../features/simplified-app/SimplifiedIcons.jsx';
import { cx } from '../../utils/cx';
import { getFinanceErrorMessage } from './financeUiUtils';
import styles from './FinanceAccountModal.module.css';

const EMPTY_FORM = {
  name: '',
  account_type: 'checking',
  balance: '0',
};

const MANAGE_BLOCKED_TITLE = 'Você não possui permissão para gerenciar contas deste espaço.';
const DELETE_BLOCKED_TITLE = 'Você não possui permissão para excluir contas deste espaço.';

// `autoCloseOnCreate` (opcional, default false): quando true, fecha a modal
// automaticamente após criar a PRIMEIRA conta criada nesta sessão de uso --
// usado por fluxos que abrem esta modal apenas para criar rapidamente uma
// conta e voltar (ex.: UpdateBalanceModal.jsx), sem alterar em nada o
// comportamento padrão (gerenciar várias contas) usado em FinanceiroPage,
// onde a prop nunca é passada.
// `className`/`overlayClassName` (opcionais): permitem que um fluxo chamador
// force a identidade escura oficial (ex.: sub-fluxo "Criar conta" dentro de
// UpdateBalanceModal.jsx) sem afetar o uso padrão desta modal em
// FinanceiroPage.jsx, que continua reativo ao
// tema --uf-* do site (comportamento inalterado quando as props não são
// passadas).
// Tela 22: no celular o Modal vira a folha padrão. Campos de 44px (Field),
// ação principal contornada e linhas no poço escuro, como nos outros modais
// do app simplificado.
function FinanceAccountModal({
  accountState,
  autoCloseOnCreate = false,
  canDelete = true,
  canManage = true,
  className,
  overlayClassName,
  onChanged,
  onClose,
  open,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const isFirstAccount = accountState.activeAccounts.length === 0;

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPendingDeleteId(null);
  }

  function handleClose() {
    if (accountState.isMutating) return;
    accountState.clearError();
    resetForm();
    onClose();
  }

  function handleEdit(account) {
    if (accountState.isMutating || !canManage) return;
    accountState.clearError();
    setEditingId(account.id);
    setPendingDeleteId(null);
    setForm({
      name: account.name,
      account_type: account.account_type,
      balance: String(account.initial_balance ?? 0),
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (accountState.isMutating || !canManage) return;
    const balance = form.balance || '0';
    const isCreate = !editingId;
    const result = await accountState.saveAccount(
      {
        name: form.name,
        account_type: form.account_type,
        initial_balance: balance,
      },
      editingId,
    );

    if (!result.error) {
      await onChanged?.();
      resetForm();
      if (autoCloseOnCreate && isCreate) {
        onClose();
      }
    }
  }

  async function handleDelete(accountId) {
    if (accountState.isMutating || !canDelete) return;
    const result = await accountState.removeAccount(accountId);
    if (!result.error) {
      await onChanged?.();
      resetForm();
    }
  }

  const errorMessage = getFinanceErrorMessage(
    accountState.error,
    'Não foi possível concluir a ação com esta conta. Tente novamente.',
  );

  function getAccountTypeName(code) {
    return accountState.accountTypes.find((type) => type.code === code)?.name ?? code;
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!accountState.isMutating}
      closeOnEsc={!accountState.isMutating}
      title={isFirstAccount ? 'Crie sua primeira conta' : 'Contas'}
      description={isFirstAccount
        ? 'Comece por aqui para organizar os dados deste perfil.'
        : 'Crie, edite ou exclua as contas usadas nas suas movimentações.'}
      size="md"
      className={cx(styles.accountDialog, className)}
      overlayClassName={overlayClassName}
    >
      <div className={styles.accountContent}>
        <form className={styles.accountForm} onSubmit={handleSubmit}>
          <Field label="Nome da conta">
            <input
              id="finance-account-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </Field>
          <Field
            label="Tipo de conta"
            helper="Escolha a opção que melhor representa esta conta."
            trailing={<PhCaretDownIcon />}
          >
            <select
              id="finance-account-type"
              value={form.account_type}
              onChange={(event) =>
                setForm((current) => ({ ...current, account_type: event.target.value }))
              }
            >
              {accountState.accountTypes.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
          </Field>
          {errorMessage ? (
            <p className={styles.formError} role="alert">{errorMessage}</p>
          ) : null}
          <div className={styles.accountActions}>
            <OutlineButton
              type="submit"
              className={styles.primaryAction}
              loading={accountState.isMutating}
              disabled={!canManage || accountState.isMutating || !form.name.trim()}
              title={!canManage ? MANAGE_BLOCKED_TITLE : undefined}
            >
              {editingId ? 'Salvar conta' : isFirstAccount ? 'Criar primeira conta' : 'Criar conta'}
            </OutlineButton>
            {editingId ? (
              <OutlineButton variant="ghost" onClick={resetForm} disabled={accountState.isMutating}>
                Cancelar edição
              </OutlineButton>
            ) : null}
          </div>
        </form>

        <ul className={styles.accountList}>
          {accountState.activeAccounts.map((account) => {
            const isConfirmingDelete = pendingDeleteId === account.id;
            return (
              <li key={account.id} className={styles.accountRow} data-editing={editingId === account.id}>
                <span className={styles.accountText}>
                  <strong>{account.name}</strong>
                  <span>{getAccountTypeName(account.account_type)}</span>
                </span>
                <span className={styles.accountRowActions}>
                  {isConfirmingDelete ? (
                    <>
                      <OutlineButton
                        variant="secondary"
                        className={styles.rowButton}
                        loading={accountState.isMutating}
                        onClick={() => handleDelete(account.id)}
                      >
                        Confirmar exclusão
                      </OutlineButton>
                      <OutlineButton
                        variant="ghost"
                        className={styles.rowButton}
                        disabled={accountState.isMutating}
                        onClick={() => setPendingDeleteId(null)}
                      >
                        Cancelar
                      </OutlineButton>
                    </>
                  ) : (
                    <>
                      <OutlineButton
                        variant="secondary"
                        className={styles.rowButton}
                        disabled={accountState.isMutating || !canManage}
                        title={!canManage ? MANAGE_BLOCKED_TITLE : undefined}
                        onClick={() => handleEdit(account)}
                      >
                        Editar
                      </OutlineButton>
                      <OutlineButton
                        variant="ghost"
                        className={styles.rowButton}
                        disabled={accountState.isMutating || !canDelete}
                        title={!canDelete ? DELETE_BLOCKED_TITLE : undefined}
                        onClick={() => setPendingDeleteId(account.id)}
                      >
                        Excluir
                      </OutlineButton>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {!accountState.activeAccounts.length ? (
          <p className={styles.emptyGuidance} role="status">
            Cadastre uma conta para começar a acompanhar seu dinheiro neste perfil.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export default FinanceAccountModal;
