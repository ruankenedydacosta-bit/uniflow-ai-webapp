import assert from 'node:assert/strict';
import React, { useCallback, useMemo, useState } from 'react';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { act, create } from 'react-test-renderer';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { VOICE_CAPTURE_STATES } from './voiceCaptureReducer.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createControlledVoiceHook(controls, counters) {
  return function useControlledVoiceInput(callbacks) {
    const [status, setStatus] = useState(VOICE_CAPTURE_STATES.IDLE);
    const cancel = useCallback(() => {
      counters.cancel += 1;
      setStatus(VOICE_CAPTURE_STATES.CANCELED);
      callbacks.onCaptureEnd?.();
      return true;
    }, [callbacks]); // instável de propósito: reproduz a causa antiga.

    controls.start = () => {
      callbacks.onBeforeStart?.();
      setStatus(VOICE_CAPTURE_STATES.LISTENING);
    };
    controls.process = () => setStatus(VOICE_CAPTURE_STATES.PROCESSING);
    controls.finish = (transcript) => callbacks.onFinalTranscript?.(transcript);

    return useMemo(() => ({
      status,
      cancel,
      start: controls.start,
      message: status,
    }), [cancel, status]);
  };
}

let viteServer;
let mountedComponents;

async function loadMountedComponents() {
  if (mountedComponents) return mountedComponents;
  viteServer = await createServer({
    root: fileURLToPath(new URL('../../../', import.meta.url)),
    configFile: false,
    logLevel: 'silent',
    plugins: [react()],
    server: { middlewareMode: true },
    ssr: { external: ['react', 'react-dom'] },
    appType: 'custom',
  });
  const [runtimeModule, chatInputModule] = await Promise.all([
    viteServer.ssrLoadModule('/src/features/uni-voice/UniVoiceInputProviderRuntime.js'),
    viteServer.ssrLoadModule('/src/features/uni-chat/components/ChatInput.jsx'),
  ]);
  mountedComponents = {
    Provider: runtimeModule.UniVoiceInputProviderRuntime,
    ChatInput: chatInputModule.default,
  };
  return mountedComponents;
}

test.after(async () => { await viteServer?.close(); });

test('provider + binding real do ChatInput não autocancela em recording → processing/rerender', async () => {
  const controls = {};
  const counters = { cancel: 0 };
  const useVoiceInput = createControlledVoiceHook(controls, counters);
  const { Provider, ChatInput } = await loadMountedComponents();
  const chatProps = {
    value: '',
    onChange: () => {},
    onSend: () => {},
    onBeforeVoiceStart: () => {},
    disabled: false,
  };
  let renderer;

  await act(async () => {
    renderer = create(React.createElement(
      Provider,
      { profileId: 'balanced', workspaceId: 'workspace-a', useVoiceInput },
      React.createElement(ChatInput, chatProps),
    ));
  });
  await act(async () => { controls.start(); });
  await act(async () => { controls.process(); });
  await act(async () => {
    renderer.update(React.createElement(
      Provider,
      { profileId: 'balanced', workspaceId: 'workspace-a', useVoiceInput },
      React.createElement(ChatInput, { ...chatProps, onSend: () => 2 }),
    ));
  });

  assert.equal(counters.cancel, 0);

  await act(async () => { renderer.unmount(); });
  assert.equal(counters.cancel, 1);
});

test('remoção real do binding (troca de rota) cancela captura ativa', async () => {
  const controls = {};
  const counters = { cancel: 0 };
  const useVoiceInput = createControlledVoiceHook(controls, counters);
  const { Provider, ChatInput } = await loadMountedComponents();
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(
      Provider,
      { profileId: 'balanced', workspaceId: 'workspace-a', useVoiceInput },
      React.createElement(ChatInput, {
        value: '', onChange: () => {}, onSend: () => {}, disabled: false,
      }),
    ));
  });
  await act(async () => { controls.start(); });
  await act(async () => {
    renderer.update(React.createElement(
      Provider,
      { profileId: 'balanced', workspaceId: 'workspace-a', useVoiceInput },
      null,
    ));
  });
  assert.equal(counters.cancel, 1);
  await act(async () => { renderer.unmount(); });
});

test('Support → Uni/Agenda cancela owner antigo e não entrega fala na rota nova', async () => {
  const controls = {};
  const counters = { cancel: 0 };
  const received = [];
  const useVoiceInput = createControlledVoiceHook(controls, counters);
  const { Provider, ChatInput } = await loadMountedComponents();
  const supportProps = {
    value: '', onChange: () => {}, onSend: (text) => received.push(`support:${text}`), disabled: false,
  };
  const agendaProps = {
    value: '', onChange: () => {}, onSend: (text) => received.push(`agenda:${text}`), disabled: false,
  };
  const SupportRoute = () => React.createElement(ChatInput, supportProps);
  const AgendaRoute = () => React.createElement(ChatInput, agendaProps);
  let renderer;

  await act(async () => {
    renderer = create(React.createElement(
      Provider,
      { profileId: 'balanced', workspaceId: 'workspace-a', useVoiceInput },
      React.createElement(SupportRoute),
    ));
  });
  await act(async () => { controls.start(); });
  await act(async () => {
    renderer.update(React.createElement(
      Provider,
      { profileId: 'balanced', workspaceId: 'workspace-a', useVoiceInput },
      React.createElement(AgendaRoute),
    ));
  });
  await act(async () => { controls.finish('fala antiga'); });

  assert.equal(counters.cancel, 1);
  assert.deepEqual(received, []);
  await act(async () => { renderer.unmount(); });
});

test('erro real no início notifica onCaptureEnd exatamente uma vez', async () => {
  const { Provider, ChatInput } = await loadMountedComponents();
  let captureEnds = 0;
  const permissionError = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const runtime = {
    navigator: {
      userAgent: 'test',
      platform: 'test',
      mediaDevices: { getUserMedia: async () => { throw permissionError; } },
    },
    MediaRecorder: class FakeMediaRecorder {
      static isTypeSupported() { return true; }
    },
    addEventListener() {},
    removeEventListener() {},
    document: { addEventListener() {}, removeEventListener() {} },
    setTimeout,
    clearTimeout,
  };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(
      Provider,
      {
        profileId: 'balanced',
        workspaceId: 'workspace-a',
        voiceInputOptions: { runtime, onCaptureEnd: () => { captureEnds += 1; } },
      },
      React.createElement(ChatInput, {
        value: '', onChange: () => {}, onSend: () => {}, disabled: false,
      }),
    ));
  });

  await act(async () => {
    renderer.root.findByProps({ 'aria-label': 'Falar' }).props.onClick();
    await Promise.resolve();
  });

  assert.equal(captureEnds, 1);
  await act(async () => { renderer.unmount(); });
  assert.equal(captureEnds, 1);
});
