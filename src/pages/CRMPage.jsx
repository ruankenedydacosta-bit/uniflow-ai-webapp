import { useState } from 'react';
import { useAccess } from '../app/AccessContext';
import { WORKSPACE_TYPES } from '../app/access.js';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import { cx } from '../utils/cx';
import { formatCurrency } from '../utils/formatters';
import { crmMock } from './crm/crm.mock.js';
import styles from './CRMPage.module.css';

function CRMPage() {
  const { access } = useAccess();
  const [showStageHint, setShowStageHint] = useState(false);
  const isBusinessWorkspace = access.currentWorkspace === WORKSPACE_TYPES.BUSINESS;
  const crm = crmMock.business;

  if (!isBusinessWorkspace) {
    return (
      <div className={styles.page}>
        <section className={styles.hero} aria-labelledby="crm-title">
          <div className={styles.heroCopy}>
            <Badge variant="outline" dot>
              Empresarial
            </Badge>
            <h2 id="crm-title">CRM</h2>
            <p>CRM está disponível no espaço empresarial.</p>
          </div>
        </section>

        <Card variant="outline" padding="lg" className={styles.lockedCard}>
          <h3>Troque para o espaço empresarial</h3>
          <p>Este módulo conecta clientes, oportunidades, follow-ups e receita potencial da empresa.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="crm-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            {crm.workspaceLabel}
          </Badge>
          <h2 id="crm-title">CRM</h2>
          <p>{crm.subtitle}</p>
        </div>

        <div className={styles.actions}>
          <Button>Nova oportunidade</Button>
          <Button variant="secondary">Perguntar à Uni</Button>
        </div>
      </section>

      <section className={styles.focusGrid} aria-label="Oportunidades que merecem atenção">
        <Card variant="glass" padding="lg" className={styles.attentionCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.eyebrow}>Pipeline comercial</span>
              <h3>Oportunidades que merecem atenção</h3>
            </div>
            <Badge variant="warning" size="sm" dot>
              Hoje
            </Badge>
          </div>
          <p className={styles.attentionText}>{crm.attention}</p>
        </Card>

        <Card variant="outline" padding="lg" className={styles.nextCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Próxima ação recomendada</h3>
              <p>O movimento comercial mais útil agora.</p>
            </div>
          </div>
          <strong>{crm.nextAction}</strong>
        </Card>
      </section>

      <section className={styles.pipelineSection} aria-labelledby="crm-pipeline-title">
        <div className={styles.sectionHeader}>
          <div>
            <h3 id="crm-pipeline-title">Pipeline compacto</h3>
            <p>Oportunidades conectadas aos clientes, com próximo passo claro.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon="+"
            aria-expanded={showStageHint}
            onClick={() => setShowStageHint((currentShowStageHint) => !currentShowStageHint)}
          >
            Nova etapa
          </Button>
        </div>

        {showStageHint ? (
          <div className={styles.stageHint} role="status">
            Em breve, você poderá criar etapas como Cancelado, Pós-venda ou Aguardando pagamento.
          </div>
        ) : null}

        <div className={styles.pipeline} aria-label="Pipeline de oportunidades">
          {crm.pipeline.map((stage) => (
            <Card key={stage.stage} variant="default" padding="md" className={styles.stageCard}>
              <div className={styles.stageHeader}>
                <strong>{stage.stage}</strong>
                <Badge variant="glass" size="sm">
                  {stage.opportunities.length}
                </Badge>
              </div>

              <div className={styles.opportunityList}>
                {stage.opportunities.map((opportunity) => (
                  <div key={`${stage.stage}-${opportunity.client}`} className={styles.opportunityCard}>
                    <div className={styles.opportunityTop}>
                      <strong>{opportunity.client}</strong>
                      <Badge variant={opportunity.variant} size="sm">
                        {opportunity.priority}
                      </Badge>
                    </div>
                    <span className={styles.value}>{formatCurrency(opportunity.value)}</span>
                    <span className={styles.meta}>
                      {opportunity.status} · {opportunity.lastInteraction}
                    </span>
                    <p>{opportunity.nextStep}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className={styles.guidanceGrid} aria-label="Follow-ups e leitura da Uni">
        <Card variant="glass" padding="lg" className={styles.followCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Próximos follow-ups</h3>
              <p>Ações comerciais mockadas para recuperar contexto sem abrir outro sistema.</p>
            </div>
          </div>

          <div className={styles.followList}>
            {crm.followUps.map((followUp, index) => (
              <div key={followUp} className={styles.followItem}>
                <span className={cx(styles.followDot, styles[`followTone${index + 1}`])} aria-hidden="true" />
                <p>{followUp}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="outline" padding="lg" className={styles.uniCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h3>Leitura da Uni</h3>
              <p>O que clientes, oportunidades e receita potencial indicam.</p>
            </div>
            <Badge variant="glass" size="sm" dot>
              Uni
            </Badge>
          </div>
          <p>{crm.uniReading}</p>
        </Card>
      </section>
    </div>
  );
}

export default CRMPage;
