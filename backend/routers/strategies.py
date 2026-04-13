"""
期權策略 API 路由
GET  /api/strategies/types             - 所有策略類型說明
GET  /api/strategies/template          - 取得策略模板腳位
POST /api/strategies/analyze           - 分析策略損益
"""

from fastapi import APIRouter, HTTPException, Query
from models.schemas import (
    StrategyType, StrategyAnalysisRequest, StrategyAnalysisResponse, Market
)
from services.strategy_builder import StrategyBuilder
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/types")
async def list_strategy_types():
    """列出所有支援的策略類型及說明"""
    result = []
    for stype, desc in StrategyBuilder.STRATEGY_DESCRIPTIONS.items():
        result.append({
            "type": stype,
            **desc
        })
    return {"strategies": result}


@router.get("/template")
async def get_strategy_template(
    strategy_type: StrategyType,
    underlying_price: float = Query(..., gt=0),
    expiry: str = Query(..., description="到期日 YYYY-MM-DD"),
):
    """取得策略建議腳位模板"""
    try:
        template = StrategyBuilder.get_strategy_template(
            strategy_type=strategy_type,
            underlying_price=underlying_price,
            expiry=expiry,
        )
        return template
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/analyze", response_model=StrategyAnalysisResponse)
async def analyze_strategy(request: StrategyAnalysisRequest):
    """
    分析期權策略組合
    - 計算到期損益曲線
    - 找出損益平衡點
    - 計算最大獲利 / 最大虧損
    - 計算組合 Greeks
    """
    if not request.legs:
        raise HTTPException(status_code=400, detail="至少需要一個腳位 (leg)")

    try:
        result = StrategyBuilder.analyze(request)
        return result
    except Exception as e:
        logger.error(f"策略分析錯誤: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"分析失敗：{str(e)}")


@router.get("/compare")
async def compare_strategies(
    symbol: str,
    market: Market = Market.US,
    underlying_price: float = Query(..., gt=0),
    expiry: str = Query(...),
):
    """
    快速比較各策略在相同標的下的特性
    （最大獲利、最大損失、損益平衡點範圍）
    """
    from models.schemas import StrategyAnalysisRequest, StrategyLeg, OptionType
    from dateutil import parser as dt_parser
    import datetime

    # 基本模板：以 ATM 為基準
    S = underlying_price
    atm_strike = round(S, 0)
    otm_call = round(S * 1.05, 0)
    otm_put = round(S * 0.95, 0)
    otm_call_far = round(S * 1.10, 0)
    otm_put_far = round(S * 0.90, 0)

    # 假設 30% IV 下的大約權利金
    try:
        expiry_dt = dt_parser.parse(expiry).date()
        T = max((expiry_dt - datetime.date.today()).days / 365, 1 / 365)
    except Exception:
        T = 30 / 365

    from services.options_math import BlackScholes
    r = 0.053
    iv = 0.30

    atm_call_px = BlackScholes.price(S, atm_strike, T, r, iv, "call")
    atm_put_px = BlackScholes.price(S, atm_strike, T, r, iv, "put")
    otm_call_px = BlackScholes.price(S, otm_call, T, r, iv, "call")
    otm_put_px = BlackScholes.price(S, otm_put, T, r, iv, "put")
    otm_call_far_px = BlackScholes.price(S, otm_call_far, T, r, iv, "call")
    otm_put_far_px = BlackScholes.price(S, otm_put_far, T, r, iv, "put")

    simple_strategies = [
        (StrategyType.LONG_CALL, [StrategyLeg(option_type=OptionType.CALL, action="buy", strike=atm_strike, expiry=expiry, premium=atm_call_px)]),
        (StrategyType.LONG_PUT, [StrategyLeg(option_type=OptionType.PUT, action="buy", strike=atm_strike, expiry=expiry, premium=atm_put_px)]),
        (StrategyType.STRADDLE, [
            StrategyLeg(option_type=OptionType.CALL, action="buy", strike=atm_strike, expiry=expiry, premium=atm_call_px),
            StrategyLeg(option_type=OptionType.PUT, action="buy", strike=atm_strike, expiry=expiry, premium=atm_put_px),
        ]),
        (StrategyType.STRANGLE, [
            StrategyLeg(option_type=OptionType.CALL, action="buy", strike=otm_call, expiry=expiry, premium=otm_call_px),
            StrategyLeg(option_type=OptionType.PUT, action="buy", strike=otm_put, expiry=expiry, premium=otm_put_px),
        ]),
        (StrategyType.BULL_CALL_SPREAD, [
            StrategyLeg(option_type=OptionType.CALL, action="buy", strike=atm_strike, expiry=expiry, premium=atm_call_px),
            StrategyLeg(option_type=OptionType.CALL, action="sell", strike=otm_call, expiry=expiry, premium=otm_call_px),
        ]),
        (StrategyType.IRON_CONDOR, [
            StrategyLeg(option_type=OptionType.PUT, action="buy", strike=otm_put_far, expiry=expiry, premium=otm_put_far_px),
            StrategyLeg(option_type=OptionType.PUT, action="sell", strike=otm_put, expiry=expiry, premium=otm_put_px),
            StrategyLeg(option_type=OptionType.CALL, action="sell", strike=otm_call, expiry=expiry, premium=otm_call_px),
            StrategyLeg(option_type=OptionType.CALL, action="buy", strike=otm_call_far, expiry=expiry, premium=otm_call_far_px),
        ]),
    ]

    comparisons = []
    for stype, legs in simple_strategies:
        req = StrategyAnalysisRequest(
            symbol=symbol, market=market,
            underlying_price=S, strategy_type=stype, legs=legs
        )
        result = StrategyBuilder.analyze(req)
        comparisons.append({
            "type": stype,
            "name_zh": StrategyBuilder.STRATEGY_DESCRIPTIONS.get(stype, {}).get("name_zh", stype),
            "market_view": StrategyBuilder.STRATEGY_DESCRIPTIONS.get(stype, {}).get("market_view", ""),
            "net_premium": result.net_premium,
            "max_profit": result.max_profit,
            "max_loss": result.max_loss,
            "breakeven_prices": result.breakeven_prices,
            "net_delta": result.net_delta,
        })

    return {
        "symbol": symbol,
        "underlying_price": S,
        "expiry": expiry,
        "assumed_iv": iv,
        "comparisons": comparisons,
    }
