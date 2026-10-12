import { useId, useMemo, useState } from 'react';
import { useSession } from '../../../app/SessionContext.jsx';
import OutlineButton from '../../../components/ui/OutlineButton';
import { useTransactions } from '../../../hooks';
import { formatCurrency } from '../../../utils/formatters.js';
import { PhCaretRightIcon } from '../../simplified-app/SimplifiedIcons.jsx';
import { mediaDeSaidasMensais, periodoDaMediaDeSaidas, sugestoesDeMeta } from '../sugestoesDeMeta.js';
import styles from './GoalSuggestions.module.css';

// Estado vazio de Metas (handoff 08h, #155). Cada sugestão abre o passo 2
// da criação com o tipo e o valor preenchidos. "Criar outra meta" abre o
// passo 1 (onEscolher recebe null).
export default function GoalSuggestions({ onEscolher }) {
  const { workspace } = useSession();
  const tituloId = useId();
  const [periodo] = useState(() => periodoDaMediaDeSaidas());
  const { transactions, isLoading } = useTransactions({
    workspaceId: workspace?.id,
    dateFrom: periodo.dateFrom,
    dateTo: periodo.dateTo,
    status: 'completed',
  });
  const sugestoes = useMemo(
    () => sugestoesDeMeta(isLoading ? null : mediaDeSaidasMensais(transactions)),
    [isLoading, transactions],
  );

  return (
    <section className={styles.empty} aria-labelledby={tituloId}>
      <h2 id={tituloId} className={styles.title}>Nenhuma meta ainda</h2>
      <p className={styles.text}>Crie uma meta para ver quanto falta e quanto guardar por mês. Comece por uma sugestão:</p>
      <ul className={styles.list}>
        {sugestoes.map((sugestao) => (
          <li key={sugestao.tipo}>
            <button
              type="button"
              className={styles.option}
              // A reserva espera a média carregar: sem isso, o passo 2
              // abriria com o valor zerado.
              disabled={isLoading && sugestao.tipo === 'emergency_reserve'}
              aria-busy={isLoading && sugestao.tipo === 'emergency_reserve' ? true : undefined}
              onClick={() => onEscolher({ tipo: sugestao.tipo, alvo: sugestao.alvo })}
            >
              <span className={styles.optionText}>
                <span className={styles.optionTitle}>{sugestao.titulo}</span>
                <span className={styles.optionDescription}>{sugestao.descricao}</span>
              </span>
              {sugestao.alvo ? <span className={styles.optionValue}>{formatCurrency(sugestao.alvo)}</span> : null}
              <span className={styles.caret} aria-hidden="true"><PhCaretRightIcon /></span>
            </button>
          </li>
        ))}
      </ul>
      <OutlineButton variant="secondary" onClick={() => onEscolher(null)}>Criar outra meta</OutlineButton>
    </section>
  );
}
