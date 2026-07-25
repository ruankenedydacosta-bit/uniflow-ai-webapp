import Badge from '../../../components/ui/Badge';
import styles from './SupportRequestsList.module.css';

const STATUS_LABELS = Object.freeze({
  open: 'Aberta',
  in_review: 'Em análise',
  resolved: 'Resolvida',
  closed: 'Encerrada',
});

const STATUS_VARIANTS = Object.freeze({
  open: 'primary',
  in_review: 'warning',
  resolved: 'success',
  closed: 'default',
});

function formatDate(value) {
  try {
    return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function SupportRequestsList({ requests, isLoading }) {
  if (isLoading) {
    return <p className={styles.empty}>Carregando suas solicitações…</p>;
  }

  if (!requests || requests.length === 0) {
    return <p className={styles.empty}>Você ainda não abriu nenhuma solicitação de suporte.</p>;
  }

  return (
    <ul className={styles.list}>
      {requests.map((request) => (
        <li key={request.id} className={styles.item}>
          <div className={styles.itemHeader}>
            <span className={styles.subject}>{request.subject}</span>
            <Badge variant={STATUS_VARIANTS[request.status] ?? 'default'} size="sm">
              {STATUS_LABELS[request.status] ?? request.status}
            </Badge>
          </div>
          <span className={styles.date}>Criada em {formatDate(request.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
