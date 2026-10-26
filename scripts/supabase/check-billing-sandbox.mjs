import { assessSandboxEnvironment } from './billing-homologation-config.mjs';
// Read-only preflight. Never reads .env files or prints credentials/resources.
const key = process.env.ASAAS_API_KEY;
const base = process.env.ASAAS_BASE_URL;
const readiness = assessSandboxEnvironment(process.env);
console.log(JSON.stringify(readiness));
if (!readiness.commercialFlagsDisabled) {
  console.error('REFUSED: commercial Pix Automatic flags must remain disabled during this homologation.');
  process.exitCode = 1;
} else if (base && base !== 'https://api-sandbox.asaas.com/v3') {
  console.error('REFUSED: ASAAS_BASE_URL must point exactly to the Asaas Sandbox.');
  process.exitCode = 1;
} else if (!key || !base) {
  console.log(`SKIPPED: required environment names: ${[!key && 'ASAAS_API_KEY', !base && 'ASAAS_BASE_URL'].filter(Boolean).join(', ')}. No provider request made.`);
  process.exitCode = 2;
} else {
  try {
    const response = await fetch(`${base}/subscriptions?limit=1`, {
      headers: { access_token: key, 'User-Agent': 'UniFlowAI-Sandbox-Preflight', accept: 'application/json' },
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    console.log(`Sandbox read-only connectivity: HTTP ${response.status}. This does not validate payment, webhook delivery or activation.`);
    if (!response.ok) process.exitCode = 1;
    await response.body?.cancel();
  } catch {
    console.error('FAILED: Sandbox read-only connectivity. No response or credential details logged.');
    process.exitCode = 1;
  }
}
