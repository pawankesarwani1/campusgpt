import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useExportPDF } from '../../hooks/useExportPDF';

export default function ExportPDFModal({ isOpen, onClose, messages, sessionTitle, subjectCode, userName }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const { exportChat } = useExportPDF();

  // Initialize all messages as selected when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(messages.map((m) => m.id)));
    }
  }, [isOpen, messages]);

  const handleToggle = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(messages.map((m) => m.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleExport = (exportAll = false) => {
    if (messages.length === 0) return;
    
    setIsExporting(true);
    try {
      const messagesToExport = exportAll 
        ? messages 
        : messages.filter(m => selectedIds.has(m.id));
        
      if (messagesToExport.length === 0) {
        alert("Please select at least one message to export.");
        return;
      }
      
      const isEdited = !exportAll && messagesToExport.length < messages.length;
      exportChat(messagesToExport, sessionTitle, subjectCode, userName, isEdited);
      onClose();
    } catch (error) {
      console.error("Failed to export PDF:", error);
      alert("Failed to export PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export PDF Options">
      <div className="space-y-4">
        <p className="text-sm text-campusMuted">
          Select the messages you want to include in your PDF export. Unchecked messages will be excluded, and the PDF will be marked as "(Edited)".
        </p>

        {/* Selection actions */}
        <div className="flex items-center justify-between py-2 border-b border-campusBorder/30">
          <span className="text-xs font-semibold text-campusText">
            {selectedIds.size} of {messages.length} selected
          </span>
          <div className="flex gap-3">
            <button onClick={handleSelectAll} className="text-xs text-campusBlue hover:underline">Select All</button>
            <button onClick={handleDeselectAll} className="text-xs text-campusMuted hover:underline">Deselect All</button>
          </div>
        </div>

        {/* Message List */}
        <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            const isSelected = selectedIds.has(msg.id);
            return (
              <label 
                key={msg.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected ? 'border-campusBlue/50 bg-campusBlue/5' : 'border-campusBorder/30 bg-campusDark/50 opacity-60 hover:opacity-100'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <input 
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(msg.id)}
                    className="w-4 h-4 rounded text-campusBlue focus:ring-campusBlue bg-campusDark border-campusBorder/50"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-semibold mb-1 ${isUser ? 'text-campusMuted' : 'text-campusBlue'}`}>
                    {isUser ? 'You' : 'CampusGPT'}
                  </p>
                  <p className="text-xs text-campusText line-clamp-3 leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-campusBorder/30">
          <Button variant="secondary" onClick={() => handleExport(true)} disabled={isExporting}>
            Export Full Chat
          </Button>
          <Button onClick={() => handleExport(false)} disabled={isExporting || selectedIds.size === 0}>
            {isExporting ? 'Exporting...' : 'Export Selected'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
