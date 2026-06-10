import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Activity, Package, Zap, Clock } from 'lucide-react';
import AddProductForm from './components/AddProductForm';
import ProductCard from './components/ProductCard';
import type { Product } from './components/ProductCard';
import PriceChart from './components/PriceChart';

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null
  );
  const [demoMode, setDemoMode] = useState(false);
  const [togglingDemo, setTogglingDemo] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Initial fetch
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Auto-refresh polling: 5s in demo mode, 30s in standard mode
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    const pollMs = demoMode ? 5000 : 30000;
    intervalRef.current = setInterval(() => {
      fetchProducts();
    }, pollMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [demoMode, fetchProducts]);

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

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Ambient background gradient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-violet-600/[0.07] rounded-full blur-3xl"
          style={{ animation: 'floatOrb 20s ease-in-out infinite' }}
        />
        <div
          className="absolute top-1/4 -right-20 w-[400px] h-[400px] bg-cyan-600/[0.07] rounded-full blur-3xl"
          style={{ animation: 'floatOrb 25s ease-in-out infinite reverse' }}
        />
        <div
          className="absolute bottom-0 left-1/3 w-[450px] h-[450px] bg-emerald-600/[0.04] rounded-full blur-3xl"
          style={{ animation: 'floatOrb 22s ease-in-out infinite 5s' }}
        />
        <div
          className="absolute top-2/3 right-1/4 w-[300px] h-[300px] bg-fuchsia-600/[0.04] rounded-full blur-3xl"
          style={{ animation: 'floatOrb 18s ease-in-out infinite 3s' }}
        />
      </div>

      {/* Content wrapper */}
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-xl sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            {/* Left: branding */}
            <div className="flex items-center gap-3.5">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 shadow-lg shadow-violet-500/20">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
                  Price Monitor
                </h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Real-time price tracking dashboard
                </p>
              </div>
            </div>

            {/* Right: demo toggle + product count */}
            <div className="flex items-center gap-5">
              {/* Demo Mode Toggle */}
              <div className="flex items-center gap-3">
                {/* Status text */}
                <div className="hidden sm:flex items-center gap-2">
                  {demoMode ? (
                    <>
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-medium text-emerald-400">
                        Demo Mode Active (10s checks)
                      </span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-gray-500" />
                      <span className="text-xs font-medium text-gray-500">
                        Standard Mode (1h checks)
                      </span>
                    </>
                  )}
                </div>

                {/* Toggle switch */}
                <button
                  onClick={toggleDemoMode}
                  disabled={togglingDemo}
                  className={`
                    relative w-12 h-6 rounded-full
                    transition-all duration-300 ease-out
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${
                      demoMode
                        ? 'bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-lg shadow-emerald-500/30 focus:ring-emerald-500/50'
                        : 'bg-white/[0.1] focus:ring-white/20'
                    }
                  `}
                  aria-label="Toggle Demo Mode"
                >
                  <span
                    className={`
                      absolute top-0.5 left-0.5
                      w-5 h-5 rounded-full
                      bg-white shadow-md
                      transition-transform duration-300 ease-out
                      ${demoMode ? 'translate-x-6' : 'translate-x-0'}
                    `}
                  />
                </button>
              </div>

              {/* Divider */}
              <div className="w-px h-6 bg-white/[0.08]" />

              {/* Product count */}
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Package className="w-4 h-4" />
                <span>
                  {products.length} product{products.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-6 py-10 space-y-10">
          {/* Add Product Form */}
          <AddProductForm onProductAdded={fetchProducts} />

          {/* Product grid */}
          <section>
            <div className="flex items-center gap-2 mb-6">
              <h2 className="text-lg font-semibold text-white">
                Tracked Products
              </h2>
              {loadingProducts && (
                <div className="w-4 h-4 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              )}
            </div>

            {!loadingProducts && products.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] mb-4">
                  <Package className="w-7 h-7 text-gray-600" />
                </div>
                <p className="text-gray-500 text-sm">
                  No products tracked yet. Add one above to get started!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map((product, idx) => (
                  <div
                    key={product.id}
                    className="animate-[fadeIn_0.4s_ease-out_both]"
                    style={{ animationDelay: `${idx * 60}ms` }}
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
          </section>

          {/* Price chart for selected product */}
          {selectedProduct && (
            <section
              className="animate-[chartSlideUp_0.4s_ease-out]"
              key={selectedProduct.id}
            >
              <PriceChart
                productId={selectedProduct.id}
                productTitle={selectedProduct.title}
                targetPrice={selectedProduct.target_price}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
