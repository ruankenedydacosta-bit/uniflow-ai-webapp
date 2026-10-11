import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildNamePronunciationSavedOutput,
  buildRealtimeToolErrorOutput,
  NAME_PRONUNCIATION_MAX_LENGTH,
  readRealtimeNamePronunciation,
  buildRealtimeToolOutput,
  buildScreenActionInstructions,
  findUniReplyAfter,
  REALTIME_SCREEN_ACTIONS,
  resolveScreenActionOutcome,
  snapshotScreenActionTurn,
  parseRealtimeToolArguments,
  resolveRealtimeToolOutcome,
  snapshotRealtimeToolTurn,
  readRealtimeToolPhrase,
  REALTIME_TOOL_NAMES,
  REALTIME_DRAFT_REPLIES,
  readRealtimeDraftReply,
  buildEndConversationOutput,
  AVISO_RESPOSTA_REPETIDA,
  readRealtimeToolReply,
  warnRepeatedRealtimeReply,
} from './realtimeToolBridge.js';
import { classifyPendingActionReply } from '../uni-conversation/pendingActionInput.js';
import { isCancelEntirePendingFlow } from '../uni-conversation/financialPendingActionFlow.js';

const EDGE_SOURCE = readFileSync(
  new URL('../../../supabase/functions/uni-voice-realtime-session/index.ts', import.meta.url),
  'utf8',
);

test('argumentos da ferramenta: JSON de objeto vale; resto vira nulo', () => {
  assert.deepEqual(parseRealtimeToolArguments('{"frase":"gastei 50"}'), { frase: 'gastei 50' });
  assert.equal(parseRealtimeToolArguments('[1]'), null);
  assert.equal(parseRealtimeToolArguments('não é json'), null);
  assert.equal(parseRealtimeToolArguments(''), null);
  assert.equal(parseRealtimeToolArguments(undefined), null);
});

test('frase da ferramenta sai sem espaços e só quando é texto', () => {
  assert.equal(readRealtimeToolPhrase({ frase: '  gastei 50 no mercado ' }), 'gastei 50 no mercado');
  assert.equal(readRealtimeToolPhrase({ frase: 50 }), '');
  assert.equal(readRealtimeToolPhrase(null), '');
});

test('resposta só conta depois da mensagem da pessoa enviada neste turno', () => {
  const messages = [
    { id: 'u1', from: 'user', text: 'oi' },
    { id: 'a1', from: 'uni', text: 'Olá!' },
  ];
  assert.equal(findUniReplyAfter(messages, 'a1'), null);

  const withTurn = [
    ...messages,
    { id: 'u2', from: 'user', text: 'gastei 50' },
    { id: 'a2', from: 'uni', text: 'Confere o rascunho?', confirmation: { status: 'pending' } },
  ];
  assert.equal(findUniReplyAfter(withTurn, 'a1').id, 'a2');
});

test('sem mensagem de referência, vale a primeira conversa', () => {
  const messages = [
    { id: 'u1', from: 'user', text: 'gastei 50' },
    { id: 'a1', from: 'uni', text: 'Anotado.' },
  ];
  assert.equal(findUniReplyAfter(messages, null).id, 'a1');
});

test('entre várias respostas do mesmo turno, vale a última com texto', () => {
  const messages = [
    { id: 'u1', from: 'user', text: 'gastei 50' },
    { id: 'a1', from: 'uni', text: 'Entendendo…' },
    { id: 'a2', from: 'uni', text: '   ' },
    { id: 'a3', from: 'uni', text: 'Confere o rascunho?' },
  ];
  assert.equal(findUniReplyAfter(messages, null).id, 'a3');
});

test('saída da ferramenta diz se há rascunho esperando confirmação', () => {
  assert.deepEqual(
    JSON.parse(buildRealtimeToolOutput({ text: ' Confere? ', confirmation: { status: 'pending' } })),
    { resposta: 'Confere?', aguardando_confirmacao: true },
  );
  assert.deepEqual(
    JSON.parse(buildRealtimeToolOutput({ text: 'Lançado.' })),
    { resposta: 'Lançado.', aguardando_confirmacao: false },
  );
  assert.deepEqual(JSON.parse(buildRealtimeToolErrorOutput('demorou')), { erro: 'demorou' });
});

