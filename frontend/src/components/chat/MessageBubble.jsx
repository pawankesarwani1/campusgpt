import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import useChatStore from '../../store/chatStore';
import useTTS from '../../hooks/useTTS';
import { useRef, useEffect } from 'react';

function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const setMessageFeedback = useChatStore(s => s.setMessageFeedback);
  const feedback = useChatStore(s => s.messageFeedback[message.id]);
  const { speak, speakingId } = useTTS();
  const isSpeaking = speakingId === message.id;

  const bubbleRef = useRef(null);
  const setReplyQuote = useChatStore(s => s.setReplyQuote);
  const [replyPos, setReplyPos] = useState(null);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setReplyPos(null);
      return;
    }
    const text = sel.toString().trim();
    if (text) {
      setTimeout(() => {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setReplyPos({
          top: rect.top - 35,
          left: rect.left + (rect.width / 2) - 40, // Center button approx
          text
        });
      }, 10);
    }
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target)) {
        setReplyPos(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleReplyQuote = () => {
    if (replyPos?.text) {
      setReplyQuote(replyPos.text);
      setReplyPos(null);
      window.getSelection().removeAllRanges();
    }
  };

  const handleCopy = () => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`group flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-slide-up`}>
      <div
        ref={bubbleRef}
        onMouseUp={!isUser ? handleMouseUp : undefined}
        className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-3 relative ${
          isUser
            ? 'bg-campusBlue text-white rounded-br-md'
            : 'bg-campusCard border border-campusBorder/20 text-campusText rounded-bl-md'
        }`}
      >
        {/* Floating Reply Button */}
        {!isUser && replyPos && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleReplyQuote();
            }}
            style={{ position: 'fixed', top: replyPos.top, left: replyPos.left, zIndex: 50 }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-campusDark/95 backdrop-blur-md border border-campusBorder shadow-xl rounded-lg text-xs font-medium text-white hover:bg-campusBlue hover:border-campusBlue/50 transition-all animate-slide-up"
          >
            Reply
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
        )}
        {/* Role label & Copy Button */}
        <div className="flex items-center justify-between mb-1">
          <p className={`text-[10px] font-semibold ${isUser ? 'text-blue-200' : 'text-campusBlue'}`}>
            {isUser ? 'You' : 'CampusGPT'}
          </p>
          {message.content && (
            <button
              onClick={handleCopy}
              className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                isUser ? 'hover:bg-blue-600/50 text-blue-100' : 'hover:bg-campusHover text-campusMuted hover:text-campusText'
              }`}
              title="Copy"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Content */}
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : !message.content ? (
          <div className="flex items-center gap-2 py-2">
            <span className="typing-dot w-2 h-2 bg-campusBlue rounded-full" />
            <span className="typing-dot w-2 h-2 bg-campusBlue rounded-full" />
            <span className="typing-dot w-2 h-2 bg-campusBlue rounded-full" />
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-campusText">
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  if (!inline && match) {
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-lg !bg-campusDark text-xs"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    );
                  }
                  return (
                    <code className="bg-campusDark px-1.5 py-0.5 rounded text-campusAccent text-xs font-mono" {...props}>
                      {children}
                    </code>
                  );
                },
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border border-campusBorder/30 rounded-lg text-xs">{children}</table>
                    </div>
                  );
                },
                th({ children }) {
                  return <th className="px-3 py-2 bg-campusDark border-b border-campusBorder/30 text-left font-medium text-campusMuted">{children}</th>;
                },
                td({ children }) {
                  return <td className="px-3 py-2 border-b border-campusBorder/20">{children}</td>;
                },
                h1({ children }) { return <h1 className="text-lg font-bold text-campusText mt-3 mb-1">{children}</h1>; },
                h2({ children }) { return <h2 className="text-base font-bold text-campusText mt-3 mb-1">{children}</h2>; },
                h3({ children }) { return <h3 className="text-sm font-bold text-campusText mt-2 mb-1">{children}</h3>; },
                p({ children }) { return <p className="text-sm leading-relaxed mb-2">{children}</p>; },
                ul({ children }) { return <ul className="list-disc list-inside space-y-1 text-sm">{children}</ul>; },
                ol({ children }) { return <ol className="list-decimal list-inside space-y-1 text-sm">{children}</ol>; },
                strong({ children }) { return <strong className="font-semibold text-campusAccent">{children}</strong>; },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Timestamp & Feedback */}
        <div className="flex items-center justify-between mt-2">
          <p className={`text-[10px] ${isUser ? 'text-blue-200/60' : 'text-campusMuted/50'}`}>
            {formatTime(message.created_at)}
          </p>
          
          {!isUser && message.content && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => speak(message.content, message.id)}
                className={`p-1 rounded transition-colors ${
                  isSpeaking ? 'text-campusBlue bg-campusBlue/10 animate-pulse' : 'text-campusMuted hover:text-campusBlue hover:bg-campusHover'
                }`}
                title={isSpeaking ? "Stop Speaking" : "Read Aloud"}
              >
                {isSpeaking ? (
                  <svg className="w-3.5 h-3.5" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => setMessageFeedback(message.id, feedback === 'like' ? null : 'like')}
                className={`p-1 rounded transition-colors ${
                  feedback === 'like' ? 'text-green-500 bg-green-500/10' : 'text-campusMuted hover:text-green-400 hover:bg-campusHover'
                }`}
                title="Helpful"
              >
                <svg className="w-3.5 h-3.5" fill={feedback === 'like' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                </svg>
              </button>
              <button
                onClick={() => setMessageFeedback(message.id, feedback === 'dislike' ? null : 'dislike')}
                className={`p-1 rounded transition-colors ${
                  feedback === 'dislike' ? 'text-red-500 bg-red-500/10' : 'text-campusMuted hover:text-red-400 hover:bg-campusHover'
                }`}
                title="Not Helpful"
              >
                <svg className="w-3.5 h-3.5" fill={feedback === 'dislike' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Memoized so that streaming a new token only re-renders the message that
// changed, not every bubble in the conversation (each runs Markdown +
// syntax highlighting, which is expensive).
export default memo(MessageBubble);
