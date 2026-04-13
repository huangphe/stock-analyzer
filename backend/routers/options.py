"""
期權 API 路由
GET  /api/options/{symbol}/chain       - 期權鏈
POST /api/options/greeks               - 計算 Greeks
POST /api/options/iv                   - 反推隱含波動率
"""

from fastapi import APIRouter, HTTPException, Query
from models.schemas import GreeksRequest, GreeksResponse, OptionsChainResponse, OptionContract
from services.data_fetcher import USStockFetcher
from services.options_math import BlackScholes
from typing import Optional
import logging
import datetime

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{symbol}/chain", response_model=OptionsChainResponse)
async def get_options_chain(
    symbol: str,
    expiry: Optional[str] = Query(None, description="到期日 YYYY-MM-DD，不填則取最近一個"),
):
    """取得美股期權鏈（含所有履約價）"""
    try:
        data = USStockFetcher.get_options_chain(symbol, expiry)

        # 補充 Greeks（yfinance 不提供，我們自行計算）
        underlying = data["underlying_price"]
        target_expiry = data["calls"][0]["expiry"] if data["calls"] else expiry or ""

        try:
            expiry_dt = datetime.date.fromisoformat(target_expiry)
            T = max((expiry_dt - datetime.date.today()).days / 365, 1 / 365)
        except Exception:
            T = 30 / 365

        def enrich_with_greeks(contracts: list, opt_type: str) -> list:
            enriched = []
            for c in contracts:
                iv = c["implied_volatility"] if c["implied_volatility"] > 0 else 0.30
                g = BlackScholes.greeks(
                    S=underlying, K=c["strike"], T=T,
                    r=0.053, sigma=iv, option_type=opt_type
                )
                enriched.append(OptionContract(
                    **c,
                    delta=g["delta"],
                    gamma=g["gamma"],
                    theta=g["theta"],
                    vega=g["vega"],
                    rho=g["rho"],
                ))
            return enriched

        return OptionsChainResponse(
            symbol=data["symbol"],
            underlying_price=data["underlying_price"],
            expiry_dates=data["expiry_dates"],
            calls=enrich_with_greeks(data["calls"], "call"),
            puts=enrich_with_greeks(data["puts"], "put"),
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"期權鏈錯誤: {e}")
        raise HTTPException(status_code=500, detail="取得期權鏈失敗")


@router.post("/greeks", response_model=GreeksResponse)
async def calculate_greeks(req: GreeksRequest):
    """計算 Black-Scholes Greeks"""
    try:
        result = BlackScholes.greeks(
            S=req.underlying_price,
            K=req.strike,
            T=req.time_to_expiry,
            r=req.risk_free_rate,
            sigma=req.volatility,
            option_type=req.option_type.value,
            q=req.dividend_yield,
        )
        return GreeksResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"計算錯誤：{str(e)}")


@router.post("/iv")
async def calculate_implied_volatility(
    market_price: float,
    underlying_price: float,
    strike: float,
    days_to_expiry: int,
    option_type: str = "call",
    risk_free_rate: float = 0.053,
):
    """反推隱含波動率 (Implied Volatility)"""
    T = max(days_to_expiry / 365, 1 / 365)
    iv = BlackScholes.implied_volatility(
        market_price=market_price,
        S=underlying_price,
        K=strike,
        T=T,
        r=risk_free_rate,
        option_type=option_type,
    )
    if iv is None:
        raise HTTPException(status_code=400, detail="無法計算 IV，請確認輸入的期權價格是否合理")
    return {
        "implied_volatility": iv,
        "implied_volatility_pct": round(iv * 100, 2),
        "days_to_expiry": days_to_expiry,
    }
