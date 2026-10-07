import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';

// A integração Supabase ↔ GitHub registra cada migration pela versão (o
// prefixo antes do primeiro "_"). Duas migrations com a mesma versão abortam
// o deploy com "duplicate key value violates unique constraint
// schema_migrations_pkey", e nenhuma migration depois dela é aplicada.
const MIGRATIONS_DIR = new URL('../../supabase/migrations/', import.meta.url);

const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();

test('toda migration tem versão numérica antes do primeiro "_"', () => {
  for (const name of files) {
    assert.match(name, /^\d{8,14}_[a-z0-9_]+\.sql$/, name);
  }
});

test('nenhuma versão de migration se repete', () => {
  const seen = new Map();
  for (const name of files) {
    const version = name.split('_')[0];
    assert.ok(!seen.has(version), `${name} repete a versão ${version} de ${seen.get(version)}`);
    seen.set(version, name);
  }
});

test('a ordem por nome de arquivo é a mesma da ordem numérica da versão', () => {
  const versions = files.map((name) => BigInt(name.split('_')[0].padEnd(14, '0')));
  const sorted = [...versions].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  assert.deepEqual(versions, sorted);
});
