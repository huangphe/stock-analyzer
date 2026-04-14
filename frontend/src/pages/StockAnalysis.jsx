import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Activity, BarChart2,
  DollarSign, Info, Zap, AlertTriangle, ChevronRight,
  ArrowUpRight, ArrowDownRight, Search, Layers
} from 'lucide-react'
import { stockApi } from '../utils/api'

const PERIODS = ['1mo', '3mo', '6mo', '1y', '2y']
const INTERVALS = { '1mo': '1d', '3mo': '1d', '6mo': '1d', '1y': '1wk', '2y': '1wk' }

// ── Design tokens ──────────────────────────────────────────────────────────
const UP = '#10b981'   // emerald-500
const DOWN = '#f43f5e' // rose-500
const BRAND = '#8b5cf6' // violet-500

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(v, dec = 2) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toFixed(dec) : v
}
function fmtBig(v) {
  if (v == null) return '—'
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  return v.toLocaleString()
}
function computeMA(arr, n) {
  return arr.map((_, i) =>
    i < n - 1 ? null : arr.slice(i - n + 1, i + 1).reduce((s, x) => s + x, 0) / n
  )
}
function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null
  const gains = [], losses = []
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gains.push(Math.max(d, 0))
    losses.push(Math.max(-d, 0))
  }
  let ag = gains.slice(0, period).reduce((s, v) => s + v, 0) / period
  let al = losses.slice(0, period).reduce((s, v) => s + v, 0) / period
  for (let i = period; i < gains.length; i++) {
    ag = (ag * (period - 1) + gains[i]) / period
    al = (al * (period - 1) + losses[i]) / period
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al)
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = 'text-white', index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass-card p-4 flex flex-col justify-between"
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none">{label}</span>
        {Icon && <Icon size={12} className="text-zinc-600" />}
      </div>
      <div>
        <div className={`text-lg font-bold font-mono tracking-tight ${color}`}>{value}</div>
        {sub && <div className="text-[10px] text-zinc-600 mt-1 font-medium">{sub}</div>}
      </div>
    </motion.div>
  )
}

