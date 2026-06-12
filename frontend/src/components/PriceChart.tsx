import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart,
} from 'recharts';
import { BarChart3, Loader2, Inbox, Wand2, TrendingDown } from 'lucide-react';

interface PriceChartProps {
  productId: number;
  productTitle: string;
  targetPrice: number;
  currencySymbol?: string;
  onDataSeeded?: () => void;
}

interface PricePoint {
  id: number;
  product_id: number;
  price: number;
  scraped_at: string;
}

interface ChartDataPoint {
  time: string;
  rawTime: number;
  price: number;
}

interface PricePrediction {
  prob_1_week: number;
  prob_1_month: number;
  prob_1_year: number;
  message: string;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

export default function PriceChart({
  productId,
  productTitle,
  targetPrice,
  currencySymbol = '£',
  onDataSeeded,
}: PriceChartProps) {
  const [data, setData]           = useState<ChartDataPoint[]>([]);
  const [prediction, setPrediction] = useState<PricePrediction | null>(null);
  const [loading, setLoading]     = useState(true);
  const [seeding, setSeeding]     = useState(false);

  const fetchData = async (cancelled = false) => {
    setLoading(true);
    try {
      const [histRes, predRes] = await Promise.all([
        axios.get<PricePoint[]>(`/api/products/${productId}/history`),
        axios.get<PricePrediction>(`/api/products/${productId}/prediction`),
      ]);
      if (cancelled) return;
      const chartData: ChartDataPoint[] = histRes.data.map(p => ({
        time:    formatTimestamp(p.scraped_at),
        rawTime: new Date(p.scraped_at).getTime(),
        price:   p.price,
      }));
      chartData.sort((a, b) => a.rawTime - b.rawTime);
      setData(chartData);
      setPrediction(predRes.data);
    } catch (err) {
      console.error('Failed to fetch chart data:', err);
      if (!cancelled) { setData([]); setPrediction(null); }
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchData(cancelled);
    return () => { cancelled = true; };
  }, [productId]);

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      await axios.post(`/api/products/${productId}/seed-history`);
      await fetchData();
      onDataSeeded?.();
    } catch (err) {
      console.error('Failed to seed data', err);
    } finally {
      setSeeding(false);
    }
  };

  /* Y-axis domain */
  const prices    = data.map(d => d.price);
  const allValues = [...prices, targetPrice];
  const minVal    = Math.min(...allValues);
  const maxVal    = Math.max(...allValues);
  const padding   = (maxVal - minVal) * 0.15 || 1;
  const yMin      = Math.max(0, Math.floor(minVal - padding));
  const yMax      = Math.ceil(maxVal + padding);

  /* Custom Tooltip */
  const CustomTooltip = ({
    active,
    payload,
    label,
  }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: 'rgba(12,12,12,0.95)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '10px 14px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <p style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: '1.125rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
          {currencySymbol}{payload[0].value.toFixed(2)}
        </p>
      </div>
    );
  };

  /* Probability bar colour */
  const probColor = (pct: number) => {
    if (pct >= 0.6) return 'var(--accent)';
    if (pct >= 0.3) return '#f59e0b';
    return '#f87171';
  };

  return (
    <div style={{ position: 'relative', animation: 'chartSlideUp 0.4s ease both' }}>
      <div style={{
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '24px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Top highlight */}
        <div aria-hidden="true" style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
          pointerEvents: 'none',
        }} />

        {/* SVG gradients */}
        <svg width={0} height={0} style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#00e5a0" />
              <stop offset="100%" stopColor="#00c4d8" />
            </linearGradient>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#00e5a0" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#00e5a0" stopOpacity={0.01} />
            </linearGradient>
          </defs>
        </svg>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BarChart3 size={16} color="var(--accent)" />
            </div>
            <div>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                Price History
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {productTitle}
              </p>
            </div>
          </div>

          {data.length <= 1 && (
            <button
              onClick={handleSeedData}
              disabled={seeding}
              className="btn-ghost"
              style={{ fontSize: '0.75rem', padding: '7px 14px', opacity: seeding ? 0.6 : 1 }}
            >
              {seeding
                ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Seeding…</>
                : <><Wand2 size={13} /> Seed Demo Data</>
              }
            </button>
          )}
        </div>

        {/* Chart body */}
        {loading ? (
          <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Loader2 size={20} color="var(--accent)" style={{ animation: 'spin 0.8s linear infinite' }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Loading price history…</span>
          </div>
        ) : data.length === 0 ? (
          <div style={{ height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Inbox size={36} color="rgba(255,255,255,0.15)" />
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>No price history yet</p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Data will appear after the first price check</p>
          </div>
        ) : (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${currencySymbol}${v}`}
                  dx={-4}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={targetPrice}
                  stroke="rgba(0,229,160,0.6)"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Target ${currencySymbol}${targetPrice.toFixed(2)}`,
                    position: 'insideTopRight',
                    fill: 'rgba(0,229,160,0.8)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="none"
                  fill="url(#areaGrad)"
                  animationDuration={1000}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="url(#lineGrad)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#00e5a0', stroke: '#050505', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#00e5a0', stroke: '#fff', strokeWidth: 2 }}
                  animationDuration={1000}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Prediction section */}
        {!loading && data.length > 0 && prediction && (
          <div style={{
            marginTop: 24, paddingTop: 24,
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <TrendingDown size={14} color="var(--accent)" />
              </div>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  Target Price Probability
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {prediction.message}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: '1 Week',  val: prediction.prob_1_week },
                { label: '1 Month', val: prediction.prob_1_month },
                { label: '1 Year',  val: prediction.prob_1_year },
              ].map(({ label, val }) => {
                const pct = Math.round(val * 100);
                const col = probColor(val);
                return (
                  <div
                    key={label}
                    className="glass"
                    style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, position: 'relative', overflow: 'hidden' }}
                  >
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: '1.875rem', fontWeight: 800, color: col, letterSpacing: '-0.03em', lineHeight: 1 }}>
                      {pct}%
                    </span>
                    {/* Progress bar */}
                    <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: col,
                        width: `${pct}%`,
                        transition: 'width 1s ease',
                        boxShadow: `0 0 6px ${col}88`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
