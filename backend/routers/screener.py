"""
選股篩選器 API
POST /api/screener/scan
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from services.data_fetcher import USStockFetcher, TWStockFetcher
from services.technical import analyze_stock
from services.market_scanner import TWMarketScanner
from slowapi import Limiter
from slowapi.util import get_remote_address
import logging
import concurrent.futures

router = APIRouter()
logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

# 內建篩選宇宙
DEFAULT_US = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "SPY", "QQQ",
    "AMD", "INTC", "ORCL", "CRM", "ADBE", "NFLX", "DIS", "V", "JPM", "BAC", "WMT",
]
DEFAULT_TW = [
    "2330", "2317", "2454", "2308", "2881", "0050", "0056",
    "2412", "2002", "2382", "3711", "2886", "2891", "1301", "2303",
]


class StockItem(BaseModel):
    market: str  # "US" or "TW"
    symbol: str


class ScanRequest(BaseModel):
    stocks: List[StockItem] = []
    include_us_universe: bool = False
    include_tw_universe: bool = False
    min_left_score: int = 1
    min_right_score: int = 1
    strategy: Optional[str] = None  # e.g., "tw_momentum"


def _fetch_and_analyze(market: str, symbol: str, include_monthly: bool = False):
    try:
        # 1. 抓取日線資料
        if market == "US":
            bars = USStockFetcher.get_history(symbol, period="6mo", interval="1d")
            quote = USStockFetcher.get_quote(symbol)
        else:
            bars = TWStockFetcher.get_history(symbol, period="6mo", interval="1d")
            quote = TWStockFetcher.get_quote(symbol)

        if not bars:
            return None

        # 2. 先進行基礎分析 (不含月線)
        signals = analyze_stock(bars)
        if not signals:
            return None

        # 3. 如果需要策略分析 (如強勢股)，且通過了初選，才抓月線（只對台股）
        if include_monthly and market == "TW" and signals.get("is_momentum_candidate"):
            logger.info(f"通過初選，抓取月線: {symbol}")
            monthly_bars = TWStockFetcher.get_history(symbol, period="3y", interval="1mo")
            if monthly_bars:
                # 重新執行完整分析 (含月線)
                signals = analyze_stock(bars, monthly_bars=monthly_bars)

        return {
            "market": market,
            "symbol": symbol,
            "name": quote.get("name", symbol),
            "price": quote.get("price") or signals["price"],
            "change_pct": quote.get("change_pct"),
            **signals,
        }
    except Exception as e:
        logger.warning(f"Screener 抓取失敗 {market}:{symbol}: {e}")
        return None


@router.post("/scan")
@limiter.limit("10/minute")
async def scan_stocks(request: Request, req: ScanRequest):
    """掃描股票並回傳左側/右側交易信號"""
    stocks_to_scan = list(req.stocks)
    is_momentum_mode = (req.strategy == "tw_momentum")

    # 特殊策略模式：台股強勢股 Discovery
    if is_momentum_mode:
        universe_set = set(TWMarketScanner.get_tw_universe())
        # 主池：TW_UNIVERSE
        for sym in universe_set:
            stocks_to_scan.append(StockItem(market="TW", symbol=sym))
        # 補充：近 10 天漲停股中，主池未涵蓋的新興股（來自 limit_up_log.json）
        rolling_limit_up = TWMarketScanner.get_rolling_limit_up(days=10)
        extra = [s for s in rolling_limit_up if s not in universe_set]
        for sym in extra[:30]:  # 最多補充 30 支
            stocks_to_scan.append(StockItem(market="TW", symbol=sym))

    if req.include_us_universe:
        for sym in DEFAULT_US:
            stocks_to_scan.append(StockItem(market="US", symbol=sym))
    if req.include_tw_universe:
        for sym in DEFAULT_TW:
            stocks_to_scan.append(StockItem(market="TW", symbol=sym))

    # 去重
    seen: set = set()
    unique = []
    for s in stocks_to_scan:
        key = f"{s.market}:{s.symbol.upper()}"
        if key not in seen:
            seen.add(key)
            unique.append(StockItem(market=s.market, symbol=s.symbol.upper()))

    if not unique:
        raise HTTPException(status_code=400, detail="請提供至少一檔股票或選擇內建策略")

    results = []
    # 增加併發數以加快速度
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(_fetch_and_analyze, s.market, s.symbol, is_momentum_mode): s for s in unique
        }
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result:
                if is_momentum_mode:
                    if result.get("is_momentum_candidate"):
                        results.append(result)
                else:
                    results.append(result)

    left_side = sorted(
        [r for r in results if r["left_score"] >= req.min_left_score],
        key=lambda x: x["left_score"],
        reverse=True,
    )
    right_side = sorted(
        [r for r in results if r["right_score"] >= req.min_right_score],
        key=lambda x: x["right_score"],
        reverse=True,
    )

    return {
        "total_scanned": len(results),
        "left_side": left_side,
        "right_side": right_side,
    }
