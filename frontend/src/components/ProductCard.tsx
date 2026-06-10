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
      onClick={() => onSelect(product.id)}
      className={`
        group relative cursor-pointer
        rounded-2xl p-5
        bg-white/[0.04] backdrop-blur-xl
        border transition-all duration-300 ease-out
        hover:scale-[1.02] hover:bg-white/[0.06]
        ${
          isSelected
            ? `${status.border} ${status.glow} shadow-xl bg-white/[0.07]`
            : 'border-white/[0.08] hover:border-white/[0.14] shadow-lg shadow-black/10'
        }
      `}
    >
      {/* Status glow accent line at top */}
      <div
        className={`absolute top-0 left-6 right-6 h-px bg-gradient-to-r ${
          product.status === 'Triggered'
            ? 'from-transparent via-amber-400/60 to-transparent'
            : product.status === 'Error'
            ? 'from-transparent via-red-400/60 to-transparent'
            : 'from-transparent via-emerald-400/40 to-transparent'
        }`}
      />

      {/* Top row: image + title + status */}
      <div className="flex items-start gap-4 mb-4">
        {/* Product image */}
        <div className="shrink-0">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              className="w-16 h-16 rounded-xl object-cover bg-white/[0.05] shadow-md shadow-black/30 border border-white/[0.06]"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
              <Target className="w-6 h-6 text-gray-600" />
            </div>
          )}
        </div>

        {/* Title + status */}
        <div className="flex-1 min-w-0">
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
                    : 'bg-red-400'
                }`}
              />
              {product.status}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
      <div className="flex items-end justify-between gap-4">
        {/* Current price */}
        <div>
          <p className="text-xs text-gray-500 mb-1">Current Price</p>
          <p className="text-2xl font-bold text-white tracking-tight">
            ${product.current_price.toFixed(2)}
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

      {/* Target price section */}
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
              <span className="text-xs text-gray-400">$</span>
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
                ${product.target_price.toFixed(2)}
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
    </div>
  );
}
