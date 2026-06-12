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
  created_at: string;
}

interface ProductCardProps {
  product: Product;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onUpdate: () => void;
}

export default function ProductCard({
  product,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
}: ProductCardProps) {
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetValue, setTargetValue] = useState(
    product.target_price.toString()
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isPending = product.status === 'Pending';
  const isError = product.status === 'Error';

  const priceDiff = product.current_price - product.target_price;
  const priceDiffPct =
    product.target_price > 0
      ? ((priceDiff / product.target_price) * 100).toFixed(1)
      : '0.0';
  const isAboveTarget = priceDiff > 0;
  const isAtOrBelow = priceDiff <= 0;

  const statusConfig: Record<string, { color: string; glow: string; border: string; badge: string }> = {
    Active: {
      color: 'text-emerald-400',
      glow: 'shadow-emerald-500/10',
      border: 'border-emerald-500/20',
      badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    },
    Pending: {
      color: 'text-blue-400',
      glow: 'shadow-blue-500/10',
      border: 'border-blue-500/20',
      badge: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
    Triggered: {
      color: 'text-amber-400',
      glow: 'shadow-amber-500/15',
      border: 'border-amber-500/25',
      badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    },
    Error: {
      color: 'text-red-400',
      glow: 'shadow-red-500/10',
      border: 'border-red-500/20',
      badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    },
  };

  const status = statusConfig[product.status] ?? statusConfig.Active;

  const handleSaveTarget = async () => {
    const newTarget = Number(targetValue);
    if (!newTarget || newTarget <= 0) return;
    setSaving(true);
    try {
      await axios.patch(`/api/products/${product.id}`, {
        target_price: newTarget,
      });
      setEditingTarget(false);
      onUpdate();
    } catch (err) {
      console.error('Failed to update target price:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/api/products/${product.id}`);
      onDelete(product.id);
    } catch (err) {
      console.error('Failed to delete product:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingTarget(false);
    setTargetValue(product.target_price.toString());
  };

  return (
    <div
      onClick={() => !isPending && onSelect(product.id)}
      className={`
        group relative
        rounded-2xl p-5
        bg-white/[0.02] backdrop-blur-2xl
        border transition-all duration-300 ease-out
        ${isPending ? 'cursor-default' : 'cursor-pointer hover:-translate-y-0.5 hover:bg-white/[0.04]'}
        ${isPending ? 'animate-[pendingPulse_2s_ease-in-out_infinite]' : ''}
        ${
          isSelected
            ? `${status.border} ${status.glow} shadow-2xl bg-white/[0.05]`
            : 'border-white/[0.06] hover:border-white/[0.12] shadow-xl shadow-black/30'
        }
      `}
    >
      {/* Status glow accent line at top */}
      <div
        className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r ${
          isPending
            ? 'from-transparent via-blue-400/60 to-transparent'
            : product.status === 'Triggered'
            ? 'from-transparent via-amber-400/60 to-transparent'
            : product.status === 'Error'
            ? 'from-transparent via-red-400/60 to-transparent'
            : 'from-transparent via-emerald-400/40 to-transparent'
        }`}
      />

      {/* Pending: animated blue top bar */}
      {isPending && (
        <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden rounded-t-2xl">
          <div
            className="h-full w-full rounded-t-2xl"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.7), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 2s linear infinite',
            }}
          />
        </div>
      )}

      {/* Top row: image + title + status */}
      <div className="flex items-start gap-4 mb-4">
        {/* Product image */}
        <div className="shrink-0">
          {isPending ? (
            <div className="w-16 h-16 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          ) : product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              className="w-16 h-16 rounded-xl object-cover bg-white/[0.05] shadow-md shadow-black/30 border border-white/[0.06]"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
              {isError ? (
                <AlertTriangle className="w-6 h-6 text-red-400" />
              ) : (
                <Target className="w-6 h-6 text-gray-600" />
              )}
            </div>
          )}
        </div>

        {/* Title + status */}
        <div className="flex-1 min-w-0">
          {isPending ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                <span className="text-sm font-semibold text-blue-300">Fetching…</span>
              </div>
              {/* Skeleton lines */}
              <div className="space-y-1.5">
                <div
                  className="h-3 rounded-full w-3/4"
                  style={{
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s linear infinite',
                  }}
                />
                <div
                  className="h-3 rounded-full w-1/2"
                  style={{
                    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s linear infinite 0.3s',
                  }}
                />
              </div>
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-white leading-tight line-clamp-2">
                {product.title || 'Untitled Product'}
              </h3>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`
                    inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border
                    ${status.badge}
                    ${product.status === 'Triggered' ? 'animate-[statusPulse_2s_ease-in-out_infinite]' : ''}
                  `}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      product.status === 'Active'
                        ? 'bg-emerald-400'
                        : product.status === 'Triggered'
                        ? 'bg-amber-400'
                        : product.status === 'Error'
                        ? 'bg-red-400'
                        : 'bg-blue-400'
                    }`}
                  />
                  {product.status}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {!isPending && (
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-lg text-gray-500 hover:text-cyan-400 hover:bg-white/[0.06] transition-all duration-200"
              title="Open product page"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={deleting}
            className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 disabled:opacity-50"
            title="Delete product"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Price section */}
      {isPending ? (
        /* Pending: shimmer price skeleton */
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Current Price</p>
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-lg font-semibold text-blue-300/70">Scraping page…</span>
            </div>
          </div>
          <div className="text-right">
            <div
              className="h-6 w-16 rounded-lg"
              style={{
                background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s linear infinite',
              }}
            />
          </div>
        </div>
      ) : isError ? (
        /* Error: show error message */
        <div className="flex items-center gap-3 py-2">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-300">Scraping failed</p>
            <p className="text-xs text-red-400/60 mt-0.5">The product page could not be read</p>
          </div>
        </div>
      ) : (
        /* Active / Triggered: normal price display */
        <div className="flex items-end justify-between gap-4">
          {/* Current price */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-gray-500">Current Price</p>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-violet-500/15 text-violet-400 border border-violet-500/25">
                {product.currency_code}
              </span>
            </div>
            <p className="text-2xl font-bold text-white tracking-tight">
              {product.currency_symbol}{product.current_price.toFixed(2)}
            </p>
          </div>

          {/* Price difference indicator */}
          <div className="text-right">
            <div
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                isAtOrBelow
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              }`}
            >
              {isAtOrBelow ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5" />
              )}
              <span>
                {isAboveTarget ? '+' : ''}
                {priceDiffPct}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {isAtOrBelow ? 'Below target' : 'Above target'}
            </p>
          </div>
        </div>
      )}

      {/* Target price section */}
      {!isPending && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-500">Target Price</span>
            </div>

            {editingTarget ? (
              <div
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-xs text-gray-400">{product.currency_symbol || '$'}</span>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  className="w-20 px-2 py-1 rounded-lg bg-white/[0.06] border border-violet-500/40 text-sm text-white outline-none focus:border-violet-500/70 transition-colors"
                  min="0"
                  step="0.01"
                  autoFocus
                />
                <button
                  onClick={handleSaveTarget}
                  disabled={saving}
                  className="p-1 rounded-md text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-emerald-400">
                  {product.currency_symbol}{product.target_price.toFixed(2)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingTarget(true);
                  }}
                  className="p-1 rounded-md text-gray-600 hover:text-violet-400 hover:bg-violet-500/10 transition-all duration-200"
                  title="Edit target price"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending: target price footer (read-only) */}
      {isPending && (
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-500">Target Price</span>
            </div>
            <span className="text-sm font-semibold text-gray-400">
              {product.currency_symbol || '$'}{product.target_price.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
