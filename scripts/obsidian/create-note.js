/* global process */
import fs from 'node:fs';
import path from 'node:path';

const OBSIDIAN_VAULT_PATH = '/Users/wagnerweber/UniFlow AI - Base de Conhecimento';

const NOTE_TYPES = {
  decision: '10 - Decisões do Projeto',
  prompt: '09 - Prompts Codex',
  roadmap: '11 - Roadmap',
  webapp: '08 - WebApp',
  landing: '07 - Site Landing Page',
  design: '13 - Design System',
  database: '12 - Banco de Dados',
};

function parseArgs(args) {
  const parsed = {};

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const value = args[index + 1];

    if (!value || value.startsWith('--')) {
      parsed[key] = '';
      continue;
    }

    parsed[key] = value;
    index += 1;
  }

  return parsed;
}

function slugify(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function getDateParts(date = new Date()) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return {
    dateStamp: `${year}-${month}-${day}`,
    timeStamp: `${hours}:${minutes}:${seconds}`,
  };
}

function getUniqueFilePath(directory, baseName) {
  let attempt = 0;
  let candidate = path.join(directory, `${baseName}.md`);

  while (fs.existsSync(candidate)) {
    attempt += 1;
    candidate = path.join(directory, `${baseName}-${attempt}.md`);
  }

  return candidate;
}

function buildNote({ type, title, content }) {
  const { dateStamp, timeStamp } = getDateParts();

  return [
    `# ${title}`,
    '',
    `Data: ${dateStamp} ${timeStamp}`,
    `Tipo: ${type}`,
    '',
    content,
    '',
  ].join('\n');
}

function validateInput({ type, title, content }) {
  if (!type || !NOTE_TYPES[type]) {
    throw new Error(`Tipo inválido. Use um destes tipos: ${Object.keys(NOTE_TYPES).join(', ')}.`);
  }

  if (!title) {
    throw new Error('Informe um título com --title.');
  }

  if (!content) {
    throw new Error('Informe o conteúdo da nota com --content.');
  }

  if (!fs.existsSync(OBSIDIAN_VAULT_PATH)) {
    throw new Error(
      `Cofre do Obsidian não encontrado em "${OBSIDIAN_VAULT_PATH}". Ajuste OBSIDIAN_VAULT_PATH no topo do script.`
    );
  }
}

function createNote() {
  const args = parseArgs(process.argv.slice(2));
  const type = args.type;
  const title = args.title;
  const content = args.content;

  validateInput({ type, title, content });

  const folderName = NOTE_TYPES[type];
  const targetDirectory = path.join(OBSIDIAN_VAULT_PATH, folderName);
  const { dateStamp } = getDateParts();
  const safeTitle = slugify(title) || 'nota';
  const filePath = getUniqueFilePath(targetDirectory, `${dateStamp}-${safeTitle}`);
  const note = buildNote({ type, title, content });

  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.writeFileSync(filePath, note, { encoding: 'utf8', flag: 'wx' });

  console.log(`Nota criada no Obsidian: ${filePath}`);
}

try {
  createNote();
} catch (error) {
  console.error(`Não foi possível criar a nota: ${error.message}`);
  process.exitCode = 1;
}
