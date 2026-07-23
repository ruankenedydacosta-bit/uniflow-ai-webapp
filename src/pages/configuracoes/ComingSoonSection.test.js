import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('ComingSoonSection renderiza title/description/message recebidos por prop, nunca dado fixo', async () => {
  const content = await source('ComingSoonSection.jsx');
  assert.match(content, /function ComingSoonSection\(\{ title, description, message \}\)/);
  assert.match(content, /<h3>\{title\}<\/h3>/);
  assert.match(content, /<p>\{description\}<\/p>/);
  assert.match(content, /<p className="uf-text-caption">\{message\}<\/p>/);
});

test('sempre exibe o badge "Em breve" (nunca "Ativo" nem outro status que implique configuracao real)', async () => {
  const content = await source('ComingSoonSection.jsx');
  assert.match(content, /<Badge variant="secondary" size="sm">\s*\n\s*Em breve\s*\n\s*<\/Badge>/);
  assert.doesNotMatch(content, /Ativo|Planejado/);
});

test('reaproveita Card/Badge e estilos ja existentes -- nenhum CSS novo, nenhuma dependencia nova', async () => {
  const content = await source('ComingSoonSection.jsx');
  assert.match(content, /import Badge from '\.\.\/\.\.\/components\/ui\/Badge';/);
  assert.match(content, /import Card from '\.\.\/\.\.\/components\/ui\/Card';/);
  assert.match(content, /import styles from '\.\.\/SettingsPage\.module\.css';/);
  assert.match(content, /className=\{styles\.settingsCard\}/);
  assert.match(content, /className=\{styles\.sectionHeader\}/);
});

test('nao e um controle interativo -- sem onClick, sem <a>, sem <button> proprio', async () => {
  const content = await source('ComingSoonSection.jsx');
  assert.doesNotMatch(content, /onClick|<a |<button/);
});

test('nao chama Supabase/services -- componente puramente apresentacional', async () => {
  const content = await source('ComingSoonSection.jsx');
  assert.doesNotMatch(content, /supabase|Service/i);
});
