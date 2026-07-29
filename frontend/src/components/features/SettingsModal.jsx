import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import useAuthStore from '../../store/authStore';
import useChatStore from '../../store/chatStore';
import useTheme from '../../hooks/useTheme';

const TABS = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'appearance', label: 'Appearance', icon: '🎨' },
  { id: 'data', label: 'Data', icon: '💾' },
  { id: 'help', label: 'Help', icon: '❓' },
];

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
  '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'
];

export default function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('profile');
  
  // Stores and Hooks
  const user = useAuthStore(s => s.user);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const deleteAllSessions = useChatStore(s => s.deleteAllSessions);
  const addToast = useChatStore(s => s.addToast);
  const { theme, toggleTheme } = useTheme();

  // Profile Form State
  const [name, setName] = useState(user?.name || '');
  const [college, setCollege] = useState(user?.college || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [avatarColor, setAvatarColor] = useState(user?.avatar_color || '#3B82F6');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleColorChange = (c) => {
    setAvatarColor(c);
    // Optimistic real-time update
    useAuthStore.setState(s => ({ user: { ...s.user, avatar_color: c } }));
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    const result = await updateProfile({ name, college, department, avatar_color: avatarColor });
    setSaving(false);
    if (result.success) {
      addToast({ type: 'success', message: 'Profile updated successfully!' });
    } else {
      addToast({ type: 'error', message: result.error });
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm("Are you sure you want to delete ALL your chats? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteAllSessions();
      addToast({ type: 'success', message: 'All chats deleted.' });
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: 'Failed to delete chats.' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings">
      <div className="flex gap-4 min-h-[300px]">
        
        {/* Sidebar Tabs */}
        <div className="w-1/3 border-r border-campusBorder/20 pr-4 space-y-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-campusBlue text-white'
                  : 'text-campusMuted hover:bg-campusHover hover:text-campusText'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 pl-2 pb-2">
          
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs text-campusMuted mb-1">Avatar Color</label>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => handleColorChange(c)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        avatarColor === c ? 'border-campusText scale-110' : 'border-transparent hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-campusMuted mb-1">Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-campusDark border border-campusBorder/30 rounded-lg text-sm text-campusText focus:outline-none focus:ring-1 focus:ring-campusBlue"
                />
              </div>

              <div>
                <label className="block text-xs text-campusMuted mb-1">College</label>
                <input 
                  type="text" 
                  value={college} 
                  onChange={e => setCollege(e.target.value)}
                  className="w-full px-3 py-2 bg-campusDark border border-campusBorder/30 rounded-lg text-sm text-campusText focus:outline-none focus:ring-1 focus:ring-campusBlue"
                />
              </div>

              <div>
                <label className="block text-xs text-campusMuted mb-1">Department</label>
                <input 
                  type="text" 
                  value={department} 
                  onChange={e => setDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-campusDark border border-campusBorder/30 rounded-lg text-sm text-campusText focus:outline-none focus:ring-1 focus:ring-campusBlue"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button onClick={handleSaveProfile} loading={saving}>Save Profile</Button>
              </div>
            </div>
          )}

          {/* APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between p-4 bg-campusDark border border-campusBorder/20 rounded-xl">
                <div>
                  <h4 className="text-sm font-medium text-campusText">Day / Night Mode</h4>
                  <p className="text-xs text-campusMuted mt-1">Toggle between light and dark themes.</p>
                </div>
                <button
                  onClick={toggleTheme}
                  className="relative inline-flex h-6 w-11 items-center rounded-full bg-campusBlue transition-colors focus:outline-none"
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      theme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* DATA TAB */}
          {activeTab === 'data' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 bg-campusError/10 border border-campusError/20 rounded-xl">
                <h4 className="text-sm font-medium text-campusError">Danger Zone</h4>
                <p className="text-xs text-campusError/80 mt-1 mb-3">
                  This will permanently delete all your chat histories. This action cannot be undone.
                </p>
                <button
                  onClick={handleDeleteAll}
                  disabled={deleting}
                  className="px-4 py-2 bg-campusError hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete All Chats'}
                </button>
              </div>
            </div>
          )}

          {/* HELP TAB */}
          {activeTab === 'help' && (
            <div className="space-y-3 animate-fade-in text-sm text-campusMuted overflow-y-auto max-h-[300px] pr-2">
              <h3 className="font-semibold text-campusText">How to use CampusGPT</h3>
              
              <div className="p-3 bg-campusDark rounded-lg border border-campusBorder/20">
                <p className="font-medium text-campusBlue mb-1">💬 General Mode</p>
                <p className="text-xs">Chat naturally about any topic. It will search your uploaded notes first, then fall back to general knowledge.</p>
              </div>

              <div className="p-3 bg-campusDark rounded-lg border border-campusBorder/20">
                <p className="font-medium text-campusBlue mb-1">📝 13-Mark Mode</p>
                <p className="text-xs">Ask it to generate long-form, essay-style answers suitable for university exams. Uses deep search.</p>
              </div>

              <div className="p-3 bg-campusDark rounded-lg border border-campusBorder/20">
                <p className="font-medium text-campusBlue mb-1">❓ PYQ Mode</p>
                <p className="text-xs">Generates potential exam questions (Previous Year Questions) and provides step-by-step solutions.</p>
              </div>

              <div className="p-3 bg-campusDark rounded-lg border border-campusBorder/20">
                <p className="font-medium text-campusBlue mb-1">📄 Summarize Mode</p>
                <p className="text-xs">Best used right after uploading a PDF. It will quickly summarize the document's contents.</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </Modal>
  );
}
