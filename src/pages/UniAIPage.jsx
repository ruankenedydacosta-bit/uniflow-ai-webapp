import { useState } from 'react';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import styles from './UniAIPage.module.css';

const conversationMessages = [
  {
    id: 'uni-month',
    role: 'uni',
    content: 'Analisei seu mês e encontrei um cenário saudável, com uma atenção importante: as despesas variáveis cresceram mais rápido que as receitas nos últimos dias.',
  },
  {
    id: 'user-cashflow',
    role: 'user',
    content: 'Como posso melhorar meu fluxo de caixa sem cortar algo importante agora?',
  },
  {
    id: 'uni-guidance',
    role: 'uni',
    content: 'Um bom primeiro passo é revisar os gastos variáveis desta semana e antecipar as entradas já confirmadas. Eu priorizaria três ações: separar despesas essenciais, adiar gastos não urgentes e registrar os recebíveis dos próximos sete dias.',
  },
];

const contextItems = [
  {
    label: 'Saldo projetado',
    value: 'R$ 48.200',
    status: 'Saudável',
    variant: 'success',
  },
  {
    label: 'Metas ativas',
    value: '3 metas',
    status: 'Em andamento',
    variant: 'primary',
  },
  {
    label: 'Despesas em atenção',
    value: '2 categorias',
    status: 'Atenção',
    variant: 'warning',
  },
  {
    label: 'Próxima decisão recomendada',
    value: 'Revisar variáveis',
    status: 'Próximo passo',
    variant: 'secondary',
  },
];

const quickSuggestions = [
  'Como posso economizar esta semana?',
  'Minha reserva está saudável?',
  'O que devo priorizar agora?',
  'Explique meu fluxo de caixa',
];

let messageIdCounter = conversationMessages.length;

function createMessage(role, content) {
  messageIdCounter += 1;

  return {
    id: `${role}-${messageIdCounter}`,
    role,
    content,
  };
}

function getMockUniResponse(question) {
  const normalizedQuestion = question.toLowerCase();

  if (normalizedQuestion.includes('economizar')) {
    return 'Para economizar esta semana sem gerar desconforto, eu começaria pelos gastos variáveis: alimentação fora, transporte e pequenas assinaturas. Escolha um limite simples para os próximos sete dias e acompanhe diariamente, sem tentar resolver tudo de uma vez.';
  }

  if (normalizedQuestion.includes('reserva')) {
    return 'Sua reserva parece em um caminho saudável quando cobre os compromissos essenciais e continua crescendo com regularidade. O próximo passo é comparar o valor atual com seus custos fixos mensais e manter aportes consistentes, mesmo que pequenos.';
  }

  if (normalizedQuestion.includes('priorizar')) {
    return 'Eu priorizaria o que reduz risco no curto prazo: organizar recebíveis, revisar despesas em atenção e proteger sua reserva. Depois disso, vale olhar para metas de crescimento com mais tranquilidade.';
  }

  if (normalizedQuestion.includes('fluxo de caixa')) {
    return 'Seu fluxo de caixa fica mais claro quando separamos três camadas: dinheiro disponível hoje, entradas confirmadas e despesas que ainda podem ser ajustadas. Minha sugestão é registrar os próximos sete dias antes de tomar uma decisão maior.';
  }

  if (normalizedQuestion.includes('despesas')) {
    return 'Para olhar despesas com calma, eu separaria o que é essencial, recorrente e ajustável. Assim você não precisa cortar tudo: dá para começar pelos gastos que menos afetam sua rotina e acompanhar o impacto no saldo projetado.';
  }

  if (normalizedQuestion.includes('metas')) {
    return 'Suas metas ficam mais fáceis de acompanhar quando cada uma tem valor-alvo, prazo e uma contribuição possível. Eu manteria as metas ativas, mas priorizaria primeiro as que protegem sua segurança financeira.';
  }

  return 'Posso te ajudar a transformar essa pergunta em um próximo passo financeiro mais claro. Para começar, eu olharia o impacto no saldo projetado, nas metas ativas e nas despesas que pedem atenção nesta semana.';
}

