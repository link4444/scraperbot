import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import {
  Package,
  Settings,
  LayoutGrid,
  Zap,
  Bell,
  BarChart3,
  Shield,
} from 'lucide-react';
import AddProductForm from './components/AddProductForm';
import ProductCard from './components/ProductCard';
import type { Product } from './components/ProductCard';
import PriceChart from './components/PriceChart';
import SettingsModal from './components/SettingsModal';
import { translations } from './translations';

type Tab = 'overview' | 'tracked';

/* ─── Scroll-driven orb animation (vanilla, outside React) ─────────────── */
function useOrbScroll(orbRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let ticking = false;
    const update = () => {
      const el = orbRef.current;
      if (!el) { ticking = false; return; }
      const y = window.scrollY;
      const rotation = y * 0.18 + Math.sin(y * 0.0023) * 40 + Math.cos(y * 0.0011) * 25;
      const scale    = 1 + Math.sin(y * 0.0017) * 0.08;
      const offsetX  = Math.sin(y * 0.0014) * 18;
      const offsetY  = Math.cos(y * 0.0009) * 14;
      el.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) rotate(${rotation}deg) scale(${scale})`;
      ticking = false;
    };
    const onScroll = () => { if (!ticking) { requestAnimationFrame(update); ticking = true; } };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, [orbRef]);
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function App() {
  const [products, setProducts]         = useState<Product[]>([]);
  const [loading,  setLoading]          = useState(true);
  const [selectedId, setSelectedId]     = useState<number | null>(null);
  const [demoMode, setDemoMode]         = useState(false);
  const [togglingDemo, setTogglingDemo] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab]                   = useState<Tab>('overview');
  const [filter, setFilter]             = useState<'all' | 'active' | 'triggered' | 'error'>('all');
  const [lang, setLang]                 = useState<'en' | 'te' | 'hi'>('en');
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'INR' | 'EUR' | 'GBP'>('USD');
  const [rates, setRates]               = useState<Record<string, number>>({});

  const t = translations[lang];

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const formRef     = useRef<HTMLDivElement>(null);
  const orbRef      = useRef<HTMLDivElement>(null);

  useOrbScroll(orbRef);

  /* ── Data ──────────────────────────────────────────────────────────── */
  const fetchProducts = useCallback(async () => {
    try {
      const { data } = await axios.get<Product[]>('/api/products');
      setProducts(data);
    } catch (e) {
      console.error('Failed to fetch products:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    axios.get('https://api.exchangerate-api.com/v4/latest/USD')
      .then(res => setRates(res.data.rates))
      .catch(console.error);
    
    axios.get('/api/demo/status').then(res => setDemoMode(res.data.demo_mode)).catch(() => {});
  }, [fetchProducts]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const hasPending = products.some(p => p.status === 'Pending');
    const ms = hasPending ? 2000 : demoMode ? 5000 : 30000;
    intervalRef.current = setInterval(fetchProducts, ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [demoMode, products, fetchProducts]);

  /* ── Stats ─────────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const total     = products.length;
    const active    = products.filter(p => p.status === 'Active').length;
    const pending   = products.filter(p => p.status === 'Pending').length;
    const triggered = products.filter(p => p.status === 'Triggered').length;
    return { total, active, pending, triggered };
  }, [products]);

  /* ── Handlers ──────────────────────────────────────────────────────── */
  const toggleDemo = async () => {
    const next = !demoMode;
    setTogglingDemo(true);
    try {
      await axios.post(`/api/demo/toggle?demo=${next}`);
      setDemoMode(next);
    } finally { setTogglingDemo(false); }
  };

  const handleSelect = (id: number) => setSelectedId(prev => prev === id ? null : id);
  const handleDelete = (id: number) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const selectedProduct = products.find(p => p.id === selectedId);

  const filteredProducts = products.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'active') return p.status === 'Active' || p.status === 'Pending';
    if (filter === 'triggered') return p.status === 'Triggered';
    if (filter === 'error') return p.status === 'Error';
    return true;
  });

  /* ═══════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', position: 'relative' }}>

      {/* ── Sticky Nav ─────────────────────────────────────────────── */}
      <header className="site-nav">
        <div className="nav-inner">


          {/* Tab switcher */}
          <nav className="tab-switcher">
            <button onClick={() => setTab('overview')} className={`nav-tab${tab === 'overview' ? ' active' : ''}`}>
              <LayoutGrid size={14} /> Overview
            </button>
            <button onClick={() => setTab('tracked')} className={`nav-tab${tab === 'tracked' ? ' active' : ''}`}>
              <Package size={14} /> Tracked
              {stats.total > 0 && (
                <span className={`tab-badge${tab === 'tracked' ? ' active' : ''}`}>{stats.total}</span>
              )}
            </button>
          </nav>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span className="demo-label">{demoMode ? 'Demo on' : '1h checks'}</span>
            <button
              onClick={toggleDemo}
              disabled={togglingDemo}
              className={`toggle${demoMode ? ' on' : ''}`}
              title={demoMode ? 'Demo mode' : 'Standard mode'}
              style={{ opacity: togglingDemo ? 0.5 : 1, cursor: togglingDemo ? 'not-allowed' : 'pointer' }}
            >
              <span className="toggle-knob" />
            </button>
            <div className="divider" />
            <button
              onClick={() => setLang(lang === 'en' ? 'te' : lang === 'te' ? 'hi' : 'en')}
              className="btn-ghost"
              style={{ padding: '4px 8px', fontSize: '0.8125rem', fontWeight: 600 }}
              title="Toggle language"
            >
              {lang.toUpperCase()}
            </button>
            <div className="divider" />
            <button
              onClick={() => {
                const next = { USD: 'INR', INR: 'EUR', EUR: 'GBP', GBP: 'USD' }[displayCurrency] as any;
                setDisplayCurrency(next);
              }}
              className="btn-ghost"
              style={{ padding: '4px 8px', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent)' }}
              title="Toggle display currency"
            >
              {displayCurrency}
            </button>
            <button onClick={() => setSettingsOpen(true)} className="btn-icon" title="Settings">
              <Settings size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* OVERVIEW TAB                                                 */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div style={{ animation: 'fadeUp 0.4s ease both' }}>

          {/* ── Hero: full-viewport, ring-centered ─────────────────── */}
          <section className="hero" aria-label="Hero">

            {/* Starfield */}
            <div className="starfield" aria-hidden="true" />

            {/* Purple conic-gradient ring — scroll-animated via useOrbScroll */}
            <div className="glow-orb" ref={orbRef} aria-hidden="true" />

            {/* Hero text content */}
            <div className="hero-content">
              <h1 className="hero-headline">
                {t.heroHeadline1}<br />{t.heroHeadline2}
              </h1>

              <p className="hero-sub">
                {t.heroSub}
              </p>

              <div className="hero-cta">
                <button className="btn-primary-hero" onClick={scrollToForm}>
                  {t.startTracking} <span aria-hidden="true" className="btn-arrow">↗</span>
                </button>
                <button className="btn-secondary-hero" onClick={() => setTab('tracked')}>
                  {t.viewProducts}
                </button>
              </div>
            </div>

            {/* Bottom social-proof footer inside the hero viewport */}
            <p className="hero-footer-text">{t.footerText}</p>
          </section>

          {/* ── Stats bar (only when products exist) ───────────────── */}
          {stats.total > 0 && (
            <section style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {[
                  { label: t.statTracked,   value: stats.total,     color: 'var(--text-primary)' },
                  { label: t.statActive,    value: stats.active,    color: 'var(--accent)' },
                  { label: t.statTriggered, value: stats.triggered, color: '#f59e0b' },
                  { label: t.statPending,   value: stats.pending,   color: '#60a5fa' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="glass glass-highlight" style={{ position: 'relative', padding: '20px 24px' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</p>
                    <p style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Feature cards ──────────────────────────────────────── */}
          <section style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 64px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {[
                {
                  icon: <Zap size={20} color="var(--accent)" />,
                  title: t.feature1Title,
                  desc: t.feature1Desc,
                },
                {
                  icon: <Bell size={20} color="var(--accent)" />,
                  title: t.feature2Title,
                  desc: t.feature2Desc,
                },
                {
                  icon: <BarChart3 size={20} color="var(--accent)" />,
                  title: t.feature3Title,
                  desc: t.feature3Desc,
                },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="glass glass-hover glass-highlight" style={{ position: 'relative', padding: '28px 24px', transition: 'border-color 0.2s, background 0.2s' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'var(--accent-dim)', border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
                  }}>
                    {icon}
                  </div>
                  <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{title}</h3>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Add product form ───────────────────────────────────── */}
          <section ref={formRef} style={{ maxWidth: 680, margin: '0 auto', padding: '0 24px 96px' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {t.trackProduct}
              </h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                {t.trackDesc}
              </p>
            </div>
            <AddProductForm onProductAdded={() => { fetchProducts(); setTab('tracked'); }} />
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* TRACKED TAB                                                  */}
      {/* ════════════════════════════════════════════════════════════ */}
      {tab === 'tracked' && (
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '40px 24px 80px', animation: 'fadeUp 0.35s ease both' }}>
          {/* Header row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: '1.1875rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {t.trackedProducts}
              </h2>
              {loading && (
                <div style={{
                  width: 16, height: 16, border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {stats.active > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span className="stat-dot" style={{ background: 'var(--accent)' }} />
                  {stats.active} {t.statActive.toLowerCase()}
                </span>
              )}
              {stats.pending > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span className="stat-dot" style={{ background: '#60a5fa', animation: 'pulse 1.5s ease infinite' }} />
                  {stats.pending} {t.statPending.toLowerCase()}
                </span>
              )}
              {stats.triggered > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <span className="stat-dot" style={{ background: '#f59e0b' }} />
                  {stats.triggered} {t.statTriggered.toLowerCase()}
                </span>
              )}
            </div>
          </div>

          {/* Sub-navigation tabs */}
          {products.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
              {[
                { id: 'all', label: t.tabAll },
                { id: 'active', label: t.tabActive },
                { id: 'triggered', label: t.tabTriggered },
                { id: 'error', label: t.tabFailed },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id as any)}
                  className="btn-ghost"
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: '0.8125rem',
                    fontWeight: filter === f.id ? 600 : 500,
                    background: filter === f.id ? 'var(--bg-hover)' : 'transparent',
                    color: filter === f.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: `1px solid ${filter === f.id ? 'var(--border)' : 'transparent'}`,
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && products.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div className="glass" style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={22} color="var(--text-muted)" />
              </div>
              <div>
                <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{t.noProducts}</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{t.headToOverview}</p>
              </div>
              <button className="btn-accent" style={{ marginTop: 8 }} onClick={() => setTab('overview')}>{t.goToOverview}</button>
            </div>
          ) : (
            <>
              {filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  {t.noMatch}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                  {filteredProducts.map((product, idx) => (
                    <div key={product.id} style={{ animation: `fadeUp 0.35s ${idx * 50}ms ease both` }}>
                    <ProductCard
                      product={product}
                      isSelected={selectedId === product.id}
                      onSelect={handleSelect}
                      onDelete={handleDelete}
                      onUpdate={fetchProducts}
                      displayCurrency={displayCurrency}
                      rates={rates}
                    />
                    </div>
                  ))}
                </div>
              )}

              {selectedProduct && selectedProduct.status !== 'Pending' && (
                <div style={{ marginTop: 24, animation: 'chartSlideUp 0.4s ease both' }} key={selectedProduct.id}>
                  <PriceChart
                    productId={selectedProduct.id}
                    productTitle={selectedProduct.title}
                    targetPrice={selectedProduct.target_price}
                    currencySymbol={selectedProduct.currency_symbol}
                    currencyCode={selectedProduct.currency_code}
                    displayCurrency={displayCurrency}
                    rates={rates}
                    onUpdate={fetchProducts}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)', background: 'rgba(2, 6, 23, 0.82)',
        padding: '18px 24px', position: 'relative', zIndex: 1,
      }}>
        <div style={{
          maxWidth: 1120, margin: '0 auto',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>© 2026 PriceMonitor</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <Shield size={12} />
              <span>books.toscrape.com · Discord Webhooks · SQLite</span>
            </div>
          </div>
          <div style={{
            fontSize: '0.625rem',
            color: 'rgba(255,255,255,0.3)',
            lineHeight: 1.4,
            maxWidth: 600
          }}>
            Disclaimer: The AI analysis, market sentiment, and target prices provided are for informational purposes only and do not constitute financial advice. Always do your own research.
          </div>
        </div>
      </footer>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
