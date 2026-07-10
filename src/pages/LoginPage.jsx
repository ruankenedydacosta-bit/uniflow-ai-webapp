import { useNavigate } from 'react-router-dom';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import styles from './LoginPage.module.css';

function LoginPage() {
  const navigate = useNavigate();

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.brandBlock}>
          <Badge variant="glass" dot>
            Demo mockado
          </Badge>
          <span className={styles.brand}>UniFlow AI</span>
          <h1 id="login-title">A clareza financeira começa com uma decisão melhor.</h1>
          <p>
            Entre no demo ou comece configurando como a Uni deve organizar sua experiência financeira.
          </p>
        </div>

        <Card variant="glass" padding="lg" className={styles.loginCard}>
          <div>
            <span className={styles.eyebrow}>Entrada inicial</span>
            <h2>Conheça a Uni sem autenticação real</h2>
            <p>
              Esta etapa prepara o fluxo futuro de login, cadastro e onboarding sem conectar Supabase ainda.
            </p>
          </div>

          <div className={styles.actions}>
            <Button fullWidth onClick={() => navigate('/dashboard')}>
              Entrar no demo
            </Button>
            <Button variant="secondary" fullWidth onClick={() => navigate('/onboarding')}>
              Começar agora
            </Button>
          </div>
        </Card>
      </section>
    </main>
  );
}

export default LoginPage;
