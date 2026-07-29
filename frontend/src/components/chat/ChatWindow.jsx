import { useEffect, useRef, useState } from 'react';
import useChatStore from '../../store/chatStore';
import MessageBubble from './MessageBubble';

export default function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendPrompt = useChatStore((s) => s.sendPrompt);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const [showScrollBtns, setShowScrollBtns] = useState({ top: false, bottom: false });

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const top = el.scrollTop > 300;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight > 100;
    setShowScrollBtns({ top, bottom });
  };

  // Auto-scroll to bottom on new messages — but only if the user is already
  // near the bottom, so scrolling up to read history isn't interrupted by
  // each streamed token.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const scrollToTop = () => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div 
      className="flex-1 overflow-y-auto px-4 py-6 relative" 
      ref={containerRef} 
      onScroll={handleScroll}
    >
      <div className="max-w-3xl mx-auto space-y-1">
        {messages.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
            <div className="w-16 h-16 mb-6 rounded-2xl bg-campusBlue/10 flex items-center justify-center">
              <span className="text-3xl">✨</span>
            </div>
            <h3 className="text-xl font-semibold text-campusText mb-2">Ask anything about your subject</h3>
            <p className="text-campusMuted text-sm max-w-md">
              Get instant answers from your course notes, generate 13-mark answers,
              predict important PYQ questions, or summarize uploaded PDFs.
            </p>
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {[
                'Explain normalization in DBMS',
                'CB3491 Unit 3 important questions',
                'Generate 13-mark answer on B+ trees',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => sendPrompt(q)}
                  disabled={isStreaming}
                  className="px-4 py-2 bg-campusCard border border-campusBorder/30 rounded-xl text-xs text-campusMuted hover:text-campusText hover:border-campusBlue/40 hover:bg-campusHover/40 cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages */
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={msg.id || i} message={msg} />
            ))}

          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll Buttons */}
      <div className="fixed bottom-24 right-8 flex flex-col gap-2 z-10">
        {showScrollBtns.top && (
          <button
            onClick={scrollToTop}
            className="p-2 bg-campusCard/80 backdrop-blur border border-campusBorder/30 rounded-full shadow-lg text-campusMuted hover:text-campusText hover:bg-campusHover transition-all animate-fade-in"
            title="Scroll to Top"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        )}
        {showScrollBtns.bottom && (
          <button
            onClick={scrollToBottom}
            className="p-2 bg-campusCard/80 backdrop-blur border border-campusBorder/30 rounded-full shadow-lg text-campusMuted hover:text-campusText hover:bg-campusHover transition-all animate-fade-in"
            title="Scroll to Bottom"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
