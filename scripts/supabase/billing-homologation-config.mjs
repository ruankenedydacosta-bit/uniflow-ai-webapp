// Returns names/booleans only. Never returns a credential, URL, token or CPF.
const REQUIRED_E2E = ['ASAAS_API_KEY','ASAAS_BASE_URL','ASAAS_ACCOUNT_ID','ASAAS_WEBHOOK_TOKEN','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ALLOWED_ORIGINS'];
const COMMERCIAL_FLAGS = ['UNIFLOW_PIX_AUTOMATIC_ENABLED','VITE_UNIFLOW_PIX_AUTOMATIC_ENABLED'];
export function assessSandboxEnvironment(env) {
  const missing = REQUIRED_E2E.filter((name) => !env[name]);
  const sandbox = env.ASAAS_BASE_URL === 'https://api-sandbox.asaas.com/v3';
  const commercialFlagsDisabled = COMMERCIAL_FLAGS.every((name) => !env[name] || env[name] === 'false');
  let isolatedSupabase = false;
  try {
    const target = new URL(env.SUPABASE_URL);
    isolatedSupabase = (target.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(target.hostname))
      || (target.protocol === 'https:' && Boolean(env.SUPABASE_HOMOLOGATION_PROJECT_REF)
        && env.SUPABASE_HOMOLOGATION_PROJECT_REF !== 'ikulazofzufeblzrhtif'
        && target.hostname === `${env.SUPABASE_HOMOLOGATION_PROJECT_REF}.supabase.co`);
  } catch { /* Missing or unknown target remains blocked. */ }
  return { missing, sandbox, isolatedSupabase, commercialFlagsDisabled,
    providerReadReady: Boolean(env.ASAAS_API_KEY) && sandbox && commercialFlagsDisabled,
    e2eReady: !missing.length && sandbox && isolatedSupabase && commercialFlagsDisabled };
}
