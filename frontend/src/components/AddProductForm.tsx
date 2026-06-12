import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Plus, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface Props { onProductAdded: () => void; }

interface Toast { id: number; type: 'error' | 'success'; message: string; }
let _id = 0;

export default function AddProductForm({ onProductAdded }: Props) {
  const [url,    setUrl]    = useState('');
  const [price,  setPrice]  = useState('');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = (type: 'error' | 'success', message: string) => {
    const id = ++_id;
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) { toast('error', 'Please enter a product URL.'); return; }
    if (!price || Number(price) <= 0) { toast('error', 'Please enter a valid target price.'); return; }
    setLoading(true);
    try {
      await axios.post('/api/products', { url: url.trim(), target_price: Number(price) }, { timeout: 60000 });
      setUrl(''); setPrice('');
      toast('success', 'Product is now being tracked!');
      onProductAdded();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const msg = err.code === 'ECONNABORTED'
          ? 'Request timed out. Please try again.'
          : err.response?.data?.detail || err.response?.data?.message || 'Failed to add product.';
        toast('error', msg);
      } else {
        toast('error', 'An unexpected error occurred.');
      }
    } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>

      {/* Toast stack */}
      <div style={{ position: 'fixed', top: 80, right: 20, zIndex: 100, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '13px 16px', borderRadius: 12,
              background: t.type === 'error' ? 'rgba(248,113,113,0.1)' : 'rgba(0,229,160,0.1)',
              border: `1px solid ${t.type === 'error' ? 'rgba(248,113,113,0.25)' : 'rgba(0,229,160,0.25)'}`,
              backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
              animation: 'slideIn 0.3s ease both',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}
          >
            {t.type === 'error'
              ? <AlertCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
              : <CheckCircle2 size={16} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
            }
            <span style={{ fontSize: '0.8125rem', color: t.type === 'error' ? '#f87171' : 'var(--accent)', flex: 1, lineHeight: 1.5 }}>
              {t.message}
            </span>
            <button
              onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)', flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Form card */}
      <div style={{
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '32px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
      }}>
        {/* top highlight */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
          pointerEvents: 'none',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Plus size={18} color="var(--accent)" />
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Track a Product
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 2 }}>
              Paste a URL and set your target price — currency is auto-detected
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* URL */}
            <div>
              <label
                htmlFor="add-url"
                style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Product URL
              </label>
              <input
                id="add-url"
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://books.toscrape.com/catalogue/..."
                disabled={loading}
                className="input"
              />
            </div>

            {/* Target Price */}
            <div>
              <label
                htmlFor="add-price"
                style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                Target Price
              </label>
              <input
                id="add-price"
                type="number"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="e.g. 12.99"
                min="0.01"
                step="0.01"
                disabled={loading}
                className="input"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="btn-accent"
              style={{
                width: '100%', justifyContent: 'center', marginTop: 4,
                opacity: loading ? 0.65 : 1, cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading
                ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Scraping page…</>
                : <><Plus size={15} /> Start tracking</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