test('a sessão criada no servidor declara a mesma ferramenta', () => {
  assert.match(EDGE_SOURCE, new RegExp(`name: '${REALTIME_TOOL_NAMES.SEND_TO_UNI}'`));
  assert.match(EDGE_SOURCE, /required: \['frase'\]/);
});

const DRAFT = { id: 'a1', from: 'uni', text: 'Confere?', confirmation: { status: 'pending' } };

test('foto do turno guarda a última mensagem e o rascunho pendente', () => {
  const turn = snapshotRealtimeToolTurn([{ id: 'u1', from: 'user', text: 'gastei 50' }, DRAFT]);
  assert.deepEqual({ ...turn }, { baselineId: 'a1', confirmationId: 'a1', confirmationError: null });
  assert.deepEqual({ ...snapshotRealtimeToolTurn([]) }, { baselineId: null, confirmationId: null, confirmationError: null });
});

test('turno só termina com resposta nova ou mudança no rascunho', () => {
  const before = [{ id: 'u1', from: 'user', text: 'gastei 50' }, DRAFT];
  const turn = snapshotRealtimeToolTurn(before);
  const sent = [...before, { id: 'u2', from: 'user', text: 'pode lançar' }];
  assert.equal(resolveRealtimeToolOutcome(sent, turn), null);

  const confirmedWithoutReply = [
    { id: 'u1', from: 'user', text: 'gastei 50' },
    { ...DRAFT, confirmation: { status: 'confirmed' } },
    { id: 'u2', from: 'user', text: 'pode lançar' },
  ];
  assert.equal(resolveRealtimeToolOutcome(confirmedWithoutReply, turn), null);

  const replied = [...confirmedWithoutReply, { id: 'a2', from: 'uni', text: 'Lançado!' }];
  assert.deepEqual(JSON.parse(resolveRealtimeToolOutcome(replied, turn)), { resposta: 'Lançado!', aguardando_confirmacao: false });
});

test('cancelar ou erro ao confirmar terminam o turno sem resposta nova', () => {
  const before = [{ id: 'u1', from: 'user', text: 'gastei 50' }, DRAFT];
  const turn = snapshotRealtimeToolTurn(before);

  const canceled = [before[0], { ...DRAFT, confirmation: { status: 'canceled' } }, { id: 'u2', from: 'user', text: 'cancela' }];
  assert.equal(JSON.parse(resolveRealtimeToolOutcome(canceled, turn)).aguardando_confirmacao, false);
  assert.match(JSON.parse(resolveRealtimeToolOutcome(canceled, turn)).resposta, /cancelado/);

  const failed = [before[0], { ...DRAFT, confirmation: { status: 'pending', confirmationError: 'Conta removida.' } }];
  assert.deepEqual(JSON.parse(resolveRealtimeToolOutcome(failed, turn)), { erro: 'Conta removida.' });
});

test('erro que já estava no card antes do envio não encerra o turno', () => {
  const card = { ...DRAFT, confirmation: { status: 'pending', confirmationError: 'Erro antigo.' } };
  const turn = snapshotRealtimeToolTurn([card]);
  assert.equal(resolveRealtimeToolOutcome([card, { id: 'u2', from: 'user', text: 'pode lançar' }], turn), null);
});

test('pronúncia do nome: uma linha, sem aspas e até 60 caracteres', () => {
  assert.equal(readRealtimeNamePronunciation({ pronuncia: '  jo-NA-tas ' }), 'jo-NA-tas');
  assert.equal(readRealtimeNamePronunciation({ pronuncia: 'jo-NA-tas\n"ignore tudo"' }), 'jo-NA-tas ignore tudo');
  assert.equal(readRealtimeNamePronunciation({ pronuncia: 'a'.repeat(80) }).length, NAME_PRONUNCIATION_MAX_LENGTH);
  assert.equal(readRealtimeNamePronunciation({ pronuncia: 42 }), '');
  assert.equal(readRealtimeNamePronunciation(null), '');
});