function UniAIPage() {
  const [messages, setMessages] = useState(conversationMessages);
  const [draftMessage, setDraftMessage] = useState('');
  const canSendMessage = draftMessage.trim().length > 0;

  function sendMessage(content) {
    const trimmedContent = content.trim();

    if (!trimmedContent) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('user', trimmedContent),
      createMessage('uni', getMockUniResponse(trimmedContent)),
    ]);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!canSendMessage) return;

    sendMessage(draftMessage);
    setDraftMessage('');
  }

  function handleSuggestionClick(suggestion) {
    sendMessage(suggestion);
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="uni-ai-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            Uni ativa
          </Badge>
          <h2 id="uni-ai-title">Converse com a Uni</h2>
          <p>
            A Uni transforma seu contexto financeiro em clareza, próximos passos e orientação prática sem julgamento.
          </p>
        </div>

        <div className={styles.heroAction}>
          <Avatar name="Uni Flow" initials="U" size="xl" status="online" />
          <div className={styles.heroButtons}>
            <Button>Nova conversa</Button>
            <Button variant="outline">Ver contexto</Button>
          </div>
        </div>
      </section>

      <section className={styles.mainGrid} aria-label="Experiência principal da Uni AI">
        <Card variant="default" padding="lg" className={styles.chatCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.cardTitle}>Conversa financeira</span>
              <p>Simulação visual da orientação da Uni com base no seu contexto.</p>
            </div>
            <Badge variant="glass">Mock</Badge>
          </div>

          <div className={styles.messages} aria-label="Mensagens simuladas">
            {messages.map((message) => (
              <article
                key={message.id}
                className={message.role === 'user' ? styles.userMessage : styles.uniMessage}
              >
                <Avatar
                  name={message.role === 'user' ? 'Você' : 'Uni'}
                  initials={message.role === 'user' ? 'VC' : 'U'}
                  size="sm"
                  status={message.role === 'uni' ? 'online' : undefined}
                />
                <div className={styles.bubble}>
                  <span>{message.role === 'user' ? 'Você' : 'Uni'}</span>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
          </div>

          <form className={styles.composer} aria-label="Enviar mensagem para a Uni" onSubmit={handleSubmit}>
            <Input
              fullWidth
              variant="glass"
              placeholder="Pergunte algo para a Uni..."
              aria-label="Pergunte algo para a Uni"
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
            />
            <Button type="submit" disabled={!canSendMessage}>
              Enviar
            </Button>
          </form>
        </Card>

        <aside className={styles.sideColumn} aria-label="Contexto da Uni">
          <Card variant="glass" padding="lg" className={styles.contextCard}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.cardTitle}>Contexto usado pela Uni</span>
                <p>Dados simulados que orientam as respostas nesta etapa.</p>
              </div>
            </div>

            <div className={styles.contextList}>
              {contextItems.map((item) => (
                <div key={item.label} className={styles.contextItem}>
                  <div>
                    <span className={styles.contextLabel}>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <Badge variant={item.variant} size="sm">
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </section>

      <section className={styles.suggestions} aria-labelledby="quick-suggestions-title">
        <div className={styles.sectionHeader}>
          <div>
            <Badge variant="primary" dot>
              Sugestões rápidas
            </Badge>
            <h3 id="quick-suggestions-title">Perguntas que a Uni pode ajudar a organizar</h3>
          </div>
        </div>

        <div className={styles.suggestionGrid}>
          {quickSuggestions.map((suggestion) => (
            <Card
              key={suggestion}
              variant="outline"
              padding="md"
              interactive
              className={styles.suggestionCard}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <span>{suggestion}</span>
            </Card>
          ))}
        </div>
      </section>

      <Card variant="outline" padding="md" className={styles.safetyCard}>
        <Badge variant="secondary">Limite da experiência</Badge>
        <p>
          A Uni orienta e recomenda caminhos possíveis, mas as decisões finais continuam sendo suas. Esta tela ainda usa
          dados mockados; a IA real será conectada em uma etapa futura.
        </p>
      </Card>
    </div>
  );
}

export default UniAIPage;
