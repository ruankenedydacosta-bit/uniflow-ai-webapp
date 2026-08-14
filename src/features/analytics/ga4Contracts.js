export const GA4_CONSENT_STATUS = Object.freeze({
  UNKNOWN: 'unknown',
  GRANTED: 'granted',
  DENIED: 'denied',
});

export const GA4_SCRIPT_ID = 'uniflow-ga4-script';

const createPage = (path, title) => Object.freeze({ path, title });

// Contrato fechado: somente páginas categóricas e canônicas podem gerar
// page_view. Rotas técnicas, legadas, desconhecidas e redirects ficam fora.
export const GA4_PAGE_CATALOG = Object.freeze({
  '/welcome': createPage('/welcome', 'Welcome'),
  '/login': createPage('/login', 'Login'),
  '/apresentacao': createPage('/apresentacao', 'Apresentacao'),
  '/plano-pessoal': createPage('/plano-pessoal', 'Plano Pessoal'),
  '/app/home': createPage('/app/home', 'Home'),
  '/app/uni': createPage('/app/uni', 'Uni'),
  '/app/registros': createPage('/app/registros', 'Registros'),
  '/app/agenda': createPage('/app/agenda', 'Agenda'),
  '/app/conta': createPage('/app/conta', 'Conta'),
  '/app/conta/editar-perfil': createPage('/app/conta/editar-perfil', 'Conta - Editar Perfil'),
  '/app/conta/seguranca': createPage('/app/conta/seguranca', 'Conta - Seguranca'),
  '/app/conta/plano': createPage('/app/conta/plano', 'Conta - Plano'),
  '/app/conta/pagamentos': createPage('/app/conta/pagamentos', 'Conta - Pagamentos'),
  '/app/conta/pagamentos/historico': createPage(
    '/app/conta/pagamentos/historico',
    'Conta - Historico de Pagamentos',
  ),
  '/app/conta/minhas-contas': createPage('/app/conta/minhas-contas', 'Conta - Minhas Contas'),
  '/app/conta/voz': createPage('/app/conta/voz', 'Conta - Voz'),
  '/app/conta/suporte': createPage('/app/conta/suporte', 'Conta - Suporte'),
  '/app/conta/suporte/uni': createPage('/app/conta/suporte/uni', 'Conta - Uni Suporte'),
  '/app/conta/tema': createPage('/app/conta/tema', 'Conta - Tema'),
  '/app/conta/sobre': createPage('/app/conta/sobre', 'Conta - Sobre'),
});

export const GA4_EXCLUDED_PATHS = Object.freeze([
  '/',
  '/cadastro',
  '/auth/callback',
  '/redefinir-senha',
  '/plano-pessoal/retorno',
]);

const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

function parseCanonicalPathname(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  try {
    return new URL(value, 'https://uniflow.invalid').pathname;
  } catch {
    return null;
  }
}

export function resolveGa4Config(env = {}) {
  const requestedEnabled = env.VITE_GA4_ENABLED === true
    || env.VITE_GA4_ENABLED === 'true';
  const candidateMeasurementId = typeof env.VITE_GA4_MEASUREMENT_ID === 'string'
    ? env.VITE_GA4_MEASUREMENT_ID.trim()
    : '';
  const hasValidMeasurementId = GA4_MEASUREMENT_ID_PATTERN.test(candidateMeasurementId);

  return Object.freeze({
    enabled: requestedEnabled && hasValidMeasurementId,
    requestedEnabled,
    hasValidMeasurementId,
    measurementId: hasValidMeasurementId ? candidateMeasurementId : '',
  });
}

export function resolveGa4Page(pathname) {
  const canonicalPathname = parseCanonicalPathname(pathname);
  return canonicalPathname ? GA4_PAGE_CATALOG[canonicalPathname] ?? null : null;
}

export function buildGa4PageView(pathname, origin) {
  const page = resolveGa4Page(pathname);
  if (!page || typeof origin !== 'string') return null;

  try {
    const parsedOrigin = new URL(origin);
    if (!['http:', 'https:'].includes(parsedOrigin.protocol)) return null;

    return Object.freeze({
      page_title: page.title,
      page_location: `${parsedOrigin.origin}${page.path}`,
    });
  } catch {
    return null;
  }
}
