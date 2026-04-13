"""
股票 API 路由
GET /api/stocks/{market}/{symbol}/quote
GET /api/stocks/{market}/{symbol}/history
GET /api/stocks/search
"""

from fastapi import APIRouter, HTTPException, Query
from models.schemas import Market, StockQuote, StockHistoryResponse, HistoricalBar
from services.data_fetcher import USStockFetcher, TWStockFetcher
from typing import Optional
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{market}/{symbol}/quote", response_model=StockQuote)
async def get_stock_quote(market: Market, symbol: str):
    """取得股票即時報價"""
    try:
        if market == Market.US:
            data = USStockFetcher.get_quote(symbol)
        else:
            data = TWStockFetcher.get_quote(symbol)
        return StockQuote(**data)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"股票報價錯誤: {e}")
        raise HTTPException(status_code=500, detail="取得報價失敗，請稍後再試")


@router.get("/{market}/{symbol}/history", response_model=StockHistoryResponse)
async def get_stock_history(
    market: Market,
    symbol: str,
    period: str = Query("3mo", description="時間範圍: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y"),
    interval: str = Query("1d", description="K線週期: 1m, 5m, 15m, 1h, 1d, 1wk, 1mo"),
):
    """取得股票歷史 K 線"""
    try:
        if market == Market.US:
            bars = USStockFetcher.get_history(symbol, period=period, interval=interval)
        else:
            bars = TWStockFetcher.get_history(symbol, period=period, interval=interval)

        return StockHistoryResponse(
            symbol=symbol.upper(),
            market=market,
            interval=interval,
            data=[HistoricalBar(**b) for b in bars],
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"歷史 K 線錯誤: {e}")
        raise HTTPException(status_code=500, detail="取得歷史資料失敗")


@router.get("/search")
async def search_stocks(
    q: str = Query(..., min_length=1, description="搜尋關鍵字"),
    market: Optional[Market] = None,
):
    """搜尋股票代號或名稱（簡易版）"""
    # 常見美股清單（實際可串接 yfinance search 或付費 API）
    us_popular = [
        {"symbol": "AAPL", "name": "Apple Inc.", "market": "US"},
        {"symbol": "MSFT", "name": "Microsoft Corp.", "market": "US"},
        {"symbol": "GOOGL", "name": "Alphabet Inc.", "market": "US"},
        {"symbol": "AMZN", "name": "Amazon.com Inc.", "market": "US"},
        {"symbol": "NVDA", "name": "NVIDIA Corp.", "market": "US"},
        {"symbol": "META", "name": "Meta Platforms", "market": "US"},
        {"symbol": "TSLA", "name": "Tesla Inc.", "market": "US"},
        {"symbol": "SPY", "name": "SPDR S&P 500 ETF", "market": "US"},
        {"symbol": "QQQ", "name": "Invesco QQQ ETF", "market": "US"},
    ]
    # 常見台股
    tw_popular = [
        {"symbol": "2330", "name": "台積電", "market": "TW"},
        {"symbol": "2317", "name": "鴻海", "market": "TW"},
        {"symbol": "2454", "name": "聯發科", "market": "TW"},
        {"symbol": "2308", "name": "台達電", "market": "TW"},
        {"symbol": "2881", "name": "富邦金", "market": "TW"},
        {"symbol": "0050", "name": "元大台灣50 ETF", "market": "TW"},
        {"symbol": "0056", "name": "元大高股息 ETF", "market": "TW"},
    ]

    q_lower = q.lower()
    results = []

    if market != Market.TW:
        results += [s for s in us_popular if q_lower in s["symbol"].lower() or q_lower in s["name"].lower()]
    if market != Market.US:
        results += [s for s in tw_popular if q_lower in s["symbol"] or q_lower in s["name"]]

    return {"query": q, "results": results[:10]}
