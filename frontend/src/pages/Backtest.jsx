import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Activity, 
  BarChart2, Clock, ShieldCheck, AlertCircle, 
  ChevronRight, ArrowRight, Play, Info, 
  Layers, Wallet, Target, Search
} from 'lucide-react'
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api'

// --- Types & Constants ---
const STRATEGIES = [
  { id: 'momentum', label: '動能突破策略', sub: 'MA20 + MACD + 爆量', color: 'emerald' },
  { id: 'rsi_oversold', label: '超賣抄底策略', sub: 'RSI < 30 + BB下軌', color: 'blue' },
]

const PERIODS = [
  { id: '6mo', label: '6 個月' },
  { id: '1y',  label: '1 年' },
  { id: '2y',  label: '2 年' },
  { id: '5y',  label: '5 年' },
]

// --- Small Components ---

function MetricCard({ title, value, sub, icon: Icon, color = 'brand' }) {
  const colorMap = {
    brand: 'text-brand-400 bg-brand-500/5 border-brand-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
    rose: 'text-rose-400 bg-rose-500/5 border-rose-500/10',
    blue: 'text-blue-400 bg-blue-500/5 border-blue-500/10',
    amber: 'text-amber-400 bg-amber-500/5 border-amber-500/10',
  }

  return (
    <div className={`p-5 rounded-2xl border ${colorMap[color]} space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{title}</span>
        <Icon size={14} className="opacity-50" />
      </div>
      <div className="text-2xl font-black tracking-tight">{value}</div>
      {sub && <div className="text-[10px] font-bold opacity-50">{sub}</div>}
    </div>
  )
}

function TradeRow({ trade }) {
  const isProfit = (trade.pnl_pct || 0) > 0
  return (
    <tr className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors">
      <td className="py-3 px-4 text-xs font-medium text-zinc-500">{trade.entry_date}</td>
      <td className="py-3 px-4 text-xs font-medium text-zinc-500">{trade.exit_date || "持倉中"}</td>
      <td className="py-3 px-4 text-xs font-black font-mono text-zinc-300 text-right">${trade.entry_price.toFixed(2)}</td>
      <td className="py-3 px-4 text-xs font-black font-mono text-zinc-300 text-right">
        {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : "—"}
      </td>
      <td className="py-3 px-4 text-right">
        <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
          {isProfit ? '▲' : '▼'} {Math.abs(trade.pnl_pct * 100).toFixed(2)}%
        </span>
      </td>
      <td className="py-3 px-4 text-[10px] font-bold text-zinc-600 text-center">{trade.hold_days}D</td>
      <td className="py-3 px-4 text-[10px] font-bold text-zinc-600 uppercase text-right">{trade.exit_reason || "訊號中"}</td>
    </tr>
  )
}

// --- Main Component ---

export default function Backtest() {
  const [market, setMarket] = useState('US')
  const [symbol, setSymbol] = useState('NVDA')
  const [strategy, setStrategy] = useState('momentum')
  const [period, setPeriod] = useState('1y')
  const [initialCapital, setInitialCapital] = useState(100000)
  
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    
    try {
      const response = await axios.post(`${API_BASE}/backtest/run`, {
        market,
        symbol: symbol.toUpperCase().trim(),
        strategy,
        period,
        initial_capital: initialCapital,
        stop_loss: -0.08,
        take_profit: 0.25
      })
      setResult(response.data)
    } catch (err) {
      console.error(err)
      setError(err.response?.data?.detail || "執行回測失敗，請檢查代碼或後端狀態")
    } finally {
      setLoading(false)
    }
  }

  // Formatting chart data
  const chartData = useMemo(() => {
    if (!result || !result.history) return []
    return result.history.map(item => ({
      date: item.date,
      equity: item.equity,
      price: item.price
    }))
  }, [result])

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-20">
      
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="premium-badge !text-amber-400 !bg-amber-500/5 !border-amber-500/20 mb-2 font-mono">Engine v2.0 Beta</span>
          <h1 className="text-3xl font-bold text-white tracking-tight">策略回測實驗室</h1>
          <p className="text-zinc-500 text-sm mt-1">驗證量化模型效能 · 獲利能力與風險深度分析系統</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Control Panel */}
        <div className="lg:col-span-1 space-y-6">
          <section className="glass-card p-6 space-y-6">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-brand-400" />
              <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">標的設定</h2>
            </div>
            
            <div className="space-y-4">
              <div className="group">
                <label className="text-[10px] font-bold text-zinc-600 uppercase mb-1.5 block">Market / Symbol</label>
                <div className="flex glass-card !bg-zinc-950 !rounded-xl border-white/10 overflow-hidden">
                  <select 
                    value={market} 
                    onChange={e => setMarket(e.target.value)}
                    className="bg-transparent px-3 py-3 text-xs font-bold text-zinc-500 border-r border-white/5 outline-none cursor-pointer"
                  >
                    <option value="US">US</option>
                    <option value="TW">TW</option>
                  </select>
                  <input
                    type="text"
                    value={symbol}
                    onChange={e => setSymbol(e.target.value)}
                    className="bg-transparent w-full px-4 py-3 text-sm font-bold text-white placeholder-zinc-800 outline-none uppercase"
                    placeholder="ENTER..."
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase mb-1.5 block">Strategy</label>
                <div className="space-y-2">
                  {STRATEGIES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setStrategy(s.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        strategy === s.id 
                          ? 'bg-brand-600/10 border-brand-500/30 text-brand-400' 
                          : 'bg-white/[0.01] border-white/[0.03] text-zinc-500 hover:border-white/10'
                      }`}
                    >
                      <div className="text-[12px] font-bold">{s.label}</div>
                      <div className="text-[9px] font-medium opacity-60">{s.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase mb-1.5 block">Period</label>
                <div className="grid grid-cols-2 gap-2">
                  {PERIODS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPeriod(p.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${
                        period === p.id 
                          ? 'bg-zinc-100 text-zinc-900 border-white' 
                          : 'bg-white/[0.02] border-white/[0.05] text-zinc-500 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-600 uppercase mb-1.5 block">Capital</label>
                <div className="relative">
                   <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-700 text-xs">$</div>
                   <input 
                      type="number" 
                      value={initialCapital}
                      onChange={e => setInitialCapital(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl pl-6 pr-4 py-3 text-sm font-bold text-white outline-none focus:border-brand-500/50"
                   />
                </div>
              </div>
            </div>

            <button
              onClick={handleRun}
              disabled={loading}
              className="btn-premium w-full !py-4 shadow-xl shadow-brand-600/20 text-sm flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Play size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  RUN BACKTEST
                </>
              )}
            </button>
          </section>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex gap-3">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </motion.div>
          )}
        </div>

        {/* Right Dashboard Area */}
        <div className="lg:col-span-3 space-y-8">
          
          <AnimatePresence mode="wait">
            {!result && !loading ? (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="glass-card h-[600px] flex flex-col items-center justify-center text-center p-8 border-dashed"
              >
                <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-white/10 flex items-center justify-center mb-4 text-zinc-700">
                  <BarChart2 size={32} />
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Ready for simulation</h3>
                <p className="text-zinc-600 text-xs mt-2 max-w-xs uppercase leading-relaxed">選擇標的與策略代碼，點擊執行按鈕獲取深度歷史回測報告</p>
              </motion.div>
            ) : result ? (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard 
                    title="Total Return" 
                    value={`${result.total_return_pct > 0 ? '+' : ''}${result.total_return_pct.toFixed(2)}%`}
                    sub={`Initial: $${initialCapital.toLocaleString()}`}
                    icon={TrendingUp}
                    color={result.total_return_pct >= 0 ? 'emerald' : 'rose'}
                  />
                  <MetricCard 
                    title="Win Rate" 
                    value={`${result.metrics.win_rate.toFixed(1)}%`}
                    sub={`Total Trades: ${result.metrics.total_trades}`}
                    icon={Target}
                    color="amber"
                  />
                  <MetricCard 
                    title="Max Drawdown" 
                    value={`${result.metrics.max_drawdown_pct.toFixed(2)}%`}
                    sub="Peak to Trough"
                    icon={TrendingDown}
                    color="rose"
                  />
                  <MetricCard 
                    title="Final Capital" 
                    value={`$${Math.round(result.final_equity).toLocaleString()}`}
                    sub="Current Balance"
                    icon={Wallet}
                    color="brand"
                  />
                </div>

                {/* Main Chart */}
                <section className="glass-card p-6 md:p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-sm font-black text-white uppercase tracking-widest">Equity Curve</h3>
                      <p className="text-[10px] text-zinc-600 font-bold uppercase mt-1">資產淨值與標的價格對照</p>
                    </div>
                    <div className="flex items-center gap-4">
                       <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-brand-500" />
                          <span className="text-[9px] font-black text-zinc-500 uppercase">Equity</span>
                       </div>
                       <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-zinc-700" />
                          <span className="text-[9px] font-black text-zinc-500 uppercase">Price</span>
                       </div>
                    </div>
                  </div>

                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#52525b' }} 
                        />
                        <YAxis 
                          hide={true} 
                          domain={['auto', 'auto']} 
                        />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#09090b', borderColor: '#ffffff10', borderRadius: '12px', fontSize: '12px' }}
                          itemStyle={{ fontWeight: 'bold' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="equity" 
                          stroke="#8b5cf6" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorEquity)" 
                          animationDuration={1500}
                        />
                         <Area 
                          type="monotone" 
                          dataKey="price" 
                          stroke="#3f3f46" 
                          strokeWidth={1}
                          strokeDasharray="5 5"
                          fill="transparent" 
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                {/* Trade Records */}
                <section className="glass-card overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Trade Log</h3>
                    <span className="text-[10px] font-bold text-zinc-700">{result.trades.length} 筆歷史成交</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/[0.02]">
                          <th className="py-3 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">Entry Date</th>
                          <th className="py-3 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest">Exit Date</th>
                          <th className="py-3 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-right">Entry Price</th>
                          <th className="py-3 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-right">Exit Price</th>
                          <th className="py-3 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-right">PnL %</th>
                          <th className="py-3 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center">Hold</th>
                          <th className="py-3 px-4 text-[9px] font-black text-zinc-600 uppercase tracking-widest text-right">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.map((trade, i) => (
                          <TradeRow key={i} trade={trade} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {result.trades.length === 0 && (
                    <div className="py-12 text-center text-zinc-700 text-xs font-bold uppercase tracking-widest">
                       策略期間無符合之進場點
                    </div>
                  )}
                </section>

              </motion.div>
            ) : null}
          </AnimatePresence>

        </div>
      </div>
    </div>
  )
}
