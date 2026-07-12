# Uni Voice Input V1

## Objetivo

A entrada de voz da Uni transforma fala em texto com o menor atrito possível e
entrega a transcrição final ao mesmo fluxo financeiro usado pelo compositor de
texto. Ela não cria um segundo motor de conversa e não executa ações por conta
própria.

Fluxo oficial:

1. o usuário toca no microfone;
2. o navegador solicita permissão, quando necessário;
3. a interface mantém o palco visual de escuta;
4. resultados parciais servem somente como feedback temporário;
5. o resultado final é sanitizado;
6. `UniAIPage` chama o mesmo `sendMessage` usado pelo texto;
7. parser, contexto e memória auxiliam a interpretação;
8. o card financeiro existente solicita confirmação visual;
9. somente a confirmação explícita pode persistir o fato financeiro.

## Arquitetura

O domínio está em `src/features/uni-voice/`:

- `speechRecognitionAdapter.js`: encapsula `SpeechRecognition` e
  `webkitSpeechRecognition`, configura `pt-BR` e normaliza eventos do browser;
- `voiceCaptureReducer.js`: representa os estados previsíveis da captura;
- `useUniVoiceInput.js`: controla ciclo de vida, deduplicação, cancelamento e
  entrega da transcrição final por callback;
- `voiceInputMessages.js`: traduz estados em mensagens humanas conforme o perfil
  de personalidade;
- `uniVoiceInput.test.js`: valida o contrato local, sem microfone ou API real.

O hook não importa Supabase, parser financeiro ou memória. `UniAIPage` fornece
`handleVoiceTranscript`, que chama `sendMessage(transcript, {
allowFinancialAction: true })`. Essa fronteira garante que voz e texto usem a
mesma interpretação e a mesma confirmação.

## Estados

- `idle`;
- `requesting_permission`;
- `listening`;
- `processing`;
- `completed`;
- `permission_denied`;
- `unsupported`;
- `no_speech`;
- `error`;
- `canceled`.

Uma captura ativa bloqueia uma segunda inicialização. Tocar novamente durante a
escuta solicita o encerramento da captura atual. Cancelamento e desmontagem
removem listeners e não enviam conteúdo.

## Web Speech API e compatibilidade

A V1 usa somente APIs nativas do navegador:

- `SpeechRecognition`, quando disponível;
- `webkitSpeechRecognition`, para navegadores que usam o prefixo;
- `interimResults = true`, apenas para feedback visual;
- `continuous = false`;
- `lang = "pt-BR"`.

Chrome e navegadores Chromium podem oferecer suporte, sujeito a permissão e
políticas do ambiente. Safari/macOS varia por versão e configuração. A
detecção é feita em tempo de execução, sem prometer suporte. Quando a API não
existe, a entrada textual é aberta como fallback integral. Não há polyfill.

## Privacidade

- a captura nunca inicia sem toque ou clique explícito;
- áudio não é armazenado;
- áudio não é enviado ao Supabase ou a qualquer servidor;
- o adaptador não usa `getUserMedia`, `fetch`, storage ou serviços externos;
- o medidor visual existente usa um stream temporário local quando suportado e
  encerra suas tracks ao terminar;
- transcrição parcial é temporária e não executa ação;
- transcrição não vira memória automaticamente;
- somente um fato financeiro revisado e confirmado pode ser persistido;
- desmontagem e cancelamento descartam listeners e texto ainda não enviado.

## Confirmação e memória

A fala cria uma intenção, não uma autorização. Os botões visuais do card
financeiro continuam obrigatórios. A V1 não interpreta "sim" falado como
confirmação.

A memória entra somente depois do parser, pelo contrato já existente de
`useUniConversation`. Ela pode complementar contexto permitido, mas não altera
valor, data, workspace ou a exigência de confirmação.

## Personalidade

Os perfis `balanced`, `direct`, `warm` e `strategic` alteram somente a redação
das mensagens de indisponibilidade e erro. Eles não alteram estados, permissões,
sanitização ou regras financeiras.

## Limites da V1

- qualidade da transcrição depende do navegador e do sistema operacional;
- resultados parciais podem não existir no Safari;
- não há seleção de dispositivo;
- não há confirmação financeira por voz;
- não há armazenamento de gravações;
- não há API externa, OpenAI ou ElevenLabs;
- o reconhecimento nativo pode depender do serviço oferecido pelo próprio
  navegador, conforme sua implementação e política.

## Saída de voz separada

A entrada continua independente da saída. A arquitetura de saída premium para
demonstrações internas está documentada em
`UNI_VOICE_OUTPUT_PREMIUM_DEMO_V1.md`. Ela não recebe a transcrição do usuário,
não altera este fluxo e reproduz somente uma resposta final já existente.
