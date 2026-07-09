import { useEffect, useRef, useState } from 'react';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Input from '../components/ui/Input';
import styles from './UniAIPage.module.css';

const conversationMessages = [
  {
    id: 'uni-month',
    role: 'uni',
    content: 'Analisei seu mês e encontrei um cenário saudável, com uma atenção importante: as despesas variáveis cresceram mais rápido que as receitas nos últimos dias.',
  },
  {
    id: 'user-cashflow',
    role: 'user',
    content: 'Como posso melhorar meu fluxo de caixa sem cortar algo importante agora?',
  },
  {
    id: 'uni-guidance',
    role: 'uni',
    content: 'Um bom primeiro passo é revisar os gastos variáveis desta semana e antecipar as entradas já confirmadas. Eu priorizaria três ações: separar despesas essenciais, adiar gastos não urgentes e registrar os recebíveis dos próximos sete dias.',
  },
];

const contextItems = [
  {
    label: 'Saldo projetado',
    value: 'R$ 48.200',
    status: 'Saudável',
    variant: 'success',
  },
  {
    label: 'Metas ativas',
    value: '3 metas',
    status: 'Em andamento',
    variant: 'primary',
  },
  {
    label: 'Despesas em atenção',
    value: '2 categorias',
    status: 'Atenção',
    variant: 'warning',
  },
  {
    label: 'Próxima decisão recomendada',
    value: 'Revisar variáveis',
    status: 'Próximo passo',
    variant: 'secondary',
  },
];

const quickSuggestions = [
  'Como posso economizar esta semana?',
  'Minha reserva está saudável?',
  'O que devo priorizar agora?',
  'Explique meu fluxo de caixa',
];

let messageIdCounter = conversationMessages.length;

function createMessage(role, content) {
  messageIdCounter += 1;

  return {
    id: `${role}-${messageIdCounter}`,
    role,
    content,
  };
}

function getMockUniResponse(question) {
  const normalizedQuestion = question.toLowerCase();

  if (normalizedQuestion.includes('economizar')) {
    return 'Para economizar esta semana sem gerar desconforto, eu começaria pelos gastos variáveis: alimentação fora, transporte e pequenas assinaturas. Escolha um limite simples para os próximos sete dias e acompanhe diariamente, sem tentar resolver tudo de uma vez.';
  }

  if (normalizedQuestion.includes('reserva')) {
    return 'Sua reserva parece em um caminho saudável quando cobre os compromissos essenciais e continua crescendo com regularidade. O próximo passo é comparar o valor atual com seus custos fixos mensais e manter aportes consistentes, mesmo que pequenos.';
  }

  if (normalizedQuestion.includes('priorizar')) {
    return 'Eu priorizaria o que reduz risco no curto prazo: organizar recebíveis, revisar despesas em atenção e proteger sua reserva. Depois disso, vale olhar para metas de crescimento com mais tranquilidade.';
  }

  if (normalizedQuestion.includes('fluxo de caixa')) {
    return 'Seu fluxo de caixa fica mais claro quando separamos três camadas: dinheiro disponível hoje, entradas confirmadas e despesas que ainda podem ser ajustadas. Minha sugestão é registrar os próximos sete dias antes de tomar uma decisão maior.';
  }

  if (normalizedQuestion.includes('despesas')) {
    return 'Para olhar despesas com calma, eu separaria o que é essencial, recorrente e ajustável. Assim você não precisa cortar tudo: dá para começar pelos gastos que menos afetam sua rotina e acompanhar o impacto no saldo projetado.';
  }

  if (normalizedQuestion.includes('metas')) {
    return 'Suas metas ficam mais fáceis de acompanhar quando cada uma tem valor-alvo, prazo e uma contribuição possível. Eu manteria as metas ativas, mas priorizaria primeiro as que protegem sua segurança financeira.';
  }

  return 'Posso te ajudar a transformar essa pergunta em um próximo passo financeiro mais claro. Para começar, eu olharia o impacto no saldo projetado, nas metas ativas e nas despesas que pedem atenção nesta semana.';
}

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function isProbablySafari() {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('safari') && !userAgent.includes('chrome') && !userAgent.includes('chromium');
}

