import Card from '../../components/ui/Card';
import styles from '../UniAIPage.module.css';

function UniRecentConversations({ messages, visible }) {
  if (!visible) return null;

  const userMessages = messages.filter((message) => message.role === 'user').slice(-3);

  if (!userMessages.length) return null;

  return (
    <section className={styles.recentConversations} aria-label="Conversas recentes com a Uni">
      <span>Conversas recentes</span>
      <div>
        {userMessages.map((message) => (
          <Card key={message.id} variant="outline" padding="sm" className={styles.recentConversationCard}>
            <p>{message.content}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default UniRecentConversations;
