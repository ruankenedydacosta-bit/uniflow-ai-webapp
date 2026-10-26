import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLocalConnection } from './test-billing-full-stack.mjs';
const status = { runtime: 'native', identity: { project_root: '/tmp/uniflow-asaas-hml-fixture/project' }, env: { API_URL: 'http://127.0.0.1:23456', DB_URL: 'postgresql://fixture:fixture@127.0.0.1:23457/postgres', ANON_KEY: 'fixture-anon', SERVICE_ROLE_KEY: 'fixture-service' } };
test('homologation accepts only an explicitly isolated local stack', () => assert.equal(validateLocalConnection(status), status.env));
for (const [name, override] of [
  ['hosted API', { env: { ...status.env, API_URL: 'https://project.supabase.co' } }],
  ['hosted database', { env: { ...status.env, DB_URL: 'postgresql://fixture:fixture@db.project.supabase.co/postgres' } }],
  ['lookalike loopback', { env: { ...status.env, API_URL: 'http://127.0.0.1.evil.invalid' } }],
  ['wrong protocol', { env: { ...status.env, API_URL: 'https://127.0.0.1' } }],
  ['unrelated local project', { identity: { project_root: '/tmp/another-project/project' } }],
  ['missing key', { env: { ...status.env, SERVICE_ROLE_KEY: '' } }],
]) test(`homologation refuses ${name} before network or SQL`, () => assert.throws(() => validateLocalConnection({ ...status, ...override })));

const { assessSandboxEnvironment } = await import('./billing-homologation-config.mjs');
const configured = { ASAAS_API_KEY: 'sensitive-fixture-never-print', ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3', ASAAS_ACCOUNT_ID: 'fixture-account', ASAAS_WEBHOOK_TOKEN: 'sensitive-webhook-fixture', SUPABASE_URL: 'http://127.0.0.1:21564', SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'sensitive-service-fixture', APP_ALLOWED_ORIGINS: 'http://127.0.0.1:4173' };
test('Sandbox readiness never includes credential values', () => {
  const report = assessSandboxEnvironment(configured);
  assert.equal(report.e2eReady, true);
  assert.doesNotMatch(JSON.stringify(report), /sensitive-|fixture-account|fixture-anon/);
});
test('Sandbox readiness blocks production Asaas and production Supabase', () => {
  assert.equal(assessSandboxEnvironment({ ...configured, ASAAS_BASE_URL: 'https://api.asaas.com/v3' }).providerReadReady, false);
  assert.equal(assessSandboxEnvironment({ ...configured, SUPABASE_URL: 'https://ikulazofzufeblzrhtif.supabase.co', SUPABASE_HOMOLOGATION_PROJECT_REF: 'ikulazofzufeblzrhtif' }).e2eReady, false);
});
test('commercial Pix Automatic flags cannot silently enable during validation', () => {
  for (const flag of ['UNIFLOW_PIX_AUTOMATIC_ENABLED','VITE_UNIFLOW_PIX_AUTOMATIC_ENABLED']) assert.equal(assessSandboxEnvironment({ ...configured, [flag]: 'true' }).e2eReady, false);
});
test('missing secrets yield a list of names, not a false green result', () => {
  const report = assessSandboxEnvironment({});
  assert.equal(report.e2eReady, false);
  assert.ok(report.missing.includes('ASAAS_WEBHOOK_TOKEN'));
  assert.ok(report.missing.includes('SUPABASE_SERVICE_ROLE_KEY'));
});
