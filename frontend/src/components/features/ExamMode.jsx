import { useState, useRef, useEffect } from 'react';
import { useExportPDF } from '../../hooks/useExportPDF';
import api from '../../api/axios';
import ReactMarkdown from 'react-markdown';
import { uploadPdfAPI } from '../../api/upload';

export default function ExamMode({ isOpen, onClose, subjectCode: initialSubjectCode }) {
  // Configuration State
  const [subjectCode, setSubjectCode] = useState(initialSubjectCode || '');
  const [subjectName, setSubjectName] = useState('');
  const [selectedUnits, setSelectedUnits] = useState(['Unit 1']);
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [examMode, setExamMode] = useState('descriptive'); // 'descriptive' or 'mcq'

  // File Upload State
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Exam State
  const [isGenerating, setIsGenerating] = useState(false);
  const [examContent, setExamContent] = useState('');
  const [mcqQuestions, setMcqQuestions] = useState(null); // Array of objects when loaded
  const [userAnswers, setUserAnswers] = useState({}); // { questionId: selectedOption }
  const [timerStarted, setTimerStarted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10 * 60); // 10 minutes by default for MCQs
  const [examFinished, setExamFinished] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0); // MCQ: show one question at a time
  const [configOpen, setConfigOpen] = useState(false); // mobile: slide-in config drawer

  const contentEndRef = useRef(null);
  const { exportChat } = useExportPDF();

  const unitsList = ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5', 'Full Question Paper'];

  const toggleUnit = (unit) => {
    setSelectedUnits(prev => {
      if (unit === 'Full Question Paper') {
        return prev.includes('Full Question Paper') ? [] : ['Full Question Paper'];
      }
      const next = prev.includes(unit) ? prev.filter(u => u !== unit) : [...prev, unit];
      return next.filter(u => u !== 'Full Question Paper');
    });
  };

  useEffect(() => {
    let interval = null;
    if (timerStarted && !examFinished && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && timerStarted && !examFinished) {
      clearInterval(interval);
      alert("Time is up!");
      finishExam();
    }
    return () => clearInterval(interval);
  }, [timerStarted, timeLeft, examFinished]);

  // File Upload Logic
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(Array.from(e.target.files));
    }
  };

  const uploadFiles = async () => {
    if (!subjectCode) {
      alert("Please enter a Subject Code before uploading files.");
      return;
    }
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const result = await uploadPdfAPI(files, subjectCode);
      const successCount = result.results.filter(r => r.status === 'success').length;
      alert(`Successfully uploaded ${successCount} PDF(s) to the subject knowledge base.`);
      setFiles([]);
    } catch (err) {
      alert(err.response?.data?.detail || 'File upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const generateExam = async () => {
    if (selectedUnits.length === 0) {
      alert("Please select at least one unit or Full Question Paper.");
      return;
    }
    if (!subjectCode) {
        alert("Please enter a subject code first.");
        return;
    }

    setIsGenerating(true);
    setExamContent('');
    setMcqQuestions(null);
    setUserAnswers({});
    setExamFinished(false);
    setCurrentIndex(0);
    setConfigOpen(false); // close the mobile config drawer once we start
    setTimeLeft(examMode === 'mcq' ? 10 * 60 : 3 * 60 * 60); // 10 mins for MCQ, 3 hrs for Descriptive

    const requestBody = {
      subject_code: subjectCode,
      subject_name: subjectName,
      units: selectedUnits,
      include_answers: includeAnswers,
      mode: examMode
    };

    try {
      if (examMode === 'mcq') {
        // MCQ Mode: Expect JSON response
        const response = await api.post('/features/exam-mode', requestBody);
        if (response.data.questions) {
          setMcqQuestions(response.data.questions);
          setTimerStarted(true);
        } else {
          setExamContent('Failed to generate MCQs.');
        }
      } else {
        // Descriptive Mode: Stream response
        setTimerStarted(true);
        const response = await fetch(`${api.defaults.baseURL}/features/exam-mode`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify(requestBody)
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data:")) {
              try {
                const data = JSON.parse(line.substring(5));
                if (data.token) {
                  setExamContent(prev => prev + data.token);
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (error) {
      console.error("Exam generation failed", error);
      setExamContent('Error generating exam. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const finishExam = () => {
    setTimerStarted(false);
    setExamFinished(true);
  };

  const calculateScore = () => {
    if (!mcqQuestions) return 0;
    return mcqQuestions.reduce((score, q) => {
      return userAnswers[q.id] === q.answer ? score + 1 : score;
    }, 0);
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleExport = () => {
    if (!examContent && !mcqQuestions) return;
    const contentToExport = examContent || JSON.stringify(mcqQuestions, null, 2);
    exportChat(
      [{ role: 'assistant', content: contentToExport, id: 'export-exam' }],
      "Exam Paper",
      subjectCode
    );
  };

  if (!isOpen) return null;

  // ── Configuration form (reused in the desktop column and the mobile drawer) ──
  const configContent = (
    <>
      <div className="flex items-center justify-between mb-5 border-b border-campusBorder pb-2">
        <h2 className="font-bold text-campusBlue uppercase text-xs tracking-widest">Configuration</h2>
        <button
          onClick={() => setConfigOpen(false)}
          className="md:hidden text-campusMuted hover:text-campusText p-1 rounded-lg hover:bg-campusHover transition-colors"
          aria-label="Close configuration"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="mb-5">
        <label className="block text-xs font-semibold text-campusMuted mb-1.5 uppercase tracking-wide">Subject Code</label>
        <input
          type="text"
          value={subjectCode}
          onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
          placeholder="e.g. CS8492"
          className="w-full px-3.5 py-2.5 border border-campusBorder bg-campusDark rounded-lg focus:outline-none focus:ring-2 focus:ring-campusBlue/50 focus:border-campusBlue text-sm font-mono text-campusText transition-all placeholder:text-campusMuted/50"
        />
      </div>

      <div className="mb-6">
        <label className="block text-xs font-semibold text-campusMuted mb-1.5 uppercase tracking-wide">Subject Name (Optional)</label>
        <input
          type="text"
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          placeholder="e.g. Database Management"
          className="w-full px-3.5 py-2.5 border border-campusBorder bg-campusDark rounded-lg focus:outline-none focus:ring-2 focus:ring-campusBlue/50 focus:border-campusBlue text-sm text-campusText transition-all placeholder:text-campusMuted/50"
        />
      </div>

      {/* File Upload Section */}
      <div className="mb-6 p-4 bg-campusDark/50 border border-campusBorder rounded-xl shadow-inner">
        <label className="block text-xs font-semibold text-campusBlue mb-2 uppercase tracking-wide">Import Reference File</label>
        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleFileChange} multiple />
        {files.length > 0 ? (
          <div className="text-sm text-campusBlue mb-3 truncate font-medium flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            {files.length} file(s) selected
          </div>
        ) : (
          <p className="text-xs text-campusMuted mb-3 leading-relaxed">Upload PDFs to explicitly base the exam on your materials.</p>
        )}
        <div className="flex gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-2 px-3 bg-campusCard text-campusText font-medium text-xs rounded-lg border border-campusBorder hover:border-campusBlue hover:text-campusBlue transition-colors shadow-sm">
            Choose File
          </button>
          {files.length > 0 && (
            <button onClick={uploadFiles} disabled={isUploading} className="flex-1 py-2 px-3 bg-campusBlue text-white font-bold text-xs rounded-lg border border-campusBlue hover:bg-campusAccent transition-all shadow-md">
              {isUploading ? 'Uploading...' : 'Upload Now'}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-semibold text-campusMuted mb-2 uppercase tracking-wide">Exam Mode</label>
        <div className="flex gap-1.5 bg-campusDark p-1.5 rounded-xl border border-campusBorder">
          <button onClick={() => setExamMode('descriptive')} className={`flex-1 text-xs py-2.5 rounded-lg font-bold transition-all duration-200 ${examMode === 'descriptive' ? 'bg-campusCard text-campusBlue shadow-sm' : 'text-campusMuted hover:text-campusText'}`}>
            Descriptive
          </button>
          <button onClick={() => setExamMode('mcq')} className={`flex-1 text-xs py-2.5 rounded-lg font-bold transition-all duration-200 ${examMode === 'mcq' ? 'bg-campusCard text-campusBlue shadow-sm' : 'text-campusMuted hover:text-campusText'}`}>
            MCQs
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-semibold text-campusMuted mb-3 uppercase tracking-wide">Select Units</label>
        <div className="space-y-2.5">
          {unitsList.map(unit => (
            <label key={unit} className="flex items-center space-x-3 cursor-pointer group">
              <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${selectedUnits.includes(unit) ? 'bg-campusBlue border-campusBlue' : 'bg-campusDark border-campusBorder group-hover:border-campusBlue'}`}>
                {selectedUnits.includes(unit) && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
              </div>
              <input type="checkbox" checked={selectedUnits.includes(unit)} onChange={() => toggleUnit(unit)} className="hidden" />
              <span className={`text-sm transition-colors ${unit === 'Full Question Paper' ? 'font-bold text-campusBlue' : 'text-campusText group-hover:text-campusBlue'}`}>{unit}</span>
            </label>
          ))}
        </div>
      </div>

      {examMode === 'descriptive' && (
        <div className="mb-8 p-3 bg-campusBlue/5 border border-campusBlue/20 rounded-lg">
          <label className="flex items-center space-x-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded flex items-center justify-center transition-colors border ${includeAnswers ? 'bg-campusBlue border-campusBlue' : 'bg-campusDark border-campusBorder group-hover:border-campusBlue'}`}>
              {includeAnswers && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
            </div>
            <input type="checkbox" checked={includeAnswers} onChange={() => setIncludeAnswers(!includeAnswers)} className="hidden" />
            <span className="text-campusText font-medium text-sm">Include Model Answers</span>
          </label>
        </div>
      )}

      <button
        onClick={generateExam}
        disabled={isGenerating || selectedUnits.length === 0}
        className={`w-full py-3.5 rounded-xl font-bold text-white shadow-md transition-all mt-auto tracking-wide uppercase text-sm
          ${isGenerating ? 'bg-campusMuted cursor-not-allowed opacity-70' : 'bg-gradient-to-r from-campusBlue to-campusAccent hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0'}
        `}
      >
        {isGenerating ? 'Generating...' : 'Start Exam'}
      </button>

      {(examContent || mcqQuestions) && !isGenerating && examMode === 'descriptive' && (
        <button onClick={handleExport} className="w-full mt-3 py-3 rounded-xl font-bold text-campusText border-2 border-campusBorder bg-campusCard hover:border-campusBlue hover:text-campusBlue shadow-sm flex justify-center items-center space-x-2 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          <span>Export PDF</span>
        </button>
      )}
    </>
  );

  // ── Single MCQ question view (one question at a time) ──
  const renderQuiz = () => {
    const total = mcqQuestions.length;
    const q = mcqQuestions[currentIndex];
    const isLast = currentIndex === total - 1;
    const answered = Object.keys(userAnswers).length;

    return (
      <div className="max-w-3xl mx-auto pb-24 animate-fade-in">
        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-campusMuted">Question {currentIndex + 1} of {total}</span>
            <span className="text-xs font-medium text-campusMuted">
              {examFinished ? <span className="text-campusBlue font-bold">Score: {calculateScore()} / {total}</span> : `${answered}/${total} answered`}
            </span>
          </div>
          <div className="w-full h-1.5 bg-campusCard rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-campusBlue to-campusAccent transition-all duration-300" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
          </div>
        </div>

        {/* Question card */}
        <div className="p-5 sm:p-7 border border-campusBorder rounded-2xl bg-campusCard shadow-sm">
          <h3 className="text-lg sm:text-xl font-bold text-campusText mb-5 leading-snug flex items-start gap-3">
            <span className="text-campusBlue bg-campusBlue/10 px-2 py-0.5 rounded-md text-sm shrink-0 mt-0.5">Q{currentIndex + 1}</span>
            <span>{q.question}</span>
          </h3>
          <div className="space-y-3">
            {q.options.map((opt, oIdx) => {
              const isSelected = userAnswers[q.id] === opt;
              const cleanOpt = opt.trim();
              const cleanAns = q.answer?.trim() || "";
              const isCorrect = cleanOpt === cleanAns ||
                (cleanAns.length > 3 && cleanOpt.includes(cleanAns)) ||
                (cleanAns.length <= 3 && cleanOpt.startsWith(cleanAns));
              const showResult = examFinished;

              let optionClass = "border-campusBorder bg-campusDark hover:bg-campusHover text-campusText";
              if (!showResult && isSelected) optionClass = "border-campusBlue bg-campusBlue/10 text-campusBlue ring-1 ring-campusBlue shadow-sm";
              if (showResult) {
                if (isCorrect) optionClass = "border-campusSuccess bg-campusSuccess/10 text-campusSuccess font-bold ring-2 ring-campusSuccess";
                else if (isSelected && !isCorrect) optionClass = "border-campusError bg-campusError/10 text-campusError line-through opacity-80";
                else optionClass = "border-campusBorder bg-campusDark opacity-40";
              }

              return (
                <label key={oIdx} className={`flex items-center gap-3 sm:gap-4 p-3.5 sm:p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 ease-out ${optionClass}`}>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                    ${isSelected && !showResult ? 'border-campusBlue bg-campusBlue' :
                      showResult && isCorrect ? 'border-campusSuccess bg-campusSuccess' :
                      showResult && isSelected && !isCorrect ? 'border-campusError bg-campusError' :
                      'border-campusMuted bg-transparent'}`}
                  >
                    {(isSelected || (showResult && isCorrect)) && <div className="w-2 h-2 bg-campusCard rounded-full"></div>}
                  </div>
                  <input type="radio" name={`question-${q.id}`} value={opt} disabled={examFinished} checked={isSelected} onChange={() => setUserAnswers(prev => ({ ...prev, [q.id]: opt }))} className="hidden" />
                  <span className="flex-1 text-sm sm:text-base">{opt}</span>
                  {showResult && isCorrect && <svg className="w-5 h-5 sm:w-6 sm:h-6 text-campusSuccess shrink-0 animate-fade-in" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                  {showResult && isSelected && !isCorrect && <svg className="w-5 h-5 sm:w-6 sm:h-6 text-campusError shrink-0 animate-fade-in" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>}
                </label>
              );
            })}
          </div>

          {examFinished && q.explanation && (
            <div className="mt-5 p-4 bg-campusDark border border-campusBlue/20 rounded-xl text-campusText shadow-inner animate-slide-up">
              <div className="flex items-center gap-2 font-bold text-campusBlue mb-2 text-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Explanation
              </div>
              <p className="leading-relaxed opacity-90 text-sm">{q.explanation}</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3 mt-6">
          <button
            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="px-4 sm:px-5 py-2.5 rounded-xl font-semibold text-sm border border-campusBorder text-campusText disabled:opacity-40 disabled:cursor-not-allowed hover:border-campusBlue hover:text-campusBlue transition-all"
          >
            ← Previous
          </button>

          {!isLast ? (
            <button
              onClick={() => setCurrentIndex(i => Math.min(total - 1, i + 1))}
              className="px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-campusBlue to-campusAccent hover:shadow-lg hover:-translate-y-0.5 transition-all"
            >
              Next →
            </button>
          ) : !examFinished ? (
            <button
              onClick={finishExam}
              className="px-6 py-2.5 rounded-xl font-bold text-sm text-white bg-campusSuccess hover:brightness-110 shadow-md transition-all"
            >
              Finish Exam
            </button>
          ) : (
            <span className="px-4 py-2.5 text-sm font-bold text-campusSuccess">✓ Completed</span>
          )}
        </div>

        {/* Final score card (after finishing, on the last question) */}
        {examFinished && isLast && (
          <div className="mt-8 p-6 sm:p-10 bg-gradient-to-br from-campusBlue to-campusAccent text-white rounded-3xl text-center shadow-2xl animate-fade-in border border-white/20">
            <h2 className="text-3xl sm:text-5xl font-black mb-3 drop-shadow-md">Score: {calculateScore()} / {total}</h2>
            <p className="text-blue-50 text-base sm:text-xl font-medium">
              {calculateScore() === total ? "Perfect score! Outstanding work. 🏆" :
               calculateScore() > total / 2 ? "Great job! Keep reviewing your weak areas. 📈" :
               "Good attempt. Use the explanations to guide your studies. 📚"}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-campusDark text-campusText z-50 flex flex-col h-screen w-screen overflow-hidden font-inter">
      {/* Header */}
      <header className="flex justify-between items-center gap-3 p-3 sm:p-4 border-b border-campusBorder bg-campusCard shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Mobile: open configuration drawer */}
          <button
            onClick={() => setConfigOpen(true)}
            title="Configuration"
            className="md:hidden p-2 rounded-lg bg-campusDark border border-campusBorder text-campusBlue hover:bg-campusHover transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-campusBlue leading-tight">Exam Mode</h1>
            <p className="hidden sm:block text-sm text-campusMuted">Generate and practice with Anna University model papers</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {timerStarted && !examFinished && (
            <>
              <div className="bg-campusError/10 text-campusError font-mono text-sm sm:text-xl font-bold px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-campusError/20 shadow-inner">
                {formatTime(timeLeft)}
              </div>
              <button onClick={finishExam} className="bg-campusBlue text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg font-bold text-xs sm:text-base hover:bg-campusAccent transition-all shadow-md active:scale-95">
                Finish<span className="hidden sm:inline"> Exam</span>
              </button>
            </>
          )}
          {examFinished && (
            <div className="hidden sm:block bg-campusSuccess/10 text-campusSuccess font-bold px-5 py-2.5 rounded-lg border border-campusSuccess/20 shadow-sm">
              Exam Completed
            </div>
          )}
          <button onClick={onClose} className="text-campusMuted hover:text-campusText p-2 rounded-full hover:bg-campusHover transition-colors" aria-label="Close Exam Mode">
            <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Config — static column on desktop */}
        <div className="hidden md:flex md:w-80 flex-shrink-0 bg-campusCard border-r border-campusBorder p-6 flex-col overflow-y-auto custom-scrollbar shadow-sm z-10">
          {configContent}
        </div>

        {/* Config — slide-in drawer on mobile */}
        {configOpen && (
          <div className="md:hidden fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={() => setConfigOpen(false)} />
        )}
        <div className={`md:hidden fixed top-0 left-0 h-full w-[86%] max-w-sm bg-campusCard border-r border-campusBorder p-6 flex flex-col overflow-y-auto custom-scrollbar z-50 shadow-2xl transition-transform duration-300 ease-in-out ${configOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {configContent}
        </div>

        {/* Right Area: Paper / Quiz View */}
        <div className="flex-1 bg-campusDark p-4 sm:p-6 md:p-10 overflow-y-auto custom-scrollbar relative">
          {/* Subtle background pattern */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

          <div className="relative z-10 h-full">
            {isGenerating ? (
              <div className="h-full flex flex-col items-center justify-center text-campusBlue animate-fade-in">
                <div className="w-16 h-16 border-4 border-campusBlue/20 border-t-campusBlue rounded-full animate-spin mb-6 shadow-lg"></div>
                <p className="text-xl font-bold text-campusText">Generating your custom exam...</p>
                <p className="text-sm mt-3 text-campusMuted max-w-sm text-center">This takes a moment as we analyze your context materials and craft the perfect questions.</p>
              </div>
            ) : mcqQuestions && mcqQuestions.length > 0 ? (
              renderQuiz()
            ) : examContent ? (
              <div className="max-w-4xl mx-auto prose prose-invert p-5 sm:p-8 bg-campusCard rounded-2xl shadow-sm border border-campusBorder animate-slide-up">
                <ReactMarkdown>{examContent}</ReactMarkdown>
                <div ref={contentEndRef} />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-campusMuted animate-fade-in px-4 text-center">
                <div className="w-20 h-20 sm:w-24 sm:h-24 mb-6 rounded-full bg-campusCard border-2 border-campusBorder flex items-center justify-center shadow-inner">
                  <svg className="w-10 h-10 sm:w-12 sm:h-12 text-campusBlue/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <p className="text-xl sm:text-2xl font-bold text-campusText">No Exam Generated Yet</p>
                <p className="text-sm sm:text-base mt-3 max-w-md">Configure your paper and click Start. On mobile, tap the <span className="text-campusBlue font-semibold">menu icon</span> at the top-left to open the settings.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
