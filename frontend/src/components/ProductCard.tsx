import { useState } from 'react';
import axios from 'axios';
import {
  Trash2,
  ExternalLink,
  Edit3,
  Target,
  TrendingDown,
  TrendingUp,
  Check,
  X,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export interface Product {
  id: number;
  url: string;
  title: string;
  image_url: string | null;
  current_price: number;
  target_price: number;
  alert_triggered: boolean;
  status: string;
  currency_symbol: string;
  currency_code: string;
  display_currency?: string;
  created_at: string;
}

interface Props {
  product: Product;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onUpdate: () => void;
  displayCurrency?: string;
  rates?: Record<string, number>;
}

/* ─── Status colour maps ──────────────────────────────────────────────────── */
const STATUS: Record<string, { dot: string; text: string; badge: string; badgeBg: string; badgeBorder: string }> = {
  Active:    { dot: 'var(--accent)',  text: 'var(--accent)',   badge: '#fff',  badgeBg: 'rgba(255,255,255,0.06)',  badgeBorder: 'rgba(255,255,255,0.2)' },
  Pending:   { dot: '#60a5fa', text: '#60a5fa', badge: '#fff',  badgeBg: 'rgba(96,165,250,0.08)',  badgeBorder: 'rgba(96,165,250,0.25)' },
  Triggered: { dot: '#f59e0b', text: '#f59e0b', badge: '#fff',  badgeBg: 'rgba(245,158,11,0.08)',  badgeBorder: 'rgba(245,158,11,0.25)' },
  Error:     { dot: '#f87171', text: '#f87171', badge: '#fff',  badgeBg: 'rgba(248,113,113,0.08)', badgeBorder: 'rgba(248,113,113,0.25)' },
};

/* ─────────────────────────────────────────────────────────────────────────── */

export default function ProductCard({ product, isSelected, onSelect, onDelete, onUpdate, rates = {} }: Props) {
  const [editing,  setEditing]  = useState(false);
  const [target,   setTarget]   = useState(product.target_price.toString());
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const displayCurrency = product.display_currency || 'USD';
  const rateToUSD = 1 / (rates[product.currency_code] || 1);
  const conversionRate = rates[product.currency_code] ? rateToUSD * (rates[displayCurrency] || 1) : 1;
  const SYMBOLS: Record<string, string> = { USD: '$', INR: '₹', EUR: '€', GBP: '£' };
  const symbol = SYMBOLS[displayCurrency] || displayCurrency;
  
  const currentPrice = product.current_price * conversionRate;
  const targetPrice = product.target_price * conversionRate;

  const formatPrice = (price: number) => {
    if (price === 0) return '0.00';
    if (price < 0.01) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    if (price < 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const isPending = product.status === 'Pending';
  const isError   = product.status === 'Error';
  const s = STATUS[product.status] ?? STATUS.Active;

  const diff    = product.current_price - product.target_price;
  const diffPct = product.target_price > 0
    ? ((Math.abs(diff) / product.target_price) * 100).toFixed(1)
    : '0.0';
  const below   = diff <= 0;

  const saveTarget = async () => {
    const v = Number(target);
    if (!v || v <= 0) return;
    setSaving(true);
    try {
      await axios.patch(`/api/products/${product.id}`, { target_price: v });
      setEditing(false);
      onUpdate();
    } finally { setSaving(false); }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (retrying) return;
    setRetrying(true);
    try {
      await axios.post(`/api/products/${product.id}/retry`);
      onUpdate();
    } catch (err) {
      console.error('Failed to retry', err);
    } finally {
      setRetrying(false);
    }
  };

  const del = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/api/products/${product.id}`);
      onDelete(product.id);
    } finally { setDeleting(false); }
  };

  /* ── Card border & background per selected / status ──────────────── */
  const cardBorder = isSelected
    ? `1px solid ${s.dot}44`
    : '1px solid var(--border)';
  const cardBg = isSelected
    ? 'rgba(255,255,255,0.045)'
    : 'var(--bg-surface)';

  return (
    <div
      onClick={() => !isPending && onSelect(product.id)}
      style={{
        position: 'relative',
        borderRadius: 14,
        padding: '20px',
        background: cardBg,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: cardBorder,
        cursor: isPending ? 'default' : 'pointer',
        transition: 'border-color 0.2s, background 0.2s, transform 0.18s, box-shadow 0.2s',
        boxShadow: isSelected ? `0 0 0 1px ${s.dot}22, 0 8px 32px rgba(0,0,0,0.4)` : '0 2px 12px rgba(0,0,0,0.25)',
        animation: isPending ? 'pendingPulse 2s ease-in-out infinite' : undefined,
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (!isPending) {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
          (e.currentTarget as HTMLElement).style.boxShadow = isSelected
            ? `0 0 0 1px ${s.dot}44, 0 12px 40px rgba(0,0,0,0.5)`
            : '0 8px 32px rgba(0,0,0,0.4)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.boxShadow = isSelected
          ? `0 0 0 1px ${s.dot}22, 0 8px 32px rgba(0,0,0,0.4)`
          : '0 2px 12px rgba(0,0,0,0.25)';
      }}
    >
      {/* Top-edge inner highlight */}
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
        pointerEvents: 'none',
      }} />

      {/* Pending shimmer bar */}
      {isPending && (
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '14px 14px 0 0', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: '100%',
            background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.8s linear infinite',
          }} />
        </div>
      )}

      {/* ── Row 1: image + title + actions ──────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'flex-start' }}>
        {/* Image / skeleton */}
        <div style={{ flexShrink: 0 }}>
          {isPending ? (
            <div style={{
              width: 56, height: 56, borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Loader2 size={18} color="#60a5fa" style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              style={{
                width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.03)',
              }}
            />
          ) : (
            <div style={{
              width: 56, height: 56, borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {isError
                ? <AlertTriangle size={18} color="#f87171" />
                : <Target size={18} color="var(--text-muted)" />
              }
            </div>
          )}
        </div>

        {/* Title + badge */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isPending ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: '0.8125rem', color: '#60a5fa', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} />
                Fetching…
              </span>
              {[75, 50].map(w => (
                <div key={w} style={{
                  height: 10, borderRadius: 4, width: `${w}%`,
                  background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s linear infinite',
                }} />
              ))}
            </div>
          ) : (
            <>
              <h3 style={{
                fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)',
                lineHeight: 1.4, marginBottom: 6,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              }}>
                {product.title || 'Untitled Product'}
              </h3>
              <span
                className="badge"
                style={{
                  color: s.text,
                  background: s.badgeBg,
                  borderColor: s.badgeBorder,
                  animation: product.status === 'Triggered' ? 'statusPulse 2s ease infinite' : undefined,
                }}
              >
                <span className="stat-dot" style={{ background: s.dot }} />
                {product.status}
              </span>
            </>
          )}
        </div>

        {/* Action buttons — visible on hover */}
        <div
          className="card-actions"
          style={{ display: 'flex', gap: 4, flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          {!isPending && (
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-icon"
              title="Open product"
              style={{ textDecoration: 'none' }}
            >
              <ExternalLink size={13} />
            </a>
          )}
          <button onClick={del} disabled={deleting} className="btn-icon" title="Delete" style={{ color: '#f87171' }}>
            {deleting ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>

      {/* ── Price section ────────────────────────────────────────────── */}
      {isPending ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={14} color="#60a5fa" style={{ animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: '0.8125rem', color: '#60a5fa', opacity: 0.7 }}>Scraping page…</span>
        </div>
      ) : isError ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} color="#f87171" />
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#f87171' }}>Scraping failed</p>
              <p style={{ fontSize: '0.75rem', color: 'rgba(248,113,113,0.6)', marginTop: 2 }}>Product page could not be read</p>
            </div>
          </div>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="btn-ghost"
            style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: 'rgba(248,113,113,0.25)', color: '#f87171', background: 'rgba(248,113,113,0.05)' }}
          >
            {retrying ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <RefreshCw size={13} />}
            Retry
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Current Price
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '1.625rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                {symbol}{formatPrice(currentPrice)}
              </span>
              <span style={{
                fontSize: '0.6875rem', fontWeight: 700, padding: '2px 6px', borderRadius: 5,
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}>
                {product.currency_code}
              </span>
            </div>
          </div>

          {/* % vs target */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 8,
            background: below ? 'rgba(255,255,255,0.06)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${below ? 'rgba(255,255,255,0.18)' : 'rgba(248,113,113,0.2)'}`,
          }}>
            {below
              ? <TrendingDown size={13} color="var(--accent)" />
              : <TrendingUp   size={13} color="#f87171" />
            }
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: below ? 'var(--accent)' : '#f87171' }}>
              {below ? '-' : '+'}{diffPct}%
            </span>
          </div>
        </div>
      )}

      {/* ── Target price ─────────────────────────────────────────────── */}
      {!isPending && (
        <div style={{
          marginTop: 16, paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Target size={12} color="var(--text-muted)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target</span>
          </div>

          {editing ? (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={e => e.stopPropagation()}
            >
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{product.currency_symbol}</span>
              <input
                type="number"
                value={target}
                onChange={e => setTarget(e.target.value)}
                style={{
                  width: 72, padding: '4px 8px', borderRadius: 7,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-accent)',
                  color: 'var(--text-primary)', fontSize: '0.8125rem',
                  outline: 'none', fontFamily: 'inherit',
                }}
                min="0" step="0.01" autoFocus
              />
              <button onClick={saveTarget} disabled={saving} className="btn-icon" style={{ color: 'var(--accent)' }}>
                {saving ? <Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Check size={12} />}
              </button>
              <button onClick={() => { setEditing(false); setTarget(product.target_price.toString()); }} className="btn-icon">
                <X size={12} />
              </button>
            </div>
          ) : (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={e => e.stopPropagation()}
            >
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent)' }}>
                {symbol}{formatPrice(targetPrice)}
              </span>
              <button onClick={() => setEditing(true)} className="btn-icon" title="Edit target">
                <Edit3 size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