function getPortugueseVoice(voices) {
  return voices.find((voice) => voice.lang === 'pt-BR') ?? voices.find((voice) => voice.lang?.startsWith('pt')) ?? null;
}

function getLastUniMessage(messages) {
  return [...messages].reverse().find((message) => message.role === 'uni');
}

function getVoiceFeedback(volume, hasAudioMeter) {
  if (!hasAudioMeter) {
    return {
      message: 'Estou ouvindo... fale naturalmente.',
      className: 'volumeMedium',
    };
  }

  if (volume < 0.18) {
    return {
      message: 'Estou ajustando a escuta... pode falar naturalmente.',
      className: 'volumeLow',
    };
  }

  if (volume < 0.5) {
    return {
      message: 'Áudio claro.',
      className: 'volumeMedium',
    };
  }

  return {
    message: 'Áudio claro.',
    className: 'volumeHigh',
  };
}

function UniAIPage() {
  const [messages, setMessages] = useState(conversationMessages);
  const [draftMessage, setDraftMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceVolume, setVoiceVolume] = useState(0);
  const [hasAudioMeter, setHasAudioMeter] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceNotice, setVoiceNotice] = useState('');
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioStreamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const shouldShowEmptyCaptureNoticeRef = useRef(false);
  const canSendMessage = draftMessage.trim().length > 0;
  const lastUniMessage = getLastUniMessage(messages);
  const voiceFeedback = getVoiceFeedback(voiceVolume, hasAudioMeter);

  useEffect(() => () => {
    recognitionRef.current?.abort?.();

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    audioContextRef.current?.close?.().catch?.(() => {});
    audioContextRef.current = null;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  function sendMessage(content) {
    const trimmedContent = content.trim();

    if (!trimmedContent) return;

    setMessages((currentMessages) => [
      ...currentMessages,
      createMessage('user', trimmedContent),
      createMessage('uni', getMockUniResponse(trimmedContent)),
    ]);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!canSendMessage) return;

    setVoiceNotice('');
    setInterimTranscript('');
    sendMessage(draftMessage);
    setDraftMessage('');
  }

  function handleSuggestionClick(suggestion) {
    setVoiceNotice('');
    setInterimTranscript('');
    sendMessage(suggestion);
  }

  async function startAudioMeter() {
    setVoiceVolume(0);
    setHasAudioMeter(false);

    if (typeof window === 'undefined' || isProbablySafari() || !navigator.mediaDevices?.getUserMedia) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      const samples = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      audioStreamRef.current = stream;
      audioContextRef.current = audioContext;
      setHasAudioMeter(true);

      function updateVolume() {
        analyser.getByteTimeDomainData(samples);

        const sum = samples.reduce((total, sample) => {
          const centeredSample = (sample - 128) / 128;
          return total + centeredSample * centeredSample;
        }, 0);
        const rms = Math.sqrt(sum / samples.length);

        setVoiceVolume(Math.min(rms * 6, 1));
        animationFrameRef.current = window.requestAnimationFrame(updateVolume);
      }

      updateVolume();
    } catch {
      setHasAudioMeter(false);
      setVoiceVolume(0);
    }
  }

  function stopAudioMeter() {
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    audioContextRef.current?.close?.().catch?.(() => {});
    audioContextRef.current = null;
    setHasAudioMeter(false);
    setVoiceVolume(0);
  }

  function stopVoiceCapture() {
    shouldShowEmptyCaptureNoticeRef.current = false;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimTranscript('');
    stopAudioMeter();
  }

  function startVoiceCapture() {
    if (isListening) {
      stopVoiceCapture();
      setVoiceNotice('Escuta encerrada. Você pode digitar ou falar novamente quando quiser.');
      return;
    }

    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setVoiceNotice('Seu navegador ainda não suporta captura de voz aqui. Você pode digitar sua pergunta para a Uni.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    finalTranscriptRef.current = '';
    shouldShowEmptyCaptureNoticeRef.current = true;
    setInterimTranscript('');
    setVoiceNotice('');
    recognition.lang = 'pt-BR';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceNotice('Ouvindo...');
    };

    recognition.onresult = (event) => {
      let partialTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? '';

        if (result?.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`.trim();
        } else {
          partialTranscript = `${partialTranscript} ${transcript}`.trim();
        }
      }

      setInterimTranscript(partialTranscript);
    };

    recognition.onerror = () => {
      shouldShowEmptyCaptureNoticeRef.current = false;
      setVoiceNotice('Não consegui capturar sua fala agora. Se quiser, repita com calma ou digite sua pergunta.');
    };

    recognition.onend = () => {
      const finalTranscript = finalTranscriptRef.current.trim();

      if (finalTranscript) {
        sendMessage(finalTranscript);
        setVoiceNotice('Áudio captado.');
      } else if (shouldShowEmptyCaptureNoticeRef.current) {
        setVoiceNotice('Não captei uma pergunta completa. Se quiser, repita com calma.');
      }

      setIsListening(false);
      setInterimTranscript('');
      finalTranscriptRef.current = '';
      shouldShowEmptyCaptureNoticeRef.current = false;
      recognitionRef.current = null;
      stopAudioMeter();
    };

    startAudioMeter();

    try {
      recognition.start();
    } catch {
      stopAudioMeter();
      recognitionRef.current = null;
      shouldShowEmptyCaptureNoticeRef.current = false;
      setInterimTranscript('');
      setVoiceNotice('Não consegui iniciar a captura de voz agora. Você pode digitar sua pergunta para a Uni.');
    }
  }

  function speakLastResponse() {
    if (
      !lastUniMessage ||
      typeof window === 'undefined' ||
      !('speechSynthesis' in window) ||
      !window.SpeechSynthesisUtterance
    ) {
      setVoiceNotice('A leitura em voz alta ainda não está disponível neste navegador.');
      return;
    }

    const synthesis = window.speechSynthesis;
    synthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(lastUniMessage.content);
    utterance.lang = 'pt-BR';

    function applyPortugueseVoice() {
      const portugueseVoice = getPortugueseVoice(synthesis.getVoices());

      if (portugueseVoice) {
        utterance.voice = portugueseVoice;
      }
    }

    applyPortugueseVoice();
    synthesis.onvoiceschanged = applyPortugueseVoice;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setVoiceNotice('Falando...');
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      synthesis.onvoiceschanged = null;
      setVoiceNotice('');
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      synthesis.onvoiceschanged = null;
      setVoiceNotice('Não consegui reproduzir a resposta em voz agora.');
    };

    synthesis.speak(utterance);
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="uni-ai-title">
        <div className={styles.heroCopy}>
          <Badge variant="secondary" dot>
            Uni ativa
          </Badge>
          <h2 id="uni-ai-title">Converse com a Uni</h2>
          <p>
            A Uni transforma seu contexto financeiro em clareza, próximos passos e orientação prática sem julgamento.
          </p>
        </div>

        <div className={styles.heroAction}>
          <Avatar name="Uni Flow" initials="U" size="xl" status="online" />
          <div className={styles.heroButtons}>
            <Button>Nova conversa</Button>
            <Button variant="outline">Ver contexto</Button>
          </div>
        </div>
      </section>

      <section className={styles.mainGrid} aria-label="Experiência principal da Uni AI">
        <Card variant="default" padding="lg" className={styles.chatCard}>
          <div className={styles.cardHeader}>
            <div>
              <span className={styles.cardTitle}>Conversa financeira</span>
              <p>Simulação visual da orientação da Uni com base no seu contexto.</p>
            </div>
            <div className={styles.chatActions}>
              <Badge variant={isListening ? 'success' : isSpeaking ? 'primary' : 'glass'}>
                {isListening ? 'Ouvindo...' : isSpeaking ? 'Falando...' : 'Mock'}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={startVoiceCapture}
                aria-pressed={isListening}
              >
                {isListening ? 'Parar escuta' : 'Falar com a Uni'}
              </Button>
              <Button variant="outline" size="sm" onClick={speakLastResponse} disabled={!lastUniMessage || isSpeaking}>
                {isSpeaking ? 'Falando...' : 'Ouvir resposta'}
              </Button>
            </div>
          </div>

          {voiceNotice ? (
            <p className={styles.voiceNotice} role="status" aria-live="polite">
              {voiceNotice}
            </p>
          ) : null}

          {isListening ? (
            <div className={styles.voiceCapturePanel} aria-live="polite">
              <div className={styles.microphone} aria-hidden="true">
                <span className={styles.microphoneHead} />
                <span className={styles.microphoneStem} />
              </div>
              <div className={styles.voiceCaptureCopy}>
                <strong>Uni está ouvindo</strong>
                <span>{interimTranscript ? `Ouvindo: ${interimTranscript}` : 'Estou ouvindo... fale naturalmente.'}</span>
                <p>{voiceFeedback.message}</p>
              </div>
              <div
                className={`${styles.voiceWaves} ${styles[voiceFeedback.className]}`}
                role="meter"
                aria-label="Intensidade do áudio"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(voiceVolume * 100)}
              >
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}

          <div className={styles.messages} aria-label="Mensagens simuladas">
            {messages.map((message) => (
              <article
                key={message.id}
                className={message.role === 'user' ? styles.userMessage : styles.uniMessage}
              >
                <Avatar
                  name={message.role === 'user' ? 'Você' : 'Uni'}
                  initials={message.role === 'user' ? 'VC' : 'U'}
                  size="sm"
                  status={message.role === 'uni' ? 'online' : undefined}
                />
                <div className={styles.bubble}>
                  <span>{message.role === 'user' ? 'Você' : 'Uni'}</span>
                  <p>{message.content}</p>
                </div>
              </article>
            ))}
          </div>

          <form className={styles.composer} aria-label="Enviar mensagem para a Uni" onSubmit={handleSubmit}>
            <Input
              fullWidth
              variant="glass"
              placeholder="Pergunte algo para a Uni..."
              aria-label="Pergunte algo para a Uni"
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
            />
            <Button type="submit" disabled={!canSendMessage}>
              Enviar
            </Button>
          </form>
        </Card>

        <aside className={styles.sideColumn} aria-label="Contexto da Uni">
          <Card variant="glass" padding="lg" className={styles.contextCard}>
            <div className={styles.cardHeader}>
              <div>
                <span className={styles.cardTitle}>Contexto usado pela Uni</span>
                <p>Dados simulados que orientam as respostas nesta etapa.</p>
              </div>
            </div>

            <div className={styles.contextList}>
              {contextItems.map((item) => (
                <div key={item.label} className={styles.contextItem}>
                  <div>
                    <span className={styles.contextLabel}>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <Badge variant={item.variant} size="sm">
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </section>

      <section className={styles.suggestions} aria-labelledby="quick-suggestions-title">
        <div className={styles.sectionHeader}>
          <div>
            <Badge variant="primary" dot>
              Sugestões rápidas
            </Badge>
            <h3 id="quick-suggestions-title">Perguntas que a Uni pode ajudar a organizar</h3>
          </div>
        </div>

        <div className={styles.suggestionGrid}>
          {quickSuggestions.map((suggestion) => (
            <Card
              key={suggestion}
              variant="outline"
              padding="md"
              interactive
              className={styles.suggestionCard}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              <span>{suggestion}</span>
            </Card>
          ))}
        </div>
      </section>

      <Card variant="outline" padding="md" className={styles.safetyCard}>
        <Badge variant="secondary">Limite da experiência</Badge>
        <p>
          A Uni orienta e recomenda caminhos possíveis, mas as decisões finais continuam sendo suas. Esta tela ainda usa
          dados mockados; a IA real será conectada em uma etapa futura.
        </p>
      </Card>
    </div>
  );
}

export default UniAIPage;
