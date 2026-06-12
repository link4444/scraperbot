import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Settings, Loader2, AlertCircle, CheckCircle2, Send } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DISCORD_WEBHOOK_REGEX = /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9\-_]+$/;

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchSettings = async () => {
      setLoading(true);
      setStatusMessage(null);
      setValidationError('');
      try {
        const response = await axios.get<{ discord_webhook_url: string }>('/api/settings');
        setWebhookUrl(response.data.discord_webhook_url || '');
      } catch (err) {
        console.error('Failed to fetch settings:', err);
        setStatusMessage({
          type: 'error',
          text: 'Failed to load settings from server.',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleValidate = (url: string): boolean => {
    if (!url.trim()) {
      setValidationError('');
      return true;
    }
    if (!DISCORD_WEBHOOK_REGEX.test(url.trim())) {
      setValidationError(
        'Invalid Discord Webhook URL format. Expected: https://discord.com/api/webhooks/...'
      );
      return false;
    }
    setValidationError('');
    return true;
  };

  const handleSave = async () => {
    const trimmed = webhookUrl.trim();
    if (!handleValidate(trimmed)) return;

    setSaving(true);
    setStatusMessage(null);
    try {
      const response = await axios.post<{ discord_webhook_url: string }>('/api/settings', {
        discord_webhook_url: trimmed,
      });
      setWebhookUrl(response.data.discord_webhook_url || '');
      setStatusMessage({
        type: 'success',
        text: 'Settings saved successfully!',
      });
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      const msg = err.response?.data?.detail || 'Failed to save settings.';
      setStatusMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestWebhook = async () => {
    setTesting(true);
    setStatusMessage(null);
    try {
      const response = await axios.post<{ status: string; message: string }>('/api/test-webhook');
      if (response.data.status === 'ok') {
        setStatusMessage({
          type: 'success',
          text: 'Test alert sent! Check your Discord channel.',
        });
      } else {
        setStatusMessage({
          type: 'warning',
          text: response.data.message || 'Test alert delivery warning.',
        });
      }
    } catch (err: any) {
      console.error('Failed to test webhook:', err);
      const msg = err.response?.data?.detail || 'Failed to trigger test webhook.';
      setStatusMessage({
        type: 'error',
        text: msg,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-gray-900 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-violet-600/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06] bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 shadow-md shadow-violet-500/10">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <h3 className="font-semibold text-lg text-white">System Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all"
            aria-label="Close settings"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-sm text-gray-400">Loading system configuration...</p>
            </div>
          ) : (
            <>
              {/* Discord Webhook field */}
              <div className="space-y-2">
                <label htmlFor="settings-webhook" className="block text-sm font-medium text-gray-300">
                  Discord Webhook URL
                </label>
                <div className="relative">
                  <input
                    id="settings-webhook"
                    type="text"
                    value={webhookUrl}
                    onChange={(e) => {
                      setWebhookUrl(e.target.value);
                      handleValidate(e.target.value);
                    }}
                    placeholder="https://discord.com/api/webhooks/..."
                    disabled={saving || testing}
                    className={`
                      w-full px-4 py-2.5 rounded-xl bg-white/[0.02] border text-sm text-white placeholder-gray-500
                      focus:outline-none focus:ring-2 transition-all duration-200
                      ${
                        validationError
                          ? 'border-red-500/50 focus:ring-red-500/35'
                          : 'border-white/[0.08] focus:border-violet-500/50 focus:ring-violet-500/20'
                      }
                    `}
                  />
                </div>
                {validationError && (
                  <p className="text-xs text-red-400 flex items-start gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{validationError}</span>
                  </p>
                )}
                <p className="text-xs text-gray-500 leading-relaxed">
                  Price drop notifications will be pushed to the Discord channel associated with this webhook. Leave blank to disable alerts.
                </p>
              </div>

              {/* Status Indicator */}
              {statusMessage && (
                <div
                  className={`
                    flex items-start gap-3 p-3.5 rounded-xl border text-sm
                    ${
                      statusMessage.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : statusMessage.type === 'warning'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                        : 'bg-red-500/10 border-red-500/20 text-red-300'
                    }
                  `}
                >
                  {statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4.5 h-4.5 shrink-0 mt-0.5 text-amber-400" />
                  )}
                  <span className="leading-tight">{statusMessage.text}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleTestWebhook}
                  disabled={saving || testing || !!validationError || !webhookUrl.trim()}
                  className={`
                    flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.08]
                    text-sm font-semibold text-gray-200 hover:text-white hover:bg-white/[0.04] active:bg-white/[0.08]
                    transition-all duration-200 select-none
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
                    sm:flex-1
                  `}
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Test Alert</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || testing || !!validationError}
                  className={`
                    flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl
                    bg-gradient-to-r from-violet-500 to-cyan-500 hover:from-violet-600 hover:to-cyan-600
                    active:from-violet-700 active:to-cyan-700
                    text-sm font-semibold text-white shadow-lg shadow-violet-500/10 hover:shadow-violet-500/15
                    transition-all duration-200 select-none
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-violet-500 disabled:hover:to-cyan-500
                    sm:px-8
                  `}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