// ── Chart Tooltip ───────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null
  const isUp = d.close >= d.open
  return (
    <div className="glass-card !bg-zinc-950/90 !rounded-xl px-4 py-3 text-xs shadow-2xl border-white/10 min-w-[180px]">
      <div className="text-zinc-500 mb-2 font-bold tracking-widest uppercase text-[10px]">{label}</div>
      <div className="space-y-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400">開盤</span>
          <span className="font-mono text-zinc-100">{fmt(d.open)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-400 font-bold">收盤</span>
          <span className={`font-mono font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>{fmt(d.close)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t border-white/5 pt-1.5">
          <span className="text-zinc-500">最高</span>
          <span className="font-mono text-zinc-300">{fmt(d.high)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">最低</span>
          <span className="font-mono text-zinc-300">{fmt(d.low)}</span>
        </div>
        {d.volume > 0 && (
          <div className="flex justify-between gap-4 pt-1.5 border-t border-white/5">
            <span className="text-zinc-500">成交量</span>
            <span className="font-mono text-zinc-400">{fmtBig(d.volume)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Price Chart ─────────────────────────────────────────────────────────────
function PriceChart({ data }) {
  const closes = data.map(b => b.close)
  const ma20arr = computeMA(closes, 20)
  const ma60arr = computeMA(closes, 60)

  const chartData = data.map((b, i) => ({
    ...b,
    body: [Math.min(b.open, b.close), Math.max(b.open, b.close)],
    ma20: ma20arr[i],
    ma60: ma60arr[i],
  }))

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={chartData} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#52525b', fontSize: 10, fontWeight: 600 }}
          tickFormatter={v => v.slice(5)}
          minTickGap={40}
          axisLine={false}
          tickLine={false}
          dy={10}
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: '#52525b', fontSize: 10, fontWeight: 600 }}
          tickFormatter={v => v.toFixed(0)}
          width={45}
          axisLine={false}
          tickLine={false}
          orientation="right"
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
        <Bar dataKey="body" radius={[2, 2, 2, 2]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.close >= entry.open ? UP : DOWN} opacity={0.7} />
          ))}
        </Bar>
        <Line dataKey="ma20" stroke="#f59e0b" dot={false} strokeWidth={2} name="MA20" connectNulls strokeDasharray="5 5" opacity={0.6} />
        <Line dataKey="ma60" stroke="#8b5cf6" dot={false} strokeWidth={2} name="MA60" connectNulls opacity={0.6} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── Volume Chart ────────────────────────────────────────────────────────────
function VolumeChart({ data }) {
  const avgVol = data.reduce((s, b) => s + (b.volume || 0), 0) / data.length
  return (
    <ResponsiveContainer width="100%" height={80}>
      <ComposedChart data={data} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
        <XAxis dataKey="date" hide />
        <YAxis width={45} tick={false} axisLine={false} tickLine={false} orientation="right" />
        <ReferenceLine y={avgVol} stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
        <Bar dataKey="volume" maxBarSize={6} radius={[1, 1, 0, 0]}>
          {data.map((b, i) => (
            <Cell key={i} fill={b.close >= b.open ? `${UP}44` : `${DOWN}44`} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── AI Commentary ───────────────────────────────────────────────────────────
function generateAnalysis(quote, histData) {
  if (!quote || !histData?.length) return null
  const closes = histData.map(b => b.close)
  const rsi = computeRSI(closes)
  const ma20 = closes.length >= 20 ? closes.slice(-20).reduce((s, v) => s + v, 0) / 20 : null
  const ma60 = closes.length >= 60 ? closes.slice(-60).reduce((s, v) => s + v, 0) / 60 : null
  const price = quote.price
  
  const high52 = Math.max(...histData.map(b => b.high))
  const low52 = Math.min(...histData.map(b => b.low))
  const fromLow = ((price - low52) / low52 * 100).toFixed(1)
  const fromHigh = ((price - high52) / high52 * 100).toFixed(1)

  const trend = ma20 && ma60
    ? (price > ma20 && ma20 > ma60 ? 'bullish' : price < ma20 && ma20 < ma60 ? 'bearish' : 'neutral')
    : 'neutral'

  const points = []
  if (trend === 'bullish') {
    points.push({ type: 'bullish', icon: TrendingUp, text: `多頭排列：股價穩守 MA20 及 MA60 之上，趨勢偏多發展。` })
  } else if (trend === 'bearish') {
    points.push({ type: 'bearish', icon: TrendingDown, text: `空頭預警：股價跌破關鍵均線支撐，目前處於下行通道。` })
  } else {
    points.push({ type: 'neutral', icon: Activity, text: `目前處於盤整區間，均線糾結，等待方向性突破訊號。` })
  }

  if (rsi != null) {
     if (rsi > 70) points.push({ type: 'warning', icon: AlertTriangle, text: `RSI 指標超買（${rsi.toFixed(1)}），短線追高回調風險大。` })
     else if (rsi < 30) points.push({ type: 'bullish', icon: Zap, text: `RSI 進入超賣區（${rsi.toFixed(1)}），可留意跌深反彈機會。` })
     else if (rsi >= 45 && rsi <= 55) points.push({ type: 'neutral', icon: Info, text: `RSI ${rsi.toFixed(1)} 位於中性區，動能尚未明顯偏向多空。` })
  }

  const positionPct = ((price - low52) / (high52 - low52) * 100).toFixed(0)
  return { trend, rsi, ma20, ma60, high52, low52, positionPct, points }
}

function AICommentary({ quote, histData }) {
  const analysis = useMemo(() => generateAnalysis(quote, histData), [quote, histData])
  if (!analysis) return <div className="h-full flex items-center justify-center text-zinc-600 text-sm">Waiting for insights...</div>

  const styleMap = {
    bullish: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
    bearish: 'text-rose-400 bg-rose-500/5 border-rose-500/10',
    warning: 'text-amber-400 bg-amber-500/5 border-amber-500/10',
    neutral: 'text-zinc-500 bg-zinc-500/5 border-zinc-500/10',
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <Zap size={14} className="text-brand-400" /> AI 趨勢分析
        </h3>
        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border uppercase tracking-widest ${styleMap[analysis.trend]}`}>
          {analysis.trend === 'bullish' ? '強勢多頭' : analysis.trend === 'bearish' ? '弱勢空頭' : '盤整格局'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'RSI 動能', value: fmt(analysis.rsi, 1), color: analysis.rsi > 70 ? 'text-amber-400' : analysis.rsi < 30 ? 'text-emerald-400' : 'text-white' },
          { label: 'MA20 支撐', value: fmt(analysis.ma20), color: quote.price > analysis.ma20 ? 'text-emerald-400' : 'text-rose-400' },
        ].map((m, i) => (
          <div key={i} className="glass-card p-3 !bg-white/[0.01]">
            <div className="text-[10px] text-zinc-600 font-bold mb-1 uppercase tracking-tight">{m.label}</div>
            <div className={`text-base font-bold font-mono ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <AnimatePresence>
          {analysis.points.map((p, i) => {
            const Icon = p.icon
            return (
              <motion.div 
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`p-4 rounded-2xl border flex gap-3 ${styleMap[p.type]}`}
              >
                <Icon size={16} className="shrink-0 mt-0.5" />
                <p className="text-xs font-semibold leading-relaxed text-zinc-300">{p.text}</p>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <div className="pt-4 border-t border-white/[0.04]">
         <div className="flex justify-between items-center text-[10px] text-zinc-600 font-bold mb-2">
            <span>52W LOW: {fmt(analysis.low52)}</span>
            <span>HIGH: {fmt(analysis.high52)}</span>
         </div>
         <div className="relative h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
            <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${analysis.positionPct}%` }}
               transition={{ duration: 1, ease: "easeOut" }}
               className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500"
            />
         </div>
      </div>
    </div>
  )
}

