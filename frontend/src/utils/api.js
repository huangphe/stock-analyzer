import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://127.0.0.1:8001/api',
  timeout: 15000,
})

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.detail || err.message || '請求失敗'
    return Promise.reject(new Error(msg))
  }
)

// ── 股票 ──────────────────────────────────
export const stockApi = {
  getQuote: (market, symbol) =>
    api.get(`/stocks/${market}/${symbol}/quote`),

  getHistory: (market, symbol, period = '3mo', interval = '1d') =>
    api.get(`/stocks/${market}/${symbol}/history`, { params: { period, interval } }),

  search: (q, market) =>
    api.get('/stocks/search', { params: { q, market } }),

  scanScreener: (req) =>
    api.post('/screener/scan', req, { timeout: 60000 }),
}

// ── 期權 ──────────────────────────────────
export const optionsApi = {
  getChain: (symbol, expiry) =>
    api.get(`/options/${symbol}/chain`, { params: expiry ? { expiry } : {} }),

  calculateGreeks: (data) =>
    api.post('/options/greeks', data),

  calculateIV: (params) =>
    api.post('/options/iv', null, { params }),
}

// ── 策略 ──────────────────────────────────
export const strategyApi = {
  listTypes: () =>
    api.get('/strategies/types'),

  getTemplate: (strategy_type, underlying_price, expiry) =>
    api.get('/strategies/template', { params: { strategy_type, underlying_price, expiry } }),

  analyze: (data) =>
    api.post('/strategies/analyze', data),

  compare: (symbol, market, underlying_price, expiry) =>
    api.get('/strategies/compare', { params: { symbol, market, underlying_price, expiry } }),
}

export default api
