import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Settings, Loader2, AlertCircle, CheckCircle2, Send } from 'lucide-react';

interface Props { isOpen: boolean; onClose: () => void; }

const WH_REGEX = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9\-_]+$/;

export default function SettingsModal({ isOpen, onClose }: Props) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [testing,    setTesting]    = useState(false);
  const [valErr,     setValErr]     = useState('');
  const [status,     setStatus]     = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true); setStatus(null); setValErr('');
    axios.get<{ discord_webhook_url: string }>('/api/settings')
      .then(r => setWebhookUrl(r.data.discord_webhook_url || ''))
      .catch(() => setStatus({ type: 'error', text: 'Failed to load settings.' }))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const validate = (u: string): boolean => {
    if (!u.trim()) { setValErr(''); return true; }
    if (!WH_REGEX.test(u.trim())) { setValErr('Invalid Discord webhook URL format.'); return false; }
    setValErr(''); return true;
  };

  const handleSave = async () => {
    if (!validate(webhookUrl)) return;
    setSaving(true); setStatus(null);
    try {
      const r = await axios.post<{ discord_webhook_url: string }>('/api/settings', { discord_webhook_url: webhookUrl.trim() });
      setWebhookUrl(r.data.discord_webhook_url || '');
      setStatus({ type: 'success', text: 'Settings saved.' });
    } catch (e: any) {
      setStatus({ type: 'error', text: e.response?.data?.detail || 'Failed to save settings.' });
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setStatus(null);
    try {
      const r = await axios.post<{ status: string; message: string }>('/api/test-webhook');
      if (r.data.status === 'ok') setStatus({ type: 'success', text: 'Test alert sent! Check your Discord channel.' });
      else setStatus({ type: 'warn', text: r.data.message });
    } catch (e: any) {
      setStatus({ type: 'error', text: e.response?.data?.detail || 'Failed to trigger test.' });
    } finally { setTesting(false); }
  };

  const statusColors: Record<string, string> = {
    success: 'var(--accent)',
    error:   '#f87171',
    warn:    '#f59e0b',
  };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'fadeIn 0.2s ease both',
      }}
    >
      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: '#0e0e0e',
          backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          animation: 'fadeUp 0.25s ease both',
          position: 'relative',
        }}
      >
        {/* Top highlight */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
          pointerEvents: 'none',
        }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Settings size={15} color="var(--accent)" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)' }}>
              System Settings
            </span>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close settings"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 0' }}>
              <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Loading configuration…</p>
            </div>
          ) : (
            <>
              {/* Webhook input */}
              <div>
                <label
                  htmlFor="modal-webhook"
                  style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  Discord Webhook URL
                </label>
                <input
                  id="modal-webhook"
                  type="text"
                  value={webhookUrl}
                  onChange={e => { setWebhookUrl(e.target.value); validate(e.target.value); }}
                  placeholder="https://discord.com/api/webhooks/..."
                  disabled={saving || testing}
                  className="input"
                  style={{ borderColor: valErr ? 'rgba(248,113,113,0.5)' : undefined }}
                />
                {valErr && (
                  <p style={{ marginTop: 6, fontSize: '0.75rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertCircle size={12} /> {valErr}
                  </p>
                )}
                <p style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                  Alerts are sent here when a product drops below your target. Leave empty to disable.
                </p>
              </div>

              {/* Status banner */}
              {status && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', borderRadius: 10,
                  background: `${statusColors[status.type]}10`,
                  border: `1px solid ${statusColors[status.type]}30`,
                }}>
                  {status.type === 'success'
                    ? <CheckCircle2 size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
                    : <AlertCircle  size={15} color={statusColors[status.type]} style={{ flexShrink: 0, marginTop: 1 }} />
                  }
                  <span style={{ fontSize: '0.8125rem', color: statusColors[status.type], lineHeight: 1.5 }}>
                    {status.text}
                  </span>
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={handleTest}
                  disabled={saving || testing || !!valErr || !webhookUrl.trim()}
                  className="btn-ghost"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    opacity: (saving || testing || !!valErr || !webhookUrl.trim()) ? 0.45 : 1,
                    cursor: (saving || testing || !!valErr || !webhookUrl.trim()) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {testing
                    ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Sending…</>
                    : <><Send size={14} /> Send Test Alert</>
                  }
                </button>

                <button
                  onClick={handleSave}
                  disabled={saving || testing || !!valErr}
                  className="btn-accent"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    opacity: (saving || testing || !!valErr) ? 0.55 : 1,
                    cursor: (saving || testing || !!valErr) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving
                    ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</>
                    : 'Save Changes'
                  }
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
