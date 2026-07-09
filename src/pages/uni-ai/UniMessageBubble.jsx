import Avatar from '../../components/ui/Avatar';
import styles from '../UniAIPage.module.css';

function UniMessageBubble({ message }) {
  const isUserMessage = message.role === 'user';

  return (
    <article className={isUserMessage ? styles.userMessage : styles.uniMessage}>
      <Avatar
        name={isUserMessage ? 'Você' : 'Uni'}
        initials={isUserMessage ? 'VC' : 'U'}
        size="xs"
        status={isUserMessage ? undefined : 'online'}
      />
      <div className={styles.bubble}>
        <span>{isUserMessage ? 'Você' : 'Uni'}</span>
        <p>{message.content}</p>
      </div>
    </article>
  );
}

export default UniMessageBubble;
