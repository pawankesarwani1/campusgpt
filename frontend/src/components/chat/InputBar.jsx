import { useState, useRef, useEffect } from 'react';
import useChatStore from '../../store/chatStore';
import useVoice from '../../hooks/useVoice';
import { streamMessage } from '../../hooks/useStream';
import PDFUploader from '../upload/PDFUploader';
import { API_BASE_URL } from '../../api/axios';

const API_BASE = API_BASE_URL;

export default function InputBar() {
  const [input, setInput] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const textareaRef = useRef(null);

  const {
    currentSession, isStreaming, selectedMode, subjectCode, isTemporary,
    addMessage, appendToken, setStreaming, createSession, addToast,
    loadSessions, replyQuote, clearReplyQuote,
    pendingPrompt, clearPendingPrompt,
  } = useChatStore();

  const { transcript, isListening, startListening, stopListening, supported: voiceSupported } = useVoice();

  // Snapshot of input before voice started
  const baseInputRef = useRef('');

  // Sync voice transcript to input
  useEffect(() => {
    if (transcript) {
      setInput(baseInputRef.current + (baseInputRef.current && !baseInputRef.current.endsWith(' ') ? ' ' : '') + transcript);
    }
  }, [transcript]);

  const handleStartListening = () => {
    baseInputRef.current = input;
    startListening();
  };

  const handleSend = async (overrideText) => {
    const query = (typeof overrideText === 'string' ? overrideText : input).trim();
    if (!query || isStreaming) return;

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Format the query with quote if available
    let finalQuery = query;
    if (replyQuote) {
      // Add standard Markdown blockquote formatting
      const formattedQuote = replyQuote.split('\n').map(line => `> ${line}`).join('\n');
      finalQuery = `${formattedQuote}\n\n${query}`;
      clearReplyQuote();
    }

    // Ensure we have a session (unless temporary)
    let sessionId = currentSession?.id;
    if (!sessionId && !isTemporary) {
      const session = await createSession(query.slice(0, 60), subjectCode);
      if (!session) {
        addToast({ type: 'error', message: 'Failed to create chat session.' });
        return;
      }
      sessionId = session.id;
    }

    // Add user message locally
    const userMsg = {
      id: `temp-user-${Date.now()}`,
      role: 'user',
      content: finalQuery,
      created_at: new Date().toISOString(),
    };
    addMessage(userMsg);

    // Add empty assistant message placeholder
    const assistantMsg = {
      id: `temp-assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    };
    addMessage(assistantMsg);
    setStreaming(true);

    // Stream from backend
    await streamMessage(
      `${API_BASE}/chat/ask`,
      {
        query: finalQuery,
        subject_code: subjectCode || "",
        mode: selectedMode,
        session_id: sessionId,
        is_temporary: isTemporary,
      },
      (token) => appendToken(token),
      (data) => {
        setStreaming(false);
        // Refresh sessions list to update last_message
        loadSessions();
      },
      (error) => {
        setStreaming(false);
        appendToken(`\n\n⚠️ Error: ${error}`);
        addToast({ type: 'error', message: error });
      }
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Send a question queued by a suggestion chip (from the empty state)
  useEffect(() => {
    if (pendingPrompt && !isStreaming) {
      handleSend(pendingPrompt);
      clearPendingPrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  // Auto-expand textarea
  const handleInput = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  };

  return (
    <>
      <div className="border-t border-campusBorder/20 bg-campusDark px-4 py-3">
        <div className="max-w-3xl mx-auto">
          {/* Quoted Text Preview (above the input pill) */}
          {replyQuote && (
            <div className="mb-2 bg-campusCard border border-campusBlue/30 rounded-lg p-2 pr-8 relative animate-fade-in text-left">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-campusBlue rounded-l-lg"></div>
              <p className="text-xs text-campusMuted italic line-clamp-3 ml-1 break-words">
                {replyQuote}
              </p>
              <button
                onClick={clearReplyQuote}
                className="absolute top-1 right-1 p-1 text-campusMuted/70 hover:text-white hover:bg-campusHover rounded-md transition-colors"
                title="Remove quote"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Unified input pill */}
          <div className="flex items-end gap-1 bg-campusCard border border-campusBorder/50 rounded-2xl pl-2 pr-2 py-1.5 transition-all focus-within:border-campusBlue/60 focus-within:ring-2 focus-within:ring-campusBlue/20">
            {/* Upload button */}
            <button
              onClick={() => setShowUpload(true)}
              title="Upload PDF"
              className="p-2 rounded-xl hover:bg-campusHover text-campusMuted hover:text-campusText transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? '🎤 Listening...' : 'Ask about your subject...'}
              disabled={isStreaming}
              rows={1}
              className="flex-1 bg-transparent border-none px-1 py-2 text-sm text-campusText placeholder:text-campusMuted/50 focus:outline-none focus:ring-0 resize-none disabled:opacity-50 self-center"
            />

            {/* Voice button */}
            {voiceSupported && (
              <button
                onClick={isListening ? stopListening : handleStartListening}
                disabled={isStreaming}
                title={isListening ? 'Stop listening' : 'Voice input'}
                className={`p-2 rounded-xl transition-colors flex-shrink-0 ${
                  isListening
                    ? 'bg-campusError/20 text-campusError animate-pulse'
                    : 'hover:bg-campusHover text-campusMuted hover:text-campusText'
                } disabled:opacity-50`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            )}

            {/* Send button (circular) */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="p-2.5 rounded-full bg-campusBlue hover:bg-campusBlue/90 text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 shadow-lg shadow-campusBlue/20"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>

          {/* Disclaimer text */}
          <div className="text-center mt-2">
            <p className="text-[10px] text-campusMuted/70">
              CampusGPT is AI and can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </div>

      {/* Upload modal */}
      <PDFUploader isOpen={showUpload} onClose={() => setShowUpload(false)} />
    </>
  );
}
