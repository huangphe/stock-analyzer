import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  TrendingDown, TrendingUp, ExternalLink, RefreshCw,
  Info, BarChart2, Maximize2, Minimize2, AlertCircle,
} from 'lucide-react'
import { stockApi } from '../utils/api'

const CONCEPT_CARDS = [
  {
    icon: TrendingDown,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    title: '散戶極度樂觀',
    desc: '當 FB 網紅大喊「要漲了」、粉絲一片看多，往往是頭部訊號——準備反手做空或出場。',
  },
  {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    title: '散戶極度悲觀',
    desc: '當哀鴻遍野、人人喊崩，聰明錢正在悄悄建倉。逆向思維：別人恐懼時我貪婪。',
  },
  {
    icon: BarChart2,
    color: 'text-brand-400',
    bg: 'bg-brand-500/10 border-brand-500/20',
    title: '歷史勝率 81.5%',
    desc: '以 0050 回測，逆向訊號策略大幅跑贏買入持有，是少數有實戰數據支撐的散戶情緒指標。',
  },
]

const CHART_SYMBOLS = [
  { label: '0050 台灣50', market: 'TW', symbol: '0050' },
  { label: '2330 台積電', market: 'TW', symbol: '2330' },
  { label: '2317 鴻海',   market: 'TW', symbol: '2317' },
  { label: 'SPY 標普500', market: 'US', symbol: 'SPY'  },
]

const PERIODS = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y'  },
]

function MiniChart({ market, symbol, period }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['contrary-chart', market, symbol, period],
    queryFn: () => stockApi.getHistory(market, symbol, period, '1d'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-600 gap-2">
        <RefreshCw size={18} className="animate-spin text-brand-500/50" />
        <span className="text-sm">載入中…</span>
      </div>
    )
  }
  if (isError || !data?.data?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-zinc-600">
        <AlertCircle size={22} className="text-zinc-700" />
        <span className="text-sm">需啟動後端服務才能顯示圖表</span>
        <span className="text-xs text-zinc-700">本地執行：uvicorn main:app（backend/）</span>
      </div>
    )
  }

  const bars = data.data.map(b => ({
    date: b.date?.slice(0, 10),
    close: b.close,
  }))
  const mn = Math.min(...bars.map(b => b.close))
  const mx = Math.max(...bars.map(b => b.close))
  const pad = (mx - mn) * 0.05
  const first = bars[0]?.close
  const last  = bars[bars.length - 1]?.close
  const isUp  = last >= first
  const color = isUp ? '#10b981' : '#f43f5e'

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={bars} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#52525b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={d => d?.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[mn - pad, mx + pad]}
          tick={{ fill: '#52525b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={v => v.toFixed(0)}
        />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
          labelStyle={{ color: '#a1a1aa', fontSize: 11 }}
          itemStyle={{ color: color, fontSize: 12 }}
          formatter={v => [v.toFixed(2), '收盤']}
        />
        <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill="url(#cg)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export default function ContraryIndicator() {
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [activeIdx, setActiveIdx]   = useState(0)
  const [period,    setPeriod]      = useState('3mo')
  const { market, symbol } = CHART_SYMBOLS[activeIdx]

  return (
    <div className="space-y-8">

      {/* ── 頁頭 ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <TrendingDown size={18} className="text-purple-400" />
            </span>
            逆向情緒指標
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            追蹤 FB 投資網紅情緒 · 逆勢進場 · 以 0050 回測勝率 81.5%
          </p>
        </div>
        <a
          href="https://hansai-art.github.io/8zz-Contrarian-Indicator-TradingView/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/10 border border-purple-500/20 text-purple-300 text-sm font-medium hover:bg-purple-600/20 transition-colors"
        >
          <ExternalLink size={14} />
          在新分頁開啟完整工具
        </a>
      </motion.div>

      {/* ── 概念卡片 ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {CONCEPT_CARDS.map(({ icon: Icon, color, bg, title, desc }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className={`glass-card p-4 border ${bg}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon size={18} className={color} />
              <span className="text-sm font-semibold text-white">{title}</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{desc}</p>
          </motion.div>
        ))}
      </div>

      {/* ── 嵌入工具 ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-purple-400" />
            <span className="text-sm font-semibold text-white">8ZZ 逆向指標互動工具</span>
            <span className="text-[10px] text-zinc-600 ml-1">by hansai-art</span>
          </div>
          <button
            onClick={() => setFullscreen(v => !v)}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-zinc-500 hover:text-zinc-300 transition-colors"
            title={fullscreen ? '縮小' : '全螢幕'}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>

        <div className={`relative bg-[#0d0d10] transition-all duration-500 ${fullscreen ? 'h-[85vh]' : 'h-[640px]'}`}>
          {!iframeLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-600">
              <RefreshCw size={28} className="animate-spin text-purple-500/50" />
              <span className="text-sm">載入中…</span>
            </div>
          )}
          <iframe
            src="https://hansai-art.github.io/8zz-Contrarian-Indicator-TradingView/"
            title="8ZZ 逆向情緒指標"
            className={`w-full h-full border-0 transition-opacity duration-500 ${iframeLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setIframeLoaded(true)}
            allow="fullscreen"
            loading="lazy"
          />
        </div>
      </motion.div>

      {/* ── 自製收盤價走勢圖 ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <BarChart2 size={14} className="text-brand-400" />
            <span className="text-sm font-semibold text-white">收盤價走勢</span>
            <span className="text-xs text-zinc-600">· 搭配逆向訊號參考</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {CHART_SYMBOLS.map(({ label }, i) => (
              <button
                key={label}
                onClick={() => setActiveIdx(i)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  activeIdx === i
                    ? 'bg-brand-600/20 border border-brand-500/30 text-brand-300'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="w-px h-4 bg-white/10 mx-1" />
            {PERIODS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                  period === value
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-600 hover:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="px-2 pt-4 pb-2 bg-[#09090b]">
          <MiniChart market={market} symbol={symbol} period={period} />
        </div>
      </motion.div>

      {/* ── 使用說明 ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="glass-card p-5 border border-yellow-500/10 bg-yellow-500/[0.03]"
      >
        <div className="flex items-start gap-3">
          <Info size={16} className="text-yellow-500 mt-0.5 shrink-0" />
          <div className="space-y-1 text-xs text-zinc-500 leading-relaxed">
            <p className="text-yellow-400/80 font-semibold text-sm mb-1">使用說明</p>
            <p>• <span className="text-zinc-300">工具來源</span>：由 hansai-art 開發，追蹤 Facebook 投資網紅「Banini」的貼文情緒，當情緒極端時產生反向進場訊號。</p>
            <p>• <span className="text-zinc-300">Mode B</span>：持有至下一個反向訊號出現（動態出場），適合趨勢明確時。</p>
            <p>• <span className="text-zinc-300">Mode A</span>：固定持有 14 天後出場，適合短線操作。</p>
            <p>• 以上數據為歷史回測，不代表未來績效，請搭配自身風險管理使用。</p>
          </div>
        </div>
      </motion.div>

    </div>
  )
}
