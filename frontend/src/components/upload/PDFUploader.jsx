import { useState, useRef, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { uploadPdfAPI } from '../../api/upload';
import useChatStore from '../../store/chatStore';

export default function PDFUploader({ isOpen, onClose }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const { subjectCode, setSubjectCode, addMessage, addToast, setMode } = useChatStore();
  const [localSubject, setLocalSubject] = useState(subjectCode);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

  const handleFiles = (newFiles) => {
    if (!newFiles || newFiles.length === 0) return;
    
    const validFiles = [];
    Array.from(newFiles).forEach(f => {
      if (f.type !== 'application/pdf') {
        addToast({ type: 'error', message: `${f.name} is not a PDF.` });
      } else if (f.size > MAX_FILE_SIZE) {
        addToast({ type: 'error', message: `${f.name} exceeds 50MB limit.` });
      } else {
        // Avoid duplicates
        if (!files.some(existing => existing.name === f.name)) {
          validFiles.push(f);
        }
      }
    });

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  };

  const removeFile = (e, index) => {
    e.stopPropagation();
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer?.files);
  }, [files]);

  const handleUpload = async () => {
    if (files.length === 0) return;

    const trimmedSubject = localSubject.trim();
    if (!trimmedSubject) {
      addToast({ type: 'error', message: 'Please enter a Subject Code before uploading.' });
      return;
    }

    setUploading(true);

    try {
      const result = await uploadPdfAPI(files, trimmedSubject);
      
      const successCount = result.results.filter(r => r.status === 'success').length;
      if (successCount > 0) {
        addToast({ type: 'success', message: `${successCount} PDF(s) uploaded successfully.` });
      }

      let content = `📄 **PDFs uploaded:**\n`;
      result.results.forEach(r => {
        if (r.status === 'success') {
          content += `- ✅ ${r.filename} (${r.chunks_stored} chunks)\n`;
        } else if (r.status === 'duplicate') {
          content += `- 🔄 ${r.filename} (Already fully processed)\n`;
        } else {
          content += `- ❌ ${r.filename} (Error: ${r.error})\n`;
        }
      });
      content += `\n- Subject: ${result.subject_code}\n\nYou can now ask questions about these documents using **General** mode.`;

      addMessage({
        id: `sys-${Date.now()}`,
        role: 'assistant',
        content,
        created_at: new Date().toISOString(),
      });

      if (localSubject) setSubjectCode(localSubject);
      setMode('general');
      setFiles([]);
      onClose();
    } catch (err) {
      addToast({ type: 'error', message: err.response?.data?.detail || 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Upload PDF">
      {/* Drag-drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          dragOver
            ? 'border-campusBlue bg-campusBlue/5'
            : 'border-campusBorder/40 hover:border-campusBlue/40 hover:bg-campusHover/30'
        }`}
      >
        <svg className="w-10 h-10 mx-auto mb-3 text-campusMuted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-campusMuted">Drag & drop PDFs here or <span className="text-campusBlue font-medium">browse</span></p>
        <p className="text-xs text-campusMuted/50 mt-1">Max 50MB per file</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* File preview list */}
      {files.length > 0 && (
        <div className="mt-4 max-h-48 overflow-y-auto space-y-2 pr-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-3 p-3 bg-campusDark rounded-xl">
              <div className="w-10 h-10 bg-campusError/10 rounded-lg flex items-center justify-center text-campusError flex-shrink-0">
                <span className="text-lg">📄</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-campusText truncate">{f.name}</p>
                <p className="text-xs text-campusMuted">{formatSize(f.size)}</p>
              </div>
              <button
                onClick={(e) => removeFile(e, i)}
                className="text-campusMuted hover:text-campusError transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Subject code (required) */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-campusMuted mb-1.5">
          Subject Code <span className="text-campusError">*</span>
        </label>
        <input
          type="text"
          placeholder="e.g. CB3491"
          value={localSubject}
          onChange={(e) => setLocalSubject(e.target.value.toUpperCase())}
          required
          className="w-full px-4 py-2.5 bg-campusDark border border-campusBorder/30 rounded-lg text-sm text-campusText placeholder:text-campusMuted/50 focus:outline-none focus:ring-2 focus:ring-campusBlue/40 font-mono"
        />
        <p className="text-xs text-campusMuted/60 mt-1.5">Required — files can't be uploaded without a subject code.</p>
      </div>

      {/* Upload button */}
      <div className="mt-5 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleUpload}
          loading={uploading}
          disabled={files.length === 0 || !localSubject.trim()}
        >
          Upload & Process
        </Button>
      </div>
    </Modal>
  );
}
