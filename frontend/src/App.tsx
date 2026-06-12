import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import {
  Activity,
  Package,
  Zap,
  Clock,
  Settings,
  Compass,
  Bell,
  BarChart3,
  ArrowRight,
  Shield,
  TrendingDown,
} from 'lucide-react';
import AddProductForm from './components/AddProductForm';
import ProductCard from './components/ProductCard';
import type { Product } from './components/ProductCard';
import PriceChart from './components/PriceChart';
import SettingsModal from './components/SettingsModal';

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null
  );
  const [demoMode, setDemoMode] = useState(false);
  const [togglingDemo, setTogglingDemo] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'tracked'>('overview');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const trackingFormRef = useRef<HTMLDivElement>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await axios.get<Product[]>('/api/products');
      setProducts(res.data);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.status === 'Active').length;
    const pending = products.filter((p) => p.status === 'Pending').length;
    const triggered = products.filter((p) => p.status === 'Triggered').length;

    // Calculate average savings/discount for tracked items
    let totalDiscount = 0;
    let itemsWithDiscount = 0;
    products.forEach((p) => {
      if (p.target_price > 0 && p.current_price > 0) {
        const diff = p.target_price - p.current_price;
        if (diff > 0) {
          totalDiscount += (diff / p.target_price) * 100;
          itemsWithDiscount++;
        }
      }
    });
    const avgDiscount = itemsWithDiscount > 0 ? (totalDiscount / itemsWithDiscount).toFixed(1) : '0.0';

    return { total, active, pending, triggered, avgDiscount };
  }, [products]);

  // Initial fetch
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Auto-refresh polling
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    const hasPending = stats.pending > 0;
    const pollMs = hasPending ? 2000 : demoMode ? 5000 : 30000;
    intervalRef.current = setInterval(() => {
      fetchProducts();
    }, pollMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [demoMode, stats.pending, fetchProducts]);

  const toggleDemoMode = async () => {
    const next = !demoMode;
    setTogglingDemo(true);
    try {
      await axios.post(`/api/demo/toggle?demo=${next}`);
      setDemoMode(next);
    } catch (err) {
      console.error('Failed to toggle demo mode:', err);
    } finally {
      setTogglingDemo(false);
    }
  };

  const handleSelectProduct = (id: number) => {
    setSelectedProductId((prev) => (prev === id ? null : id));
  };

  const handleDeleteProduct = (id: number) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    if (selectedProductId === id) setSelectedProductId(null);
  };

  const handleScrollToForm = () => {
    trackingFormRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-violet-500/30 selection:text-violet-200 relative overflow-hidden">
      {/* Ambient background gradient orbs (Luxury Premium Purple & Indigo Theme) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div
          className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-violet-900/[0.15] rounded-full blur-[140px]"
          style={{ animation: 'floatOrb 25s ease-in-out infinite' }}
        />
        <div
          className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] bg-indigo-900/[0.15] rounded-full blur-[120px]"
          style={{ animation: 'floatOrb 30s ease-in-out infinite reverse' }}
        />
        <div
          className="absolute bottom-[-10%] left-[20%] w-[650px] h-[650px] bg-fuchsia-950/[0.08] rounded-full blur-[160px]"
          style={{ animation: 'floatOrb 28s ease-in-out infinite 4s' }}
        />
      </div>

      {/* Content wrapper */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="border-b border-white/[0.06] bg-black/[0.3] backdrop-blur-2xl sticky top-0 z-30 transition-all duration-300">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
            {/* Left: branding */}
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-violet-600 via-indigo-600 to-cyan-500 shadow-md shadow-violet-500/20">
                <Activity className="w-4.5 h-4.5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-base font-bold bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent font-display tracking-tight">
                  Price Monitor
                </h1>
                <p className="text-[10px] text-gray-500 font-medium">
                  Real-time price tracking dashboard
                </p>
              </div>
            </div>

            {/* Center: Navigation Tabs */}
            <div className="flex items-center gap-1 bg-white/[0.02] p-1 rounded-xl border border-white/[0.06] backdrop-blur-md">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Overview</span>
              </button>
              <button
                onClick={() => setActiveTab('tracked')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  activeTab === 'tracked'
                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Tracked ({products.length})</span>
              </button>
            </div>

            {/* Right: demo toggle + settings */}
            <div className="flex items-center gap-3">
              {/* Demo Mode Toggle */}
              <div className="flex items-center gap-2.5">
                <div className="hidden md:flex items-center gap-1.5">
                  {demoMode ? (
                    <>
                      <Zap className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] font-semibold text-emerald-400 tracking-wide">
                        Demo (10s checks)
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 text-gray-500" />
                      <span className="text-[10px] font-semibold text-gray-500 tracking-wide">
                        Standard (1h checks)
                      </span>
                    </>
                  )}
                </div>

                <button
                  onClick={toggleDemoMode}
                  disabled={togglingDemo}
                  className={`
                    relative w-10 h-5.5 rounded-full
                    transition-all duration-300 ease-out
                    focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed
                    ${
                      demoMode
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-md shadow-emerald-500/20'
                        : 'bg-white/[0.08] border border-white/[0.06]'
                    }
                  `}
                  aria-label="Toggle Demo Mode"
                >
                  <span
                    className={`
                      absolute top-0.5 left-0.5
                      w-4.5 h-4.5 rounded-full
                      bg-white shadow-sm
                      transition-transform duration-300 ease-out
                      ${demoMode ? 'translate-x-4.5' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>

              {/* Divider */}
              <div className="w-px h-5 bg-white/[0.08]" />

              {/* Settings Button */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] active:bg-white/[0.1] text-gray-400 hover:text-white transition-all cursor-pointer"
                title="System Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Tab contents */}
        <div className="flex-1">
          {activeTab === 'overview' ? (
            /* START PAGE (OVERVIEW) */
            <div className="animate-[fadeIn_0.4s_ease-out_both]">
              {/* Hero Section */}
              <section className="relative pt-20 pb-16 px-6 text-center max-w-4xl mx-auto overflow-hidden">
                {/* Nebula Glow behind hero */}
                <div className="absolute top-[40%] left-[50%] -translate-x-[50%] -translate-y-[50%] w-[350px] h-[350px] bg-violet-600/[0.07] rounded-full blur-[80px] pointer-events-none" />

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[10px] font-bold text-violet-300 tracking-wider uppercase mb-6 backdrop-blur-md shadow-inner">
                  <Zap className="w-3 h-3 text-violet-400 animate-pulse" />
                  <span>Version 2.0 Released</span>
                </div>

                <h2 className="text-4xl sm:text-6xl font-extrabold font-display tracking-tight text-white leading-[1.1] mb-6">
                  Intelligent Price Automation for{' '}
                  <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
                    Modern Shoppers
                  </span>
                </h2>

                <p className="text-gray-400 text-sm sm:text-lg max-w-2xl mx-auto leading-relaxed mb-10 font-normal">
                  Scrape product details instantly, track historical price fluctuations with interactive charts, and receive immediate alerts on Discord when prices drop.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button
                    onClick={() => setActiveTab('tracked')}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-sm font-bold shadow-lg shadow-violet-500/15 hover:shadow-violet-500/25 active:scale-98 transition-all cursor-pointer"
                  >
                    <span>View Tracked Products</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleScrollToForm}
                    className="w-full sm:w-auto px-8 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] active:bg-white/[0.08] text-sm font-semibold hover:border-white/[0.15] transition-all cursor-pointer"
                  >
                    Track a New Product
                  </button>
                </div>

                {/* Subtitle / Trust Indicator */}
                <p className="text-[11px] text-gray-500 mt-12 font-medium tracking-wide">
                  Optimized for books.toscrape.com • Custom alerts via Discord Webhooks
                </p>
              </section>

              {/* Stats & Overview Showcase (Ultra-Glassy Cards) */}
              <section className="max-w-6xl mx-auto px-6 py-12 border-t border-white/[0.04] bg-white/[0.01]/10 backdrop-blur-3xl">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
                  {/* Total Card */}
                  <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-5 shadow-xl hover:border-white/[0.12] transition-all duration-300">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Total Products</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-bold font-display">{stats.total}</span>
                      <span className="text-[10px] text-gray-400 font-medium">monitored</span>
                    </div>
                  </div>
                  {/* Active Card */}
                  <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-5 shadow-xl hover:border-white/[0.12] transition-all duration-300">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Active Trackers</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-bold font-display text-emerald-400">{stats.active}</span>
                      <span className="text-[10px] text-gray-400 font-medium">active polling</span>
                    </div>
                  </div>
                  {/* Triggered Card */}
                  <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-5 shadow-xl hover:border-white/[0.12] transition-all duration-300">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Triggered Alerts</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-bold font-display text-amber-400">{stats.triggered}</span>
                      <span className="text-[10px] text-gray-400 font-medium">notified Discord</span>
                    </div>
                  </div>
                  {/* Average Savings */}
                  <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-5 shadow-xl hover:border-white/[0.12] transition-all duration-300">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Average Discount</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-bold font-display text-violet-400 flex items-center gap-1">
                        <TrendingDown className="w-6 h-6 text-violet-400 shrink-0" />
                        {stats.avgDiscount}%
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">below target</span>
                    </div>
                  </div>
                </div>

                {/* Features Highlights */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
                  <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-6 shadow-xl space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-violet-400" />
                    </div>
                    <h3 className="text-base font-bold text-white font-display">Playwright Scraping</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Utilizes dynamic headless browser scraping to bypass traditional API blockers, extracting prices, names, and thumbnails instantly.
                    </p>
                  </div>

                  <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-6 shadow-xl space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Bell className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h3 className="text-base font-bold text-white font-display">Discord Notification Engine</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Sends rich embed webhook notifications directly to your custom Discord channel when products hit or drop below your designated target price.
                    </p>
                  </div>

                  <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-6 shadow-xl space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-cyan-400" />
                    </div>
                    <h3 className="text-base font-bold text-white font-display">Historical Analytics</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Maintains an SQLite database of historical price changes, plotting interactive graphs and computing price prediction analytics.
                    </p>
                  </div>
                </div>

                {/* Form Wrapper */}
                <div ref={trackingFormRef} className="pt-8">
                  <AddProductForm onProductAdded={() => {
                    fetchProducts();
                    setActiveTab('tracked'); // Switch tab to tracked when a product is added
                  }} />
                </div>
              </section>
            </div>
          ) : (
            /* ACTIVELY TRACKED PRODUCTS */
            <div className="max-w-6xl mx-auto px-6 py-10 space-y-10 animate-[fadeIn_0.3s_ease-out]">
              {/* Product grid header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white font-display">
                    Tracked Products
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] font-bold text-gray-400">
                    {products.length}
                  </span>
                  {loadingProducts && (
                    <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin ml-2" />
                  )}
                </div>

                <div className="flex items-center gap-6">
                  {/* Stats Quick Summary */}
                  <div className="hidden sm:flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>{stats.active} Active</span>
                    </span>
                    {stats.pending > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <span>{stats.pending} Pending</span>
                      </span>
                    )}
                    {stats.triggered > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>{stats.triggered} Triggered</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {!loadingProducts && products.length === 0 ? (
                <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-12 text-center max-w-xl mx-auto shadow-xl">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-4">
                    <Package className="w-6 h-6 text-gray-500" />
                  </div>
                  <h3 className="font-bold text-base text-white font-display mb-1">No products tracked yet</h3>
                  <p className="text-gray-500 text-xs max-w-xs mx-auto leading-relaxed mb-6">
                    Paste a URL from books.toscrape.com on the home tab to start monitoring prices in real-time.
                  </p>
                  <button
                    onClick={() => setActiveTab('overview')}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-xs font-semibold text-white shadow-md transition-all cursor-pointer"
                  >
                    Go to Overview
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {products.map((product, idx) => (
                    <div
                      key={product.id}
                      className="animate-[fadeIn_0.4s_ease-out_both]"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <ProductCard
                        product={product}
                        isSelected={selectedProductId === product.id}
                        onSelect={handleSelectProduct}
                        onDelete={handleDeleteProduct}
                        onUpdate={fetchProducts}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Price chart for selected product */}
              {selectedProduct && selectedProduct.status !== 'Pending' && (
                <section
                  className="animate-[chartSlideUp_0.4s_ease-out]"
                  key={selectedProduct.id}
                >
                  <div className="bg-white/[0.02] border border-white/[0.06] backdrop-blur-2xl rounded-2xl p-6 shadow-xl">
                    <PriceChart
                      productId={selectedProduct.id}
                      productTitle={selectedProduct.title}
                      targetPrice={selectedProduct.target_price}
                      currencySymbol={selectedProduct.currency_symbol}
                    />
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-gray-500 bg-black/[0.2] backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© 2026 Price Monitor Bot. All rights reserved.</p>
            <div className="flex items-center gap-4 font-medium">
              <span className="flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-gray-600" />
                <span>SQLite DB Secure</span>
              </span>
              <span>•</span>
              <span>books.toscrape.com</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
