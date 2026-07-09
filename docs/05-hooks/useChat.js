import { useCallback, useState } from 'react';
import { chatService } from '../../services/supabase/chat.service';
import { uniAiService } from '../../services/ai/uni.service';
import { MESSAGE_ROLE } from './constants';

/**
 * useChat — dono do array de mensagens da conversa ativa. ChatWindow.jsx
 * só renderiza o que este hook expõe (mesma separação lógica/renderização
 * de Input/Card/Button).
 *
 * @param {{ conversaId: string, userId: string }} params
 */
export function useChat({ conversaId, userId }) {
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(
    async (text) => {
      setError(null);
      const userMessage = { id: `local-${Date.now()}`, role: MESSAGE_ROLE.USER, content: text };
      const uniMessageId = `local-${Date.now() + 1}`;

      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: uniMessageId, role: MESSAGE_ROLE.UNI, content: '', streaming: true },
      ]);
      setSending(true);

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));

        const fullReply = await uniAiService.streamReply(
          { conversationId: conversaId, message: text, history },
          {
            onChunk: (_chunk, fullTextSoFar) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === uniMessageId ? { ...m, content: fullTextSoFar } : m))
              );
            },
          }
        );

        setMessages((prev) => prev.map((m) => (m.id === uniMessageId ? { ...m, streaming: false } : m)));

        await chatService.saveExchange({ conversaId, userId, mensagem: text, resposta: fullReply });
      } catch (err) {
        setError(err.message);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === uniMessageId
              ? { ...m, streaming: false, content: 'Não consegui responder agora. Tente de novo.' }
              : m
          )
        );
      } finally {
        setSending(false);
      }
    },
    [conversaId, userId, messages]
  );

  const uploadFile = useCallback(
    async (file) => {
      try {
        const attachment = await chatService.uploadAttachment(userId, file);
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            role: MESSAGE_ROLE.USER,
            content: '',
            attachments: [{ ...attachment, type: file.type }],
          },
        ]);
      } catch (err) {
        setError(err.message);
      }
    },
    [userId]
  );

  const loadHistory = useCallback(async () => {
    if (!conversaId) return;
    const history = await chatService.listMessages(conversaId);
    const flattened = history.flatMap((row) => [
      { id: `${row.id}-user`, role: MESSAGE_ROLE.USER, content: row.mensagem },
      { id: `${row.id}-uni`, role: MESSAGE_ROLE.UNI, content: row.resposta },
    ]);
    setMessages(flattened);
  }, [conversaId]);

  return { messages, sending, error, sendMessage, uploadFile, loadHistory };
}
