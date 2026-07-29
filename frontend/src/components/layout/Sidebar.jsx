import { useState, useRef, useEffect } from 'react';
import useChatStore from '../../store/chatStore';
import useAuthStore from '../../store/authStore';
import SettingsModal from '../features/SettingsModal';

export default function Sidebar({ onClose }) {
  const {
    sessions, currentSession, createSession, selectSession, deleteSession, updateSession,
    subjectCode, setSubjectCode,
  } = useChatStore();
  const { user, logout } = useAuthStore();
  const [hoveredId, setHoveredId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNewChat = async () => {
    await createSession('New Chat', subjectCode);
    onClose?.();
  };

  const handleSelect = async (id) => {
    await selectSession(id);
    onClose?.();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    setMenuOpenId(null);
    if (!window.confirm('Delete this chat permanently? This cannot be undone.')) return;
    await deleteSession(id);
  };

  const handleRename = async (e, session) => {
    e.stopPropagation();
    setMenuOpenId(null);
    const newTitle = window.prompt("Enter new chat name:", session.title);
    if (newTitle && newTitle.trim() && newTitle !== session.title) {
      await updateSession(session.id, { title: newTitle.trim() });
    }
  };

  const handleTogglePin = async (e, session) => {
    e.stopPropagation();
    setMenuOpenId(null);
    await updateSession(session.id, { is_pinned: !session.is_pinned });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-[260px] h-full bg-campusCard border-r border-campusBorder/20 flex flex-col">
      {/* Logo + New Chat */}
      <div className="p-4 border-b border-campusBorder/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Brand logo tile */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-campusBlue to-campusAccent flex items-center justify-center flex-shrink-0 shadow-lg shadow-campusBlue/20">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-none">
                <span className="text-campusBlue">Campus</span><span className="text-campusText">GPT</span>
              </h1>
              <p className="text-[10px] text-campusMuted mt-1 leading-none tracking-wide">AI Study Assistant</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1 rounded-lg hover:bg-campusHover text-campusMuted flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <button
          onClick={handleNewChat}
          className="w-full flex items-center gap-2 px-4 py-2.5 bg-campusBlue/10 hover:bg-campusBlue/20 text-campusBlue rounded-xl border border-campusBlue/20 transition-all text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Subject Code filter */}
      <div className="px-4 py-3 border-b border-campusBorder/20">
        <input
          type="text"
          placeholder="Subject code (CB3491)"
          value={subjectCode}
          onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
          className="w-full px-3 py-2 bg-campusDark border border-campusBorder/30 rounded-lg text-xs text-campusText placeholder:text-campusMuted/50 focus:outline-none focus:ring-1 focus:ring-campusBlue/50 font-mono"
        />
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 ? (
          <p className="text-campusMuted/50 text-xs text-center px-4 py-8">
            No conversations yet.<br />Start a new chat!
          </p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => handleSelect(session.id)}
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`group flex items-center justify-between px-4 py-3 mx-2 rounded-lg cursor-pointer transition-all text-sm ${
                currentSession?.id === session.id
                  ? 'bg-campusBlue/15 text-campusBlue border border-campusBlue/20'
                  : 'text-campusMuted hover:bg-campusHover hover:text-campusText border border-transparent'
              }`}
            >
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center gap-1.5">
                  {session.is_pinned && (
                    <svg className="w-3 h-3 text-campusAccent flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
                    </svg>
                  )}
                  <p className="truncate font-medium text-xs">{session.title}</p>
                </div>
                <p className="text-[10px] text-campusMuted/60 mt-0.5">
                  {formatTime(session.updated_at)}
                  {session.subject_code && ` · ${session.subject_code}`}
                </p>
              </div>

              {/* Context Menu Button */}
              <div className="relative">
                {(hoveredId === session.id || menuOpenId === session.id) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === session.id ? null : session.id);
                    }}
                    className="p-1 rounded hover:bg-campusHover/50 text-campusMuted transition-colors flex-shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                )}

                {/* Dropdown */}
                {menuOpenId === session.id && (
                  <div 
                    ref={menuRef}
                    className="absolute right-0 top-6 mt-1 w-32 bg-campusCard border border-campusBorder/30 rounded-lg shadow-xl overflow-hidden z-50"
                  >
                    <button
                      onClick={(e) => handleTogglePin(e, session)}
                      className="w-full text-left px-3 py-2 text-xs text-campusText hover:bg-campusHover transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5 text-campusMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                      </svg>
                      {session.is_pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={(e) => handleRename(e, session)}
                      className="w-full text-left px-3 py-2 text-xs text-campusText hover:bg-campusHover transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5 text-campusMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Rename
                    </button>
                    <div className="h-px bg-campusBorder/20 my-0.5"></div>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="w-full text-left px-3 py-2 text-xs text-campusError hover:bg-campusError/10 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* User section */}
      <div className="p-3 border-t border-campusBorder/20">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-campusDark border border-campusBorder/30">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-semibold shadow-sm flex-shrink-0"
            style={{ backgroundColor: user?.avatar_color || '#6366F1' }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-campusText truncate">{user?.name || 'User'}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wider text-campusBlue bg-campusBlue/10 px-1.5 py-0.5 rounded">Student</span>
              <p className="text-[10px] text-campusMuted truncate">{user?.department || ''}</p>
            </div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="p-1.5 rounded-lg hover:bg-campusHover text-campusMuted hover:text-campusText transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            onClick={logout}
            title="Logout"
            className="p-1.5 rounded-lg hover:bg-campusError/10 text-campusMuted hover:text-campusError transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