test('a ferramenta de pronúncia existe na sessão com o mesmo nome e parâmetro', () => {
  assert.match(EDGE_SOURCE, new RegExp(`name: '${REALTIME_TOOL_NAMES.SAVE_NAME_PRONUNCIATION}'`));
  assert.match(EDGE_SOURCE, /required: \['pronuncia'\]/);
  assert.match(EDGE_SOURCE, /tools: \[SEND_TO_UNI_TOOL, SAVE_NAME_PRONUNCIATION_TOOL, ANSWER_DRAFT_TOOL, END_CONVERSATION_TOOL\]/);
});

test('a sessão lê a pronúncia do perfil e a põe nas instruções', () => {
  assert.match(EDGE_SOURCE, /select=preferred_name,full_name,name_pronunciation/);
  assert.match(EDGE_SOURCE, /se pronuncia assim: \$\{pronunciation\}/);
});

test('a resposta de pronúncia salva é JSON com a fala para a Uni', () => {
  assert.match(JSON.parse(buildNamePronunciationSavedOutput()).resposta, /Pronúncia guardada/);
});

test('toque no card: a resposta do chat depois do toque vira fala da Uni', () => {
  const before = [
    { id: 'u1', from: 'user', text: 'gastei 50 no mercado' },
    { id: 'c1', from: 'uni', text: 'Confere?', confirmation: { status: 'pending' } },
  ];
  const turn = snapshotScreenActionTurn(before);
  assert.equal(resolveScreenActionOutcome(before, turn), null);

  const after = [
    { ...before[0] },
    { ...before[1], confirmation: { status: 'confirmed' } },
    { id: 'a2', from: 'uni', text: 'Pronto. Quer que eu faça mais alguma coisa?' },
  ];
  const outcome = resolveScreenActionOutcome(after, turn);
  assert.deepEqual(outcome, { text: 'Pronto. Quer que eu faça mais alguma coisa?', awaitingConfirmation: false });
  const instructions = buildScreenActionInstructions(REALTIME_SCREEN_ACTIONS.CONFIRM, outcome);
  assert.match(instructions, /tocou em Confirmar/);
  assert.match(instructions, /Quer que eu faça mais alguma coisa\?/);
});

test('toque no card com erro: a Uni conta o aviso do card', () => {
  const before = [{ id: 'c1', from: 'uni', text: 'Confere?', confirmation: { status: 'pending' } }];
  const turn = snapshotRealtimeToolTurn(before);
  const after = [{ ...before[0], confirmation: { status: 'pending', confirmationError: 'Falhou.' } }];
  const outcome = resolveScreenActionOutcome(after, turn);
  assert.equal(outcome.isError, true);
  assert.match(buildScreenActionInstructions(REALTIME_SCREEN_ACTIONS.CONFIRM, outcome), /Deu errado.*Falhou\..*pergunte se pode confirmar/);
});

test('edição salva: o card novo continua esperando confirmação', () => {
  const before = [{ id: 'c1', from: 'uni', text: 'Confere?', confirmation: { status: 'pending' } }];
  const turn = snapshotRealtimeToolTurn(before);
  const after = [
    { ...before[0], confirmation: { status: 'updated' } },
    { id: 'c2', from: 'uni', text: 'Revise antes de registrar.', confirmation: { status: 'pending' } },
  ];
  const instructions = buildScreenActionInstructions(
    REALTIME_SCREEN_ACTIONS.EDIT,
    resolveScreenActionOutcome(after, turn),
  );
  assert.match(instructions, /mudou os campos do card/);
  assert.match(instructions, /pergunte se pode confirmar/);
});

test('toque ignorado: resposta a outra frase da pessoa não vira fala do toque', () => {
  const before = [{ id: 'c1', from: 'uni', text: 'Confere?', confirmation: { status: 'pending' } }];
  const turn = snapshotScreenActionTurn(before);
  const after = [...before, { id: 'u2', from: 'user', text: 'qual meu saldo?' }, { id: 'a3', from: 'uni', text: 'R$ 100.' }];
  assert.deepEqual(resolveScreenActionOutcome(after, turn), { discard: true });
});

