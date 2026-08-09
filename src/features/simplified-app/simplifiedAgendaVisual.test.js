import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

// ============================================================================
// LOTE AGENDA VISUAL: a rota /app/agenda (já sempre registrada) agora monta
// um CALENDÁRIO simplificado de verdade -- grade de mês, hoje destacado,
// dia selecionado, painel de compromissos do dia, formulário simples que
// reutiliza agendaFormUtils/agendaService. A lista completa legada segue na
// rota /agenda (AgendaPage), fora do escopo deste lote.
// ============================================================================

test('rota SIMPLIFIED_ROUTES.AGENDA continua sendo /app/agenda (não duplica contrato)', () => {
  assert.equal(SIMPLIFIED_ROUTES.AGENDA, '/app/agenda');
});

test('SimplifiedAgendaPage renderiza calendário com cabeçalho "Agenda" e voltar para Conta', async () => {
  const page = await source('./SimplifiedAgendaPage.jsx');
  assert.match(page, /<h1>Agenda<\/h1>/);
  assert.match(page, /aria-label="Voltar para Conta"/);
  assert.match(page, /navigate\(SIMPLIFIED_ROUTES\.ACCOUNT\)/);
  assert.match(page, /useAgenda\(\{/);
  assert.match(page, /data-simplified-agenda/);
});

test('SimplifiedAgendaPage tem navegação de meses: anterior, próximos e "Hoje"', async () => {
  const page = await source('./SimplifiedAgendaPage.jsx');
  assert.match(page, /aria-label="Mês anterior"/);
  assert.match(page, /aria-label="Próximo mês"/);
  assert.match(page, /aria-label="Ir para hoje"/);
  assert.match(page, /selectToday\(\)/);
  assert.match(page, /moveMonth\(-1\)/);
  assert.match(page, /moveMonth\(1\)/);
  assert.match(page, /\bbuildMonthGrid\(/);
});

test('grade usa o mesmo gerador de grade testado (simplifiedAgendaCalendar) -- padroes de acessibilidade presentes', async () => {
  const page = await source('./SimplifiedAgendaPage.jsx');
  assert.match(page, /buildMonthGrid\(/);
  assert.match(page, /WEEKDAY_HEADER_LABELS/);
  assert.match(page, /aria-label=\{`\$\{formatDayHeading/);
  assert.match(page, /aria-pressed=\{isSelected\}/);
  assert.match(page, /eventDot/);
});

test('dia selecionado abre painel: compromissos do dia + botão "+ Novo compromisso"', async () => {
  const page = await source('./SimplifiedAgendaPage.jsx');
  assert.match(page, /formatDayHeading\(new Date\(/);
  assert.match(page, /\+ Novo compromisso/);
  assert.match(page, /selectedDayItems/);
  assert.match(page, /Nenhum compromisso neste dia\./);
});

test('novo compromisso e edição usam SimplifiedAgendaFormModal (nunca split agenda direto)', async () => {
  const page = await source('./SimplifiedAgendaPage.jsx');
  assert.match(page, /SimplifiedAgendaFormModal/);
  assert.match(page, /openCreate\(\)/);
  assert.match(page, /openEdit\(item\)/);
  assert.doesNotMatch(page, /supabase/);
  assert.doesNotMatch(page, /\.from\('agenda_items'\)/);
});

test('exclusão usa confirmação real (AgendaDeleteConfirmModal) -- nunca delete sem confirmação', async () => {
  const page = await source('./SimplifiedAgendaPage.jsx');
  assert.match(page, /AgendaDeleteConfirmModal/);
  assert.match(page, /setDeletingItem\(item\)/);
  assert.match(page, /onClose=\{\(\) => setDeletingItem\(null\)\}/);
});

test('form de edição expõe botão "Excluir" que pede confirmação (nunca excluded.so direto)', async () => {
  const [form, page] = await Promise.all([
    source(`./${FORM_MODAL}`),
    source('./SimplifiedAgendaPage.jsx'),
  ]);
  assert.match(form, /Excluir/);
  assert.match(form, /onRequestDelete/);
  assert.match(form, /variant="danger"/);
  assert.match(page, /onRequestDelete=\{\(item\) => \{/);
});

// ============================================================================
// Formulário simples -- reaproveita contrato oficial, campos do LOTE.
// ============================================================================

const FORM_MODAL = 'SimplifiedAgendaFormModal.jsx';

test('form: campos do LOTE presentes (Título*, Data, Horário, Dia inteiro, Observações)', async () => {
  const form = await source(`./${FORM_MODAL}`);
  assert.match(form, /Título do compromisso/);
  assert.match(form, /aria-required="true"/);
  assert.match(form, /type="date"/);
  assert.match(form, /type="time"/);
  assert.match(form, /Dia inteiro/);
  assert.match(form, /Observações/);
  assert.match(form, /<textarea/);
});

test('form: Cancelar não envia nada; Salvar passa por validateAgendaItemForm + buildAgendaItemCreationPayload', async () => {
  const form = await source(`./${FORM_MODAL}`);
  assert.match(form, /validateAgendaItemForm\(/);
  assert.match(form, /buildAgendaItemCreationPayload\(/);
  assert.match(form, /variant="ghost"/);
  assert.match(form, /Cancelar/);
  assert.match(form, /loading=\{isMutating\}/);
  assert.match(form, /onClose\(\)/);
});

test('form: criação e edição são os MESMOS builders (createItem / updateItem), com client_operation_id via agendaService', async () => {
  const form = await source(`./${FORM_MODAL}`);
  assert.match(form, /createAgendaItemEditForm/);
  assert.match(form, /agenda\.createItem\(payload\)/);
  assert.match(form, /agenda\.updateItem\(item\.id, payload\)/);
});

test('form: mensagem de erro vem de getAgendaItemErrorMessage (nunca error.message cru)', async () => {
  const form = await source(`./${FORM_MODAL}`);
  assert.match(form, /getAgendaItemErrorMessage\(/);
  assert.match(form, /role="alert"/);
});

test('form: lembrete de notificação é explicitamente comunicado como indisponível (sem fachada)', async () => {
  const form = await source(`./${FORM_MODAL}`);
  assert.match(form, /Lembrete por notificação ainda não está disponível/);
});

// ============================================================================
// Conta -- entrada do calendário logo abaixo do plano e antes do pagamento.
// ============================================================================

test('Conta: card "Agenda" logo abaixo do card do plano e ANTES de "Pagamento e assinatura"', async () => {
  const [page, routes] = await Promise.all([
    source('./SimplifiedAccountPage.jsx'),
    source('../../app/routes.jsx'),
  ]);
  const agendaIndex = page.indexOf(`title: 'Agenda'`);
  const paymentIndex = page.indexOf(`id: ACCOUNT_SUBROUTE_IDS.PAYMENTS`);
  assert.ok(agendaIndex !== -1, 'card Agenda existe');
  assert.ok(agendaIndex < paymentIndex, 'Agenda vem ANTES de Pagamento e assinatura');
  assert.match(page, /title: 'Agenda',/);
  assert.match(page, /subtitle: 'Seus compromissos e lembretes',/);
  assert.match(page, /CalendarIcon/);
  assert.match(page, /to: SIMPLIFIED_ROUTES\.AGENDA/);
  assert.match(page, /item\.to \? navigate\(item\.to\) : goTo\(item\.id\)/);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.AGENDA/);
});

test('Conta: rota Agenda SEGUE registrada e não aparece na barra inferior', async () => {
  const [routes, navigation] = await Promise.all([
    source('../../app/routes.jsx'),
    source('./simplifiedRoutes.js'),
  ]);
  assert.match(routes, /path: SIMPLIFIED_ROUTES\.AGENDA/);
  assert.match(navigation, /AGENDA: '\/app\/agenda'/);
  assert.doesNotMatch(navigation, /AGENDA'/);
});