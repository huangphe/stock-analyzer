import { useState, useMemo, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, SlidersHorizontal, Activity, TrendingUp,
  ArrowRight, Globe, BarChart2, Zap, X, Star,
  ShieldCheck, AlertCircle, ChevronRight, Plus, Info,
  ExternalLink, TrendingDown, Save, Clock, Trash2, ChevronDown,
  ChevronUp, Send,
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api'

// ── 策略設定 ─────────────────────────────────────────────────────────────────

const STRATEGIES = [
  {
    id: null,
    label: '左右側雙訊號',
    sub: '掃描超賣反轉與突破動能兩種機會',
    color: 'brand',
  },
  {
    id: 'tw_momentum',
    label: '台股強勢股 HOT',
    sub: '近 10 天漲停 + 月線 MACD 金叉',
    color: 'amber',
    special: true,
  },
  {
    id: 'us_momentum',
    label: '美股動能突破',
    sub: '接近 52W 高 + MA20 + 爆量 + MACD 金叉',
    color: 'emerald',
  },
  {
    id: 'rsi_oversold',
    label: '跨市場超賣抄底',
    sub: 'RSI < 35 + BB %b < 10% 深度超賣',
    color: 'blue',
  },
]

// ── Persistence ───────────────────────────────────────────────────────────────

const REPORTS_KEY = 'screener_reports'
const MAX_REPORTS = 10

function loadWatchlist() {
  try { return JSON.parse(localStorage.getItem('watchlist') || '[]') } catch { return [] }
}
function loadReports() {
  try { return JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]') } catch { return [] }
}
function saveReport(results, label) {
  const reports = loadReports()
  const entry = {
    id: Date.now(),
    label: label || new Date().toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    savedAt: new Date().toISOString(),
    data: results,
  }
  const updated = [entry, ...reports].slice(0, MAX_REPORTS)
  localStorage.setItem(REPORTS_KEY, JSON.stringify(updated))
  return updated
}
function deleteReport(id) {
  const reports = loadReports().filter(r => r.id !== id)
  localStorage.setItem(REPORTS_KEY, JSON.stringify(reports))
  return reports
}

// ── SSE Streaming ─────────────────────────────────────────────────────────────

async function streamScan(req, onProgress, onDone, onError) {
  try {
    const res = await fetch(`${API_BASE}/screener/scan/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop()
      for (const chunk of chunks) {
        if (!chunk.startsWith('data: ')) continue
        try {
          const evt = JSON.parse(chunk.slice(6))
          if (evt.type === 'progress') onProgress(evt.scanned, evt.total)
          else if (evt.type === 'done') onDone(evt)
        } catch {}
      }
    }
  } catch (e) {
    onError(e)
  }
}

// ── Sorting hook ──────────────────────────────────────────────────────────────

function useSortable(items) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('desc')

  const toggle = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d === 'desc' ? 'asc' : 'desc'); return key }
      setSortDir('desc')
      return key
    })
  }, [])

  const sorted = useMemo(() => {
    if (!sortKey) return items
    return [...items].sort((a, b) => {
      let av = sortKey.includes('.') ? sortKey.split('.').reduce((o, k) => o?.[k], a) : a[sortKey]
      let bv = sortKey.includes('.') ? sortKey.split('.').reduce((o, k) => o?.[k], b) : b[sortKey]
      av = av ?? (sortDir === 'desc' ? -Infinity : Infinity)
      bv = bv ?? (sortDir === 'desc' ? -Infinity : Infinity)
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [items, sortKey, sortDir])

  return { sorted, sortKey, sortDir, toggle }
}

// ── SortTh ─────────────────────────────────────────────────────────────────

function SortTh({ label, sortK, currentKey, currentDir, onToggle, className = '' }) {
  const active = currentKey === sortK
  return (
    <th
      onClick={() => onToggle(sortK)}
      className={`py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest cursor-pointer hover:text-zinc-400 select-none transition-colors ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? currentDir === 'desc' ? <ChevronDown size={10} className="text-brand-400" /> : <ChevronUp size={10} className="text-brand-400" />
          : <ChevronDown size={10} className="opacity-20" />}
      </span>
    </th>
  )
}

// ── SignalBadge ───────────────────────────────────────────────────────────────

function SignalBadge({ signals }) {
  if (!signals || signals.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {signals.map((s, i) => (
        <span key={i} className="text-[8px] font-bold bg-brand-500/5 text-zinc-500 px-1.5 py-0.5 rounded border border-white/[0.03] uppercase tracking-tighter">
          {s}
        </span>
      ))}
    </div>
  )
}

function QualityBadge({ item }) {
  if (!item.is_quality_momentum) return null
  return (
    <span className="flex items-center gap-1 text-[8px] font-black bg-brand-500/20 text-brand-400 px-1.5 py-0.5 rounded border border-brand-500/30 uppercase tracking-widest animate-pulse">
      <Zap size={8} /> Quality
    </span>
  )
}

function formatAmount(val) {
  if (!val) return '—'
  if (val >= 1000000000) return (val / 1000000000).toFixed(2) + 'B'
  if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M'
  return val.toLocaleString()
}

// ── FilterBar ─────────────────────────────────────────────────────────────────

function FilterBar({ maxRsi, setMaxRsi, minVol, setMinVol }) {
  return (
    <div className="flex flex-wrap gap-4 items-center text-xs px-1">
      <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">過濾</span>
      <label className="flex items-center gap-2 text-zinc-500">
        RSI ≤
        <input
          type="number" min="0" max="100" value={maxRsi}
          onChange={e => setMaxRsi(+e.target.value)}
          className="w-14 bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none focus:border-brand-500/50"
        />
      </label>
      <label className="flex items-center gap-2 text-zinc-500">
        量比 ≥
        <input
          type="number" min="0" step="0.1" value={minVol}
          onChange={e => setMinVol(+e.target.value)}
          className="w-14 bg-zinc-900 border border-white/10 rounded-lg px-2 py-1 text-xs text-zinc-300 outline-none focus:border-brand-500/50"
        />
      </label>
    </div>
  )
}

// ── MomentumTable ─────────────────────────────────────────────────────────────

function MomentumTable({ stocks }) {
  const { sorted, sortKey, sortDir, toggle } = useSortable(stocks || [])
  if (!sorted || sorted.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-2">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
        <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">台股強勢股候選</h3>
        <span className="text-[10px] font-bold text-zinc-700 ml-auto">{sorted.length} 標的</span>
      </div>

      <div className="glass-card shadow-2xl overflow-hidden border-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.04]">
                <th className="py-4 px-6 text-[9px] font-black text-zinc-600 uppercase tracking-widest">代碼</th>
                <th className="py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">行業</th>
                <SortTh label="價格" sortK="price" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-right" />
                <SortTh label="漲跌幅" sortK="change_pct" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-right" />
                <SortTh label="成交額" sortK="turnover" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-center" />
                <SortTh label="PE/PB" sortK="pe_ratio" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-center" />
                <th className="py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center">MA20 均價</th>
                <th className="py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">近10天漲停日</th>
                <th className="py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">策略信號</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const isUp = (item.change_pct ?? 0) >= 0
                return (
                  <tr key={item.symbol} className="group hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors">
                    <td className="py-4 px-6">
                      <Link to={`/stocks?market=${item.market}&symbol=${item.symbol}`} className="block">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.05] flex items-center justify-center text-[10px] font-black text-amber-400">
                            {item.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-sm font-black text-white group-hover:text-amber-400 transition-colors flex items-center gap-1.5">
                              {item.symbol}
                              <ExternalLink size={10} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-all" />
                            </div>
                            <div className="text-[10px] font-bold text-zinc-600 truncate max-w-[100px]">{item.name}</div>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-[10px] font-bold text-zinc-400 bg-white/[0.03] px-2 py-1 rounded inline-block">
                        {item.sector || 'N/A'}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="text-xs font-black font-mono text-zinc-200">${item.price?.toFixed(2)}</div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className={`text-[11px] font-black font-mono inline-flex items-center gap-1 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {isUp ? '+' : ''}{item.change_pct?.toFixed(2)}%
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="text-[10px] font-black font-mono text-zinc-300">{formatAmount(item.turnover)}</div>
                      <div className="text-[8px] font-bold text-zinc-700 uppercase mt-0.5">{item.market === 'TW' ? 'TWD' : 'USD'}</div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className={`text-[10px] font-black font-mono ${item.pe_ratio < 20 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                        P/E {item.pe_ratio?.toFixed(1) || 'N/A'}
                      </div>
                      <div className="text-[8px] font-bold text-zinc-700 italic">Sector PE Limit: {item.sector === 'Technology' ? '30' : item.sector === 'Financial Services' ? '15' : '20'}</div>
                      <div className="text-[9px] font-bold text-zinc-700">P/B {item.pb_ratio?.toFixed(1) || 'N/A'}</div>
                    </td>
                    <td className="py-4 px-4 text-center whitespace-nowrap">
                      <div className="text-xs font-black font-mono text-zinc-300">${item.ma20?.toFixed(1) ?? '—'}</div>
                      <div className={`text-[9px] font-bold mt-0.5 ${item.price > item.ma20 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                        {item.price > item.ma20 ? '▲ 站上' : '▼ 跌破'}
                      </div>
                    </td>
                    <td className="py-4 px-4 min-w-[160px]">
                      {item.limit_up_dates?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.limit_up_dates.map((d, i) => (
                            <span key={i} className="text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {d.date?.slice(5)} +{d.change_pct}%
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-zinc-700 text-[10px]">—</span>}
                    </td>
                    <td className="py-4 px-4 min-w-[160px]">
                      <div className="flex flex-col gap-1.5">
                         <SignalBadge signals={item.strategy_signals} />
                         <QualityBadge item={item} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── StockScreenerTable ────────────────────────────────────────────────────────

function StockScreenerTable({ stocks, title, side, maxRsi, minVol }) {
  const filtered = useMemo(() => {
    if (!stocks) return []
    return stocks.filter(s => {
      if (maxRsi < 100 && s.rsi != null && s.rsi > maxRsi) return false
      if (minVol > 0 && s.vol_ratio != null && s.vol_ratio < minVol) return false
      return true
    })
  }, [stocks, maxRsi, minVol])

  const scoreKey = side === 'left' ? 'left_score' : 'right_score'
  const { sorted, sortKey, sortDir, toggle } = useSortable(filtered)
  if (!sorted || sorted.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-2">
        <div className={`w-1.5 h-1.5 rounded-full ${side === 'left' ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'}`} />
        <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">{title}</h3>
        <span className="text-[10px] font-bold text-zinc-700 ml-auto">{sorted.length} 標的</span>
      </div>

      <div className="glass-card shadow-2xl overflow-hidden border-white/[0.03]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/[0.04]">
                <th className="py-4 px-6 text-[9px] font-black text-zinc-600 uppercase tracking-widest">代碼</th>
                <th className="py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">行業</th>
                <SortTh label="價格" sortK="price" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-right" />
                <SortTh label="漲跌幅" sortK="change_pct" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-right" />
                <SortTh label="RSI" sortK="rsi" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-center" />
                <th className="py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center">MACD</th>
                <th className="py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center">BB %b</th>
                <SortTh label="量比" sortK="vol_ratio" currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-center" />
                <th className="py-4 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">掃描信號</th>
                <SortTh label="評分" sortK={scoreKey} currentKey={sortKey} currentDir={sortDir} onToggle={toggle} className="text-center" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const isUp = item.change_pct >= 0
                const signals = side === 'left' ? item.left_side_signals : item.right_side_signals
                const score = item[scoreKey]

                return (
                  <tr key={item.symbol} className="group hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors">
                    <td className="py-4 px-6">
                      <Link to={`/stocks?market=${item.market}&symbol=${item.symbol}`} className="block">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-white/[0.05] flex items-center justify-center text-[10px] font-black text-brand-400 uppercase">
                            {item.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-sm font-black text-white group-hover:text-brand-400 transition-colors uppercase flex items-center gap-1.5">
                              {item.symbol}
                              <ExternalLink size={10} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-all" />
                            </div>
                            <div className="text-[10px] font-bold text-zinc-600 truncate max-w-[120px]">{item.name}</div>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="text-xs font-black font-mono text-zinc-200">${item.price?.toFixed(2)}</div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className={`text-[11px] font-black font-mono inline-flex items-center gap-1 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {isUp ? '+' : ''}{item.change_pct?.toFixed(2)}%
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-[10px] font-bold text-zinc-400 bg-white/[0.03] px-2 py-1 rounded inline-block">
                        {item.sector || 'N/A'}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className={`text-[11px] font-black font-mono ${item.rsi < 35 ? 'text-blue-400' : item.rsi > 70 ? 'text-amber-400' : 'text-zinc-500'}`}>
                        {item.rsi?.toFixed(1) || '—'}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      {item.daily_macd?.macd != null ? (
                        <div>
                          <div className={`text-[10px] font-black font-mono ${item.daily_macd.is_golden_cross ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {item.daily_macd.is_golden_cross ? '金叉' : '死叉'}
                          </div>
                          <div className="text-[9px] text-zinc-700 font-mono">H {item.daily_macd.hist?.toFixed(3)}</div>
                        </div>
                      ) : <span className="text-zinc-700 text-[10px]">—</span>}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {item.bollinger?.pct_b != null ? (
                        <div>
                          <div className={`text-[10px] font-black font-mono ${item.bollinger.pct_b < 0.2 ? 'text-blue-400' : item.bollinger.pct_b > 0.8 ? 'text-amber-400' : 'text-zinc-400'}`}>
                            {(item.bollinger.pct_b * 100).toFixed(0)}%
                          </div>
                          <div className="text-[9px] text-zinc-700">BW {item.bollinger.bandwidth?.toFixed(3)}</div>
                        </div>
                      ) : <span className="text-zinc-700 text-[10px]">—</span>}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className={`text-[11px] font-black font-mono ${item.vol_ratio >= 1.5 ? 'text-amber-400' : 'text-zinc-600'}`}>
                        {item.vol_ratio?.toFixed(1)}x
                      </div>
                    </td>
                    <td className="py-4 px-4 min-w-[200px]">
                      <SignalBadge signals={signals} />
                    </td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        {[...Array(Math.max(0, score || 0))].map((_, i) => (
                          <Star key={i} size={10} className="fill-brand-400 text-brand-400" />
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Screener() {
  const watchlist = loadWatchlist()

  // Config state
  const [useWatchlist, setUseWatchlist] = useState(false)
  const [includeUS, setIncludeUS] = useState(true)
  const [includeTW, setIncludeTW] = useState(false)
  const [strategy, setStrategy] = useState(null)
  const [notifyTelegram, setNotifyTelegram] = useState(false)
  const [extraStocks, setExtraStocks] = useState([])
  const [inputMarket, setInputMarket] = useState('US')
  const [inputSymbol, setInputSymbol] = useState('')

  // Scan state
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0 })
  const [scanError, setScanError] = useState(null)
  const [results, setResults] = useState(null)
  const [loadedReport, setLoadedReport] = useState(null)
  const abortRef = useRef(null)

  // Results UI state
  const [tab, setTab] = useState('left')
  const [maxRsi, setMaxRsi] = useState(100)
  const [minVol, setMinVol] = useState(0)

  // Reports
  const [reports, setReports] = useState(() => loadReports())
  const [showReports, setShowReports] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  const displayResults = loadedReport || results

  // ── Handlers ────────────────────────────────────────────

  const handleAddExtra = (e) => {
    e.preventDefault()
    const sym = inputSymbol.trim().toUpperCase()
    if (!sym) return
    const key = `${inputMarket}-${sym}`
    if (!extraStocks.some(s => `${s.market}-${s.symbol}` === key)) {
      setExtraStocks(prev => [...prev, { market: inputMarket, symbol: sym }])
    }
    setInputSymbol('')
  }

  const removeExtra = (market, symbol) => {
    setExtraStocks(prev => prev.filter(s => !(s.market === market && s.symbol === symbol)))
  }

  const handleScan = () => {
    setLoadedReport(null)
    setResults(null)
    setScanError(null)
    setScanProgress({ scanned: 0, total: 0 })
    setScanning(true)

    const stocks = []
    if (useWatchlist) watchlist.forEach(w => stocks.push({ market: w.market, symbol: w.symbol }))
    extraStocks.forEach(s => stocks.push(s))

    const req = {
      stocks,
      include_us_universe: strategy === 'us_momentum' ? false : includeUS,
      include_tw_universe: strategy === 'tw_momentum' ? false : includeTW,
      strategy: strategy,
      min_left_score: 1,
      min_right_score: 1,
      notify_telegram: notifyTelegram,
    }

    streamScan(
      req,
      (scanned, total) => setScanProgress({ scanned, total }),
      (data) => { setResults(data); setScanning(false) },
      (err) => { setScanError(err.message || '掃描失敗'); setScanning(false) },
    )
  }

  const handleSaveReport = () => {
    if (!displayResults) return
    const updated = saveReport(displayResults)
    setReports(updated)
    setSavedMsg(true)
    setTimeout(() => setSavedMsg(false), 2000)
  }

  const handleLoadReport = (reportData) => {
    setResults(null)
    setLoadedReport(reportData)
    setShowReports(false)
  }

  // ── Derived ─────────────────────────────────────────────

  const isMomentumStrategy = strategy === 'tw_momentum'
  const isUsMomentum = strategy === 'us_momentum'
  const isOversold = strategy === 'rsi_oversold'

  const sideItems = useMemo(() => {
    if (!displayResults) return []
    return tab === 'left' ? displayResults.left_side : displayResults.right_side
  }, [displayResults, tab])

  const usStocks = useMemo(() => sideItems.filter(i => i.market === 'US'), [sideItems])
  const twStocks = useMemo(() => sideItems.filter(i => i.market === 'TW'), [sideItems])

  const progressPct = scanProgress.total > 0
    ? Math.round((scanProgress.scanned / scanProgress.total) * 100)
    : 0

  const canScan = !scanning && (useWatchlist || includeUS || includeTW || strategy || extraStocks.length > 0)

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20 mt-4">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="premium-badge !text-brand-400 !bg-brand-500/5 !border-brand-500/20 mb-2">Pattern Intelligence v1.3</span>
          <h1 className="text-3xl font-bold text-white tracking-tight">智能全市場掃描器</h1>
          <p className="text-zinc-500 text-sm mt-1">跨市場捕捉反轉與突破特徵 · 資料處理全自動化系統</p>
        </div>
        <button
          onClick={() => setShowReports(v => !v)}
          className="flex items-center gap-2 text-xs font-bold text-zinc-500 hover:text-zinc-300 bg-white/[0.03] px-4 py-2 rounded-xl border border-white/[0.05] transition-colors"
        >
          <Clock size={14} />
          歷史報告 ({reports.length})
          <ChevronDown size={12} className={`transition-transform ${showReports ? 'rotate-180' : ''}`} />
        </button>
      </motion.div>

      {/* Reports Panel */}
      <AnimatePresence>
        {showReports && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="glass-card p-4 space-y-2">
            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-1 mb-3">已存報告（最多 {MAX_REPORTS} 筆）</p>
            {reports.length === 0 ? (
              <p className="text-xs text-zinc-700 text-center py-4">尚無儲存報告。掃描後點「存報告」即可保存。</p>
            ) : reports.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] transition-colors">
                <div>
                  <div className="text-xs font-bold text-zinc-300">{r.label}</div>
                  <div className="text-[10px] text-zinc-700">{r.data.total_scanned} 股掃描 · {new Date(r.savedAt).toLocaleDateString('zh-TW')}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleLoadReport(r.data)} className="text-[10px] font-bold text-brand-400 hover:text-brand-300 px-3 py-1.5 rounded-lg bg-brand-500/10 transition-colors">載入</button>
                  <button onClick={() => setReports(deleteReport(r.id))} className="text-zinc-700 hover:text-rose-400 p-1.5 rounded-lg transition-colors"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Grid */}
      <section className="glass-card p-6 md:p-8 space-y-8 relative overflow-hidden">
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10">

          {/* Strategy Selection */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-brand-400" />
              <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">策略選擇</h2>
            </div>

            {/* Strategy Radio */}
            <div className="flex flex-col gap-2">
              {STRATEGIES.map(s => {
                const active = strategy === s.id
                const colorMap = {
                  brand: active ? 'bg-brand-600/10 border-brand-500/30' : 'bg-white/[0.01] border-white/[0.03] hover:border-brand-500/20',
                  amber: active ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-500/5 border-white/5 hover:border-amber-500/20',
                  emerald: active ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-500/5 border-white/5 hover:border-emerald-500/20',
                  blue: active ? 'bg-blue-500/10 border-blue-500/30' : 'bg-blue-500/5 border-white/5 hover:border-blue-500/20',
                }
                const dotColor = { brand: 'bg-brand-600', amber: 'bg-amber-500', emerald: 'bg-emerald-500', blue: 'bg-blue-500' }
                const textColor = { brand: 'text-zinc-300', amber: 'text-amber-300', emerald: 'text-emerald-300', blue: 'text-blue-300' }
                return (
                  <label key={String(s.id)} className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${colorMap[s.color]}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${active ? `${dotColor[s.color]} border-transparent` : 'border-white/20 bg-transparent'}`}>
                        {active && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className={`text-[13px] font-bold ${textColor[s.color]}`}>{s.label}</div>
                        <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-tight">{s.sub}</div>
                      </div>
                    </div>
                    <input type="radio" className="hidden" name="strategy" checked={active} onChange={() => setStrategy(s.id)} />
                  </label>
                )
              })}
            </div>

            {/* Universe toggles (only shown for default strategy) */}
            {strategy === null && (
              <div className="flex flex-col gap-2 pt-2 border-t border-white/[0.04]">
                <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest">宇宙範圍</p>
                {[
                  { id: 'watchlist', checked: useWatchlist, set: setUseWatchlist, label: '我的自選清單', sub: `${watchlist.length} 檔標的` },
                  { id: 'us20', checked: includeUS, set: setIncludeUS, label: '美股熱門池', sub: '標普 500 前 20 大權值股' },
                  { id: 'tw15', checked: includeTW, set: setIncludeTW, label: '台股精選池', sub: '半導體與 ETF 硬核標的' },
                ].map(item => (
                  <label key={item.id} className="flex items-center gap-3 p-3 rounded-xl border bg-white/[0.01] border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-all">
                    <div className={`w-4 h-4 rounded flex items-center justify-center transition-all ${item.checked ? 'bg-brand-600' : 'bg-zinc-900 border border-white/10'}`}>
                      {item.checked && <ShieldCheck size={12} className="text-white" />}
                    </div>
                    <div>
                      <div className="text-[12px] font-bold text-zinc-300">{item.label}</div>
                      <div className="text-[9px] font-medium text-zinc-600">{item.sub}</div>
                    </div>
                    <input type="checkbox" className="hidden" checked={item.checked} onChange={e => item.set(e.target.checked)} />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Manual Override + Options */}
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Plus size={16} className="text-brand-400" />
              <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">Manual Override</h2>
            </div>

            <form onSubmit={handleAddExtra} className="flex gap-2">
              <div className="flex-1 flex glass-card !bg-zinc-950 !rounded-xl border-white/10 overflow-hidden">
                <select value={inputMarket} onChange={e => setInputMarket(e.target.value)} className="bg-transparent px-4 py-3 text-xs font-bold text-zinc-500 border-r border-white/5 outline-none cursor-pointer">
                  <option value="US">US</option>
                  <option value="TW">TW</option>
                </select>
                <input
                  type="text"
                  placeholder="ENTER SYMBOL..."
                  value={inputSymbol}
                  onChange={e => setInputSymbol(e.target.value)}
                  className="bg-transparent w-full px-4 py-3 text-sm font-bold text-white placeholder-zinc-800 outline-none uppercase"
                />
              </div>
              <button type="submit" className="btn-premium-outline !px-6">ADD</button>
            </form>

            <AnimatePresence>
              {extraStocks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {extraStocks.map(s => (
                    <motion.span
                      key={`${s.market}-${s.symbol}`}
                      initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                      className="flex items-center gap-2 text-[10px] font-black bg-white/[0.03] text-zinc-400 px-3 py-1.5 rounded-full border border-white/10 uppercase"
                    >
                      <span className="opacity-40">{s.market}</span> {s.symbol}
                      <button onClick={() => removeExtra(s.market, s.symbol)} className="text-zinc-600 hover:text-rose-400"><X size={10} /></button>
                    </motion.span>
                  ))}
                </div>
              )}
            </AnimatePresence>

            {/* Telegram toggle */}
            <div className="pt-4 border-t border-white/[0.04]">
              <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest mb-2">推送設定</p>
              <label className="flex items-center gap-3 p-3 rounded-xl border bg-white/[0.01] border-white/[0.03] hover:bg-white/[0.03] cursor-pointer transition-all">
                <div className={`w-4 h-4 rounded flex items-center justify-center transition-all ${notifyTelegram ? 'bg-brand-600' : 'bg-zinc-900 border border-white/10'}`}>
                  {notifyTelegram && <Send size={10} className="text-white" />}
                </div>
                <div>
                  <div className="text-[12px] font-bold text-zinc-300">掃描後推送 Telegram</div>
                  <div className="text-[9px] font-medium text-zinc-600">需後端設定 BOT_TOKEN + CHAT_ID</div>
                </div>
                <input type="checkbox" className="hidden" checked={notifyTelegram} onChange={e => setNotifyTelegram(e.target.checked)} />
              </label>
            </div>
          </div>
        </div>

        {/* Scan button + Progress */}
        <div className="space-y-3">
          <button
            onClick={handleScan}
            disabled={!canScan}
            className="btn-premium w-full !py-4 shadow-xl shadow-brand-600/20 text-base disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {scanning ? 'SCANNING MARKETS...' : '⚡ START STRATEGY SCAN'}
          </button>

          <AnimatePresence>
            {scanning && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
                <div className="flex justify-between text-[10px] font-bold text-zinc-600">
                  <span>掃描進度</span>
                  <span>{scanProgress.scanned} / {scanProgress.total} · {progressPct}%</span>
                </div>
                <div className="h-1 rounded-full bg-zinc-900 overflow-hidden">
                  <motion.div
                    className="h-full bg-brand-500 rounded-full"
                    animate={{ width: `${progressPct}%` }}
                    transition={{ ease: 'linear', duration: 0.2 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Result Section */}
      <AnimatePresence mode="wait">
        {scanError ? (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass-card p-4 border-rose-500/20 bg-rose-500/5 text-rose-400 text-xs flex items-center gap-3">
            <AlertCircle size={16} /> 掃描錯誤: {scanError}
          </motion.div>
        ) : displayResults ? (
          <motion.div key="results" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-10">
            {/* Result header bar */}
            <div className="flex flex-col gap-4 px-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {!isMomentumStrategy && !isUsMomentum && !isOversold && (
                  <div className="flex p-1 bg-zinc-950 rounded-2xl border border-white/5 w-fit">
                    <button onClick={() => setTab('left')} className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all ${tab === 'left' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-600 hover:text-zinc-400'}`}>左側交易信號</button>
                    <button onClick={() => setTab('right')} className={`px-8 py-2.5 rounded-xl text-xs font-black transition-all ${tab === 'right' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'text-zinc-600 hover:text-zinc-400'}`}>右側交易信號</button>
                  </div>
                )}
                <div className="flex items-center gap-4 ml-auto">
                  <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                    Total Scanned: {displayResults.total_scanned} Tickers
                  </div>
                  {!loadedReport && (
                    <button
                      onClick={handleSaveReport}
                      className={`flex items-center gap-1.5 text-[10px] font-black px-3 py-1.5 rounded-lg border transition-all ${savedMsg ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/[0.03] text-zinc-500 hover:text-zinc-300 border-white/[0.05]'}`}
                    >
                      <Save size={11} />
                      {savedMsg ? '已儲存！' : '存報告'}
                    </button>
                  )}
                  {loadedReport && (
                    <span className="text-[10px] font-bold text-amber-500/70 px-3 py-1.5 rounded-lg bg-amber-500/5 border border-amber-500/10">📂 歷史報告</span>
                  )}
                </div>
              </div>

              {/* Filter bar */}
              {!isMomentumStrategy && (
                <FilterBar maxRsi={maxRsi} setMaxRsi={setMaxRsi} minVol={minVol} setMinVol={setMinVol} />
              )}
            </div>

            {/* Tables */}
            <div className="space-y-12">
              {isMomentumStrategy ? (
                <MomentumTable stocks={(displayResults.right_side ?? []).filter(i => i.market === 'TW')} />
              ) : (
                <>
                  <StockScreenerTable stocks={usStocks} title="美股市場 (US Market)" side={tab} maxRsi={maxRsi} minVol={minVol} />
                  <StockScreenerTable stocks={twStocks} title="台股市場 (TW Market)" side={tab} maxRsi={maxRsi} minVol={minVol} />
                </>
              )}

              {sideItems.length === 0 && (
                <div className="glass-card py-24 text-center border-dashed">
                  <TrendingDown size={32} className="mx-auto text-zinc-800 mb-4" />
                  <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">目前沒有標的符合您的篩選條件</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : !scanning ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass-card py-32 text-center">
            <Search size={32} className="mx-auto text-zinc-800 mb-4" />
            <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-[0.3em]">配置條件後執行深度掃描</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
