import Badge from '../../components/ui/Badge';
import Card from '../../components/ui/Card';
import styles from '../SettingsPage.module.css';

/**
 * Bloco neutro para funcionalidades de Configuracoes que ainda nao existem
 * (CFG4): nunca simula um valor configurado ou um recurso já ligado --
 * apenas rotula claramente que o recurso ainda não chegou e explica em uma
 * frase o que falta. Reaproveita Card/Badge/estilos já existentes
 * (styles.settingsCard/sectionHeader) -- nenhuma CSS nova.
 */
function ComingSoonSection({ title, description, message }) {
  return (
    <Card variant="default" padding="lg" className={styles.settingsCard}>
      <div className={styles.sectionHeader}>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <Badge variant="secondary" size="sm">
          Em breve
        </Badge>
      </div>
      <p className="uf-text-caption">{message}</p>
    </Card>
  );
}

export default ComingSoonSection;
