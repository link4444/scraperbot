import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { MessageCircle, X, Send, Loader2, Wifi, WifiOff } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<'online' | 'local'>('online');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      axios.get<{ ai_provider: string }>('/api/settings')
        .then(r => {
          if (r.data.ai_provider === 'local') setProvider('local');
          else setProvider('online');
        })
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const { data } = await axios.post<{ response: string }>('/api/chat', { question: q, provider });
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Bubble button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 300,
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--accent)', color: '#000',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 24px rgba(255,255,255,0.2)',
            transition: 'transform 0.2s',
          }}
          aria-label="Open chat"
        >
          <MessageCircle size={22} />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 300,
            width: 380, maxWidth: 'calc(100vw - 32px)',
            height: 520, maxHeight: 'calc(100vh - 120px)',
            background: '#0e0e0e',
            border: '1px solid var(--border)',
            borderRadius: 18,
            boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
            display: 'flex', flexDirection: 'column',
            animation: 'fadeUp 0.25s ease both',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 18px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: provider === 'local' ? '#facc15' : 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageCircle size={14} color={provider === 'local' ? '#000' : '#000'} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                  AI Assistant
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {provider === 'local' ? <WifiOff size={11} /> : <Wifi size={11} />}
                  {provider === 'local' ? 'Local (Ollama)' : 'Online (Groq)'}
                </span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="btn-icon"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Close chat"
            >
              <X size={15} />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            style={{
              flex: 1, overflowY: 'auto',
              padding: '16px 18px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            {messages.length === 0 && (
              <div style={{
                textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem',
                padding: '40px 0', lineHeight: 1.6,
              }}>
                Ask me anything about price monitoring,<br />financial markets, or how the app works.
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  maxWidth: '85%',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  padding: '10px 14px',
                  borderRadius: 12,
                  fontSize: '0.8125rem',
                  lineHeight: 1.55,
                  background: msg.role === 'user'
                    ? 'rgba(255,255,255,0.1)'
                    : 'rgba(255,255,255,0.04)',
                  border: msg.role === 'user'
                    ? '1px solid rgba(255,255,255,0.12)'
                    : '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: '0.8125rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                Thinking…
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8,
          }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Type your question…"
              disabled={loading}
              className="input"
              style={{ flex: 1 }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="btn-icon"
              style={{
                opacity: (loading || !input.trim()) ? 0.4 : 1,
                cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
                color: 'var(--accent)',
              }}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
