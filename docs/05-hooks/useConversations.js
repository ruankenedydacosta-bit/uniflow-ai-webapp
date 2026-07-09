import { useCallback, useEffect, useState } from 'react';
import { chatService } from '../../services/supabase/chat.service';

export function useConversations(userId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const data = await chatService.listConversations(userId);
    setConversations(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createConversation() {
    const conversation = await chatService.createConversation(userId);
    setConversations((prev) => [conversation, ...prev]);
    return conversation;
  }

  return { conversations, loading, createConversation, refresh };
}
