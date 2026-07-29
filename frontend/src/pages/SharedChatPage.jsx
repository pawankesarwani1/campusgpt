import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getSharedSessionAPI } from '../api/chat';
import MessageBubble from '../components/chat/MessageBubble';

export default function SharedChatPage() {
  const { shareId } = useParams();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSharedChat = async () => {
      try {
        const data = await getSharedSessionAPI(shareId);
        setSession(data.session);
        setMessages(data.messages);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load shared chat.');
      } finally {
        setLoading(false);
      }
    };
    fetchSharedChat();
  }, [shareId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-campusDark">
        <div className="w-8 h-8 border-4 border-campusBlue border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-campusDark">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-campusError/10 flex items-center justify-center">
          <span className="text-3xl">🚫</span>
        </div>
        <h2 className="text-xl font-semibold text-campusText mb-2">Chat Not Found</h2>
        <p className="text-campusMuted text-sm">{error}</p>
        <Link to="/" className="mt-6 px-4 py-2 bg-campusBlue hover:bg-campusBlue/90 text-white rounded-lg transition-colors">
          Go to CampusGPT
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-campusDark overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 flex flex-shrink-0 items-center justify-between px-6 border-b border-campusBorder/20 bg-campusCard/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xl font-bold text-campusBlue tracking-tight hover:opacity-80 transition-opacity">
            Campus<span className="text-campusText">GPT</span>
          </Link>
          <span className="text-campusMuted/30">|</span>
          <span className="text-xs font-medium text-campusMuted px-2 py-1 bg-campusCard rounded-md border border-campusBorder/30">
            Shared View
          </span>
        </div>
        <div className="text-sm font-medium text-campusText truncate max-w-xs md:max-w-md">
          {session.title}
        </div>
        <div className="hidden sm:block">
          {session.subject_code && (
            <span className="px-3 py-1 bg-campusBlue/15 text-campusBlue text-xs font-mono font-medium rounded-full border border-campusBlue/20">
              {session.subject_code}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </div>
      
      {/* Footer Call to Action */}
      <div className="flex-shrink-0 border-t border-campusBorder/20 bg-campusCard/50 p-4 text-center">
        <p className="text-sm text-campusMuted">
          Want to ask follow-up questions?{' '}
          <Link to="/" className="text-campusBlue hover:underline font-medium">
            Start your own chat on CampusGPT
          </Link>
        </p>
      </div>
    </div>
  );
}