export default function StockAnalysis() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [inputSymbol, setInputSymbol] = useState(searchParams.get('symbol') || '')
  const [inputMarket, setInputMarket] = useState(searchParams.get('market') || 'US')
  const [period, setPeriod] = useState('3mo')

  const symbol = searchParams.get('symbol') || ''
  const market = searchParams.get('market') || 'US'

  const { data: quote, isLoading: quoteLoading, error: quoteErr } = useQuery({
    queryKey: ['quote', market, symbol],
    queryFn: () => stockApi.getQuote(market, symbol),
    enabled: !!symbol,
    refetchInterval: 60000,
  })

  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ['history', market, symbol, period],
    queryFn: () => stockApi.getHistory(market, symbol, period, INTERVALS[period]),
    enabled: !!symbol,
  })

  const handleSearch = (e) => {
    e.preventDefault()
    if (inputSymbol.trim()) {
      setSearchParams({ market: inputMarket, symbol: inputSymbol.trim().toUpperCase() })
    }
  }

  const isUp = quote ? quote.change >= 0 : true
  const histData = history?.data || []

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20 mt-4">
      
      {/* Search Header */}
      <section className="flex flex-col md:flex-row gap-4 items-center">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2 w-full">
          <div className="glass-card flex-1 flex overflow-hidden !rounded-2xl !bg-zinc-900 focus-within:ring-2 focus-within:ring-brand-500/30 transition-all">
            <select
              value={inputMarket}
              onChange={e => setInputMarket(e.target.value)}
              className="bg-transparent px-4 py-3 text-sm font-bold text-zinc-400 border-r border-white/5 outline-none cursor-pointer"
            >
              <option value="US">🇺🇸 US</option>
              <option value="TW">🇹🇼 TW</option>
            </select>
            <div className="flex-1 flex items-center px-4">
              <Search size={18} className="text-zinc-600 mr-3 shrink-0" />
              <input
                type="text"
                placeholder={inputMarket === 'US' ? 'AAPL, NVDA, TSLA...' : '2330, 0050, 2454...'}
                value={inputSymbol}
                onChange={e => setInputSymbol(e.target.value)}
                className="bg-transparent w-full text-sm font-bold text-white placeholder-zinc-700 outline-none uppercase"
              />
            </div>
          </div>
          <button type="submit" className="btn-premium px-8">查詢</button>
        </form>
      </section>

      {/* Main Content Area */}
      <AnimatePresence mode="wait">
        {!symbol ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card py-32 text-center"
          >
            <div className="w-20 h-20 rounded-full bg-brand-500/5 flex items-center justify-center mx-auto mb-6 border border-brand-500/10 backdrop-blur-3xl">
              <Activity size={32} className="text-brand-500/40 animate-pulse" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">開始您的數據分析</h2>
            <p className="text-zinc-500 text-sm mb-8">支援美股及台股即時串接與 AI 選股建議</p>
            <div className="flex flex-wrap justify-center gap-3">
              {['NVDA', 'TSLA', 'AAPL', '2330', '2454'].map(s => (
                <button
                  key={s}
                  onClick={() => {
                    const mkt = isNaN(s[0]) ? 'US' : 'TW'
                    setSearchParams({ market: mkt, symbol: s })
                  }}
                  className="btn-premium-outline !py-2 !px-4 !rounded-full !text-xs !font-bold hover:!border-brand-500/40 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        ) : quoteLoading ? (
             <div className="glass-card py-32 text-center animate-pulse">
                <div className="text-zinc-600 text-sm font-bold tracking-widest">LOADING REALTIME DATA...</div>
             </div>
        ) : quote ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Quote Header */}
            <div className="glass-card p-6 md:p-10 relative overflow-hidden">
               <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
                  <div className="space-y-4">
                     <span className="premium-badge !text-brand-400 !bg-brand-500/5 !border-brand-500/20">{market} MARKET</span>
                     <div className="flex items-center gap-3">
                        <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter">{symbol}</h1>
                        <span className="text-sm md:text-xl font-bold text-zinc-600 mt-2">{quote.name}</span>
                     </div>
                     <div className="flex items-end gap-6">
                        <div className="text-4xl md:text-6xl font-bold font-mono text-white tracking-tighter">{fmt(quote.price)}</div>
                        <div className={`flex items-center gap-1.5 md:gap-2 mb-1.5 font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                           {isUp ? <ArrowUpRight className="w-6 h-6 md:w-8 md:h-8" /> : <ArrowDownRight className="w-6 h-6 md:w-8 md:h-8" />}
                           <div className="text-xl md:text-3xl font-mono leading-none">
                              {isUp ? '+' : ''}{fmt(quote.change)} ({isUp ? '+' : ''}{fmt(quote.change_pct)}%)
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: '昨收', value: fmt(quote.prev_close) },
                      { label: '開盤', value: fmt(quote.open) },
                      { label: '最高', value: fmt(quote.high) },
                      { label: '最低', value: fmt(quote.low) },
                      { label: 'P/E', value: quote.pe_ratio ? fmt(quote.pe_ratio, 1) + 'x' : '—' },
                      { label: '市值', value: fmtBig(quote.market_cap) },
                    ].map((k, i) => (
                      <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-4 min-w-[100px] text-center">
                         <div className="text-[10px] font-bold text-zinc-600 uppercase mb-1 tracking-widest">{k.label}</div>
                         <div className="text-sm font-bold font-mono text-zinc-300">{k.value}</div>
                      </div>
                    ))}
                  </div>
               </div>
               <div className="absolute -right-20 -top-20 w-80 h-80 bg-brand-500/5 blur-3xl rounded-full" />
            </div>

            {/* Main Visuals Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Chart Side */}
              <div className="lg:col-span-3 glass-card p-6 md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <BarChart2 size={14} className="text-zinc-600" /> 趨勢圖表
                  </h3>
                  <div className="flex bg-zinc-950 p-1 rounded-xl border border-white/5">
                    {PERIODS.map(p => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          period === p 
                          ? 'bg-brand-600 text-white shadow-lg' 
                          : 'text-zinc-600 hover:text-zinc-400'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {histLoading ? (
                  <div className="h-[400px] flex items-center justify-center text-zinc-700 font-bold uppercase tracking-widest text-xs">
                     Fetching historical data...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <PriceChart data={histData} />
                    <div className="pt-4 border-t border-white/[0.04]">
                       <div className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest mb-2 ml-1">Volume Performance</div>
                       <VolumeChart data={histData} />
                    </div>
                  </div>
                )}
              </div>

              {/* AI Analysis Side */}
              <div className="lg:col-span-2 glass-card p-6 md:p-8 min-h-[500px]">
                 <AICommentary quote={quote} histData={histData} />
              </div>
            </div>

            {/* Bottom Call Action */}
            <motion.div 
               whileHover={{ y: -5 }}
               className="glass-card p-6 md:p-8 border-brand-500/20 bg-gradient-to-r from-brand-950/20 to-transparent flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative group"
            >
               <div className="relative z-10 space-y-2">
                  <h3 className="text-xl font-bold text-white tracking-tight">建立 {symbol} 的量化策略？</h3>
                  <p className="text-sm text-zinc-500">快速計算此標的回測勝率、Greeks 風險指標與盈虧預測模型。</p>
               </div>
               <Link 
                 to={`/options?symbol=${symbol}&market=${market}&price=${quote.price}`}
                 className="btn-premium !px-10 !py-4 whitespace-nowrap relative z-10 shadow-xl shadow-brand-600/20"
               >
                 開始期權策略分析 <ChevronRight size={18} className="ml-2" />
               </Link>
               <div className="absolute -right-12 top-0 bottom-0 w-32 bg-brand-500/10 blur-3xl" />
               <Layers className="absolute right-6 top-1/2 -translate-y-1/2 text-brand-500/5 w-48 h-48 -rotate-12 transition-transform group-hover:rotate-0 duration-700" />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
