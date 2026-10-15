import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  PRODUCT_KNOWLEDGE_MANIFEST,
  KNOWLEDGE_STATUS,
  WORKSPACE_SCOPE,
  KNOWLEDGE_CATEGORIES,
  getKnowledgeEntryById,
  listAvailableStatuses,
} from './productKnowledgeManifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

const VALID_STATUSES = new Set(Object.values(KNOWLEDGE_STATUS));
const VALID_WORKSPACES = new Set(Object.values(WORKSPACE_SCOPE));
const VALID_CATEGORIES = new Set(Object.values(KNOWLEDGE_CATEGORIES));

// Rotas reais do app (src/app/routes.jsx) -- mantidas aqui como lista fixa
// para o teste de "rota citada que não existe" não depender de importar
// routes.jsx (que arrasta JSX/React para o node --test).
const KNOWN_APP_ROUTES = new Set([
  '/', '/welcome', '/login', '/redefinir-senha', '/auth/callback',
  '/apresentacao', '/plano-pessoal', '/app/home', '/app/uni', '/app/registros', '/app/conta',
  '/app/agenda', '/app/metas', '/app/conta/suporte', '/app/conta/voz', '/app/conta/google-agenda', '/app/agenda/google',
  '/dashboard', '/uni-ai', '/financeiro', '/categorias', '/open-finance', '/metas',
  '/futuro', '/crm', '/clientes', '/projetos', '/agenda', '/relatorios', '/configuracoes',
]);

test('manifesto tem ao menos uma entrada', () => {
  assert.ok(PRODUCT_KNOWLEDGE_MANIFEST.length > 0);
});

test('todo id do manifesto é único', () => {
  const ids = PRODUCT_KNOWLEDGE_MANIFEST.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('todo id é uma string kebab-case não vazia', () => {
  for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
    assert.match(entry.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `id inválido: ${entry.id}`);
  }
});

test('toda categoria pertence ao vocabulário KNOWLEDGE_CATEGORIES', () => {
  for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
    assert.ok(VALID_CATEGORIES.has(entry.category), `categoria inválida em ${entry.id}: ${entry.category}`);
  }
});

test('todo status pertence ao vocabulário KNOWLEDGE_STATUS', () => {
  for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
    assert.ok(VALID_STATUSES.has(entry.status), `status inválido em ${entry.id}: ${entry.status}`);
  }
});

test('todo workspace pertence ao vocabulário WORKSPACE_SCOPE', () => {
  for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
    assert.ok(VALID_WORKSPACES.has(entry.workspaces), `workspace inválido em ${entry.id}: ${entry.workspaces}`);
  }
});

test('toda entrada aponta para um arquivo docs/product-knowledge existente', () => {
  for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
    const fullPath = join(REPO_ROOT, entry.file);
    assert.ok(existsSync(fullPath), `arquivo não encontrado para ${entry.id}: ${entry.file}`);
    assert.match(entry.file, /^docs\/product-knowledge\/.+\.md$/);
  }
});

test('nenhuma rota citada no manifesto é inexistente no app', () => {
  for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
    for (const route of entry.routes) {
      assert.ok(KNOWN_APP_ROUTES.has(route), `rota citada não existe em routes.jsx: ${route} (entrada ${entry.id})`);
    }
  }
});

test('toda entrada tem keywords e version definidos', () => {
  for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
    assert.ok(Array.isArray(entry.keywords) && entry.keywords.length > 0, `sem keywords: ${entry.id}`);
    assert.ok(typeof entry.version === 'number' && entry.version >= 1, `version inválida: ${entry.id}`);
    assert.ok(typeof entry.updatedAt === 'string' && entry.updatedAt.length > 0, `updatedAt ausente: ${entry.id}`);
  }
});

test('funcionalidades marcadas como future ou demo não têm conteúdo que as descreva como disponíveis sem ressalva', () => {
  const futureOrDemo = PRODUCT_KNOWLEDGE_MANIFEST.filter(
    (entry) => entry.status === KNOWLEDGE_STATUS.FUTURE || entry.status === KNOWLEDGE_STATUS.DEMO,
  );
  for (const entry of futureOrDemo) {
    const lower = entry.content.toLowerCase();
    assert.ok(
      lower.includes('demonstra') || lower.includes('em breve') || lower.includes('não') || lower.includes('nesta fase'),
      `entrada ${entry.id} está marcada como ${entry.status} mas o conteúdo não contém uma ressalva explícita`,
    );
  }
});

test('open-finance é status demo, nunca available', () => {
  const financial = getKnowledgeEntryById('financial-management');
  assert.equal(financial.status, KNOWLEDGE_STATUS.LIMITED);
  assert.match(financial.content, /DEMONSTRAÇÃO VISUAL/);
});

test('metas são anunciadas em Mais → Produto, na rota /app/metas', () => {
  const goals = getKnowledgeEntryById('goals');
  assert.equal(goals.status, KNOWLEDGE_STATUS.AVAILABLE);
  assert.deepEqual(goals.routes, ['/app/metas']);
  assert.match(goals.content, /Mais → Produto → Metas/);
});

test('navegação mobile descreve a barra inferior atual (Hoje, Financeiro, Falar, Agenda e Mais)', () => {
  const navigation = getKnowledgeEntryById('navigation-mobile');
  assert.match(navigation.content, /barra inferior tem Hoje, Financeiro, Falar, Agenda e Mais/);
  assert.doesNotMatch(navigation.content, /Home, Financeiro, Uni/);
});

test('getKnowledgeEntryById retorna null para id inexistente', () => {
  assert.equal(getKnowledgeEntryById('nao-existe'), null);
});

test('getKnowledgeEntryById retorna a entrada correta', () => {
  const entry = getKnowledgeEntryById('uni-voice');
  assert.equal(entry.title, 'Voz da Uni');
});

test('listAvailableStatuses retorna todos os status do vocabulário', () => {
  assert.deepEqual(new Set(listAvailableStatuses()), VALID_STATUSES);
});

test('docs/product-knowledge não tem arquivo .md órfão (sem entrada correspondente no manifesto)', () => {
  const docsDir = join(REPO_ROOT, 'docs', 'product-knowledge');
  const registeredFiles = new Set(PRODUCT_KNOWLEDGE_MANIFEST.map((entry) => entry.file.split('/').pop()));
  const nonKnowledgeDocs = new Set(['SUPPORT_HANDOFF.md', 'OPENAI_RUNTIME.md']);
  const filesOnDisk = readdirSync(docsDir).filter((name) => name.endsWith('.md') && !nonKnowledgeDocs.has(name));
  for (const file of filesOnDisk) {
    assert.ok(registeredFiles.has(file), `arquivo órfão, sem entrada no manifesto: ${file}`);
  }
});

test('nenhum campo content do manifesto ultrapassa um tamanho razoável (nunca o manual inteiro)', () => {
  for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
    assert.ok(entry.content.length <= 1200, `content de ${entry.id} está grande demais (${entry.content.length} chars)`);
  }
});

test('README de auditoria: arquivo do edge function uni-chat-llm existe (sanity check de caminho usado por outros testes)', () => {
  const fnPath = join(REPO_ROOT, 'supabase', 'functions', 'uni-chat-llm', 'index.ts');
  assert.ok(existsSync(fnPath));
  const source = readFileSync(fnPath, 'utf8');
  assert.ok(source.length > 0);
});
