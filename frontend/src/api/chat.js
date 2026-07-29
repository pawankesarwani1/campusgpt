import api from './axios';

export async function getSessionsAPI() {
  const res = await api.get('/chat/sessions');
  return res.data; // SessionOut[]
}

export async function createSessionAPI(title, subjectCode) {
  const res = await api.post('/chat/sessions', {
    title,
    subject_code: subjectCode || null,
  });
  return res.data; // SessionOut
}

export async function deleteSessionAPI(sessionId) {
  const res = await api.delete(`/chat/sessions/${sessionId}`);
  return res.data;
}

export async function deleteAllSessionsAPI() {
  const res = await api.delete('/chat/sessions');
  return res.data;
}

export async function getHistoryAPI(sessionId) {
  const res = await api.get(`/chat/history/${sessionId}`);
  return res.data; // MessageOut[]
}

export async function shareSessionAPI(sessionId) {
  const res = await api.post(`/chat/sessions/${sessionId}/share`);
  return res.data; // { share_id: string }
}

export async function getSharedSessionAPI(shareId) {
  const res = await api.get(`/chat/shared/${shareId}`);
  return res.data; // { session: {...}, messages: [...] }
}

export async function updateSessionAPI(sessionId, data) {
  const res = await api.patch(`/chat/sessions/${sessionId}`, data);
  return res.data; // SessionOut
}

// Note: /chat/ask uses SSE streaming, handled by useStream hook
// This is a non-streaming fallback if needed
export async function askQuestionAPI(query, subjectCode, mode, sessionId) {
  const res = await api.post('/chat/ask', {
    query,
    subject_code: subjectCode || null,
    mode: mode || 'general',
    session_id: sessionId || null,
  });
  return res.data;
}
