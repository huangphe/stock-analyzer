"""
股票資料抓取服務
- 美股：yfinance
- 台股：TWSE OpenAPI + twstock
"""

import yfinance as yf
import requests
import pandas as pd
import logging
import time
import random
from datetime import datetime, date
from typing import Optional, List
from cachetools import TTLCache, cached
import threading
from core.config import settings

logger = logging.getLogger(__name__)

# 簡易記憶體快取（正式環境可換 Redis）
_cache_lock = threading.Lock()
_quote_cache = TTLCache(maxsize=500, ttl=60)      # 報價快取 1 分鐘
_history_cache = TTLCache(maxsize=200, ttl=300)    # 歷史快取 5 分鐘
_tw_cache = TTLCache(maxsize=300, ttl=60)          # 台股快取 1 分鐘

# 限制同時打 Yahoo Finance 的並發數，避免 429
_yf_semaphore = threading.Semaphore(2)

_RATE_LIMIT_ERRORS = ("429", "Too Many Requests", "Expecting value", "JSONDecodeError", "json")


# ─────────────────────────────────────────
# 美股 (Finnhub 主 / yfinance 備援)
# ─────────────────────────────────────────

FINNHUB_BASE = "https://finnhub.io/api/v1"


def _finnhub_get(path: str, params: dict) -> dict:
    """呼叫 Finnhub API"""
    params["token"] = settings.FINNHUB_API_KEY
    resp = requests.get(f"{FINNHUB_BASE}{path}", params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


class USStockFetcher:
    """美股資料抓取"""

    @staticmethod
    def _quote_via_finnhub(symbol: str) -> dict:
        """Finnhub 即時報價 + 公司名稱"""
        sym = symbol.upper()
        quote_data = _finnhub_get("/quote", {"symbol": sym})
        # c=current, d=change, dp=change%, h=high, l=low, o=open, pc=prev_close
        if not quote_data.get("c"):
            raise ValueError(f"Finnhub 無 {sym} 資料")

        # 取公司名稱（另一支 API，有快取）
        name = sym
        try:
            profile = _finnhub_get("/stock/profile2", {"symbol": sym})
            name = profile.get("name", sym)
        except Exception:
            pass

        return {
            "symbol": sym,
            "market": "US",
            "name": name,
            "price": quote_data.get("c", 0),
            "change": quote_data.get("d", 0),
            "change_pct": quote_data.get("dp", 0),
            "volume": 0,  # Finnhub quote endpoint 不含 volume
            "open": quote_data.get("o", 0),
            "high": quote_data.get("h", 0),
            "low": quote_data.get("l", 0),
            "prev_close": quote_data.get("pc", 0),
            "market_cap": None,
            "pe_ratio": None,
            "timestamp": datetime.now().isoformat(),
        }

    @staticmethod
    def _quote_via_yfinance(symbol: str) -> dict:
        """yfinance 備援報價：用 history() 取代 info()，大幅降低 429 機率"""
        with _yf_semaphore:
            ticker = yf.Ticker(symbol.upper())
            # history 比 info 少打很多請求，不易被限流
            hist = ticker.history(period="5d", interval="1d")

        if hist.empty:
            raise ValueError(f"yfinance 無 {symbol} 歷史資料")

        latest = hist.iloc[-1]
        prev = hist.iloc[-2] if len(hist) >= 2 else None
        price = round(float(latest["Close"]), 4)
        prev_close = round(float(prev["Close"]), 4) if prev is not None else 0.0
        change = round(price - prev_close, 4) if prev_close else 0.0
        change_pct = round(change / prev_close * 100, 2) if prev_close else 0.0

        return {
            "symbol": symbol.upper(),
            "market": "US",
            "name": symbol.upper(),
            "price": price,
            "change": change,
            "change_pct": change_pct,
            "volume": int(latest.get("Volume", 0)),
            "open": round(float(latest["Open"]), 4),
            "high": round(float(latest["High"]), 4),
            "low": round(float(latest["Low"]), 4),
            "prev_close": prev_close,
            "market_cap": None,
            "pe_ratio": None,
            "timestamp": datetime.now().isoformat(),
        }

    @staticmethod
    def get_quote(symbol: str) -> dict:
        """取得美股即時報價（Finnhub 主，yfinance 備援）"""
        cache_key = f"us_quote_{symbol.upper()}"
        with _cache_lock:
            if cache_key in _quote_cache:
                return _quote_cache[cache_key]

        # 有 Finnhub key 時優先使用
        if settings.FINNHUB_API_KEY:
            try:
                quote = USStockFetcher._quote_via_finnhub(symbol)
                with _cache_lock:
                    _quote_cache[cache_key] = quote
                return quote
            except Exception as e:
                logger.warning(f"Finnhub 失敗，改用 yfinance：{e}")

        # 備援：yfinance
        try:
            quote = USStockFetcher._quote_via_yfinance(symbol)
            with _cache_lock:
                _quote_cache[cache_key] = quote
            return quote
        except Exception as e:
            logger.error(f"美股報價抓取失敗 {symbol}: {e}")
            raise ValueError(f"無法取得 {symbol} 報價：{str(e)}")

    _PERIOD_DAYS = {
        "1mo": 30, "3mo": 90, "6mo": 180,
        "1y": 365, "2y": 730, "5y": 1825,
    }
    _INTERVAL_MAP = {"1d": "D", "1wk": "W", "1mo": "M"}

    _YAHOO_HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }

    @staticmethod
    def _history_via_yahoo_direct(symbol: str, period: str, interval: str) -> List[dict]:
        """直接呼叫 Yahoo Finance v8 chart API（繞過 yfinance library）"""
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol.upper()}"
        params = {"interval": interval, "range": period, "includePrePost": "false"}
        resp = requests.get(
            url, headers=USStockFetcher._YAHOO_HEADERS,
            params=params, timeout=15
        )
        resp.raise_for_status()
        data = resp.json()

        result = data.get("chart", {}).get("result")
        if not result:
            raise ValueError(f"Yahoo chart API 無資料: {symbol}")

        r = result[0]
        timestamps = r.get("timestamp", [])
        ohlcv = r.get("indicators", {}).get("quote", [{}])[0]

        bars = []
        for i, ts in enumerate(timestamps):
            try:
                dt = datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
                bars.append({
                    "date": dt,
                    "open": round(float(ohlcv["open"][i] or 0), 4),
                    "high": round(float(ohlcv["high"][i] or 0), 4),
                    "low": round(float(ohlcv["low"][i] or 0), 4),
                    "close": round(float(ohlcv["close"][i] or 0), 4),
                    "volume": int(ohlcv["volume"][i] or 0),
                })
            except (TypeError, IndexError):
                continue
        return bars

    @staticmethod
    def get_history(
        symbol: str,
        period: str = "3mo",
        interval: str = "1d",
    ) -> List[dict]:
        """取得美股歷史 K 線（Yahoo v8 直連 → yfinance 備援）"""
        cache_key = f"us_hist_{symbol}_{period}_{interval}"
        with _cache_lock:
            if cache_key in _history_cache:
                return _history_cache[cache_key]

        # 主：Yahoo Finance v8 API 直連
        for attempt in range(3):
            try:
                bars = USStockFetcher._history_via_yahoo_direct(symbol, period, interval)
                if bars:
                    with _cache_lock:
                        _history_cache[cache_key] = bars
                    return bars
            except Exception as e:
                if attempt < 2:
                    time.sleep(2 ** attempt + random.uniform(0.5, 1.5))
                else:
                    logger.warning(f"Yahoo v8 直連失敗，改用 yfinance: {e}")

        # 備援：yfinance
        try:
            with _yf_semaphore:
                ticker = yf.Ticker(symbol.upper())
                df = ticker.history(period=period, interval=interval)

            if df.empty:
                return []

            bars = []
            for idx, row in df.iterrows():
                bars.append({
                    "date": idx.strftime("%Y-%m-%d %H:%M") if interval != "1d" else idx.strftime("%Y-%m-%d"),
                    "open": round(float(row["Open"]), 4),
                    "high": round(float(row["High"]), 4),
                    "low": round(float(row["Low"]), 4),
                    "close": round(float(row["Close"]), 4),
                    "volume": int(row["Volume"]),
                })

            with _cache_lock:
                _history_cache[cache_key] = bars
            return bars

        except Exception as e:
            logger.error(f"美股歷史抓取失敗 {symbol}: {e}")
            raise ValueError(f"無法取得 {symbol} 歷史資料：{str(e)}")



    @staticmethod
    def get_options_chain(symbol: str, expiry: Optional[str] = None) -> dict:
        """取得美股期權鏈 (使用 yfinance 抓取)"""
        try:
            ticker = yf.Ticker(symbol.upper())
            expiry_dates = ticker.options

            if not expiry_dates:
                raise ValueError(f"{symbol} 無可用期權資料")

            target_expiry = expiry if expiry in expiry_dates else expiry_dates[0]

            # yfinance 已經升級，通常可以直接取得 chain
            chain = ticker.option_chain(target_expiry)
            
            # 使用更穩定的 get_quote 取得標的價格
            try:
                quote_data = USStockFetcher.get_quote(symbol)
                underlying_price = quote_data.get("price", 0)
            except Exception:
                underlying_price = ticker.fast_info.get("last_price") or 0

            def process_chain(df: pd.DataFrame, opt_type: str) -> List[dict]:
                result = []
                for _, row in df.iterrows():
                    result.append({
                        "symbol": str(row.get("contractSymbol", "")),
                        "expiry": target_expiry,
                        "strike": float(row["strike"]),
                        "option_type": opt_type,
                        "last_price": float(row.get("lastPrice", 0)),
                        "bid": float(row.get("bid", 0)),
                        "ask": float(row.get("ask", 0)),
                        "volume": int(row.get("volume", 0) or 0),
                        "open_interest": int(row.get("openInterest", 0) or 0),
                        "implied_volatility": round(float(row.get("impliedVolatility", 0)), 4),
                    })
                return result

            return {
                "symbol": symbol.upper(),
                "underlying_price": underlying_price,
                "expiry_dates": list(expiry_dates),
                "calls": process_chain(chain.calls, "call"),
                "puts": process_chain(chain.puts, "put"),
            }

        except Exception as e:
            logger.error(f"期權鏈抓取失 {symbol}: {e}")
            raise ValueError(f"無法取得 {symbol} 期權資料：{str(e)}")


