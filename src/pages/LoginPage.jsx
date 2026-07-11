import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../app/SessionContext';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import styles from './LoginPage.module.css';

function LoginPage() {
  const navigate = useNavigate();
  const {
    error: sessionError,
    isDemoMode,
    signInWithPassword,
  } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setFormError('Informe email e senha para continuar.');
      return;
    }

    setFormError('');
    setIsSubmitting(true);

    try {
      const result = await signInWithPassword({
        email: email.trim(),
        password,
      });

      if (result.error) {
        setFormError('Não foi possível entrar. Confira seus dados e tente novamente.');
        return;
      }

      const requiresOnboarding =
        result.profileMissing ||
        !result.data?.profile?.onboarding_completed;

      navigate(requiresOnboarding ? '/onboarding' : '/dashboard', {
        replace: true,
      });
    } catch {
      setFormError('Não foi possível entrar. Confira seus dados e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div className={styles.brandBlock}>
          <Badge variant="glass" dot>
            {isDemoMode ? 'Demo mockado' : 'Acesso seguro'}
          </Badge>
          <span className={styles.brand}>UniFlow AI</span>
          <h1 id="login-title">A clareza financeira começa com uma decisão melhor.</h1>
          <p>
            {isDemoMode
              ? 'Entre no demo ou comece configurando como a Uni deve organizar sua experiência financeira.'
              : 'Entre com sua conta para continuar sua experiência financeira com segurança.'}
          </p>
        </div>

        <Card variant="glass" padding="lg" className={styles.loginCard}>
          <div>
            <span className={styles.eyebrow}>Entrada inicial</span>
            <h2>
              {isDemoMode
                ? 'Conheça a Uni sem autenticação real'
                : 'Entre na sua conta'}
            </h2>
            <p>
              {isDemoMode
                ? 'Esta etapa prepara o fluxo futuro de login, cadastro e onboarding sem conectar Supabase ainda.'
                : 'Use seu email e senha cadastrados para acessar a UniFlow AI.'}
            </p>
          </div>

          {isDemoMode ? (
            <div className={styles.actions}>
              <Button fullWidth onClick={() => navigate('/dashboard')}>
                Entrar no demo
              </Button>
              <Button variant="secondary" fullWidth onClick={() => navigate('/onboarding')}>
                Começar agora
              </Button>
            </div>
          ) : (
            <form className={styles.actions} onSubmit={handleSubmit}>
              <Input
                id="login-email"
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={isSubmitting}
                required
                fullWidth
              />
              <Input
                id="login-password"
                label="Senha"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
                error={
                  formError ||
                  (sessionError
                    ? 'Não foi possível carregar sua sessão. Tente novamente.'
                    : '')
                }
                required
                fullWidth
              />
              <Button
                type="submit"
                fullWidth
                loading={isSubmitting}
                disabled={!email.trim() || !password}
              >
                Entrar
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => navigate('/onboarding')}
              >
                Começar agora
              </Button>
            </form>
          )}
        </Card>
      </section>
    </main>
  );
}

export default LoginPage;
