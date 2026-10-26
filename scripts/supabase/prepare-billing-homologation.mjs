import { mkdtemp, mkdir, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateLocalConnection } from './test-billing-full-stack.mjs';

// Uses an already available CLI >=2.121. No package/global installation, link,
// remote project creation, production environment or real credentials involved.
const binary = process.env.SUPABASE_HML_CLI ?? 'supabase';
const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });
const parts = version.stdout?.trim().replace(/^v/, '').split('.').map(Number) ?? [];
if (version.status !== 0 || parts[0] < 2 || (parts[0] === 2 && parts[1] < 121) || !Number.isFinite(parts[1])) {
  console.error('BLOCKED: Supabase CLI >=2.121 is required for the isolated native runtime. Set SUPABASE_HML_CLI to its executable; no request made.');
  process.exitCode = 2;
} else {
  const root = await mkdtemp(path.join(os.tmpdir(), 'uniflow-asaas-hml-'));
  const project = path.join(root, 'project');
  await mkdir(path.join(project, 'supabase'), { recursive: true });
  const runtimeHome = process.env.SUPABASE_HML_HOME ?? path.join(root, 'runtime');
  await writeFile(path.join(project, 'supabase/config.toml'), `project_id = "uniflow-asaas-hml-54"
[experimental]
stack = true
[db]
major_version = 17
[db.seed]
enabled = false
[auth]
enabled = true
site_url = "http://127.0.0.1:4173"
[auth.email]
enable_signup = true
enable_confirmations = false
[studio]
enabled = false
[analytics]
enabled = false
[realtime]
enabled = false
[edge_runtime]
enabled = false
[db.pooler]
enabled = false
`);
  const cliEnv = { ...process.env, SUPABASE_HOME: runtimeHome, SUPABASE_EXPERIMENTAL_STACK: '1' };
  const start = spawnSync(binary, ['start', '--runtime', 'native', '--preparation', 'on-demand', '--exclude', 'studio,mail,analytics,pooler,realtime,functions', '--workdir', project], { env: cliEnv, encoding: 'utf8', timeout: 600000 });
  const log = path.join(root, 'startup-private.log');
  await writeFile(log, `${start.stdout ?? ''}\n${start.stderr ?? ''}`); await chmod(log, 0o600);
  if (start.status !== 0) {
    console.error(`BLOCKED: native startup failed. Private local diagnostics: ${log}`); process.exitCode = 2;
  } else {
    try {
      const result = spawnSync(binary, ['status', '--workdir', project, '--output-format', 'json'], { env: cliEnv, encoding: 'utf8' });
      const status = JSON.parse(result.stdout);
      validateLocalConnection(status);
      const file = path.join(root, 'connection-private.json');
      await writeFile(file, JSON.stringify(status)); await chmod(file, 0o600);
      const manifest = { cli: binary, runtimeHome, project, version: version.stdout.trim() };
      await writeFile(path.join(root, 'local-runtime.json'), JSON.stringify(manifest, null, 2));
      console.log(`READY: isolated local Supabase. Connection file: ${file}`);
      console.log('Migrations have not been applied. Run the full-stack validator, which disables cron BEFORE applying the complete chain.');
    } catch {
      console.error(`BLOCKED: local connection validation failed. Private diagnostics: ${log}`); process.exitCode = 2;
    }
  }
}
