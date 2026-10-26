import { useCallback, useEffect, useState } from 'react';
import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { pixAutomatic } from '../../services/billingService.js';
import { canShowPixAutomaticQr, pixAutomaticMessage } from './pixAutomaticPresentation.js';
import styles from './PersonalPlan.module.css';
import { formatCurrency } from '../../utils/formatters.js';

export default function PixAutomaticModal({ open, workspaceId, onClose, onGoHome }) {
  const [storedAuthorization, setAuthorization] = useState(null);
  const [authorizationWorkspaceId, setAuthorizationWorkspaceId] = useState(null);
  const authorization = authorizationWorkspaceId === workspaceId ? storedAuthorization : null;
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const refresh = useCallback(async (action = 'status') => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const result = await pixAutomatic({ workspaceId, action });
      if (result.error) setError('Não foi possível confirmar o estado. Verifique novamente antes de gerar outro pagamento.');
      else { setAuthorizationWorkspaceId(workspaceId); setAuthorization(result.data?.authorization ?? null); setError(null); setConfirmCancel(false); }
    } catch {
      setError('Não foi possível confirmar o estado. Verifique novamente antes de gerar outro pagamento.');
    } finally { setIsLoading(false); }
  }, [workspaceId]);
  useEffect(() => {
    if (!open || !workspaceId) return undefined;
    let active = true;
    let inFlight = false;
    let ticks = 0;
    const read = async () => {
      if (!active || inFlight || ticks >= 24) return;
      ticks += 1;
      inFlight = true;
      const result = await pixAutomatic({ workspaceId, action: 'status' });
      inFlight = false;
      if (!active) return;
      if (result.error) setError('A consulta não foi concluída. Use Verificar agora para tentar novamente.');
      else { setAuthorizationWorkspaceId(workspaceId); setAuthorization(result.data?.authorization ?? null); setError(null); }
    };
    const timeout = window.setTimeout(read, 0);
    const interval = window.setInterval(read, 5000);
    return () => { active = false; window.clearTimeout(timeout); window.clearInterval(interval); };
  }, [open, workspaceId]);
  const showQr = canShowPixAutomaticQr(authorization);
  async function copy() {
    try { await navigator.clipboard.writeText(authorization.payload); setCopied(true); }
    catch { setError('Não foi possível copiar. Você pode usar o QR Code no aplicativo do banco.'); }
  }
  return (
    <Modal open={open} onClose={onClose} title="Pix Automático" className={styles.checkoutDialog}
      footer={<Button type="button" variant="secondary" loading={isLoading} onClick={() => refresh('reconcile')}>Verificar agora</Button>}>
      <p role="status">{pixAutomaticMessage(authorization)}</p>
      {Number.isFinite(authorization?.value) ? <p className={styles.pixValueAmount}>{formatCurrency(authorization.value)} por mês</p> : null}
      {showQr ? <div className={styles.pixQrCard}>
        {typeof authorization.encoded_image === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(authorization.encoded_image)
          ? <img className={styles.pixQrImage} src={`data:image/png;base64,${authorization.encoded_image}`} alt="QR Code do primeiro pagamento e autorização do Pix Automático" /> : null}
        <p className={styles.hint}>Este QR Code reúne o primeiro pagamento e a autorização das próximas cobranças. Confirme as duas etapas no banco.</p>
        <Button type="button" variant="primary" onClick={copy}>{copied ? 'Código copiado' : 'Copiar código Pix'}</Button>
      </div> : null}
      {authorization?.initial_payment_confirmed ? <Button type="button" variant="primary" onClick={onGoHome}>Acessar meu plano</Button> : null}
      {authorization && ['CREATED','ACTIVE'].includes(authorization.status) && !authorization.cancellation_requested ? (
        confirmCancel ? <div><p>As próximas cobranças automáticas serão interrompidas após a confirmação do banco. Seu período já pago continua válido.</p>
          <Button type="button" variant="danger" disabled={isLoading} onClick={() => refresh('cancel')}>Confirmar cancelamento</Button>
          <Button type="button" variant="secondary" onClick={() => setConfirmCancel(false)}>Manter autorização</Button>
        </div> : <Button type="button" variant="secondary" disabled={isLoading} onClick={() => setConfirmCancel(true)}>Cancelar autorização automática</Button>
      ) : null}
      {error ? <p className={styles.methodError} role="alert">{error}</p> : null}
    </Modal>
  );
}
