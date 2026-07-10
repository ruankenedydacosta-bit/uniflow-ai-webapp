import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { formatCurrency } from '../utils/formatters';
import { clientsMock } from './clientes/clients.mock.js';
import styles from './ClientesPage.module.css';

function ClientesPage() {
  const { access } = useAccess();
  const isBusinessWorkspace = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS;
  const clients = clientsMock.business;

  if (!isBusinessWorkspace) {
    return (
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="clientes-title">
          <div className={styles.heroCopy}>
            <Badge variant="outline" dot>
              Empresarial
            </Badge>
            <h2 id="clientes-title">Clientes</h2>
            <p>Clientes está disponível no espaço empresarial.</p>
          </div>
        </section>

        <Card variant="outline" padding="lg" className={styles.lockedCard}>
          <h3>Troque para o espaço empresarial</h3>
          <p>Este módulo organiza relacionamento, cobranças e oportunidades da empresa sem misturar dados pessoais.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="clientes-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {clients.workspaceLabel}
          </Badge>
          <h2 id="clientes-title">Clientes</h2>
          <p>{clients.subtitle}</p>
        </div>

        <div className={styles.actions}>
          <Button>Novo cliente</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.focusGrid} aria-label="Clientes que merecem atenção">
        <Card variant="glass" padding="lg" className={styles.attentionCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Relacionamento empresarial</span>
              <h3>Clientes que merecem atenção</h3>
            </div>
            <Badge variant="warning" size="sm" dot>
              Hoje
            </Badge>
          </div>
          <p className={styles.attentionText}>{clients.attention}</p>
        </Card>

        <Card variant="outline" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>O que relacionamento, receita e retorno indicam agora.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <p>{clients.uniReading}</p>
        </Card>
      </section>

      <section className={styles.clientsSection} aria-labelledby="clientes-list-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="clientes-list-title">Relacionamentos em acompanhamento</h3>
            <p>Clientes mockados para validar atenção, receita, status e próximo passo.</p>
          </div>
        </div>

        <div className={styles.clientGrid}>
          {clients.clients.map((client) => (
            <Card key={client.name} variant="default" padding="md" className={styles.clientCard}>
              <div className={styles.clientTop}>
                <div>
                  <strong>{client.name}</strong>
                  <span>{client.type}</span>
                </div>
                <Badge variant={client.variant} size="sm">
                  {client.status}
                </Badge>
              </div>

              <div className={styles.clientMeta}>
                <div>
                  <span>Valor associado</span>
                  <strong>{formatCurrency(client.value)}</strong>
                </div>
                <div>
                  <span>Último contato</span>
                  <strong>{client.lastContact}</strong>
                </div>
              </div>

              <p>{client.nextAction}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.actionsSection} aria-labelledby="clientes-actions-title">
        <Card variant="glass" padding="lg" className={styles.nextActionsCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3 id="clientes-actions-title">Próximas ações</h3>
              <p>Uma fila simples para orientar relacionamento sem virar CRM pesado.</p>
            </div>
          </div>

          <div className={styles.nextActionList}>
            {clients.nextActions.map((action, index) => (
              <div key={action} className={styles.nextActionItem}>
                <span className={cx(styles.actionDot, styles[`actionTone${index + 1}`])} aria-hidden="true" />
                <p>{action}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}

export default ClientesPage;
