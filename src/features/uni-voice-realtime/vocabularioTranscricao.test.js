import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ABERTURA_DO_PROMPT,
  carregarVocabularioDoUsuario,
  limparNome,
  MAX_CARACTERES_DO_VOCABULARIO,
  MAX_NOMES_NO_VOCABULARIO,
  modeloAceitaPrompt,
  montarPromptDeTranscricao,
  montarVocabulario,
} from '../../../supabase/functions/_shared/vocabularioTranscricao.js';

const WORKSPACE = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';
const BASE = {
  supabaseUrl: 'https://exemplo.supabase.co',
  anonKey: 'anon',
  authorization: 'Bearer jwt-do-usuario',
  workspaceId: WORKSPACE,
};

const REALTIME_SESSION_HOOK = readFileSync(
  new URL('./useRealtimeVoiceSession.js', import.meta.url),
  'utf8',
);
const HOME_VIEW = readFileSync(
  new URL('../simplified-app/SimplifiedHomeView.jsx', import.meta.url),
  'utf8',
);
const REALTIME_FUNCTION = readFileSync(
  new URL('../../../supabase/functions/uni-voice-realtime-session/index.ts', import.meta.url),
  'utf8',
);

function fetchFalso(respostas) {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init });
    const tabela = new URL(url).pathname.split('/').pop();
    const resposta = respostas[tabela];
    if (resposta instanceof Error) throw resposta;
    if (typeof resposta === 'number') return { ok: false, status: resposta, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => resposta ?? [] };
  };
  return { fetchImpl, chamadas };
}

test('limparNome tira o que quebra o prompt e descarta nome longo demais', () => {
  assert.equal(limparNome('  Nubank\n'), 'Nubank');
  assert.equal(limparNome('Casa, "praia"; <férias>'), 'Casa praia férias');
  assert.equal(limparNome('x'.repeat(41)), '');
  assert.equal(limparNome(null), '');
  assert.equal(limparNome(42), '');
});

test('montarVocabulario segue a prioridade e não repete nome com acento ou caixa diferentes', () => {
  const nomes = montarVocabulario([
    ['Nubank', 'Itaú'],
    ['Dízimo', 'itau', 'NUBANK', '', 'Pets do Thor'],
  ]);
  assert.deepEqual(nomes, ['Nubank', 'Itaú', 'Dízimo', 'Pets do Thor']);
});

test('montarVocabulario respeita o teto de nomes e o de caracteres', () => {
  const muitos = Array.from({ length: 100 }, (_, i) => `Categoria ${i}`);
  const nomes = montarVocabulario([muitos]);
  assert.ok(nomes.length <= MAX_NOMES_NO_VOCABULARIO);
  assert.ok(nomes.join(', ').length <= MAX_CARACTERES_DO_VOCABULARIO);

  const longos = Array.from({ length: 30 }, (_, i) => `${'n'.repeat(36)}${String(i).padStart(3, '0')}`);
  const cortados = montarVocabulario([longos]);
  assert.ok(cortados.join(', ').length <= MAX_CARACTERES_DO_VOCABULARIO);
  assert.ok(cortados.length < longos.length);
  assert.ok(montarPromptDeTranscricao(cortados).length <= ABERTURA_DO_PROMPT.length + MAX_CARACTERES_DO_VOCABULARIO + 1);
});

test('montarPromptDeTranscricao fica vazio sem nomes', () => {
  assert.equal(montarPromptDeTranscricao([]), '');
  assert.equal(
    montarPromptDeTranscricao(['Nubank', 'Dízimo']),
    'Nomes que podem aparecer na fala: Nubank, Dízimo.',
  );
});

test('modeloAceitaPrompt recusa os modelos sem prompt', () => {
  assert.equal(modeloAceitaPrompt('gpt-4o-transcribe'), true);
  assert.equal(modeloAceitaPrompt('whisper-1'), true);
  assert.equal(modeloAceitaPrompt('gpt-4o-transcribe-diarize'), false);
  assert.equal(modeloAceitaPrompt('gpt-realtime-whisper'), false);
  assert.equal(modeloAceitaPrompt(''), false);
});

