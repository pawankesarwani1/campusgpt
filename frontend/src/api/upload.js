import api from './axios';

export async function uploadPdfAPI(files, subjectCode) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file); // 'files' matches backend list parameter name
  });
  formData.append('subject_code', subjectCode || 'UNKNOWN');

  const res = await api.post('/upload/pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data; // { status, total_chunks_stored, subject_code, results, uploaded_by }
}
