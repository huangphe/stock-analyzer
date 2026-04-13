import { motion } from 'framer-motion'
import { TrendingUp, ArrowRight, Zap, Shield, BarChart3, Globe } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div className="relative isolate overflow-hidden">
      {/* Background Orbs */}
      <div className="glow-orb w-[500px] h-[500px] bg-brand-500/10 -top-48 -left-24" />
      <div className="glow-orb w-[400px] h-[400px] bg-blue-500/10 top-1/2 -right-24" />

      {/* Hero Section */}
      <section className="pt-20 pb-16 sm:pt-32 sm:pb-24">
        <div className="text-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="premium-badge text-brand-400 mb-6">
              <Zap size={12} className="mr-1" /> Next-Gen Quantitative Platform
            </span>
            <h1 className="text-4xl sm:text-7xl font-bold tracking-tight text-white mb-8 text-balance">
              掌握市場動脈 <br />
              <span className="heading-gradient">量化分析從未如此簡單</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-zinc-400 mb-10 text-balance">
              結合 AI 技術分析與多維度策略回測，為您打造雙市場（美股、台股）
              跨緯度的投資視覺化體驗。
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link to="/dashboard" className="btn-premium px-8 py-3.5 text-base">
                立即開始 <ArrowRight size={18} />
              </Link>
              <Link to="/screener" className="btn-premium-outline px-8 py-3.5 text-base">
                查看選股器
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats / Proof */}
      <section className="py-12 border-y border-white/[0.05] bg-white/[0.01]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto px-4">
          {[
            { label: '覆蓋標的', value: '10,000+' },
            { label: '策略參數', value: '500+' },
            { label: '即時數據', value: '60s' },
            { label: '準確度', value: '99.9%' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-xs text-zinc-500 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-4 bg-zinc-950/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">核心優勢</h2>
            <p className="text-zinc-500">專為現代投資者打造的自動化分析工具</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { 
                icon: <Globe className="text-blue-400" />, 
                title: '跨市場支援', 
                desc: '完整整合台股與美股，省去切換不同平台的麻煩。' 
              },
              { 
                icon: <Zap className="text-amber-400" />, 
                title: '左右開弓策略', 
                desc: '獨家 RSI 超賣抄底與動能突破雙重篩選邏輯。' 
              },
              { 
                icon: <BarChart3 className="text-brand-400" />, 
                title: '期權盈虧視覺化', 
                desc: '精準預測期權策略獲利區間與 Greeks 風險因子。' 
              },
            ].map((f, i) => (
              <motion.div
                key={i}
                whileHover={{ y: -5 }}
                className="glass-card p-8 border-white/[0.05] hover:border-brand-500/20 transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-white/[0.03] flex items-center justify-center mb-6 border border-white/[0.05]">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{f.title}</h3>
                <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