test('erro repetido igual ao anterior também é falado', () => {
  const card = { id: 'c1', from: 'uni', text: 'Confere?', confirmation: { status: 'pending', confirmationError: 'Falhou.' } };
  const turn = snapshotScreenActionTurn([card]);
  assert.equal(resolveScreenActionOutcome([card], turn), null);
  const retried = { ...card, confirmation: { ...card.confirmation, confirmationError: 'Falhou.' } };
  assert.equal(resolveScreenActionOutcome([retried], turn).isError, true);
});

test('um toque com duas respostas: a Uni fala as duas', () => {
  const before = [{ id: 'c1', from: 'uni', text: 'Criar a categoria?', confirmation: { status: 'pending' } }];
  const turn = snapshotScreenActionTurn(before);
  const after = [
    { ...before[0], confirmation: { status: 'confirmed' } },
    { id: 'a2', from: 'uni', text: 'Categoria Pet criada.' },
    { id: 'c2', from: 'uni', text: 'Revise antes de registrar.', confirmation: { status: 'pending' } },
  ];
  const outcome = resolveScreenActionOutcome(after, turn);
  assert.equal(outcome.text, 'Categoria Pet criada. Revise antes de registrar.');
  assert.equal(outcome.awaitingConfirmation, true);
});

// BUG REAL EM PRODUÇÃO (voz): um ajuste que o chat trata como frase nova
// descarta o card (expired) antes de a resposta nova chegar. Encerrar o turno
// aí fazia a Uni dizer "esse rascunho expirou" no meio do ajuste.
test('card expirado espera a resposta do chat em vez de encerrar o turno', () => {
  const before = [{ id: 'u1', from: 'user', text: 'gastei 50' }, DRAFT];
  const turn = snapshotRealtimeToolTurn(before);
  const expired = [before[0], { ...DRAFT, confirmation: { status: 'expired' } }, { id: 'u2', from: 'user', text: 'gastei 80 no mercado' }];
  assert.equal(resolveRealtimeToolOutcome(expired, turn), null);

  const replied = [...expired, { id: 'a2', from: 'uni', text: 'Revise o lançamento.', confirmation: { status: 'pending' } }];
  assert.deepEqual(
    JSON.parse(resolveRealtimeToolOutcome(replied, turn)),
    { resposta: 'Revise o lançamento.', aguardando_confirmacao: true },
  );
});

test('responder o card falando vira a frase padrão do chat', () => {
  assert.equal(readRealtimeDraftReply({ acao: 'confirmar' }), 'Confirmar');
  assert.equal(readRealtimeDraftReply({ acao: 'cancelar' }), 'Cancelar');
  assert.equal(readRealtimeDraftReply({ acao: 'cancelar_tudo' }), 'Cancelar tudo');
  assert.equal(readRealtimeDraftReply({ acao: 'editar' }), '');
  assert.equal(readRealtimeDraftReply({ acao: 'toString' }), '');
  assert.equal(readRealtimeDraftReply({}), '');
  assert.equal(readRealtimeDraftReply(null), '');
});

test('o chat entende cada frase padrão do card do jeito certo', () => {
  assert.equal(classifyPendingActionReply(REALTIME_DRAFT_REPLIES.confirmar), 'confirm');
  assert.equal(classifyPendingActionReply(REALTIME_DRAFT_REPLIES.confirmar, { subjectName: 'Salário' }), 'confirm');
  assert.equal(classifyPendingActionReply(REALTIME_DRAFT_REPLIES.cancelar), 'cancel');
  assert.equal(isCancelEntirePendingFlow(REALTIME_DRAFT_REPLIES.cancelar), false);
  assert.equal(classifyPendingActionReply(REALTIME_DRAFT_REPLIES.cancelar_tudo), 'cancel');
  assert.equal(isCancelEntirePendingFlow(REALTIME_DRAFT_REPLIES.cancelar_tudo), true);
});

test('a sessão declara responder_rascunho com as mesmas ações do app', () => {
  assert.match(EDGE_SOURCE, new RegExp(`name: '${REALTIME_TOOL_NAMES.ANSWER_DRAFT}'`));
  assert.match(EDGE_SOURCE, /required: \['acao'\]/);
  const actions = Object.keys(REALTIME_DRAFT_REPLIES).map((action) => `'${action}'`).join(', ');
  assert.ok(EDGE_SOURCE.includes(`enum: [${actions}]`));
});

