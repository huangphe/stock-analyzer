from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from services.data_fetcher import USStockFetcher, TWStockFetcher
from services.technical import calculate_all_indicators, apply_strategy_signals
from services.backtest_engine import BacktestEngine
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class BacktestRequest(BaseModel):
    market: str  # "US" or "TW"
    symbol: str
    strategy: str = "momentum"  # "momentum" | "rsi_oversold"
    period: str = "1y"
    initial_capital: float = 1_000_000
    stop_loss: float = -0.08
    take_profit: float = 0.20

@router.post("/run")
async def run_backtest(req: BacktestRequest):
    """執行歷史回測 API"""
    try:
        # 1. 抓取歷史數據
        if req.market == "US":
            bars = USStockFetcher.get_history(req.symbol, period=req.period, interval="1d")
        else:
            bars = TWStockFetcher.get_history(req.symbol, period=req.period, interval="1d")
            
        if not bars:
            raise HTTPException(status_code=404, detail=f"找不到 {req.symbol} 的歷史數據")

        # 2. 計算指標與訊號
        df_indicators = calculate_all_indicators(bars)
        df_with_signals = apply_strategy_signals(df_indicators, strategy=req.strategy)

        # 3. 執行回測引擎
        engine = BacktestEngine(
            initial_capital=req.initial_capital,
            stop_loss=req.stop_loss,
            take_profit=req.take_profit
        )
        
        result = engine.run(df_with_signals, symbol=req.symbol)
        
        if "error" in result:
            raise HTTPException(status_code=500, detail=result["error"])

        return result

    except Exception as e:
        logger.error(f"回測執行失敗: {str(e)}")
        raise HTTPException(status_code=500, detail=f"回測執行器發生錯誤: {str(e)}")
