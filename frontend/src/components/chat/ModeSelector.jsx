import useChatStore from '../../store/chatStore';

const MODES = [
  { key: 'general', label: 'General', icon: '💬' },
  { key: 'marks13', label: '13-Mark', icon: '📝' },
  { key: 'pyq_predict', label: 'PYQ', icon: '❓' },
  { key: 'summarize', label: 'Summarize', icon: '📄' },
];

export default function ModeSelector() {
  const selectedMode = useChatStore((s) => s.selectedMode);
  const setMode = useChatStore((s) => s.setMode);

  return (
    <div className="flex items-center bg-campusCard rounded-xl border border-campusBorder/20 p-0.5">
      {MODES.map((mode) => (
        <button
          key={mode.key}
          onClick={() => setMode(mode.key)}
          title={mode.label}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1 ${
            selectedMode === mode.key
              ? 'bg-campusBlue text-white shadow-sm'
              : 'text-campusMuted hover:text-campusText hover:bg-campusHover'
          }`}
        >
          <span className="text-sm">{mode.icon}</span>
          <span className="hidden md:inline">{mode.label}</span>
        </button>
      ))}
    </div>
  );
}
