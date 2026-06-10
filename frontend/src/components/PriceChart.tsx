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
import { BarChart3, Loader2, Inbox } from 'lucide-react';

interface PriceChartProps {
  productId: number;
  productTitle: string;
  targetPrice: number;
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }) +
    ', ' +
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-gray-900/90 backdrop-blur-xl border border-white/[0.1] rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-white">
        ${payload[0].value.toFixed(2)}
      </p>
    </div>
  );
}

export default function PriceChart({
  productId,
  productTitle,
  targetPrice,
}: PriceChartProps) {
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await axios.get<PricePoint[]>(
          `/api/products/${productId}/history`
        );
        if (cancelled) return;
        const chartData: ChartDataPoint[] = res.data.map((p) => ({
          time: formatTimestamp(p.scraped_at),
          rawTime: new Date(p.scraped_at).getTime(),
          price: p.price,
        }));
        // Sort by time ascending
        chartData.sort((a, b) => a.rawTime - b.rawTime);
        setData(chartData);
      } catch (err) {
        console.error('Failed to fetch price history:', err);
        if (!cancelled) setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Compute Y-axis domain with some padding
  const prices = data.map((d) => d.price);
  const allValues = [...prices, targetPrice];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.15 || 1;
  const yMin = Math.max(0, Math.floor(minVal - padding));
  const yMax = Math.ceil(maxVal + padding);

  return (
    <div className="relative animate-[fadeIn_0.4s_ease-out]">
      {/* Ambient glow */}
      <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/10 via-cyan-500/10 to-violet-600/10 rounded-3xl blur-xl opacity-60" />

      <div className="relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6 shadow-2xl">
        {/* Chart header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 shadow-lg shadow-violet-500/20">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              Price History
            </h3>
            <p className="text-xs text-gray-500 truncate max-w-md">
              {productTitle}
            </p>
          </div>
        </div>

        {/* Chart body */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading price history...</span>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Inbox className="w-10 h-10 mb-3 text-gray-600" />
            <p className="text-sm">No price history yet</p>
            <p className="text-xs text-gray-600 mt-1">
              Data will appear after the first price check
            </p>
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="priceLineGradient"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="0"
                  >
                    <stop offset="0%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                  <linearGradient
                    id="areaFillGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
                  tickLine={false}
                  dy={8}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v}`}
                  dx={-4}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine
                  y={targetPrice}
                  stroke="#10b981"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Target $${targetPrice.toFixed(2)}`,
                    position: 'insideTopRight',
                    fill: '#10b981',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="none"
                  fill="url(#areaFillGradient)"
                  animationDuration={1200}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="url(#priceLineGradient)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#8b5cf6', stroke: '#1f2937', strokeWidth: 2 }}
                  activeDot={{
                    r: 6,
                    fill: '#06b6d4',
                    stroke: '#fff',
                    strokeWidth: 2,
                  }}
                  animationDuration={1200}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
