import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { Plus, Link, DollarSign, Loader2, AlertCircle, CheckCircle2, X, Globe } from 'lucide-react';

interface AddProductFormProps {
  onProductAdded: () => void;
}

interface Toast {
  id: number;
  type: 'error' | 'success';
  message: string;
}

let toastId = 0;

export default function AddProductForm({ onProductAdded }: AddProductFormProps) {
  const [url, setUrl] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: 'error' | 'success', message: string) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      addToast('error', 'Please enter a product URL.');
      return;
    }

    if (!targetPrice || Number(targetPrice) <= 0) {
      addToast('error', 'Please enter a valid target price.');
      return;
    }

    setLoading(true);

    try {
      console.log('Sending POST request to:', axios.defaults.baseURL + '/api/products');
      const response = await axios.post(
        '/api/products',
        { url: url.trim(), target_price: Number(targetPrice) },
        { timeout: 60000 }, // 60-second client-side timeout
      );
      console.log('Response received:', response.data);

      setUrl('');
      setTargetPrice('');
      addToast('success', 'Product is now being tracked!');
      onProductAdded();
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const message =
          err.code === 'ECONNABORTED'
            ? 'Request timed out — the server is taking too long. Please try again.'
            : err.response?.data?.detail ||
              err.response?.data?.message ||
              'Failed to add product. Please try again.';
        addToast('error', message);
      } else {
        addToast('error', 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Toast notifications */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-2xl backdrop-blur-xl
              border animate-[slideIn_0.3s_ease-out]
              ${
                toast.type === 'error'
                  ? 'bg-red-500/15 border-red-500/30 text-red-300'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              }
            `}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-2 p-0.5 rounded-md hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Ambient glow behind card */}
      <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-cyan-500/20 to-emerald-500/20 rounded-3xl blur-xl opacity-60" />

      {/* Form card */}
      <div className="relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
        {/* Card header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 shadow-lg shadow-violet-500/25">
            <Plus className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Track a Product</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Paste a URL and set your target price — currency is auto-detected
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* URL input */}
          <div className="group relative">
            <label
              htmlFor="product-url"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Product URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <Link className="w-4.5 h-4.5 text-gray-500 group-focus-within:text-violet-400 transition-colors duration-200" />
              </div>
              <input
                id="product-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.example.com/product..."
                disabled={loading}
                className="
                  w-full pl-12 pr-4 py-3.5 rounded-xl
                  bg-white/[0.04] border border-white/[0.08]
                  text-white placeholder-gray-500
                  text-sm
                  outline-none
                  transition-all duration-300 ease-out
                  focus:border-violet-500/50 focus:bg-white/[0.06]
                  focus:ring-2 focus:ring-violet-500/20
                  hover:border-white/[0.15] hover:bg-white/[0.05]
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              />
            </div>
          </div>

          {/* Target price input */}
          <div className="group relative">
            <label
              htmlFor="target-price"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Target Price
              <span className="ml-2 text-xs text-gray-500 font-normal">(currency auto-detected from page)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <DollarSign className="w-4.5 h-4.5 text-gray-500 group-focus-within:text-emerald-400 transition-colors duration-200" />
              </div>
              <input
                id="target-price"
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={loading}
                className="
                  w-full pl-12 pr-4 py-3.5 rounded-xl
                  bg-white/[0.04] border border-white/[0.08]
                  text-white placeholder-gray-500
                  text-sm
                  outline-none
                  transition-all duration-300 ease-out
                  focus:border-emerald-500/50 focus:bg-white/[0.06]
                  focus:ring-2 focus:ring-emerald-500/20
                  hover:border-white/[0.15] hover:bg-white/[0.05]
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              />
            </div>
            {/* Currency auto-detect notice */}
            <div className="flex items-center gap-1.5 mt-2">
              <Globe className="w-3 h-3 text-gray-600" />
              <span className="text-[11px] text-gray-600">
                Currency symbol (£, $, €, ¥, ₹, etc.) is automatically detected from the product page
              </span>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="
              relative w-full group/btn
              flex items-center justify-center gap-2.5
              py-3.5 px-6 rounded-xl
              font-semibold text-sm text-white
              bg-gradient-to-r from-violet-600 to-cyan-600
              shadow-lg shadow-violet-600/25
              outline-none
              transition-all duration-300 ease-out
              hover:shadow-xl hover:shadow-violet-600/30
              hover:scale-[1.01] hover:brightness-110
              active:scale-[0.99]
              disabled:opacity-60 disabled:cursor-not-allowed
              disabled:hover:scale-100 disabled:hover:shadow-lg
              disabled:hover:brightness-100
            "
          >
            {/* Button shimmer effect */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500" />

            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Adding product…</span>
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                <span>Track Product</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