# ─────────────────────────────────────────
# 台股 (TWSE OpenAPI)
# ─────────────────────────────────────────

TWSE_BASE = "https://openapi.twse.com.tw/v1"
TPEX_BASE = "https://www.tpex.org.tw/openapi/v1"


class TWStockFetcher:
    """台股資料抓取（使用 TWSE OpenAPI）"""

    @staticmethod
    def _get_twse_realtime() -> dict:
        """取得台股即時行情（所有股票）"""
        cache_key = "tw_realtime_all"
        with _cache_lock:
            if cache_key in _tw_cache:
                return _tw_cache[cache_key]

        try:
            url = f"{TWSE_BASE}/exchangeReport/STOCK_DAY_ALL"
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()

            # 建立 symbol → data 的映射
            mapping = {}
            for item in data:
                code = item.get("Code", "")
                if code:
                    mapping[code] = item

            with _cache_lock:
                _tw_cache[cache_key] = mapping
            return mapping

        except Exception as e:
            logger.warning(f"TWSE 即時行情抓取失敗: {e}")
            return {}

    @staticmethod
    def get_quote(symbol: str) -> dict:
        """取得台股報價"""
        # 台股代號通常為 4 位數字
        code = symbol.replace(".TW", "").upper()
        cache_key = f"tw_quote_{code}"

        with _cache_lock:
            if cache_key in _quote_cache:
                return _quote_cache[cache_key]

        # 優先：STOCK_DAY_ALL（一次取全部台股，快取 1 分鐘，週末也有資料）
        try:
            all_data = TWStockFetcher._get_twse_realtime()
            if code in all_data:
                item = all_data[code]

                def _f(val: str) -> float:
                    try:
                        return float(str(val).replace(",", ""))
                    except Exception:
                        return 0.0

                close_price = _f(item.get("ClosingPrice") or item.get("收盤價", 0))
                change_val = _f(item.get("Change") or item.get("漲跌價差", 0))
                prev_close = round(close_price - change_val, 2) if close_price else 0.0
                change_pct = round(change_val / prev_close * 100, 2) if prev_close else 0.0

                quote = {
                    "symbol": code,
                    "market": "TW",
                    "name": item.get("Name") or item.get("證券名稱", code),
                    "price": close_price,
                    "change": change_val,
                    "change_pct": change_pct,
                    "volume": int(_f(item.get("TradeVolume") or item.get("成交股數", 0))),
                    "open": _f(item.get("OpeningPrice") or item.get("開盤價", 0)),
                    "high": _f(item.get("HighestPrice") or item.get("最高價", 0)),
                    "low": _f(item.get("LowestPrice") or item.get("最低價", 0)),
                    "prev_close": prev_close,
                    "market_cap": None,
                    "pe_ratio": None,
                    "timestamp": datetime.now().isoformat(),
                }

                if close_price > 0:
                    with _cache_lock:
                        _quote_cache[cache_key] = quote
                    return quote

        except Exception as e:
            logger.warning(f"TWSE STOCK_DAY_ALL 失敗 {code}: {e}")

        # 次選：STOCK_DAY 當月資料
        try:
            url = f"{TWSE_BASE}/exchangeReport/STOCK_DAY"
            month_str = date.today().strftime("%Y%m01")
            params = {"response": "json", "date": month_str, "stockNo": code}
            resp = requests.get(url, params=params, timeout=10)
            data = resp.json()

            if data and "data" in data and data["data"]:
                latest = data["data"][-1]
                prev = data["data"][-2] if len(data["data"]) >= 2 else None
                close_price = float(latest[6].replace(",", ""))
                prev_close = float(prev[6].replace(",", "")) if prev else 0.0
                change = round(close_price - prev_close, 2) if prev else 0.0
                change_pct = round(change / prev_close * 100, 2) if prev_close else 0.0

                quote = {
                    "symbol": code,
                    "market": "TW",
                    "name": data.get("title", code).split(" ")[-1],
                    "price": close_price,
                    "change": change,
                    "change_pct": change_pct,
                    "volume": int(latest[1].replace(",", "")),
                    "open": float(latest[3].replace(",", "")),
                    "high": float(latest[4].replace(",", "")),
                    "low": float(latest[5].replace(",", "")),
                    "prev_close": prev_close,
                    "market_cap": None,
                    "pe_ratio": None,
                    "timestamp": datetime.now().isoformat(),
                }
                with _cache_lock:
                    _quote_cache[cache_key] = quote
                return quote

        except Exception as e:
            logger.error(f"台股 STOCK_DAY 失敗 {code}: {e}")

        raise ValueError(f"無法取得台股 {code} 報價")

    @staticmethod
    def get_history(
        symbol: str,
        period: str = "3mo",
        interval: str = "1d",
    ) -> List[dict]:
        """取得台股歷史 K 線（Yahoo Finance，代號加 .TW 後綴）"""
        code = symbol.replace(".TW", "")
        cache_key = f"tw_hist_{code}_{period}_{interval}"
        with _cache_lock:
            if cache_key in _history_cache:
                return _history_cache[cache_key]

        bars = USStockFetcher.get_history(f"{code}.TW", period=period, interval=interval)
        if bars:
            with _cache_lock:
                _history_cache[cache_key] = bars
        return bars

    @staticmethod
    def get_tw_options_chain(symbol: str) -> dict:
        """
        台指期選擇權資料（台灣期交所 TAIFEX）
        注意：台股個股選擇權流動性較低，主要以台指選擇權（TXO）為主
        """
        # 台指選擇權走 TAIFEX API（需另行申請或使用第三方）
        # 此處使用 yfinance 作為備援（僅適用於有在美國上市的台股 ADR）
        raise NotImplementedError(
            "台指期選擇權需串接 TAIFEX API，"
            "請至 https://www.taifex.com.tw 取得資料授權"
        )
