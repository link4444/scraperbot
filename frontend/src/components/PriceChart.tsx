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
import { BarChart3, Loader2, Inbox, Wand2, TrendingDown, Brain, Target, ShieldAlert, Check, Send } from 'lucide-react';

interface PriceChartProps {
  productId: number;
  productTitle: string;
  targetPrice: number;
  currencySymbol?: string;
  currencyCode?: string;
  displayCurrency?: string;
  aiProvider?: 'online' | 'local';
  rates?: Record<string, number>;
  onDataSeeded?: () => void;
  onUpdate?: () => void;
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
  targetPrice: originalTargetPrice,
  currencySymbol = '$',
  currencyCode = 'USD',
  displayCurrency = 'USD',
  aiProvider = 'online',
  rates = {},
  onDataSeeded,
  onUpdate,
}: PriceChartProps) {
  const [data, setData]           = useState<ChartDataPoint[]>([]);
  const [prediction, setPrediction] = useState<PricePrediction | null>(null);
  const [loading, setLoading]     = useState(true);
  const [seeding, setSeeding]     = useState(false);
  
  // AI Analyst State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [skeletonMsg, setSkeletonMsg] = useState("");
  const [settingTarget, setSettingTarget] = useState<string | null>(null);

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user'|'ai', text: string }[]>([]);

  const rateToUSD = 1 / (rates[currencyCode] || 1);
  const conversionRate = rates[currencyCode] ? rateToUSD * (rates[displayCurrency] || 1) : 1;
  const SYMBOLS: Record<string, string> = { USD: '$', INR: '₹', EUR: '€', GBP: '£' };
  const finalSymbol = SYMBOLS[displayCurrency] || currencySymbol;
  
  const targetPrice = originalTargetPrice * conversionRate;

  const formatPrice = (price: number) => {
    if (price === 0) return '0.00';
    if (price < 0.01) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    if (price < 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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
        price:   p.price * conversionRate,
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
  }, [productId, conversionRate]);

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

  const startAiAnalysis = async () => {
    if (!localStorage.getItem('ai_disclaimer_accepted')) {
      setShowDisclaimer(true);
      return;
    }
    
    setAiLoading(true);
    setAiError(null);
    setSkeletonMsg("Fetching DefiLlama metrics & on-chain data...");
    
    const t1 = setTimeout(() => setSkeletonMsg("Scanning CryptoPanic news aggregators..."), 1500);
    const t2 = setTimeout(() => setSkeletonMsg("Running predictive AI models..."), 3000);
    
    try {
      const res = await axios.get(`/api/products/${productId}/ai-analysis?provider=${aiProvider}`);
      setAiData(res.data);
    } catch (e: any) {
      setAiError(e.response?.data?.detail || e.message || "Failed to run AI analysis");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setAiLoading(false);
    }
  };

  const handleSetAiTarget = async (price: number, type: string) => {
    setSettingTarget(type);
    try {
      const basePrice = price / conversionRate;
      await axios.patch(`/api/products/${productId}`, { target_price: basePrice });
      onUpdate?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSettingTarget(null);
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
          {finalSymbol}{formatPrice(payload[0].value)}
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
              <stop offset="0%"   stopColor="#ffffff" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#ffffff" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#ffffff" stopOpacity={0.01} />
            </linearGradient>
          </defs>
        </svg>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
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
                  stroke="rgba(255,255,255,0.5)"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Target ${finalSymbol}${targetPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 8})}`,
                    position: 'insideTopRight',
                    fill: 'rgba(255,255,255,0.7)',
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
                  dot={{ r: 3, fill: '#ffffff', stroke: '#111111', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: '#ffffff', stroke: 'rgba(255,255,255,0.4)', strokeWidth: 2 }}
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
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
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

        {/* AI Analyst Section */}
        <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Brain size={16} color="#a855f7" />
              </div>
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Ask AI Analyst
              </h4>
            </div>
            {!aiData && !aiLoading && (
              <button className="btn-accent" style={{ background: '#a855f7', padding: '6px 12px', fontSize: '0.75rem' }} onClick={startAiAnalysis}>
                <Wand2 size={12} style={{ marginRight: 6 }} /> Analyze Asset
              </button>
            )}
          </div>

          {aiLoading && (
            <div style={{ padding: 24, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px dashed var(--border)', textAlign: 'center' }}>
              <Loader2 size={24} color="#a855f7" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', animation: 'pulse 1.5s ease infinite' }}>{skeletonMsg}</p>
            </div>
          )}

          {aiError && (
            <div style={{ padding: 16, background: 'rgba(248,113,113,0.1)', borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: '0.8125rem' }}>
              {aiError}
            </div>
          )}

          {aiData && (
            <div style={{ animation: 'fadeUp 0.4s ease both' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                <h5 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Summary</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                  {aiData.summary}
                </p>
                <h5 style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Sentiment</h5>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {aiData.sentiment_analysis}
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {aiData.targets?.map((tgt: any) => (
                  <div key={tgt.type} className="glass" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: tgt.type === 'Aggressive' ? '#f87171' : tgt.type === 'Safe' ? '#4ade80' : '#facc15', textTransform: 'uppercase' }}>
                        {tgt.type}
                      </span>
                      <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>
                        {finalSymbol}{formatPrice(tgt.price * conversionRate)}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {tgt.justification}
                    </p>
                    <button 
                      onClick={() => handleSetAiTarget(tgt.price * conversionRate, tgt.type)}
                      disabled={settingTarget === tgt.type}
                      style={{ marginTop: 'auto', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', padding: '6px', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'background 0.2s' }}
                    >
                      {settingTarget === tgt.type ? <Loader2 size={12} className="spin" /> : <Target size={12} />}
                      Set as Target
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.3)', marginTop: 12, textAlign: 'center' }}>
                Disclaimer: AI analysis is for informational purposes only. Do your own research.
              </div>

              {/* Chat Interface */}
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <h5 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                  Ask about {productTitle}
                </h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12, maxHeight: 250, overflowY: 'auto' }}>
                  {chatHistory.map((msg, i) => (
                    <div key={i} style={{ 
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      background: msg.role === 'user' ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${msg.role === 'user' ? 'rgba(168,85,247,0.3)' : 'var(--border)'}`,
                      padding: '8px 12px', borderRadius: 12, maxWidth: '85%',
                      fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5
                    }}>
                      {msg.text}
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ alignSelf: 'flex-start', padding: '8px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
                      <Loader2 size={14} color="#a855f7" className="spin" />
                    </div>
                  )}
                </div>
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!chatInput.trim() || chatLoading) return;
                    const q = chatInput.trim();
                    setChatInput("");
                    setChatHistory(prev => [...prev, { role: 'user', text: q }]);
                    setChatLoading(true);
                    try {
                      let response: string;
                      if (aiProvider === 'local') {
                        const payload = {
                          model: 'llama3',
                          prompt: `You are a strict financial AI analyst. You are currently analyzing ${productTitle}.
CRITICAL RULES:
1. You MUST ONLY answer questions strictly related to this specific asset (${productTitle}), general financial advice, or trading strategy.
2. If the user asks about ANYTHING ELSE (e.g., coding, cooking, general knowledge, weather), you must decline to answer and say "I am a financial analyst and can only answer questions related to ${productTitle} or financial markets."
3. Keep your answers concise, professional, and no more than 3-4 sentences.

User's question: ${q}`,
                          stream: false,
                        };
                        const { data } = await axios.post('http://localhost:11434/api/generate', payload);
                        response = data.response || 'I could not generate a response.';
                      } else {
                        const res = await axios.post(`/api/products/${productId}/ai-chat`, { question: q, provider: aiProvider });
                        response = res.data.response;
                      }
                      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);
                    } catch (err) {
                      setChatHistory(prev => [...prev, { role: 'ai', text: 'Failed to get response.' }]);
                    } finally {
                      setChatLoading(false);
                    }
                  }}
                  style={{ display: 'flex', gap: 8 }}
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Ask for financial advice related to this asset..."
                    disabled={chatLoading}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: '0.8125rem', color: '#fff', outline: 'none' }}
                  />
                  <button type="submit" disabled={chatLoading || !chatInput.trim()} style={{ background: '#a855f7', border: 'none', borderRadius: 8, padding: '0 12px', color: '#fff', cursor: (chatLoading || !chatInput.trim()) ? 'not-allowed' : 'pointer', opacity: (chatLoading || !chatInput.trim()) ? 0.5 : 1 }}>
                    <Send size={14} />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {showDisclaimer && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f172a', border: '1px solid var(--border)', borderRadius: 16, padding: 32, maxWidth: 400, width: '90%', animation: 'fadeUp 0.3s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <ShieldAlert size={24} color="#facc15" />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Disclaimer</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              The AI analysis, market sentiment, and target prices provided are for informational purposes only and do not constitute financial advice. Always do your own research before making any financial decisions.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setShowDisclaimer(false)}>Cancel</button>
              <button className="btn-accent" onClick={() => { localStorage.setItem('ai_disclaimer_accepted', 'true'); setShowDisclaimer(false); startAiAnalysis(); }}>
                <Check size={14} style={{ marginRight: 6 }} /> I Understand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
