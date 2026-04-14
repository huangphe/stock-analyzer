import { lazy, Suspense } from 'react'
import { Routes, Route, NavLink, Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, LineChart, Layers, SlidersHorizontal,
  Menu, X, TrendingUp, Home as HomeIcon, TrendingDown,
} from 'lucide-react'

const Home             = lazy(() => import('./pages/Home'))
const StockAnalysis    = lazy(() => import('./pages/StockAnalysis'))
const OptionsStrategy  = lazy(() => import('./pages/OptionsStrategy'))
const Dashboard        = lazy(() => import('./pages/Dashboard'))
const Screener         = lazy(() => import('./pages/Screener'))
const ContraryIndicator = lazy(() => import('./pages/ContraryIndicator'))

const NAV = [
  { to: '/',           label: '首頁',      icon: HomeIcon, end: true },
  { to: '/dashboard',  label: '總覽',      icon: LayoutDashboard      },
  { to: '/stocks',     label: '股票分析',  icon: LineChart            },
  { to: '/screener',   label: '選股篩選',  icon: SlidersHorizontal    },
  { to: '/options',    label: '期權策略',  icon: Layers               },
  { to: '/contrary',   label: '逆向指標',  icon: TrendingDown         },
]

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-6 h-6 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
    </div>
  )
}

export default function App() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col bg-[#09090b]">

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 h-14 border-b flex items-center px-4"
        style={{ background: 'rgba(9,9,11,0.7)', borderColor: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(16px)' }}
      >
        <div className="max-w-screen-xl mx-auto w-full flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/20 group-hover:scale-110 transition-transform">
                <TrendingUp size={18} className="text-white" />
              </div>
              <span className="text-base font-bold tracking-tight text-white">
                Stock<span className="text-brand-400">Analyzer</span>
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden sm:flex items-center gap-1 ml-6">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 ${
                      isActive
                        ? 'text-white'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={14} />
                      {label}
                      {isActive && (
                        <motion.div
                          layoutId="nav-active"
                          className="absolute inset-0 bg-white/[0.05] border border-white/[0.05] rounded-xl -z-10"
                          transition={{ type: "spring", stiffness: 380, damping: 30 }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-zinc-500 bg-zinc-900/50 px-3 py-1.5 rounded-full border border-white/[0.05]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Market Live</span>
            </div>

            {/* Mobile menu toggle */}
            <button
              className="sm:hidden p-2 rounded-xl bg-white/[0.03] text-zinc-400 hover:text-white transition-colors border border-white/[0.05]"
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="sm:hidden fixed top-14 inset-x-0 z-40 p-4"
          >
            <div
              className="glass-card p-2 space-y-1"
              style={{ background: 'rgba(13,13,16,0.95)' }}
            >
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-brand-600/10 text-brand-400 border border-brand-500/20'
                        : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]'
                    }`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </div>
            <div className="fixed inset-0 -z-10 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Page Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 w-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="h-full"
          >
            <div className="max-w-screen-xl mx-auto px-4 py-8">
              <Suspense fallback={<PageLoader />}>
                <Routes location={location} key={location.pathname}>
                  <Route path="/"         element={<Home />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/stocks"   element={<StockAnalysis />} />
                  <Route path="/screener" element={<Screener />} />
                  <Route path="/options"  element={<OptionsStrategy />} />
                  <Route path="/contrary" element={<ContraryIndicator />} />
                </Routes>
              </Suspense>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t px-4 py-6 text-center" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <p className="text-xs text-zinc-600 mb-2">
          © 2026 StockAnalyzer · 全方位量化分析平台
        </p>
        <p className="text-[10px] text-zinc-700 uppercase tracking-widest">
          資料來源：Yahoo Finance · Tiingo · Twse · Finnhub · 僅供參考，不構成投資建議
        </p>
      </footer>
    </div>
  )
}
