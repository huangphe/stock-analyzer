"""
選股篩選器 API
POST /api/screener/scan
POST /api/screener/scan/stream  (SSE 即時進度)
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from services.data_fetcher import USStockFetcher, TWStockFetcher
from services.technical import analyze_stock
from services.market_scanner import TWMarketScanner
from slowapi import Limiter
from slowapi.util import get_remote_address
import logging
import concurrent.futures
import json

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
    strategy: Optional[str] = None  # "tw_momentum" | "us_momentum" | "rsi_oversold"
    notify_telegram: bool = False


def _fetch_and_analyze(market: str, symbol: str, include_monthly: bool = False):
    try:
        if market == "US":
            bars = USStockFetcher.get_history(symbol, period="6mo", interval="1d")
            quote = USStockFetcher.get_quote(symbol)
        else:
            bars = TWStockFetcher.get_history(symbol, period="6mo", interval="1d")
            quote = TWStockFetcher.get_quote(symbol)

        if not bars:
            return None

        signals = analyze_stock(bars, quote=quote)
        if not signals:
            return None

        if include_monthly and market == "TW" and signals.get("is_momentum_candidate"):
            logger.info(f"通過初選，抓取月線: {symbol}")
            monthly_bars = TWStockFetcher.get_history(symbol, period="3y", interval="1mo")
            if monthly_bars:
                signals = analyze_stock(bars, monthly_bars=monthly_bars, quote=quote)

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


def _build_scan_list(req: ScanRequest) -> List[StockItem]:
    """依策略建立去重後的掃描清單"""
    stocks_to_scan = list(req.stocks)
    is_momentum_mode = (req.strategy == "tw_momentum")
    is_us_momentum = (req.strategy == "us_momentum")
    is_oversold = (req.strategy == "rsi_oversold")

    if is_momentum_mode:
        universe_set = set(TWMarketScanner.get_tw_universe())
        for sym in universe_set:
            stocks_to_scan.append(StockItem(market="TW", symbol=sym))
        rolling_limit_up = TWMarketScanner.get_rolling_limit_up(days=10)
        extra = [s for s in rolling_limit_up if s not in universe_set]
        for sym in extra[:30]:
            stocks_to_scan.append(StockItem(market="TW", symbol=sym))

    if is_us_momentum:
        for sym in DEFAULT_US:
            stocks_to_scan.append(StockItem(market="US", symbol=sym))

    if is_oversold:
        for sym in DEFAULT_US:
            stocks_to_scan.append(StockItem(market="US", symbol=sym))
        for sym in DEFAULT_TW:
            stocks_to_scan.append(StockItem(market="TW", symbol=sym))

    if req.include_us_universe:
        for sym in DEFAULT_US:
            stocks_to_scan.append(StockItem(market="US", symbol=sym))
    if req.include_tw_universe:
        for sym in DEFAULT_TW:
            stocks_to_scan.append(StockItem(market="TW", symbol=sym))

    seen: set = set()
    unique = []
    for s in stocks_to_scan:
        key = f"{s.market}:{s.symbol.upper()}"
        if key not in seen:
            seen.add(key)
            unique.append(StockItem(market=s.market, symbol=s.symbol.upper()))

    return unique


def _build_response(results: list, req: ScanRequest) -> dict:
    """從原始結果建立最終 API 回應"""
    is_momentum_mode = (req.strategy == "tw_momentum")
    is_us_momentum = (req.strategy == "us_momentum")
    is_oversold = (req.strategy == "rsi_oversold")

    filtered = []
    for r in results:
        if is_momentum_mode:
            if r.get("is_momentum_candidate"):
                filtered.append(r)
        elif is_us_momentum:
            if r.get("is_us_momentum_candidate"):
                filtered.append(r)
        elif is_oversold:
            if r.get("is_oversold_candidate"):
                filtered.append(r)
        else:
            filtered.append(r)

    left_side = sorted(
        [r for r in filtered if r["left_score"] >= req.min_left_score],
        key=lambda x: x["left_score"],
        reverse=True,
    )
    right_side = sorted(
        [r for r in filtered if r["right_score"] >= req.min_right_score],
        key=lambda x: x["right_score"],
        reverse=True,
    )

    return {
        "total_scanned": len(results),
        "left_side": left_side,
        "right_side": right_side,
    }


@router.post("/scan")
@limiter.limit("10/minute")
async def scan_stocks(request: Request, req: ScanRequest):
    """掃描股票並回傳左側/右側交易信號"""
    unique = _build_scan_list(req)
    if not unique:
        raise HTTPException(status_code=400, detail="請提供至少一檔股票或選擇內建策略")

    is_momentum_mode = (req.strategy == "tw_momentum")
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(_fetch_and_analyze, s.market, s.symbol, is_momentum_mode): s for s in unique
        }
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result:
                results.append(result)

    response_data = _build_response(results, req)

    if req.notify_telegram:
        try:
            from services.notifier import send_telegram, format_screener_result
            msg = format_screener_result(response_data, req.strategy)
            send_telegram(msg)
        except Exception as e:
            logger.warning(f"Telegram 推送失敗: {e}")

    return response_data


@router.post("/scan/stream")
@limiter.limit("10/minute")
async def scan_stocks_stream(request: Request, req: ScanRequest):
    """掃描股票（SSE 即時進度串流）"""
    unique = _build_scan_list(req)
    if not unique:
        raise HTTPException(status_code=400, detail="請提供至少一檔股票或選擇內建策略")

    total = len(unique)
    is_momentum_mode = (req.strategy == "tw_momentum")

    def generate():
        results = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = {
                executor.submit(_fetch_and_analyze, s.market, s.symbol, is_momentum_mode): s
                for s in unique
            }
            for i, future in enumerate(concurrent.futures.as_completed(futures), 1):
                result = future.result()
                if result:
                    results.append(result)
                yield f"data: {json.dumps({'type': 'progress', 'scanned': i, 'total': total})}\n\n"

        final = _build_response(results, req)

        if req.notify_telegram:
            try:
                from services.notifier import send_telegram, format_screener_result
                msg = format_screener_result(final, req.strategy)
                send_telegram(msg)
            except Exception as e:
                logger.warning(f"Telegram 推送失敗: {e}")

        yield f"data: {json.dumps({'type': 'done', **final})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
