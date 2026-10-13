# Uni Voice Input V1

> **Removido em 13/10/2026.** A gravação com envio para transcrição saiu do
> app: `src/features/uni-voice/`, o microfone do campo do chat e a Edge
> Function `uni-voice-transcribe` foram apagados. Falar com a Uni é só pela
> conversa em tempo real (`src/features/uni-voice-realtime/` e a Edge Function
> `uni-voice-realtime-session`). O texto abaixo fica como registro histórico.

## Objetivo

A entrada de voz da Uni captura áudio curto no navegador, envia a gravação para
uma Edge Function autenticada e entrega somente a transcrição sanitizada ao
mesmo fluxo conversacional usado pelo texto. Voz não cria uma autorização
financeira e nunca executa uma ação diretamente.

## Fluxo

1. o usuário toca no microfone ou segura o botão central da Uni;
2. `MediaRecorder` solicita permissão e captura no máximo 15 segundos;
3. o navegador libera todas as tracks antes da transcrição;
4. a Edge Function valida origem, sessão, workspace, MIME, tamanho e duração;
5. a transcrição acontece server-side;
6. o texto sanitizado entra no chat;
7. o contrato determinístico interpreta, esclarece e confirma a ação;
8. somente a confirmação explícita pode chamar o serviço financeiro atômico.

O long-press do botão central abre `/uni-ai` com uma solicitação efêmera de
captura. O estado é removido da navegação depois da tentativa, evitando
reinícios em refresh ou re-render.

## Arquitetura

O domínio em `src/features/uni-voice/` contém:

- `mediaRecorderAdapter.js`: `getUserMedia`, `MediaRecorder`, limites e cleanup;
- `uniVoiceTranscriptionProvider.js`: sessão, `FormData`, timeout e erros seguros;
- `voiceCaptureReducer.js`: estados previsíveis da captura;
- `useUniVoiceInput.js`: ciclo de vida e entrega da transcrição;
- `voiceInputMessages.js`: mensagens curtas de estado e fallback;
- `speechRecognitionAdapter.js`: compatibilidade legada, fora do fluxo principal.

A função `supabase/functions/uni-voice-transcribe/index.ts` é a única fronteira
com o provedor de transcrição. A credencial nunca é lida pelo frontend.

## Estados e limites

- estados: `idle`, `requesting_permission`, `listening`, `processing`,
  `completed`, `permission_denied`, `unsupported`, `no_speech`,
  `limit_exceeded`, `error` e `canceled`;
- duração máxima: 15 segundos;
- tamanho máximo: 4 MB;
- formatos: WebM/Opus, WebM, MP4 e OGG/Opus, conforme suporte do navegador;
- timeout server-side: 20 segundos;
- apenas uma gravação por vez;
- cancelamento não envia áudio;
- áudio não é persistido pela aplicação.

## Segurança

- sessão autenticada obrigatória;
- membership ativo no workspace informado;
- origem fechada por `APP_ALLOWED_ORIGINS`, com localhost apenas para DEV;
- `OPENAI_API_KEY` e `UNI_TRANSCRIPTION_MODEL` somente no ambiente da Edge;
- nenhum `service_role`;
- logs contêm métricas técnicas, nunca áudio, transcrição ou identidade;
- falhas retornam mensagens genéricas;
- texto transcrito continua sujeito à allowlist, validação e confirmação.

## Compatibilidade

O fluxo usa APIs nativas disponíveis em navegadores modernos. Android Chrome é
o alvo inicial. Safari pode selecionar MP4 quando WebM não estiver disponível.
Navegadores sem `MediaRecorder` preservam integralmente a entrada textual.

## Configuração externa

Antes de validar fora do ambiente local:

1. publicar a Edge Function `uni-voice-transcribe`;
2. manter `OPENAI_API_KEY` como Secret do Supabase;
3. configurar `APP_ALLOWED_ORIGINS` com as origens oficiais;
4. opcionalmente configurar `UNI_TRANSCRIPTION_MODEL`;
5. validar permissão e formatos em um dispositivo móvel real.

## Limitações

- a Edge Function precisa estar publicada para transcrição real;
- não há seleção manual de dispositivo;
- ações disponíveis são limitadas pelo contrato financeiro;
- TTS continua manual para não disputar o microfone;
- a gravação não é armazenada nem reaproveitada.
