import { useState, lazy, Suspense } from 'react';

// Lazy-loaded: pulls in jsPDF only when the user actually exports, keeping it
// out of the initial bundle.
const ExportPDFModal = lazy(() => import('../features/ExportPDFModal'));

export default function ExportButton({ messages, sessionTitle, subjectCode, userName }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        disabled={messages.length === 0}
        className={`
          flex items-center gap-2 p-2 lg:px-4 lg:py-2 rounded-lg font-medium text-sm transition-colors border
          ${messages.length === 0
            ? 'bg-campusCard border-campusBorder/30 text-campusMuted/40 cursor-not-allowed'
            : 'bg-campusCard border-campusBorder/30 text-campusMuted hover:text-campusBlue hover:bg-campusBlue/10'}
        `}
        title="Export session as PDF"
      >
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
        <span className="hidden lg:inline">Export PDF</span>
      </button>

      {modalOpen && (
        <Suspense fallback={null}>
          <ExportPDFModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            messages={messages}
            sessionTitle={sessionTitle}
            subjectCode={subjectCode}
            userName={userName}
          />
        </Suspense>
      )}
    </>
  );
}