test('a sessão declara encerrar_conversa e a saída pede só a despedida', () => {
  assert.match(EDGE_SOURCE, new RegExp(`name: '${REALTIME_TOOL_NAMES.END_CONVERSATION}'`));
  assert.match(EDGE_SOURCE, /chame encerrar_conversa/);
  assert.match(JSON.parse(buildEndConversationOutput()).resposta, /Despeça-se/);
});

test('a sessão manda alterar lançamento já registrado pelo mesmo caminho do chat', () => {
  assert.match(EDGE_SOURCE, /alterar um lançamento já registrado/);
  assert.match(EDGE_SOURCE, /Se a Uni listar vários lançamentos e perguntar qual, passe a resposta da pessoa com enviar_para_uni\./);
  assert.match(EDGE_SOURCE, /Com um rascunho ou uma alteração aguardando confirmação/);
});

// BUG REAL (voz): a Uni dizia "corrigi" com o card igual na tela. Ela só pode
// afirmar o que a resposta da ferramenta desta vez afirma.
test('a sessão proíbe dizer que corrigiu, registrou ou cancelou sem a ferramenta confirmar', () => {
  assert.match(EDGE_SOURCE, /Só diga que registrou, corrigiu, alterou ou cancelou algo se a resposta da ferramenta, nesta vez, disser isso\./);
  assert.match(EDGE_SOURCE, /Nunca finja que deu certo\./);
});

// BUG REAL EM PRODUÇÃO (voz, 11/10/2026): "Qual foi o valor dessa
// movimentação?" quatro vezes seguidas, e a IA reenviando a mesma frase.
test('a mesma pergunta duas vezes seguidas vai com aviso para não reenviar', () => {
  const pergunta = buildRealtimeToolOutput({ text: 'Qual foi o valor dessa movimentação?' });
  assert.equal(readRealtimeToolReply(pergunta), 'Qual foi o valor dessa movimentação?');

  const repetida = JSON.parse(warnRepeatedRealtimeReply(pergunta, 'Qual foi o valor dessa movimentação?'));
  assert.equal(repetida.aviso, AVISO_RESPOSTA_REPETIDA);
  assert.equal(repetida.resposta, 'Qual foi o valor dessa movimentação?');

  assert.equal(warnRepeatedRealtimeReply(pergunta, null), pergunta);
  assert.equal(warnRepeatedRealtimeReply(pergunta, 'Em qual conta?'), pergunta);
});

test('rascunho novo e resposta sem pergunta repetidos não ganham aviso', () => {
  const rascunho = buildRealtimeToolOutput({
    text: 'Perfeito. Revise as informações abaixo antes de registrar?',
    confirmation: { status: 'pending' },
  });
  assert.equal(warnRepeatedRealtimeReply(rascunho, 'Perfeito. Revise as informações abaixo antes de registrar?'), rascunho);
  const cancelado = buildRealtimeToolOutput({ text: 'Tudo bem. Não registrei nada.' });
  assert.equal(warnRepeatedRealtimeReply(cancelado, 'Tudo bem. Não registrei nada.'), cancelado);
  const erro = buildRealtimeToolErrorOutput('A Uni demorou para responder?');
  assert.equal(warnRepeatedRealtimeReply(erro, 'A Uni demorou para responder?'), erro);
});

test('a sessão manda seguir o aviso da ferramenta', () => {
  assert.match(EDGE_SOURCE, /Se a resposta da ferramenta trouxer um aviso, siga o aviso\./);
});

// BUG REAL EM PRODUÇÃO (voz, 11/10/2026): a IA repassou "categoria chamada
// 'Impostos' para vincular essa despesa" e falou só "Impostos" ao pedir a
// confirmação; a categoria foi criada com o nome errado.
test('a sessão passa a frase sem aspas e fala o nome exato do que vai ser criado', () => {
  assert.match(EDGE_SOURCE, /sem aspas e sem acrescentar explicação ou finalidade/);
  assert.match(EDGE_SOURCE, /diga o nome exatamente como veio na resposta/);
});

test('a sessão diz onde criar, renomear ou excluir categoria fora de um lançamento', () => {
  assert.match(EDGE_SOURCE, /abrir Categorias, no menu Mais/);
});
