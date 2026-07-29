/**
 * useStream.js — SSE streaming hook for CampusGPT.
 * Uses fetch() with ReadableStream to handle Server-Sent Events from the backend.
 */

export async function streamMessage(url, body, onToken, onDone, onError) {
  const token = localStorage.getItem('access_token');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim();
          try {
            const data = JSON.parse(dataStr);

            if (currentEvent === 'token' && data.token) {
              onToken(data.token);
            } else if (currentEvent === 'done') {
              onDone(data);
              return;
            } else if (currentEvent === 'error') {
              onError(data.error || 'Unknown stream error');
              return;
            }
          } catch {
            // Not valid JSON, might be partial — ignore
          }
        }
      }
    }

    // Stream ended without explicit done event
    onDone({});
  } catch (err) {
    onError(err.message || 'Stream connection failed');
  }
}
