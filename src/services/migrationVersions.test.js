import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';

// A integração Supabase ↔ GitHub registra cada migration pela versão (o
// prefixo antes do primeiro "_"). Duas migrations com a mesma versão abortam
// o deploy com "duplicate key value violates unique constraint
// schema_migrations_pkey", e nenhuma migration depois dela é aplicada.
//
// Este teste só olha o repositório. Ele não pega uma migration nova com
// versão menor que a última já aplicada no banco (branch antiga mergeada
// depois de outra): a integração recusa esse caso como fora de ordem.
const MIGRATIONS_DIR = new URL('../../supabase/migrations/', import.meta.url);

// Versões só com a data, anteriores a `supabase migration new`. Foi uma delas
// (20260801) que colidiu. Nenhuma versão nova pode ter só 8 dígitos.
const LEGACY_DATE_ONLY_VERSIONS = new Set([
  '20260710', '20260716', '20260719', '20260722',
  '20260724', '20260729', '20260731', '20260801',
]);

const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).sort();
const versionOf = (name) => name.split('_')[0];

test('toda migration tem versão numérica antes do primeiro "_", como o CLI exige', () => {
  for (const name of files) {
    assert.match(name, /^\d+_.+\.sql$/, name);
  }
});

test('versão nova tem 14 dígitos, o formato de supabase migration new', () => {
  for (const name of files) {
    const version = versionOf(name);
    if (LEGACY_DATE_ONLY_VERSIONS.has(version)) continue;
    assert.match(version, /^\d{14}$/, `${name}: crie a migration com supabase migration new`);
  }
});

test('nenhuma versão de migration se repete', () => {
  const seen = new Map();
  for (const name of files) {
    const version = versionOf(name);
    assert.ok(!seen.has(version), `${name} repete a versão ${version} de ${seen.get(version)}`);
    seen.set(version, name);
  }
});

test('na ordem dos arquivos, a versão cresce como texto e como número', () => {
  for (let index = 1; index < files.length; index += 1) {
    const previous = versionOf(files[index - 1]);
    const current = versionOf(files[index]);
    assert.ok(previous < current, `${files[index]} vem depois de ${files[index - 1]} só pelo nome`);
    assert.ok(
      BigInt(previous.padEnd(14, '0')) < BigInt(current.padEnd(14, '0')),
      `${files[index]} e ${files[index - 1]} têm a mesma data e hora`,
    );
  }
});
