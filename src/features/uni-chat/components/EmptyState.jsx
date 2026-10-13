import { UniRingOrb } from '../../../components/ui/UniRingOrb/index.js';
import QuickSuggestions from './QuickSuggestions';
import { getEmptyStateQuestion } from '../uniContextCopy';
import styles from './EmptyState.module.css';

export default function EmptyState({ userName, suggestions, onSelect, workspaceType }) {
  // userName pode ser null (profile/sessão carregando ou sem nome real):
  // saudação neutra, sem nome e sem "undefined".
  const greeting = userName ? `Olá, ${userName}.` : 'Olá!';
  // A pergunta inicial reflete o contexto ativo (PF/PJ); ao trocar de
  // workspace, o componente é re-renderizado com a nova prop e a pergunta
  // muda imediatamente, sem resíduo do contexto anterior.
  const question = getEmptyStateQuestion(workspaceType);

  return (
    <div className={styles.wrap}>
      <UniRingOrb size={64} />
      <h1 className={styles.greeting}>{greeting}</h1>
      <p className={styles.question}>{question}</p>
      <QuickSuggestions items={suggestions} onSelect={onSelect} variant="grid" />
    </div>
  );
}
