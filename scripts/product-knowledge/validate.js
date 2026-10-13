// OPENAI3: validador standalone da base de conhecimento de produto.
// Rodar apos editar docs/product-knowledge/*.md ou productKnowledgeManifest.js:
//
//   node scripts/product-knowledge/validate.js
//
// Sai com codigo != 0 se algo estiver inconsistente -- pensado para uso
// manual ou em CI, sem exigir o test runner. As mesmas checagens tambem
// existem como testes unitarios em
// src/features/product-knowledge/productKnowledgeManifest.test.js; este
// script reusa a MESMA fonte (o manifesto), nao duplica os dados.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';
import {
  PRODUCT_KNOWLEDGE_MANIFEST,
  KNOWLEDGE_STATUS,
  WORKSPACE_SCOPE,
  KNOWLEDGE_CATEGORIES,
} from '../../src/features/product-knowledge/productKnowledgeManifest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DOCS_DIR = join(REPO_ROOT, 'docs', 'product-knowledge');

const KNOWN_APP_ROUTES = new Set([
  '/', '/welcome', '/login', '/redefinir-senha', '/auth/callback',
  '/apresentacao', '/plano-pessoal', '/app/home', '/app/uni', '/app/registros', '/app/conta',
  '/app/agenda', '/app/metas', '/app/conta/suporte', '/app/conta/voz', '/app/conta/google-agenda', '/app/agenda/google',
  '/dashboard', '/uni-ai', '/financeiro', '/categorias', '/open-finance', '/metas', '/objetivos',
  '/futuro', '/crm', '/clientes', '/projetos', '/agenda', '/relatorios', '/configuracoes',
]);

const VALID_STATUSES = new Set(Object.values(KNOWLEDGE_STATUS));
const VALID_WORKSPACES = new Set(Object.values(WORKSPACE_SCOPE));
const VALID_CATEGORIES = new Set(Object.values(KNOWLEDGE_CATEGORIES));

const FUTURE_DISPONIVEL_PATTERN = /est[aá] dispon[ií]vel(?! em breve)/i;

const problems = [];
const warnings = [];

function fail(message) {
  problems.push(message);
}

function warn(message) {
  warnings.push(message);
}

// 1) ids unicos, kebab-case
const ids = PRODUCT_KNOWLEDGE_MANIFEST.map((e) => e.id);
const idCounts = ids.reduce((acc, id) => acc.set(id, (acc.get(id) ?? 0) + 1), new Map());
for (const [id, count] of idCounts) {
  if (count > 1) fail(`id duplicado no manifesto: "${id}" aparece ${count} vezes.`);
}
for (const id of ids) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(`id fora do padrao kebab-case: "${id}".`);
}

// 2) cada entrada aponta para um arquivo existente dentro de docs/product-knowledge
for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
  const fullPath = join(REPO_ROOT, entry.file);
  if (!existsSync(fullPath)) {
    fail(`entrada "${entry.id}" aponta para um arquivo que nao existe: ${entry.file}`);
  }
  if (!entry.file.startsWith('docs/product-knowledge/')) {
    fail(`entrada "${entry.id}" tem "file" fora de docs/product-knowledge/: ${entry.file}`);
  }
  if (!VALID_STATUSES.has(entry.status)) fail(`entrada "${entry.id}" tem status invalido: ${entry.status}`);
  if (!VALID_WORKSPACES.has(entry.workspaces)) fail(`entrada "${entry.id}" tem workspaces invalido: ${entry.workspaces}`);
  if (!VALID_CATEGORIES.has(entry.category)) fail(`entrada "${entry.id}" tem category invalida: ${entry.category}`);
}

// 3) documento em disco sem entrada correspondente no manifesto (orfao)
const registeredFiles = new Set(PRODUCT_KNOWLEDGE_MANIFEST.map((e) => e.file.split('/').pop()));
const NON_KNOWLEDGE_DOCS = new Set(['SUPPORT_HANDOFF.md', 'OPENAI_RUNTIME.md']);
const filesOnDisk = existsSync(DOCS_DIR)
  ? readdirSync(DOCS_DIR).filter((name) => name.endsWith('.md') && !NON_KNOWLEDGE_DOCS.has(name))
  : [];
for (const file of filesOnDisk) {
  if (!registeredFiles.has(file)) fail(`arquivo em docs/product-knowledge/ sem entrada no manifesto: ${file}`);
}

// 4) rota citada que nao existe no app
for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
  for (const route of entry.routes ?? []) {
    if (!KNOWN_APP_ROUTES.has(route)) {
      fail(`entrada "${entry.id}" cita uma rota que nao existe em routes.jsx: ${route}`);
    }
  }
}

// 5) funcionalidade future/demo descrita como disponivel sem ressalva
for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
  if (entry.status !== KNOWLEDGE_STATUS.FUTURE && entry.status !== KNOWLEDGE_STATUS.DEMO) continue;
  if (FUTURE_DISPONIVEL_PATTERN.test(entry.content)) {
    fail(`entrada "${entry.id}" (status ${entry.status}) descreve a funcionalidade como disponivel sem ressalva.`);
  }
}

// 6) duplicacao grosseira de conteudo entre entradas (mesmo texto colado em dois ids)
const contentSeen = new Map();
for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
  const key = entry.content.trim().toLowerCase();
  if (contentSeen.has(key)) {
    fail(`conteudo identico entre "${contentSeen.get(key)}" e "${entry.id}" -- provavel duplicacao.`);
  } else {
    contentSeen.set(key, entry.id);
  }
}

// 7) conflito simples: mesma rota marcada com workspaces incompativeis entre entradas diferentes
const routeWorkspace = new Map();
for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
  for (const route of entry.routes ?? []) {
    const prev = routeWorkspace.get(route);
    if (prev && prev.workspace !== entry.workspaces
      && prev.workspace !== WORKSPACE_SCOPE.BOTH && entry.workspaces !== WORKSPACE_SCOPE.BOTH) {
      warn(`rota ${route} tem workspaces conflitantes entre "${prev.id}" (${prev.workspace}) e "${entry.id}" (${entry.workspaces}).`);
    }
    routeWorkspace.set(route, { id: entry.id, workspace: entry.workspaces });
  }
}

// 8) content nunca "o manual inteiro" (teto de tamanho por entrada)
for (const entry of PRODUCT_KNOWLEDGE_MANIFEST) {
  if (entry.content.length > 1200) {
    warn(`entrada "${entry.id}" tem content com ${entry.content.length} caracteres -- considere encurtar.`);
  }
}

const sourceOfEdgeFn = join(REPO_ROOT, 'supabase', 'functions', 'uni-chat-llm', 'index.ts');
if (existsSync(sourceOfEdgeFn)) {
  const edgeSource = readFileSync(sourceOfEdgeFn, 'utf8');
  if (!edgeSource.includes('SUPPORT_MODE_INSTRUCTIONS')) {
    fail('supabase/functions/uni-chat-llm/index.ts nao contem mais SUPPORT_MODE_INSTRUCTIONS -- modo suporte pode ter sido removido/renomeado sem atualizar este validador.');
  }
}

console.log(`Base de conhecimento: ${PRODUCT_KNOWLEDGE_MANIFEST.length} entradas verificadas.`);
if (warnings.length > 0) {
  console.log(`\n${warnings.length} aviso(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (problems.length > 0) {
  console.error(`\n${problems.length} problema(s) encontrados:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\nTudo certo.');
