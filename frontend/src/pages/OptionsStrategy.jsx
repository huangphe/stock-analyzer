import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import {
  Layers, Package, Target, TrendingUp, BarChart3,
  ChevronRight, Plus, Trash2, Zap, LayoutGrid, Info, 
  Activity, Search, Calendar, MousePointer2, Settings2, X
} from 'lucide-react'
import { strategyApi, optionsApi } from '../utils/api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v, dec = 2) {
  if (v == null) return '—'
  return typeof v === 'number' ? v.toFixed(dec) : v
}

/** 辨識策略名稱 */
function identifyStrategy(legs) {
  if (!legs || legs.length === 0) return '尚未配置'

  const calls = [...legs.filter(l => l.option_type === 'call')].sort((a, b) => a.strike - b.strike)
  const puts  = [...legs.filter(l => l.option_type === 'put' )].sort((a, b) => a.strike - b.strike)

  if (legs.length === 1) {
    const l = legs[0]
    return `${l.action === 'buy' ? '買入' : '賣出'} ${l.option_type === 'call' ? '買權' : '賣權'}`
  }

  if (legs.length === 2) {
    // Straddle / Strangle：1 call + 1 put
    if (calls.length === 1 && puts.length === 1) {
      const c = calls[0], p = puts[0]
      const bothBuy  = c.action === 'buy'  && p.action === 'buy'
      const bothSell = c.action === 'sell' && p.action === 'sell'
      if (c.strike === p.strike) {
        if (bothBuy)  return '買入跨式策略 (Long Straddle)'
        if (bothSell) return '賣出跨式策略 (Short Straddle)'
      }
      if (bothBuy)  return '買入勒式策略 (Long Strangle)'
      if (bothSell) return '賣出勒式策略 (Short Strangle)'
    }
    // Call Spread
    if (calls.length === 2) {
      const buy  = calls.find(l => l.action === 'buy')
      const sell = calls.find(l => l.action === 'sell')
      if (buy && sell)
        return buy.strike < sell.strike
          ? '多頭買權價差 (Bull Call Spread)'
          : '空頭買權價差 (Bear Call Spread)'
    }
    // Put Spread
    if (puts.length === 2) {
      const buy  = puts.find(l => l.action === 'buy')
      const sell = puts.find(l => l.action === 'sell')
      if (buy && sell)
        return buy.strike > sell.strike
          ? '空頭賣權價差 (Bear Put Spread)'
          : '多頭賣權價差 (Bull Put Spread)'
    }
  }

  if (legs.length === 4 && calls.length === 2 && puts.length === 2) {
    const sellPut  = puts.find(l => l.action === 'sell')
    const buyPut   = puts.find(l => l.action === 'buy')
    const sellCall = calls.find(l => l.action === 'sell')
    const buyCall  = calls.find(l => l.action === 'buy')
    if (sellPut && buyPut && sellCall && buyCall) {
      if (sellPut.strike === sellCall.strike) return '鐵蝴蝶策略 (Iron Butterfly)'
      return '鐵兀鷹策略 (Iron Condor)'
    }
  }

  return '自定義組合'
}

// ── PnL Chart ───────────────────────────────────────────────────────────────

