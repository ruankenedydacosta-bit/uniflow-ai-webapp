import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildConfirmationFromAction } from './uniChatAdapter.js';
import { resolveConfirmationCard } from './confirmationCardModel.js';
import {
  buildAccountCreationConfirmation,
  FINANCIAL_PENDING_ACTION_TYPES,
} from '../uni-conversation/financialPendingActionFlow.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// Épico #91 (#88) — tela 02 do redesign: conversa com a Uni e card de
// rascunho.
// ============================================================================

test('saída vira "Saída · rascunho", com a categoria na etiqueta e o valor em destaque', () => {
  const data = buildConfirmationFromAction({
    transactionType: 'expense',
    account: { name: 'Nubank' },
    category: { name: 'Alimentação' },
    description: 'Padaria',
    amount: 42,
    date: '2026-10-07',
  });
  const card = resolveConfirmationCard(data);
  assert.equal(card.kind, 'Saída · rascunho');
  assert.equal(card.tag, 'Alimentação');
  assert.match(card.amount, /^R\$\s42,00$/);
  assert.equal(card.amountLabel, null);
  assert.deepEqual(card.details.map((row) => row.label), ['Conta', 'Descrição', 'Data']);
});

test('depois de confirmado, o card perde o "rascunho"', () => {
  const data = buildConfirmationFromAction({ transactionType: 'income', amount: 100, account: { name: 'Itaú' } });
  assert.equal(resolveConfirmationCard({ ...data, status: 'confirmed' }).kind, 'Entrada');
});

test('ajuste de saldo mostra o novo saldo em destaque com o rótulo em cima', () => {
  const data = buildConfirmationFromAction({
    transactionType: 'adjustment',
    account: { name: 'Nubank' },
    currentBalance: 100,
    balanceDelta: 50,
    balanceTarget: 150,
  });
  const card = resolveConfirmationCard(data);
  assert.equal(card.kind, 'Ajuste de saldo · rascunho');
  assert.equal(card.amountLabel, 'Novo saldo');
  assert.deepEqual(card.details.map((row) => row.label), ['Conta', 'Saldo atual', 'Ajuste']);
});

test('card de criar conta mantém o título e todas as linhas, sem inventar valor', () => {
  const data = buildAccountCreationConfirmation({
    type: FINANCIAL_PENDING_ACTION_TYPES.CREATE_ACCOUNT,
    fields: { account: { name: 'Inter', account_type: 'checking' } },
  });
  const card = resolveConfirmationCard(data);
  assert.equal(card.kind, 'Criar conta para continuar');
  assert.equal(card.amount, null);
  assert.equal(card.details.length, data.rows.length);
});

test('card de confirmação usa os botões contornados e só mostra Confirmar enquanto pendente', async () => {
  const card = await source('components/ActionConfirmation.jsx');
  const css = await source('components/ActionConfirmation.module.css');
  assert.match(card, /import OutlineButton from '..\/..\/..\/components\/ui\/OutlineButton\/OutlineButton\.jsx';/);
  assert.match(card, /\{status === 'pending' && !isEditing && \(/);
  assert.match(card, /variant="confirm"[\s\S]*?onClick=\{onConfirm\}/);
  assert.match(card, /data-appearance=\{appearance\}/);
  assert.match(css, /--uf-app-brand-green\) 30%/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});

test('cabeçalho da conversa: orb de 28px, Uni, Espaço Pessoal, histórico e nova conversa', async () => {
  const header = await source('components/ChatHeader.jsx');
  assert.match(header, /<UniRingOrb\s+size=\{28\}/);
  assert.match(header, /'Espaço Empresa' : 'Espaço Pessoal'/);
  assert.match(header, /aria-label="Ver histórico"/);
  assert.match(header, /aria-label="Nova conversa"/);
});

test('mensagens: pedido em balão azul à direita e a Uni com o orb de 22px', async () => {
  const bubble = await source('components/MessageBubble.jsx');
  const css = await source('components/MessageBubble.module.css');
  assert.match(bubble, /<UniRingOrb size=\{22\} \/>/);
  assert.match(css, /\.user \{[^}]*border-radius: 16px 16px 4px 16px;/);
  assert.match(css, /\.rowUni \{[^}]*grid-template-columns: 22px/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});

test('campo da conversa: "Escreva ou fale com a Uni" e um botão só, voz ou enviar', async () => {
  const input = await source('components/ChatInput.jsx');
  assert.match(input, /placeholder="Escreva ou fale com a Uni"/);
  assert.match(input, /const showSendButton = Boolean\(value\.trim\(\)\) && !isCapturing;/);
  assert.match(input, /\{showSendButton \? \(/);
});
