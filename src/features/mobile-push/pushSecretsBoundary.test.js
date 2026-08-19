import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ============================================================================
// PUSH1 -- limite de segredo mais importante desta fase: a VAPID private key
// (e a service role key) NUNCA podem existir em nenhum arquivo servido ao
// navegador (src/, public/). Varre o codigo-fonte real em vez de confiar em
// um unico arquivo, exatamente o tipo de regressao que uma revisao manual
// pode deixar passar num commit futuro.
// ============================================================================

const repoRoot = path.resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const FRONTEND_DIRS = ['src', 'public'];
const FORBIDDEN_PATTERNS = [/VAPID_PRIVATE_KEY/, /SUPABASE_SERVICE_ROLE_KEY/];

function collectFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      files.push(...collectFiles(fullPath));
    } else if (/\.(js|jsx|ts|tsx|css|json)$/.test(entry) && !/\.test\.(js|jsx|ts|tsx)$/.test(entry)) {
      // Arquivos de teste sao excluidos de proposito: eles PRECISAM
      // mencionar o nome do segredo para afirmar sua ausencia (mesmo
      // padrao ja usado por billingEdgeFunctions.test.js/
      // confirmedFinancialActionService.test.js) -- isso nunca e um
      // vazamento real, e o oposto: e a prova de que o limite existe.
      files.push(fullPath);
    }
  }
  return files;
}

test('VAPID_PRIVATE_KEY e SUPABASE_SERVICE_ROLE_KEY nunca aparecem em src/ ou public/ (frontend)', () => {
  const offenders = [];
  for (const dirName of FRONTEND_DIRS) {
    const dir = path.join(repoRoot, dirName);
    for (const filePath of collectFiles(dir)) {
      const content = readFileSync(filePath, 'utf8');
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) offenders.push(`${filePath} :: ${pattern}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('VAPID_PRIVATE_KEY existe no backend (Edge Function push-send-test-notification), confirmando que o segredo tem onde viver', () => {
  const functionSource = readFileSync(
    path.join(repoRoot, 'supabase/functions/push-send-test-notification/index.ts'),
    'utf8',
  );
  assert.match(functionSource, /VAPID_PRIVATE_KEY/);
});