function PnLChart({ pnlCurve, breakevens, underlyingPrice }) {
  if (!pnlCurve?.length) return null

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="glass-card !bg-zinc-950/90 !rounded-xl px-4 py-3 text-xs shadow-2xl border-white/10 min-w-[160px]">
        <div className="text-zinc-500 mb-2 font-bold uppercase tracking-widest text-[10px]">Price: ${d.price}</div>
        <div className={`text-sm font-bold font-mono ${d.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          PnL: {d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}
        </div>
        <div className={`text-[10px] font-bold ${d.pnl >= 0 ? 'text-emerald-500/60' : 'text-rose-500/60'}`}>
          ({d.pnl_pct >= 0 ? '+' : ''}{d.pnl_pct.toFixed(2)}%)
        </div>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={pnlCurve} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlPlus" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="pnlMinus" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1} />
            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.03)" vertical={false} />
        <XAxis
          dataKey="price"
          tick={{ fill: '#52525b', fontSize: 10, fontWeight: 600 }}
          tickFormatter={(v) => `$${v.toFixed(2)}`}
          axisLine={false}
          tickLine={false}
          dy={10}
        />
        <YAxis
          tick={{ fill: '#52525b', fontSize: 10, fontWeight: 600 }}
          tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}`}
          width={50}
          axisLine={false}
          tickLine={false}
          orientation="right"
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
        <ReferenceLine y={0} stroke="#27272a" strokeWidth={1} />
        <ReferenceLine
          x={underlyingPrice}
          stroke="#8b5cf6"
          strokeDasharray="4 4"
          label={{ value: '現價', fill: '#a78bfa', fontSize: 10, fontWeight: 'bold', position: 'top' }}
        />
        {breakevens?.map((be) => (
          <ReferenceLine
            key={be}
            x={be}
            stroke="#f59e0b"
            strokeDasharray="2 2"
            label={{ value: `BE $${be}`, fill: '#f59e0b', fontSize: 9, position: 'center' }}
          />
        ))}
        <Area
          type="monotone"
          dataKey="pnl"
          stroke={pnlCurve[0]?.pnl >= 0 ? "#10b981" : "#f43f5e"}
          fill="url(#pnlPlus)"
          strokeWidth={3}
          dot={false}
          animationDuration={1500}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function OptionsStrategy() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [symbol, setSymbol] = useState(searchParams.get('symbol') || 'AAPL')
  const market = 'US'
  const [underlyingPrice, setUnderlyingPrice] = useState(
    parseFloat(searchParams.get('price') || '0')
  )
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [legs, setLegs] = useState([])
  const [result, setResult] = useState(null)
  const [showAllStrikes, setShowAllStrikes] = useState(false)

  // 1. 取得期權鏈
  const { data: chain, isLoading: chainLoading, error: chainError } = useQuery({
    queryKey: ['optionsChain', symbol, selectedExpiry],
    queryFn: () => optionsApi.getChain(symbol, selectedExpiry),
    enabled: !!symbol && market === 'US',
    retry: 1,
  })

  // 同步基礎參數
  useEffect(() => {
    if (chain?.underlying_price) setUnderlyingPrice(chain.underlying_price)
    if (chain?.expiry_dates?.length > 0 && !selectedExpiry) {
      setSelectedExpiry(chain.expiry_dates[0])
    }
  }, [chain, selectedExpiry])

  // 2. 分析 Mutation
  const analyzeMutation = useMutation({
    mutationFn: (data) => strategyApi.analyze(data),
    onSuccess: (data) => setResult(data),
  })

  // ── Interaction Handlers ───────────────────────────

  const handleStrikeClick = (contract, action) => {
     // 檢查是否已存在相同腳位
     const existIdx = legs.findIndex(l => l.strike === contract.strike && l.option_type === contract.option_type && l.action === action)
     if (existIdx >= 0) {
        setLegs(legs.filter((_, i) => i !== existIdx))
        return
     }
     
     const newLeg = {
        option_type: contract.option_type,
        action: action,
        strike: contract.strike,
        expiry: selectedExpiry || chain?.expiry_dates[0],
        premium: contract.last_price || 0.1,
        quantity: 1,
     }
     setLegs([...legs, newLeg])
  }

  const handleAnalyze = () => {
    if (!legs.length) return
    analyzeMutation.mutate({
      symbol, market,
      underlying_price: underlyingPrice,
      strategy_type: 'custom',
      legs: legs.map(l => ({ ...l, premium: parseFloat(l.premium), strike: parseFloat(l.strike) })),
      contract_size: 100,
    })
  }

  // ── Derived Data ───────────────────────────────────

  const filteredStrikes = useMemo(() => {
    if (!chain) return []
    const strikes = []
    const strikeSet = new Set([...chain.calls.map(c => c.strike), ...chain.puts.map(p => p.strike)])
    const sortedStrikes = Array.from(strikeSet).sort((a, b) => a - b)
    
    if (showAllStrikes) return sortedStrikes

    // 找出最靠近 Spot 的索引
    const spotIdx = sortedStrikes.findIndex(s => s >= (underlyingPrice || 0))
    const start = Math.max(0, spotIdx - 10)
    const end = Math.min(sortedStrikes.length, spotIdx + 11)
    return sortedStrikes.slice(start, end)
  }, [chain, underlyingPrice, showAllStrikes])

  const findContract = (strikesArr, strike, type) => {
     const list = type === 'call' ? chain?.calls : chain?.puts
     return list?.find(c => c.strike === strike)
  }

  return (
    <div className="space-y-8 max-w-[1400px] mx-auto pb-20 mt-4">
      
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="premium-badge !text-brand-400 !bg-brand-500/5 !border-brand-500/20 mb-2">Strategy Builder v2</span>
          <h1 className="text-3xl font-bold text-white tracking-tight">期權策略分析儀</h1>
          <p className="text-zinc-500 text-sm mt-1">IBKR 風格視覺化策略室 · 點擊買賣價建立組合</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left: Option Chain (Visual Builder) */}
        <div className="xl:col-span-8 space-y-6">
          <section className="glass-card p-6 min-h-[600px] flex flex-col">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
               <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className="relative group flex-1 sm:w-48">
                     <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                     <input 
                        value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                        className="w-full bg-zinc-950 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-sm font-bold text-white outline-none focus:border-brand-500/50" 
                        placeholder="輸入代碼..."
                     />
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl">
                     <span className="text-[10px] font-black text-zinc-600 uppercase">Spot</span>
                     <span className="text-sm font-black font-mono text-brand-400">
                       {underlyingPrice > 0 ? `$${fmt(underlyingPrice)}` : '—'}
                     </span>
                  </div>
               </div>

               {chain?.expiry_dates && (
                  <div className="flex gap-2 p-1 bg-zinc-950 rounded-xl border border-white/5 overflow-x-auto max-w-full custom-scrollbar">
                     {chain.expiry_dates.slice(0, 8).map(d => (
                        <button 
                           key={d} onClick={() => setSelectedExpiry(d)}
                           className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all whitespace-nowrap ${selectedExpiry === d ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
                        >
                           {d.slice(5)}
                        </button>
                     ))}
                  </div>
               )}
            </div>

            {chainLoading ? (
               <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                  <Activity size={32} className="text-zinc-800 animate-pulse" />
                  <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">正在載入即時鏈結數據...</p>
               </div>
            ) : chainError ? (
               <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                     <X size={20} className="text-rose-400" />
                  </div>
                  <p className="text-sm font-bold text-zinc-400">期權鏈載入失敗</p>
                  <p className="text-[11px] text-zinc-600 max-w-xs text-center">
                     {chainError?.response?.data?.detail || 'Yahoo Finance 暫時無法取得資料，請稍後再試'}
                  </p>
               </div>
            ) : chain ? (
               <div className="flex-1 overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                      <tr className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] border-b border-white/[0.04]">
                         <th className="pb-3 px-2 text-center">Delta</th>
                         <th className="pb-3 px-2 text-right">Bid</th>
                         <th className="pb-3 px-2 text-right">Ask</th>
                         <th className="pb-3 px-4 text-center bg-white/[0.02] text-zinc-400">履約價</th>
                         <th className="pb-3 px-2 text-left">Bid</th>
                         <th className="pb-3 px-2 text-left">Ask</th>
                         <th className="pb-3 px-2 text-center">Delta</th>
                      </tr>
                   </thead>
                   <tbody>
                      {filteredStrikes.map(s => {
                         const call = findContract(filteredStrikes, s, 'call')
                         const put = findContract(filteredStrikes, s, 'put')
                         const isATM = Math.abs(s - underlyingPrice) < 2
                         
                         const getActive = (strike, type, action) => legs.some(l => l.strike === strike && l.option_type === type && l.action === action)

                         return (
                            <tr key={s} className={`group hover:bg-white/[0.01] transition-colors ${isATM ? 'bg-brand-500/[0.02]' : ''}`}>
                               {/* Call Side */}
                               <td className="py-2.5 px-2 text-[10px] font-mono font-bold text-zinc-600 text-center">{fmt(call?.delta, 2)}</td>
                               <td 
                                  onClick={() => handleStrikeClick(call, 'sell')}
                                  className={`py-2.5 px-2 text-right cursor-pointer transition-all ${getActive(s, 'call', 'sell') ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-300 hover:bg-rose-500/10'}`}
                               >
                                  <div className="text-xs font-bold font-mono">{fmt(call?.bid)}</div>
                               </td>
                               <td 
                                  onClick={() => handleStrikeClick(call, 'buy')}
                                  className={`py-2.5 px-2 text-right cursor-pointer border-r border-white/[0.05] transition-all ${getActive(s, 'call', 'buy') ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-300 hover:bg-emerald-500/10'}`}
                               >
                                  <div className="text-xs font-bold font-mono">{fmt(call?.ask)}</div>
                               </td>

                               {/* Strike */}
                               <td className={`py-2.5 px-4 text-center font-black font-mono text-sm group-hover:text-brand-400 transition-colors ${isATM ? 'text-brand-400' : 'text-zinc-500'}`}>
                                  {s}
                               </td>

                               {/* Put Side */}
                               <td 
                                  onClick={() => handleStrikeClick(put, 'sell')}
                                  className={`py-2.5 px-2 text-left cursor-pointer border-l border-white/[0.05] transition-all ${getActive(s, 'put', 'sell') ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-300 hover:bg-rose-500/10'}`}
                               >
                                  <div className="text-xs font-bold font-mono">{fmt(put?.bid)}</div>
                               </td>
                               <td 
                                  onClick={() => handleStrikeClick(put, 'buy')}
                                  className={`py-2.5 px-2 text-left cursor-pointer transition-all ${getActive(s, 'put', 'buy') ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-300 hover:bg-emerald-500/10'}`}
                               >
                                  <div className="text-xs font-bold font-mono">{fmt(put?.ask)}</div>
                               </td>
                               <td className="py-2.5 px-2 text-[10px] font-mono font-bold text-zinc-600 text-center">{fmt(put?.delta, 2)}</td>
                            </tr>
                         )
                      })}
                   </tbody>
                 </table>
                 <button 
                  onClick={() => setShowAllStrikes(!showAllStrikes)}
                  className="w-full py-4 text-[10px] font-black text-zinc-700 uppercase tracking-[0.3em] hover:text-zinc-500 transition-colors mt-2"
                 >
                  {showAllStrikes ? '隱藏部分履約價' : '顯示所有履約價'}
                 </button>
               </div>
            ) : null}

            {/* Labels overlay */}
            <div className="mt-auto pt-6 flex items-center justify-between text-[9px] font-black text-zinc-700 uppercase tracking-widest">
               <div className="flex gap-4">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-emerald-500/20 border border-emerald-500/20" /> Ask (Buy)</div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded bg-rose-500/20 border border-rose-500/20" /> Bid (Sell)</div>
               </div>
               <div>按一下價格加入 Builder，再按一下移除</div>
            </div>
          </section>
        </div>

        {/* Right: Builder Tray & Results */}
        <div className="xl:col-span-4 space-y-6">
          
          {/* Builder Tray */}
          <section className="glass-card p-6 flex flex-col">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                   <Settings2 size={16} className="text-brand-400" />
                   <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Strategy Builder</h2>
                </div>
                {legs.length > 0 && (
                   <button onClick={() => setLegs([])} className="text-[10px] font-bold text-zinc-600 hover:text-rose-400 uppercase">Clear All</button>
                )}
             </div>

             <AnimatePresence mode="popLayout">
               {legs.length === 0 ? (
                  <div className="py-20 text-center border-2 border-dashed border-white/[0.03] rounded-2xl">
                     <Plus size={24} className="mx-auto text-zinc-800 mb-2" />
                     <p className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">在鏈表中選擇買賣點</p>
                  </div>
               ) : (
                  <div className="space-y-3">
                     {legs.map((l, i) => (
                        <motion.div 
                           key={`${l.strike}-${l.option_type}-${l.action}`}
                           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                           className="flex items-center gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5"
                        >
                           <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black uppercase ${l.action === 'buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                              {l.action === 'buy' ? 'BUY' : 'SELL'}
                           </div>
                           <div className="flex-1">
                              <div className="text-xs font-bold text-white uppercase">{l.option_type} ${l.strike}</div>
                              <div className="text-[10px] font-bold text-zinc-600">{l.expiry}</div>
                           </div>
                           <div className="flex items-center gap-2">
                              <div className="text-right">
                                 <div className="text-[10px] font-bold text-zinc-600 uppercase">Price</div>
                                 <input 
                                    type="number" step="0.01" value={l.premium} 
                                    onChange={e => {
                                       const updated = [...legs]; 
                                       updated[i].premium = parseFloat(e.target.value); 
                                       setLegs(updated)
                                    }}
                                    className="w-16 bg-transparent text-xs font-bold font-mono text-zinc-300 outline-none text-right"
                                 />
                              </div>
                              <button 
                                 onClick={() => setLegs(legs.filter((_, idx) => idx !== i))}
                                 className="p-1.5 text-zinc-700 hover:text-white transition-colors"
                              >
                                 <X size={14} />
                              </button>
                           </div>
                        </motion.div>
                     ))}
                  </div>
               )}
             </AnimatePresence>

             <div className="mt-8 pt-6 border-t border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                   <div className="text-[10px] font-bold text-zinc-600 uppercase">識別類型</div>
                   <div className="text-xs font-black text-brand-400 uppercase">{identifyStrategy(legs)}</div>
                </div>
                <button
                   onClick={handleAnalyze}
                   disabled={legs.length === 0 || analyzeMutation.isPending}
                   className="btn-premium w-full !py-4 shadow-xl shadow-brand-600/20"
                >
                   {analyzeMutation.isPending ? '計算中...' : '📊 執行損益模擬分析'}
                </button>
             </div>
          </section>

          {/* Results Area */}
          <AnimatePresence>
            {result && (
               <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                     {[
                        { label: '最大獲利', value: result.max_profit ? `$${fmt(result.max_profit)}` : '∞', color: 'text-emerald-400' },
                        { label: '最大虧損', value: result.max_loss ? `$${fmt(result.max_loss)}` : '∞', color: 'text-rose-400' },
                        { label: '淨代收付', value: `${result.net_premium >= 0 ? '+' : ''}${fmt(result.net_premium)}`, color: result.net_premium >= 0 ? 'text-emerald-400' : 'text-rose-400' },
                        { label: '到期時間', value: selectedExpiry || '—', color: 'text-zinc-300' },
                     ].map((item, i) => (
                        <div key={i} className="glass-card p-4 !bg-white/[0.01]">
                           <div className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mb-2">{item.label}</div>
                           <div className={`text-sm font-black font-mono tracking-tight ${item.color}`}>{item.value}</div>
                        </div>
                     ))}
                  </div>

                  <div className="glass-card p-6 min-h-[400px]">
                     <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                           <BarChart3 size={16} className="text-zinc-600" /> 到期盈虧模擬圖
                        </h2>
                        <div className="flex items-center gap-1 px-2 py-1 bg-brand-500/5 border border-brand-500/10 rounded-lg">
                           <span className="text-[9px] font-bold text-brand-400">SPOT: ${fmt(underlyingPrice)}</span>
                        </div>
                     </div>
                     <PnLChart
                        pnlCurve={result.pnl_curve}
                        breakevens={result.breakeven_prices}
                        underlyingPrice={result.underlying_price}
                     />
                  </div>
               </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
