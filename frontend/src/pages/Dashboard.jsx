import { useState, useEffect, forwardRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { stockApi } from '../utils/api'
import { Link } from 'react-router-dom'
import {
  Plus, X, TrendingUp, TrendingDown, ArrowUpRight,
  ArrowDownRight, LineChart, Layers, SlidersHorizontal,
  ChevronRight, BarChart3, Minus, Search, Activity, Globe, Zap
} from 'lucide-react'

// ── Watchlist persistence ────────────────────────────────────────────────────
const DEFAULT_WATCHLIST = [
  { market: 'US', symbol: 'SPY',  label: 'S&P 500 ETF' },
  { market: 'US', symbol: 'QQQ',  label: 'Nasdaq 100 ETF' },
  { market: 'US', symbol: 'NVDA', label: 'NVIDIA' },
  { market: 'TW', symbol: '2330', label: '台積電' },
  { market: 'TW', symbol: '0050', label: '元大台灣50' },
]

function loadWatchlist() {
  try {
    const raw = localStorage.getItem('watchlist')
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_WATCHLIST
}

// ── Mini sparkline using SVG ─────────────────────────────────────────────────
function Sparkline({ prices = [], isUp }) {
  if (prices.length < 2) return <div className="w-20 h-7" />
  const w = 80, h = 28
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w
    const y = h - ((p - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  const color = isUp ? '#10b981' : '#f43f5e'
  return (
    <motion.svg 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      width={w} height={h} className="overflow-visible"
    >
      <motion.polyline 
        points={pts} 
        fill="none" 
        stroke={color} 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: "easeInOut" }}
      />
    </motion.svg>
  )
}

// ── Quote Card ─────────────────────────────────────────────────────────────
const QuoteRow = forwardRef(function QuoteRow({ market, symbol, label, onRemove, sparkPrices, index }, ref) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['quote', market, symbol],
    queryFn: () => stockApi.getQuote(market, symbol),
    refetchInterval: 60000,
  })

  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.05 }}
      className="group relative flex items-center gap-4 px-5 py-4 glass-card glass-card-hover"
    >
      {/* Symbol Icon */}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold bg-brand-500/10 text-brand-400 border border-brand-500/20 shrink-0 group-hover:bg-brand-500/20 transition-colors">
        {symbol.slice(0, 2)}
      </div>

      {/* Symbol Info */}
      <div className="flex-1 min-w-0">
        <Link to={`/stocks?market=${market}&symbol=${symbol}`} className="block group/link">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white group-hover/link:text-brand-400 transition-colors">{symbol}</span>
            <span className="premium-badge h-4 px-1.5 text-[9px] !bg-zinc-800/50 !text-zinc-400 border-none">{market}</span>
          </div>
          <div className="text-xs text-zinc-500 truncate mt-0.5">
            {isLoading ? 'Loading...' : isError ? 'Error' : (data?.name || label)}
          </div>
        </Link>
      </div>

      {/* Sparkline */}
      <div className="hidden sm:block">
        {isLoading ? (
          <div className="w-20 h-7 rounded-lg bg-white/[0.03] animate-pulse" />
        ) : data ? (
          <Sparkline prices={sparkPrices || [data.prev_close, data.price]} isUp={data.change >= 0} />
        ) : null}
      </div>

      {/* Price Info */}
      <div className="text-right shrink-0 min-w-[90px]">
        {isLoading ? (
          <div className="space-y-1.5">
            <div className="h-4 w-16 bg-white/[0.05] rounded animate-pulse ml-auto" />
            <div className="h-3 w-12 bg-white/[0.03] rounded animate-pulse ml-auto" />
          </div>
        ) : data ? (
          <>
            <div className="text-sm font-bold font-mono text-white tracking-tight">
              {data.price?.toFixed(2)}
            </div>
            <div className={`flex items-center justify-end gap-1 text-[11px] font-bold mt-0.5 ${data.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {data.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {Math.abs(data.change_pct).toFixed(2)}%
            </div>
          </>
        ) : (
          <span className="text-zinc-700">—</span>
        )}
      </div>

      {/* Remove Action */}
      <button
        onClick={(e) => { e.preventDefault(); onRemove(); }}
        className="absolute -right-2 -top-2 p-1.5 rounded-full bg-zinc-900 border border-white/[0.05] text-zinc-500 hover:text-red-400 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all shadow-xl z-10"
      >
        <X size={10} />
      </button>
    </motion.div>
  )
})

// ── Add Stock Modal ──────────────────────────────────────────────────────────
function AddModal({ onAdd, onClose }) {
  const [market, setMarket] = useState('US')
  const [symbol, setSymbol] = useState('')
  const [label, setLabel]   = useState('')

  const submit = (e) => {
    e.preventDefault()
    const sym = symbol.trim().toUpperCase()
    if (!sym) return
    onAdd({ market, symbol: sym, label: label.trim() || sym })
    onClose()
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-md bg-black/60" 
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-sm glass-card p-8 !bg-zinc-950 border-white/[0.1] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white tracking-tight">新增自選股</h3>
          <button onClick={onClose} className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-white/5 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-500 mb-2 block uppercase tracking-widest">市場</label>
            <select value={market} onChange={e => setMarket(e.target.value)} className="premium-input cursor-pointer">
              <option value="US">🇺🇸 美股 (US)</option>
              <option value="TW">🇹🇼 台股 (TW)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-500 mb-2 block uppercase tracking-widest">代號</label>
            <input
              autoFocus
              type="text"
              placeholder={market === 'US' ? 'AAPL、NVDA...' : '2330、0050...'}
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="premium-input"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-premium-outline flex-1 py-3">取消</button>
            <button type="submit" className="btn-premium flex-1 py-3">確認新增</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon }) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="glass-card p-5 relative overflow-hidden group"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">{label}</div>
        <Icon size={14} className="text-zinc-600 group-hover:text-brand-400 transition-colors" />
      </div>
      <div className="text-2xl font-bold font-mono text-white mb-1.5">{value}</div>
      <div className="text-[11px] text-zinc-500 font-medium">{sub}</div>
      <div className="absolute -bottom-6 -right-6 w-16 h-16 bg-brand-500/5 blur-2xl group-hover:bg-brand-500/10 transition-colors" />
    </motion.div>
  )
}

// ── Nav Card ─────────────────────────────────────────────────────────────────
function NavCard({ to, icon: Icon, title, desc, accent }) {
  return (
    <Link
      to={to}
      className="group glass-card p-5 glass-card-hover flex items-start gap-4"
    >
      <div className="mt-1 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05] group-hover:scale-110 transition-all shadow-inner">
        <Icon size={18} style={{ color: accent }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white group-hover:text-brand-400 transition-colors flex items-center justify-between">
          {title}
          <ChevronRight size={14} className="text-zinc-700 group-hover:translate-x-1 transition-all" />
        </div>
        <div className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{desc}</div>
      </div>
    </Link>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [watchlist, setWatchlist] = useState(loadWatchlist)
  const [showModal, setShowModal]  = useState(false)

  useEffect(() => {
    localStorage.setItem('watchlist', JSON.stringify(watchlist))
  }, [watchlist])

  const addStock = (item) => {
    const key = `${item.market}-${item.symbol}`
    if (!watchlist.some(w => `${w.market}-${w.symbol}` === key))
      setWatchlist(prev => [...prev, item])
  }

  const removeStock = (market, symbol) =>
    setWatchlist(prev => prev.filter(w => !(w.market === market && w.symbol === symbol)))

  return (
    <div className="space-y-12 max-w-5xl mx-auto pb-20 relative isolate">
      {/* Background Orbs */}
      <div className="glow-orb w-64 h-64 bg-brand-500/5 -top-12 -left-32" />
      <div className="glow-orb w-96 h-96 bg-blue-500/5 bottom-0 -right-48" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <div className="flex items-center gap-2 mb-2">
             <div className="w-2 h-2 rounded-full bg-brand-500" />
             <span className="text-[10px] font-bold text-brand-500 uppercase tracking-[0.2em]">Dashboard</span>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">市場總覽</h1>
          <p className="text-sm text-zinc-500 mt-1">即時美股與台股報價引擎</p>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }}
          className="flex items-center gap-4 text-[11px] font-bold"
        >
          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/5 px-3 py-1.5 rounded-full border border-emerald-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE UPDATE
          </div>
          <span className="text-zinc-600 uppercase">RELOAD EVERY 60S</span>
        </motion.div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="追蹤標的" value={watchlist.length} sub="雙市場篩選中" icon={Activity} />
        <StatCard label="連接市場" value="US + TW" sub="Global Data Access" icon={Globe} />
        <StatCard label="策略訊號" value="12+" sub="AI 精確回測" icon={Zap} />
        <StatCard label="市場狀態" value="Open" sub="交易進行中" icon={TrendingUp} />
      </div>

      {/* Main Watchlist Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em]">我的自選</h2>
             <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-zinc-500 border border-white/5">{watchlist.length}</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="btn-premium !px-4 !py-2 !text-xs"
          >
            <Plus size={14} className="mr-1" /> 新增標的
          </button>
        </div>

        {watchlist.length === 0 ? (
          <motion.button
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => setShowModal(true)}
            className="w-full glass-card border-dashed border-zinc-800 hover:border-brand-500/20 py-16 text-center group"
          >
            <div className="w-16 h-16 rounded-full bg-brand-500/5 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform border border-brand-500/10">
              <Plus size={24} className="text-zinc-600 group-hover:text-brand-400" />
            </div>
            <div className="text-sm font-bold text-zinc-500 mb-1 group-hover:text-white transition-colors">目前沒有追蹤標的</div>
            <div className="text-[11px] text-zinc-600">點擊上方按鈕或此处開始追蹤</div>
          </motion.button>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {watchlist.map((item, idx) => (
                <QuoteRow
                  key={`${item.market}-${item.symbol}`}
                  {...item}
                  index={idx}
                  onRemove={() => removeStock(item.market, item.symbol)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Secondary Tools */}
      <section className="space-y-6 pt-8 border-t border-white/[0.04]">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em]">量化分析工具</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NavCard to="/stocks"   icon={LineChart}         title="正股分析"   desc="多維度 K 線指標與 AI 趨勢解讀" accent="#7c3aed" />
          <NavCard to="/screener" icon={SlidersHorizontal} title="智能選股"   desc="左右開弓交易模型輔助決策" accent="#f59e0b" />
          <NavCard to="/options"  icon={Layers}            title="期權策略"   desc="黑盒回測與損益圖表視覺化"    accent="#3b82f6" />
        </div>
      </section>

      {/* Modals */}
      <AnimatePresence>
        {showModal && <AddModal onAdd={addStock} onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </div>
  )
}
