import { useState, useRef, useEffect } from 'react';
import useChatStore from '../../store/chatStore';
import ModeSelector from '../chat/ModeSelector';
import ExportButton from '../ui/ExportButton';
import { shareSessionAPI } from '../../api/chat';

export default function TopBar({ onToggleSidebar, onToggleExamMode }) {
  const { currentSession, subjectCode, messages, isTemporary, setTemporary, currentUser, addToast } = useChatStore();
  const [sharing, setSharing] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  // Close the mobile overflow menu when clicking outside it.
  useEffect(() => {
    const onDocClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleShare = async () => {
    if (!currentSession?.id) {
      addToast({ type: 'error', message: 'No active session to share.' });
      return;
    }
    
    try {
      setSharing(true);
      const { share_id } = await shareSessionAPI(currentSession.id);
      const shareUrl = `${window.location.origin}/share/${share_id}`;
      await navigator.clipboard.writeText(shareUrl);
      addToast({ type: 'success', message: 'Share link copied to clipboard!' });
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to generate share link.' });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="relative z-20 h-14 flex items-center justify-between px-3 sm:px-4 border-b border-campusBorder/20 bg-campusDark/80 backdrop-blur-sm">
      {/* Left: hamburger + title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          className="p-2 rounded-lg hover:bg-campusHover text-campusMuted transition-colors flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 className="hidden sm:block text-sm font-medium text-campusText truncate max-w-[140px] md:max-w-[240px]">
          {currentSession?.title || 'New Chat'}
        </h2>
        {/* Subject badge (also visible on mobile since the title is hidden there) */}
        {subjectCode && (
          <span className="px-2.5 py-1 bg-campusBlue/15 text-campusBlue text-xs font-mono font-medium rounded-full border border-campusBlue/20 flex-shrink-0">
            {subjectCode}
          </span>
        )}
      </div>

      {/* Right: temp toggle + mode selector + exam mode + export + share */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Temporary Chat Toggle — desktop; on mobile it's in the ⋯ menu */}
        <button
          onClick={() => setTemporary(!isTemporary)}
          title={isTemporary ? "Temporary Chat is ON (Data won't be saved)" : "Turn on Temporary Chat"}
          className={`hidden sm:flex p-2 rounded-lg items-center gap-1 text-xs font-medium transition-colors border ${
            isTemporary
              ? 'bg-campusError/10 text-campusError border-campusError/30 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
              : 'bg-campusCard text-campusMuted border-campusBorder/30 hover:text-campusText hover:bg-campusHover'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="hidden md:inline">Temporary Chat</span>
        </button>

        {/* Exam Mode — desktop; on mobile it's in the ⋯ menu */}
        <button
            onClick={onToggleExamMode}
            className="hidden sm:block px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-campusBlue to-campusAccent hover:brightness-110 rounded-md transition-all shadow-sm shadow-campusBlue/20"
        >
            Exam Mode
        </button>
        <ModeSelector />
        <ExportButton
          messages={messages}
          sessionTitle={currentSession?.title}
          subjectCode={subjectCode}
          userName={currentUser?.name || 'Student'}
        />

        {/* Share Button */}
        <button
          onClick={handleShare}
          disabled={sharing}
          title="Share Chat"
          className="p-2 rounded-lg bg-campusCard text-campusMuted border border-campusBorder/30 hover:text-campusBlue hover:bg-campusBlue/10 transition-colors flex-shrink-0 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>

        {/* Mobile overflow menu (⋯) — holds Temporary Chat + Exam Mode on small screens */}
        <div className="relative sm:hidden flex-shrink-0" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            title="More options"
            className="p-2 rounded-lg bg-campusCard text-campusMuted border border-campusBorder/30 hover:text-campusText hover:bg-campusHover transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
            </svg>
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-11 w-52 bg-campusCard border border-campusBorder/30 rounded-lg shadow-xl overflow-hidden z-50 animate-fade-in">
              <button
                onClick={() => { onToggleExamMode(); setMoreOpen(false); }}
                className="w-full text-left px-4 py-3 text-sm text-campusText hover:bg-campusHover transition-colors flex items-center gap-3"
              >
                <span className="text-campusBlue font-bold text-xs uppercase tracking-wide">Exam Mode</span>
              </button>
              <div className="h-px bg-campusBorder/20" />
              <button
                onClick={() => { setTemporary(!isTemporary); setMoreOpen(false); }}
                className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center gap-3 ${
                  isTemporary ? 'text-campusError' : 'text-campusText hover:bg-campusHover'
                }`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {isTemporary ? 'Temporary Chat: ON' : 'Temporary Chat'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
