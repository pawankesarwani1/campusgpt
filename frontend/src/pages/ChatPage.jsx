import { useState, useEffect, lazy, Suspense } from 'react';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import ChatWindow from '../components/chat/ChatWindow';
import InputBar from '../components/chat/InputBar';
import useChatStore from '../store/chatStore';

// Lazy-loaded: the exam UI (and its PDF/markdown deps) load only when opened.
const ExamMode = lazy(() => import('../components/features/ExamMode'));

export default function ChatPage() {
  // Default open on desktop, closed on mobile (handled via CSS mostly, but start true)
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 1024);
  const [examModeOpen, setExamModeOpen] = useState(false);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const subjectCode = useChatStore((s) => s.subjectCode);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Keep the sidebar state in sync with the viewport: open on desktop,
  // closed (drawer) on phone/tablet. This prevents the sidebar from getting
  // "stuck" visible next to the top bar when the screen is resized or rotated.
  useEffect(() => {
    const syncSidebar = () => setSidebarOpen(window.innerWidth >= 1024);
    window.addEventListener('resize', syncSidebar);
    return () => window.removeEventListener('resize', syncSidebar);
  }, []);

  // Close sidebar on mobile when clicking outside
  const closeSidebarMobile = () => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  return (
    <div className="h-screen flex bg-campusDark overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed lg:relative z-40 h-full
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 overflow-hidden'}
        `}
      >
        <div className="w-[260px] h-full">
          <Sidebar onClose={closeSidebarMobile} />
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar 
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
          onToggleExamMode={() => setExamModeOpen(true)}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatWindow />
          <InputBar />
        </div>
      </div>

      {examModeOpen && (
        <Suspense fallback={null}>
          <ExamMode
            isOpen={examModeOpen}
            onClose={() => setExamModeOpen(false)}
            subjectCode={subjectCode}
          />
        </Suspense>
      )}
    </div>
  );
}
