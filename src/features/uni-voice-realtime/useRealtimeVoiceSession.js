import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../services/supabaseClient.js';
import {
  createRealtimeSessionState,
  isRealtimeSessionIdle,
  reduceRealtimeEvent,
} from './realtimeSessionModel.js';
import { buildRealtimeToolErrorOutput, parseRealtimeToolArguments } from './realtimeToolBridge.js';

const SESSION_FUNCTION_NAME = 'uni-voice-realtime-session';
const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
export const REALTIME_IDLE_LIMIT_MS = 60000;
const TICK_MS = 1000;

function reducer(state, action) {
  return reduceRealtimeEvent(state, action.event, action.at);
}

async function requestClientSecret(eagerness) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new RealtimeSessionError('UNAUTHORIZED', 'Entre no app para conversar com a Uni.');

  const response = await fetch(`${supabaseUrl}/functions/v1/${SESSION_FUNCTION_NAME}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ eagerness }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.client_secret !== 'string') {
    throw new RealtimeSessionError(
      body?.error?.code ?? `HTTP_${response.status}`,
      body?.error?.message ?? 'Não foi possível abrir a conversa agora. Tente de novo em instantes.',
    );
  }
  return body;
}

// Erro com código, para a tela decidir o que oferecer (ex.: NOT_ALLOWED leva
// ao texto).
export class RealtimeSessionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function sendEvent(channel, event) {
  if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
}

function closeConnection(connection) {
  connection.channel?.close();
  connection.peer?.close();
  connection.localStream?.getTracks().forEach((track) => track.stop());
  if (connection.audio) {
    connection.audio.pause();
    connection.audio.srcObject = null;
  }
}

// Parar durante a conexão anula a tentativa em andamento.
class ConnectionCancelled extends Error {}

// Uma sessão por vez. O áudio da Uni toca pelo próprio WebRTC: só assim o
// cancelamento de eco do navegador sabe o que sai do alto-falante e não
// deixa a voz da Uni voltar pelo microfone como se fosse a pessoa.
//
// onToolCall({ name, args }) devolve a saída da ferramenta (texto). A Uni
// fala a resposta assim que a saída volta.
export function useRealtimeVoiceSession({ onToolCall } = {}) {
  const [state, dispatchAction] = useReducer(reducer, undefined, createRealtimeSessionState);
  const stateRef = useRef(state);
  const connectionRef = useRef(null);
  const onToolCallRef = useRef(onToolCall);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onToolCallRef.current = onToolCall;
  });

  const dispatch = useCallback((event) => {
    dispatchAction({ event, at: performance.now() });
  }, []);

  const teardown = useCallback(() => {
    const connection = connectionRef.current;
    connectionRef.current = null;
    if (connection) closeConnection(connection);
  }, []);

  const stop = useCallback((reason = 'user') => {
    teardown();
    dispatch({ type: 'local.ended', reason });
  }, [dispatch, teardown]);

  const runToolCall = useCallback(async (connection, event) => {
    dispatch({ type: 'local.tool_started' });
    let output;
    try {
      output = await onToolCallRef.current?.({
        name: event.name,
        args: parseRealtimeToolArguments(event.arguments),
      });
    } catch {
      output = null;
    }
    if (typeof output !== 'string') {
      output = buildRealtimeToolErrorOutput('Não consegui consultar agora. Peça para a pessoa tentar de novo ou escrever.');
    }
    dispatch({ type: 'local.tool_finished' });
    if (connectionRef.current !== connection) return;
    sendEvent(connection.channel, {
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: event.call_id, output },
    });
    sendEvent(connection.channel, { type: 'response.create' });
  }, [dispatch]);

  // Chame dentro do toque da pessoa: o iOS só libera microfone e áudio
  // numa ação do usuário, então os dois são pedidos antes de qualquer rede.
  const start = useCallback(async ({ eagerness } = {}) => {
    if (connectionRef.current) return;
    const connection = {};
    connectionRef.current = connection;
    dispatch({ type: 'local.connecting' });
    const ensureActive = () => {
      if (connectionRef.current !== connection) throw new ConnectionCancelled();
    };

    const audio = new Audio();
    audio.autoplay = true;
    connection.audio = audio;

    try {
      connection.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      ensureActive();

      const session = await requestClientSecret(eagerness);
      ensureActive();

      const peer = new RTCPeerConnection();
      connection.peer = peer;

      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        audio.play().catch(() => {});
      };
      peer.onconnectionstatechange = () => {
        if (connectionRef.current !== connection) return;
        // 'disconnected' pode se recuperar sozinho; 'failed', não.
        if (peer.connectionState === 'failed') {
          teardown();
          dispatch({ type: 'local.failed', code: 'CONNECTION_FAILED', message: 'A conexão com a Uni caiu.' });
        }
      };

      connection.localStream.getAudioTracks().forEach((track) => peer.addTrack(track, connection.localStream));

      const channel = peer.createDataChannel('oai-events');
      connection.channel = channel;
      channel.onopen = () => dispatch({ type: 'local.connected' });
      channel.onmessage = (message) => {
        let event;
        try {
          event = JSON.parse(message.data);
        } catch {
          // Evento ilegível não interrompe a conversa.
          return;
        }
        dispatch(event);
        if (event?.type === 'response.function_call_arguments.done') void runToolCall(connection, event);
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answer = await fetch(OPENAI_REALTIME_CALLS_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${session.client_secret}`,
          'Content-Type': 'application/sdp',
        },
      });
      if (!answer.ok) throw new Error(`A OpenAI recusou a conexão (HTTP ${answer.status}).`);
      const sdp = await answer.text();
      ensureActive();
      await peer.setRemoteDescription({ type: 'answer', sdp });
    } catch (error) {
      if (connectionRef.current !== connection) {
        // stop() já registrou o fim; só solta o que esta tentativa abriu.
        closeConnection(connection);
        return;
      }
      teardown();
      const isMicrophoneDenied = error?.name === 'NotAllowedError';
      dispatch({
        type: 'local.failed',
        code: isMicrophoneDenied ? 'MICROPHONE_DENIED' : error?.code ?? 'CONNECTION_FAILED',
        message: isMicrophoneDenied
          ? 'Libere o microfone no navegador para conversar com a Uni.'
          : error?.message ?? 'Não foi possível abrir a conversa.',
      });
    }
  }, [dispatch, runToolCall, teardown]);

  const markFalseInterruption = useCallback(() => {
    dispatch({ type: 'local.mark_false_interruption' });
  }, [dispatch]);

  // Relógio da tela e encerramento por inatividade.
  const [now, tick] = useReducer(() => performance.now(), 0, () => performance.now());
  useEffect(() => {
    const timer = setInterval(() => {
      tick();
      if (connectionRef.current && isRealtimeSessionIdle(stateRef.current, performance.now(), REALTIME_IDLE_LIMIT_MS)) {
        stop('idle');
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [stop]);

  useEffect(() => teardown, [teardown]);

  const getLocalStream = useCallback(() => connectionRef.current?.localStream ?? null, []);

  return { state, now, start, stop, markFalseInterruption, getLocalStream };
}
