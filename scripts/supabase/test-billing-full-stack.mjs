import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, readdir, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function validateLocalConnection(status) {
  assert.ok(['native', 'docker', 'podman'].includes(status.runtime), 'LOCAL_RUNTIME_REQUIRED');
  assert.ok(path.basename(path.dirname(status.identity?.project_root ?? '')).startsWith('uniflow-asaas-hml-'), 'ISOLATED_PROJECT_REQUIRED');
  for (const key of ['API_URL', 'DB_URL']) {
    const url = new URL(status.env?.[key]);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'LOOPBACK_ONLY');
    assert.ok(key === 'DB_URL' ? ['postgres:', 'postgresql:'].includes(url.protocol) : url.protocol === 'http:', 'LOCAL_PROTOCOL_REQUIRED');
  }
  for (const key of ['ANON_KEY', 'SERVICE_ROLE_KEY']) assert.ok(status.env[key], 'LOCAL_KEYS_REQUIRED');
  return status.env;
}
const repo = fileURLToPath(new URL('../../', import.meta.url));
export async function runFullStack(connectionFile, { resume = false } = {}) {
  const status = JSON.parse(await readFile(connectionFile, 'utf8'));
  const env = validateLocalConnection(status);
  const root = path.dirname(connectionFile);
  const report = { startedAt: new Date().toISOString(), runtime: status.runtime, migrations: [], assertions: [], providerCalls: 0, blockedExternalRequests: 0 };
  const transport = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      report.blockedExternalRequests += 1;
      throw new Error('NONLOCAL_TRANSPORT_FORBIDDEN');
    }
    return transport(input, options);
  };
  const check = (ok, name) => {
    report.assertions.push({ name, passed: Boolean(ok) });
    assert.ok(ok, name);
    console.log(`PASS ${name}`);
  };
  const db = new URL(env.DB_URL);
  const pgEnv = { ...process.env, PGHOST: db.hostname, PGPORT: db.port, PGUSER: db.username, PGPASSWORD: decodeURIComponent(db.password), PGDATABASE: db.pathname.slice(1) };
  function sql(query, { admin = false } = {}) {
    const result = spawnSync('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...pgEnv, ...(admin ? { PGUSER: 'supabase_admin' } : {}) }, input: query, encoding: 'utf8',
    });
    if (result.status !== 0) {
      const code = result.stderr.match(/ERROR:\s*([^\n]+)/)?.[1] ?? 'PSQL_FAILED';
      throw new Error(`LOCAL_SQL_FAILED: ${code}`);
    }
    return result.stdout.trim();
  }
  async function http(route, { jwt, body, method = body ? 'POST' : 'GET', service = false } = {}) {
    const key = service ? env.SERVICE_ROLE_KEY : env.ANON_KEY;
    const response = await fetch(`${env.API_URL}${route}`, { method, redirect: 'error',
      headers: { apikey: key, Authorization: `Bearer ${jwt ?? key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(60000) });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = null; }
    return { status: response.status, ok: response.ok, data };
  }
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  try {
    // Disable background dispatch before ANY source migration schedules jobs.
    // The historical migrations contain production URLs; no job may run here.
    sql("alter system set cron.launch_active_jobs='off'", { admin: true });
    sql('select pg_reload_conf()', { admin: true });
    for (let i = 0; i < 20 && sql('show cron.launch_active_jobs', { admin: true }) !== 'off'; i += 1) await new Promise((r) => setTimeout(r, 100));
    check(sql('show cron.launch_active_jobs', { admin: true }) === 'off', 'cron disabled before migrations');
    const migrations = (await readdir(path.join(repo, 'supabase/migrations'))).filter((f) => f.endsWith('.sql')).sort();
    const baseline = migrations.filter((f) => Number(f.split('_')[1]) < 48);
    const billing = migrations.filter((f) => Number(f.split('_')[1]) >= 48);
    const appliedPath = path.join(root, 'migrations-applied.json');
    let applied = [];
    if (resume) {
      applied = JSON.parse(await readFile(appliedPath, 'utf8'));
      check(applied.every((f) => Number(f.split('_')[1]) < 48), 'resume allowed only before billing migrations');
    }
    else check(sql("select to_regclass('public.workspaces') is null") === 't', 'fresh isolated database');
    for (const file of baseline) {
      if (!applied.includes(file)) { sql(await readFile(path.join(repo, 'supabase/migrations', file), 'utf8')); applied.push(file); }
    }
    await writeFile(appliedPath, JSON.stringify(applied));
    console.log(`Baseline migrations: ${baseline.length}/${baseline.length}`);
    const users = {};
    for (const role of ['owner', 'outsider', 'disabled', 'viewer']) {
      const email = `hml-${role}-${randomUUID()}@example.invalid`;
      const password = randomBytes(28).toString('base64url');
      const created = await http('/auth/v1/admin/users', { service: true, body: { email, password, email_confirm: true } });
      check(created.ok && created.data?.id, `Auth creates isolated ${role}`);
      const login = await http('/auth/v1/token?grant_type=password', { body: { email, password } });
      check(login.ok && login.data?.access_token, `Auth issues real JWT for ${role}`);
      users[role] = { id: created.data.id, jwt: login.data.access_token };
    }
    const ids = Object.fromEntries(['personal', 'business', 'businessUnpaid', 'foreign', 'latest', 'account', 'foreignAccount', 'subscription'].map((name) => [name, randomUUID()]));
    for (const [name, type, owner, plan] of [
      ['personal','personal','owner','pro'], ['business','business','owner','business'],
      ['businessUnpaid','business','owner','pro'], ['foreign','personal','outsider','pro'],
    ]) {
      sql(`insert into public.workspaces(id,name,workspace_type,owner_user_id) values(${quote(ids[name])},'HML billing',${quote(type)},${quote(users[owner].id)});
      insert into public.subscriptions(${name === 'personal' ? 'id,' : ''}workspace_id,plan_id,status,current_period_ends_at,asaas_customer_id,asaas_subscription_id,payment_method)
      values(${name === 'personal' ? quote(ids.subscription) + ',' : ''}${quote(ids[name])},${quote(plan)},'active',now()+interval '30 days',${quote('cus_hml_'+name)},${quote('sub_hml_'+name)},'pix');`);
    }
    sql(`insert into public.workspace_members(workspace_id,user_id,role,status) values
      (${quote(ids.personal)},${quote(users.disabled.id)},'member','disabled'),
      (${quote(ids.personal)},${quote(users.viewer.id)},'viewer','active');
      insert into public.accounts(id,workspace_id,name,account_type) values
      (${quote(ids.account)},${quote(ids.personal)},'HML account','checking'),
      (${quote(ids.foreignAccount)},${quote(ids.foreign)},'HML foreign','checking');
      insert into public.clients(workspace_id,name) values(${quote(ids.business)},'HML paid'),(${quote(ids.businessUnpaid)},'HML unpaid');
      insert into public.billing_payments(workspace_id,asaas_payment_id,asaas_subscription_id,status,billing_type,value) values(${quote(ids.personal)},'pay_hml','sub_hml_personal','received','pix',29.9);`);
    const preservedSql = 'select jsonb_agg(to_jsonb(s) order by id) from public.subscriptions s';
    const before = JSON.parse(sql(preservedSql));
    for (const file of billing) {
      sql(await readFile(path.join(repo, 'supabase/migrations', file), 'utf8'));
      applied.push(file); await writeFile(appliedPath, JSON.stringify(applied));
    }
    check(applied.length === migrations.length, 'all source migrations applied without mocks or skipped files');
    const after = JSON.parse(sql(preservedSql));
    const originalFields = Object.keys(before[0]);
    const project = (rows) => rows.map((row) => Object.fromEntries(originalFields.map((key) => [key, row[key]])));
    check(JSON.stringify(project(before)) === JSON.stringify(project(after)), 'preexisting paid subscriber fields preserved exactly');
    report.subscriberSnapshotSha256 = createHash('sha256').update(JSON.stringify(project(after))).digest('hex');
    report.migrations = await Promise.all(migrations.map(async (file) => ({ file, sha256: createHash('sha256').update(await readFile(path.join(repo, 'supabase/migrations', file))).digest('hex') })));
    sql("notify pgrst, 'reload schema'");
    const select = async (role, table, workspace) => http(`/rest/v1/${table}?workspace_id=eq.${workspace}&select=*`, { jwt: users[role].jwt });
    const capability = async (workspace, name) => http('/rest/v1/rpc/workspace_has_plan_capability', { jwt: users.owner.jwt, body: { target_workspace_id: workspace, target_capability_id: name } });
    check((await select('owner','accounts',ids.personal)).data?.length === 1, 'paid owner retains account access through PostgREST');
    check((await select('outsider','accounts',ids.personal)).data?.length === 0, 'foreign JWT cannot read paid workspace');
    check((await select('disabled','accounts',ids.personal)).data?.length === 0, 'disabled membership cannot read paid workspace');
    check((await select('viewer','accounts',ids.personal)).data?.length === 1, 'active viewer can read owned workspace');
    check(!(await http('/rest/v1/accounts', { jwt: users.viewer.jwt, body: { workspace_id: ids.personal, name: 'HML forbidden', account_type: 'checking' } })).ok, 'viewer write rejected by real RLS');
    check((await capability(ids.personal,'reports')).data === true, 'Pro reports capability preserved');
    check((await capability(ids.personal,'business_features')).data === false, 'Pro never gains Business capability');
    check((await capability(ids.business,'business_features')).data === true, 'Business capability preserved');
    check((await select('owner','clients',ids.business)).data?.length === 1, 'paid Business reads clients');
    check((await select('owner','clients',ids.businessUnpaid)).data?.length === 0, 'Pro on business workspace cannot bypass Business RLS');
    check(!(await http('/rest/v1/subscriptions?id=eq.'+ids.subscription, { jwt: users.owner.jwt, method: 'PATCH', body: { status: 'active' } })).ok, 'subscriber cannot write subscription authorization');
    check(!(await http('/rest/v1/rpc/reserve_pix_automatic', { jwt: users.owner.jwt, body: { p_workspace_id: ids.personal, p_plan_id: 'pro', p_value: 29.9 } })).ok, 'authenticated JWT cannot execute service-only Pix reservation');
    check(!(await http('/rest/v1/accounts?select=id', { jwt: 'invalid.jwt.signature' })).ok, 'forged JWT rejected by PostgREST/Auth gateway');
    sql(`update public.subscriptions set status='suspended' where id=${quote(ids.subscription)}`);
    check((await select('owner','accounts',ids.personal)).data?.length === 0, 'suspension denies product reads with real JWT');
    check((await select('owner','billing_payments',ids.personal)).data?.length === 1, 'suspension retains billing history for regularization');
    check(sql(`select count(*) from public.accounts where id=${quote(ids.account)}`) === '1', 'suspension does not delete financial data');
    sql(`update public.subscriptions set status='active' where id=${quote(ids.subscription)}`);
    check((await select('owner','accounts',ids.personal)).data?.length === 1, 'reactivation restores same persisted financial data');
    sql(`insert into public.workspaces(id,name,workspace_type,owner_user_id) values(${quote(ids.latest)},'HML latest','business',${quote(users.owner.id)});
      insert into public.subscriptions(workspace_id,plan_id,status,current_period_ends_at,created_at) values
      (${quote(ids.latest)},'business','canceled',now()+interval '30 days',now()-interval '1 day'),
      (${quote(ids.latest)},'business','pending',null,now());`);
    check((await capability(ids.latest,'business_features')).data === false, 'new pending prevents fallback to older paid subscription');
    check(sql("select not has_function_privilege('authenticated','public.reserve_pix_automatic(uuid,text,numeric)','execute') and not has_function_privilege('anon','public.reserve_pix_automatic(uuid,text,numeric)','execute')") === 't', 'Pix reservation has no authenticated or anon execute grants');
    const automaticWorkspace = randomUUID();
    sql(`insert into public.workspaces(id,name,workspace_type,owner_user_id) values(${quote(automaticWorkspace)},'HML automatic local fixture','personal',${quote(users.owner.id)});
      insert into public.billing_customers(workspace_id,asaas_customer_id) values(${quote(automaticWorkspace)},'cus_hml_automatic');`);
    const reserve = await http('/rest/v1/rpc/reserve_pix_automatic', { service: true, body: { p_workspace_id: automaticWorkspace, p_plan_id: 'pro', p_value: 29.9 } });
    check(reserve.ok && reserve.data?.claimed === true, 'service-role reserves isolated Automatic Pix fixture through PostgREST');
    const authorization = reserve.data.authorization;
    const canonical = { id: 'authorization_hml', contractId: authorization.contract_id, customerId: 'cus_hml_automatic', value: 29.9, frequency: 'MONTHLY', paymentCreationMode: 'SUBSCRIPTION', status: 'ACTIVE' };
    const appliedAuth = await http('/rest/v1/rpc/apply_pix_authorization', { service: true, body: { p_authorization_id: authorization.id, p_remote: canonical } });
    check(appliedAuth.ok && appliedAuth.data === true, 'service-role applies isolated authorization fixture through real RPC');
    check((await select('owner','subscriptions',automaticWorkspace)).data?.[0]?.status === 'pending', 'ACTIVE consent fixture alone never grants paid access');
    const foreignAuth = await select('outsider','billing_pix_authorizations',automaticWorkspace);
    check(foreignAuth.ok && foreignAuth.data?.length === 0, 'Automatic Pix authorization isolated from foreign JWT');
    const future = new Date(Date.now() + 30 * 86400000).toISOString();
    const payment = { id: 'pay_hml_automatic', customer: 'cus_hml_automatic', value: 29.9, status: 'RECEIVED', local_status: 'received', paymentDate: new Date().toISOString().slice(0,10) };
    const patch = { status: 'active', current_period_ends_at: future };
    check(!(await http('/rest/v1/rpc/apply_pix_automatic_payment', { service: true, body: { p_authorization_id: authorization.id, p_payment: { ...payment, customer: 'cus_foreign' }, p_patch: patch } })).ok, 'Automatic Pix RPC rejects customer mismatch');
    const paid = await http('/rest/v1/rpc/apply_pix_automatic_payment', { service: true, body: { p_authorization_id: authorization.id, p_payment: payment, p_patch: patch } });
    check(paid.ok && paid.data === true, 'verified payment fixture activates through real transaction');
    check((await select('owner','subscriptions',automaticWorkspace)).data?.[0]?.status === 'active', 'paid automatic fixture visible as active to owner JWT');
    const eventId = randomUUID();
    sql(`insert into public.webhook_events(id,asaas_event_id,event_type,payload) values(${quote(eventId)},${quote('evt_hml_'+eventId)},'PAYMENT_RECEIVED','{}');`);
    const claims = await Promise.all([0,1].map(() => http('/rest/v1/rpc/claim_billing_webhook_event', { service: true, body: { target_event_id: eventId } })));
    check(claims.every((row) => row.ok) && claims.filter((row) => row.data?.length === 1).length === 1, 'concurrent real PostgREST webhook claims accept exactly one worker');
    // Real handler code with real Auth/PostgREST transport; only the Deno
    // registration/env adapter is supplied by Node. This is not an Edge deploy.
    const previousDeno = globalThis.Deno;
    const edgeEnv = { SUPABASE_URL: env.API_URL, SUPABASE_ANON_KEY: env.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
      APP_ALLOWED_ORIGINS: 'http://127.0.0.1:4173', ASAAS_BASE_URL: 'https://api-sandbox.asaas.com/v3',
      ASAAS_WEBHOOK_TOKEN: randomBytes(32).toString('hex'), UNIFLOW_PIX_AUTOMATIC_ENABLED: 'false', UNIFLOW_PIX_AUTOMATIC_PROCESSING_ENABLED: 'false' };
    let webhookHandler;
    globalThis.Deno = { env: { get: (name) => edgeEnv[name] }, serve: (handler) => { webhookHandler = handler; } };
    try {
      const { handlePixAutomatic } = await import('../../supabase/functions/billing-pix-automatic/index.ts');
      const request = (action, jwt = users.owner.jwt) => new Request('http://127.0.0.1/fixture', { method: 'POST', headers: { Origin: edgeEnv.APP_ALLOWED_ORIGINS, Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ workspace_id: automaticWorkspace, action }) });
      const availability = await handlePixAutomatic(request('availability'));
      check(availability.status === 200 && (await availability.json()).available === false, 'commercial Automatic Pix offer remains disabled with real Auth JWT');
      check((await handlePixAutomatic(request('create'))).status === 409, 'disabled commercial flag prevents new authorization');
      check((await handlePixAutomatic(request('create', users.outsider.jwt))).status === 403, 'Automatic Pix handler rejects cross-workspace real JWT');
      await import('../../supabase/functions/billing-webhook/index.ts');
      const forged = await webhookHandler(new Request('http://127.0.0.1/fixture', { method: 'POST', headers: { 'asaas-access-token': 'forged_fixture' }, body: JSON.stringify({ id: 'evt_forged', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_forged' } }) }));
      check(forged.status === 401, 'webhook handler rejects forged token before provider or persistence');
    } finally { globalThis.Deno = previousDeno; }
    check(sql('show cron.launch_active_jobs', { admin: true }) === 'off', 'scheduled production dispatch remained disabled throughout');
    check(report.blockedExternalRequests === 0, 'no provider or nonlocal HTTP request attempted by validator or handlers');
    report.result = 'passed';
  } catch (error) {
    report.result = 'failed'; report.failure = error.message;
    throw error;
  } finally {
    globalThis.fetch = transport;
    report.finishedAt = new Date().toISOString();
    const evidence = path.join(root, 'billing-full-stack-evidence.json');
    await writeFile(evidence, JSON.stringify(report, null, 2)); await chmod(evidence, 0o600);
    console.log(`Evidence: ${evidence}`);
  }
  return report;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const connectionFile = process.argv[process.argv.indexOf('--connection-file') + 1];
  if (!process.argv.includes('--connection-file') || !connectionFile) {
    console.error('BLOCKED: --connection-file from an isolated local Supabase stack is required. No request made.'); process.exitCode = 2;
  } else {
    try { const report = await runFullStack(connectionFile, { resume: process.argv.includes('--resume-local') }); console.log(`Full Supabase stack: ${report.assertions.length} assertions passed; ${report.migrations.length} migrations.`); }
    catch (error) { console.error(`FAILED: ${error.message}`); process.exitCode = 1; }
  }
}
