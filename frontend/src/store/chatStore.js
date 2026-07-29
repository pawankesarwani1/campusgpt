import { create } from 'zustand';
import { getSessionsAPI, createSessionAPI, deleteSessionAPI, getHistoryAPI, deleteAllSessionsAPI, updateSessionAPI } from '../api/chat';

const sortSessions = (sessions) => {
  return [...sessions].sort((a, b) => {
    if (a.is_pinned === b.is_pinned) {
      return new Date(b.updated_at) - new Date(a.updated_at);
    }
    return a.is_pinned ? -1 : 1;
  });
};

const useChatStore = create((set, get) => ({
  sessions: [],
  currentSession: null,
  messages: [],
  isStreaming: false,
  selectedMode: 'general',
  subjectCode: '',
  isTemporary: false,
  toasts: [],
  messageFeedback: {}, // Record<messageId, 'like' | 'dislike'>
  replyQuote: null,
  pendingPrompt: null, // question queued by a suggestion chip, sent by InputBar

  // ── Quotes ──
  setReplyQuote: (text) => set({ replyQuote: text }),
  clearReplyQuote: () => set({ replyQuote: null }),

  // ── Suggestion chips → programmatic send ──
  sendPrompt: (text) => set({ pendingPrompt: text }),
  clearPendingPrompt: () => set({ pendingPrompt: null }),

  // ── Sessions ──
  loadSessions: async () => {
    try {
      const sessions = await getSessionsAPI();
      set({ sessions: sortSessions(sessions) });
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  },

  createSession: async (title, subjectCode) => {
    try {
      const session = await createSessionAPI(title || 'New Chat', subjectCode);
      set((state) => ({
        sessions: sortSessions([session, ...state.sessions]),
        currentSession: session,
        messages: [],
      }));
      return session;
    } catch (err) {
      console.error('Failed to create session:', err);
      return null;
    }
  },

  selectSession: async (sessionId) => {
    const { sessions } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    set({ currentSession: session, messages: [] });

    try {
      const messages = await getHistoryAPI(sessionId);
      set({ messages });
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },

  deleteSession: async (sessionId) => {
    try {
      await deleteSessionAPI(sessionId);
      set((state) => {
        const sessions = state.sessions.filter((s) => s.id !== sessionId);
        const currentSession = state.currentSession?.id === sessionId ? null : state.currentSession;
        return {
          sessions,
          currentSession,
          messages: currentSession ? state.messages : [],
        };
      });
    } catch (err) {
      console.error('Failed to delete session:', err);
    }
  },

  updateSession: async (sessionId, data) => {
    try {
      const updatedSession = await updateSessionAPI(sessionId, data);
      set((state) => {
        const updatedSessions = state.sessions.map((s) => 
          s.id === sessionId ? updatedSession : s
        );
        return {
          sessions: sortSessions(updatedSessions),
          currentSession: state.currentSession?.id === sessionId ? updatedSession : state.currentSession,
        };
      });
      return updatedSession;
    } catch (err) {
      console.error('Failed to update session:', err);
      return null;
    }
  },

  deleteAllSessions: async () => {
    try {
      await deleteAllSessionsAPI();
      set({
        sessions: [],
        currentSession: null,
        messages: [],
      });
    } catch (err) {
      console.error('Failed to delete all sessions:', err);
      throw err;
    }
  },

  // ── Messages ──
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  // Append a token to the last assistant message (for streaming)
  appendToken: (token) => {
    set((state) => {
      const msgs = [...state.messages];
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        msgs[msgs.length - 1] = { ...lastMsg, content: lastMsg.content + token };
      }
      return { messages: msgs };
    });
  },

  setStreaming: (val) => set({ isStreaming: val }),

  // Set local feedback for a message
  setMessageFeedback: (messageId, feedback) => {
    set((state) => ({
      messageFeedback: {
        ...state.messageFeedback,
        [messageId]: feedback,
      },
    }));
  },

  // ── Mode & Subject ──
  setMode: (mode) => set({ selectedMode: mode }),
  setSubjectCode: (code) => set({ subjectCode: code }),
  setTemporary: (val) => set((state) => {
    if (val) {
      // If turning on Temporary Chat, clear the current session and messages
      return { isTemporary: true, currentSession: null, messages: [] };
    }
    return { isTemporary: false };
  }),

  // ── Toast notifications ──
  addToast: (toast) => {
    const id = Date.now();
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    // Auto-remove after 4 seconds
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

export default useChatStore;
