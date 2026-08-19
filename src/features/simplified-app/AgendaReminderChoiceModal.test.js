import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = () => readFile(new URL('./AgendaReminderChoiceModal.jsx', import.meta.url), 'utf8');
const css = () => readFile(new URL('./AgendaReminderChoiceModal.module.css', import.meta.url), 'utf8');

// ============================================================================
// AGPUSH1/AGPUSH2 -- AgendaReminderChoiceModal.jsx (fallback iPhone/deep
// link + microinteracao). Mesmo padrao de cobertura estrutural usado no
// resto do projeto (sem Testing Library/jsdom).
// ============================================================================

test('sempre confere o estado atual no servidor antes de oferecer a escolha -- nunca assume que ainda esta pendente', async () => {
  const content = await source();
  assert.match(content, /import \{ getAgendaPushReminderState \} from '\.\.\/agenda-push\/agendaPushReminderService\.js';/);
  assert.match(content, /const result = await getAgendaPushReminderState\(item\.id\);/);
});

test('se ja houver reminder_decision_at, mostra so uma confirmacao -- nunca reoferece a escolha (outro dispositivo pode ja ter decidido)', async () => {
  const content = await source();
  assert.match(content, /const decisionMade = Boolean\(result\?\.data\?\.reminder_decision_at\);/);
  assert.match(content, /state\.decisionMade \?/);
  assert.match(content, /Já registramos sua escolha para este compromisso\./);
});

test('as tres escolhas usam exatamente os offsets aceitos pela Edge Function (30, 60, none)', async () => {
  const content = await source();
  assert.match(content, /offset: '30', label: '30 min antes'/);
  assert.match(content, /offset: '60', label: '1h antes'/);
  assert.match(content, /offset: 'none', label: 'Não precisa'/);
});

test('escolha e enviada via sendAgendaReminderDecision (caminho autenticado) -- nunca uma segunda implementacao de escrita', async () => {
  const content = await source();
  assert.match(content, /import \{ sendAgendaReminderDecision \} from '\.\.\/mobile-push\/pushEdgeFunctions\.js';/);
  assert.match(content, /await sendAgendaReminderDecision\(\{[\s\S]{0,120}?agendaItemId: item\.id,[\s\S]{0,60}?offset: option\.offset,/);
});

test('bloqueia fechamento enquanto envia -- mesmo padrao de AgendaStatusConfirmModal', async () => {
  const content = await source();
  assert.match(content, /closeOnOverlayClick=\{!isBusy\}/);
  assert.match(content, /closeOnEsc=\{!isBusy\}/);
});

// ---------------------------------------------------------------------------
// AGPUSH2 -- a animacao e CONSEQUENCIA de um sucesso real, nunca condicao
// da gravacao nem promessa antecipada.
// ---------------------------------------------------------------------------

test('CRITICO: a persistencia acontece ANTES de qualquer feedback visual de sucesso', async () => {
  const content = await source();
  const handler = content.slice(content.indexOf('async function handleChoose'), content.indexOf('const isLoading'));
  const persistIndex = handler.indexOf('await sendAgendaReminderDecision');
  const confirmIndex = handler.indexOf('setConfirmed(option)');
  const appliedIndex = handler.indexOf('onReminderApplied?.(');
  assert.ok(persistIndex > -1);
  assert.ok(confirmIndex > persistIndex, 'a confirmacao visual so pode vir depois da persistencia');
  assert.ok(appliedIndex > confirmIndex, 'a particula so pode ser disparada depois da confirmacao');
});

test('CRITICO: backend falhou => nenhuma animacao de sucesso, modal permanece e permite tentar de novo', async () => {
  const content = await source();
  const handler = content.slice(content.indexOf('async function handleChoose'), content.indexOf('const isLoading'));
  const errorBlock = handler.slice(handler.indexOf('if (result?.error)'), handler.indexOf('// 2.'));
  assert.match(errorBlock, /setLocalError\(/);
  assert.match(errorBlock, /return;/);
  assert.doesNotMatch(errorBlock, /setConfirmed|onReminderApplied/);
});

test('"Nao precisa" reporta offsetMinutes null -- nenhum lembrete instalado, nenhuma particula ate o card', async () => {
  const content = await source();
  assert.match(content, /offsetMinutes: option\.offset === 'none' \? null : Number\.parseInt\(option\.offset, 10\)/);
  assert.match(content, /confirmedLabel: 'Sem lembrete'/);
});

test('a origem da particula e medida do proprio dialogo, no instante em que ele ainda esta na tela', async () => {
  const content = await source();
  assert.match(content, /closest\('\[role="dialog"\]'\)/);
  assert.match(content, /getBoundingClientRect\?\.\(\) \?\? null/);
  const handler = content.slice(content.indexOf('async function handleChoose'));
  assert.ok(
    handler.indexOf('readOriginRect()') < handler.indexOf('onReminderApplied?.('),
    'o rect precisa ser lido antes de o modal ser desmontado',
  );
});

test('prefers-reduced-motion pula o recolhimento do modal (confirmacao + fade simples)', async () => {
  const content = await source();
  assert.match(content, /import \{ prefersReducedMotion \} from '\.\.\/agenda-push\/agendaReminderAnimation\.js';/);
  assert.match(content, /if \(!reduced\) \{\s*\n\s*setIsCollapsing\(true\);/);
});

test('toque duplo no botao nunca dispara duas persistencias', async () => {
  const content = await source();
  assert.match(content, /if \(isSubmitting \|\| confirmed\) return;/);
});

// ---------------------------------------------------------------------------
// CSS -- fases 1 e 2 (feedback do toque e recolhimento)
// ---------------------------------------------------------------------------

test('FASE 1: o botao responde ao toque com scale ~0.97 e brilho interno discreto da marca', async () => {
  const content = await css();
  const start = content.indexOf('.choiceButton:active');
  const activeBlock = content.slice(start, content.indexOf('}', start));
  assert.match(activeBlock, /transform:\s*scale\(0\.97\);/);
  assert.match(activeBlock, /inset 0 0 \d+px color-mix\(in srgb, var\(--uf-app-(primary|ai)\)/);
});

test('FASE 2: o modal se condensa (scale ~0.92 + opacity 0 + blur), nunca so desaparece', async () => {
  const content = await css();
  const start = content.indexOf('.dialogCollapsing {');
  const collapsing = content.slice(start, content.indexOf('}', start));
  assert.match(collapsing, /transform:\s*scale\(0\.92\);/);
  assert.match(collapsing, /opacity:\s*0;/);
  assert.match(collapsing, /filter:\s*blur\(\d+px\);/);
});

test('o recolhimento nao usa bounce -- nenhum cubic-bezier com overshoot', async () => {
  const content = await css();
  assert.doesNotMatch(content, /cubic-bezier\([^)]*1\.[1-9]\d*\s*\)/);
  assert.match(content, /transform 180ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
});

test('reduced motion desliga transform/blur/animacoes do modal', async () => {
  const content = await css();
  const reduced = content.slice(content.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.dialogCollapsing \{\s*\n\s*transform: none;\s*\n\s*filter: none;/);
  assert.match(reduced, /\.confirmation \{\s*\n\s*animation: none;/);
});

test('a paleta do modal usa somente tokens de marca -- nenhum verde/amarelo/laranja', async () => {
  const content = await css();
  assert.doesNotMatch(content, /\b(green|yellow|orange)\b/i);
  assert.doesNotMatch(content, /--uf-app-success|--uf-app-warning/);
});
