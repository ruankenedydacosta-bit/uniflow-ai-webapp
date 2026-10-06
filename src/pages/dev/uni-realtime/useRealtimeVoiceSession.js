import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../../services/supabaseClient.js';
import {
  createRealtimeSessionState,
  isRealtimeSessionIdle,
  reduceRealtimeEvent,
} from './realtimeSessionModel.js';

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
  if (!accessToken) throw new Error('Entre no app antes de testar a conversa.');

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
    throw new Error(body?.error?.message ?? `Não foi possível abrir a conversa (HTTP ${response.status}).`);
  }
  return body;
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
export function useRealtimeVoiceSession() {
  const [state, dispatchAction] = useReducer(reducer, undefined, createRealtimeSessionState);
  const stateRef = useRef(state);
  const connectionRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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

  const start = useCallback(async ({ eagerness } = {}) => {
    if (connectionRef.current) return;
    const connection = {};
    connectionRef.current = connection;
    dispatch({ type: 'local.connecting' });
    const ensureActive = () => {
      if (connectionRef.current !== connection) throw new ConnectionCancelled();
    };

    try {
      const session = await requestClientSecret(eagerness);
      ensureActive();

      connection.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      ensureActive();

      const peer = new RTCPeerConnection();
      connection.peer = peer;

      const audio = new Audio();
      audio.autoplay = true;
      connection.audio = audio;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        audio.play().catch(() => {});
      };
      peer.onconnectionstatechange = () => {
        if (connectionRef.current !== connection) return;
        // 'disconnected' pode se recuperar sozinho; 'failed', não.
        if (peer.connectionState === 'failed') {
          teardown();
          dispatch({ type: 'local.failed', message: 'A conexão com a Uni caiu.' });
        }
      };

      connection.localStream.getAudioTracks().forEach((track) => peer.addTrack(track, connection.localStream));

      const channel = peer.createDataChannel('oai-events');
      connection.channel = channel;
      channel.onopen = () => dispatch({ type: 'local.connected' });
      channel.onmessage = (message) => {
        try {
          dispatch(JSON.parse(message.data));
        } catch {
          // Evento ilegível não interrompe a conversa.
        }
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
      const message = error?.name === 'NotAllowedError'
        ? 'Libere o microfone no navegador para conversar com a Uni.'
        : error?.message ?? 'Não foi possível abrir a conversa.';
      dispatch({ type: 'local.failed', message });
    }
  }, [dispatch, teardown]);

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