test('carregarVocabularioDoUsuario lê contas e categorias com o JWT do usuário, filtradas pelo espaço', async () => {
  const { fetchImpl, chamadas } = fetchFalso({
    accounts: [{ name: 'Nubank' }, { name: 'Carteira' }],
    categories: [{ name: 'Dízimo' }, { name: 'nubank' }],
  });
  const resultado = await carregarVocabularioDoUsuario({ ...BASE, fetchImpl });

  assert.deepEqual(resultado.nomes, ['Nubank', 'Carteira', 'Dízimo']);
  assert.equal(resultado.prompt, 'Nomes que podem aparecer na fala: Nubank, Carteira, Dízimo.');
  assert.equal(chamadas.length, 2);
  for (const { url, init } of chamadas) {
    assert.equal(init.headers.Authorization, 'Bearer jwt-do-usuario');
    assert.equal(init.headers.apikey, 'anon');
    assert.match(url, new RegExp(`workspace_id=eq\\.${WORKSPACE}`));
    assert.match(url, /select=name&/);
    assert.match(url, /is_active=eq\.true/);
  }
});

test('carregarVocabularioDoUsuario devolve vazio sem espaço válido, sem sessão ou com falha de leitura', async () => {
  const vazio = { nomes: [], prompt: '' };
  const { fetchImpl, chamadas } = fetchFalso({ accounts: [{ name: 'Nubank' }] });

  assert.deepEqual(await carregarVocabularioDoUsuario({ ...BASE, workspaceId: undefined, fetchImpl }), vazio);
  assert.deepEqual(await carregarVocabularioDoUsuario({ ...BASE, workspaceId: 'x&or=(id.gt.0)', fetchImpl }), vazio);
  assert.deepEqual(await carregarVocabularioDoUsuario({ ...BASE, authorization: '', fetchImpl }), vazio);
  assert.equal(chamadas.length, 0);

  const comErro = fetchFalso({ accounts: new Error('rede'), categories: [{ name: 'Dízimo' }] });
  assert.deepEqual(await carregarVocabularioDoUsuario({ ...BASE, fetchImpl: comErro.fetchImpl }), vazio);

  const negado = fetchFalso({ accounts: 401, categories: [{ name: 'Dízimo' }] });
  assert.deepEqual(
    await carregarVocabularioDoUsuario({ ...BASE, fetchImpl: negado.fetchImpl }),
    { nomes: ['Dízimo'], prompt: 'Nomes que podem aparecer na fala: Dízimo.' },
  );
});

test('carregarVocabularioDoUsuario desiste quando a leitura passa do tempo limite', async () => {
  const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('abortado')), { once: true });
  });
  const resultado = await carregarVocabularioDoUsuario({ ...BASE, fetchImpl, tempoLimiteMs: 5 });
  assert.deepEqual(resultado, { nomes: [], prompt: '' });
});

test('uni-voice-realtime-session lê o vocabulário com o JWT da pessoa e só espera por ele depois da reserva', () => {
  assert.match(REALTIME_FUNCTION, /const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';/);
  assert.match(REALTIME_FUNCTION, /Deno\.env\.get\('UNI_REALTIME_TRANSCRIPTION_MODEL'\) \|\| DEFAULT_TRANSCRIPTION_MODEL/);
  // A leitura começa antes da reserva e só é esperada depois dela.
  const inicio = REALTIME_FUNCTION.indexOf('const vocabularyPromise = carregarVocabularioDoUsuario(');
  const reserva = REALTIME_FUNCTION.indexOf("'voice_reserve_block'");
  const espera = REALTIME_FUNCTION.indexOf('const vocabulary = await vocabularyPromise;');
  assert.ok(inicio > 0 && reserva > inicio && espera > reserva);
  assert.match(REALTIME_FUNCTION, /authorization,\n\s*workspaceId: payload\?\.workspace_id,/);
  assert.match(REALTIME_FUNCTION, /transcription: buildTranscriptionConfig\(transcriptionModel, transcriptionPrompt\)/);
});

test('o app manda o espaço ativo ao abrir a conversa por voz', () => {
  assert.match(REALTIME_SESSION_HOOK, /body: JSON\.stringify\(\{ eagerness, workspace_id: workspaceId \|\| undefined \}\)/);
  assert.match(REALTIME_SESSION_HOOK, /requestClientSecret\(\{ eagerness, workspaceId \}\)/);
  assert.match(HOME_VIEW, /realtime\.start\(\{\s*workspaceId: workspace\?\.id,/);
});
