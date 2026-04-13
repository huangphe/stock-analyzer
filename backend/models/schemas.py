"""
Pydantic 資料模型定義
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from enum import Enum


# ─────────────────────────────────────────
# 股票相關
# ─────────────────────────────────────────

class Market(str, Enum):
    US = "US"   # 美股
    TW = "TW"   # 台股


class StockQuote(BaseModel):
    symbol: str
    market: Market
    name: str
    price: float
    change: float
    change_pct: float
    volume: int
    open: float
    high: float
    low: float
    prev_close: float
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    timestamp: str


class HistoricalBar(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


class StockHistoryResponse(BaseModel):
    symbol: str
    market: Market
    interval: str
    data: List[HistoricalBar]


# ─────────────────────────────────────────
# 期權相關
# ─────────────────────────────────────────

class OptionType(str, Enum):
    CALL = "call"
    PUT = "put"


class OptionContract(BaseModel):
    symbol: str
    expiry: str               # YYYY-MM-DD
    strike: float
    option_type: OptionType
    last_price: float
    bid: float
    ask: float
    volume: int
    open_interest: int
    implied_volatility: float
    # Greeks
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    rho: Optional[float] = None


class OptionsChainResponse(BaseModel):
    symbol: str
    underlying_price: float
    expiry_dates: List[str]
    calls: List[OptionContract]
    puts: List[OptionContract]


# ─────────────────────────────────────────
# 期權策略組合
# ─────────────────────────────────────────

class StrategyLeg(BaseModel):
    """策略的單一腳位"""
    option_type: OptionType
    action: Literal["buy", "sell"]
    strike: float
    expiry: str
    quantity: int = 1
    premium: float              # 每單位權利金


class StrategyType(str, Enum):
    COVERED_CALL = "covered_call"
    CASH_SECURED_PUT = "cash_secured_put"
    BULL_CALL_SPREAD = "bull_call_spread"
    BEAR_PUT_SPREAD = "bear_put_spread"
    IRON_CONDOR = "iron_condor"
    IRON_BUTTERFLY = "iron_butterfly"
    STRADDLE = "straddle"
    STRANGLE = "strangle"
    LONG_CALL = "long_call"
    LONG_PUT = "long_put"
    CUSTOM = "custom"


class StrategyAnalysisRequest(BaseModel):
    symbol: str
    market: Market = Market.US
    underlying_price: float
    strategy_type: StrategyType
    legs: List[StrategyLeg]
    contract_size: int = 100   # 台股選擇權通常為 1 張


class PnLPoint(BaseModel):
    price: float
    pnl: float
    pnl_pct: float


class StrategyAnalysisResponse(BaseModel):
    strategy_type: StrategyType
    symbol: str
    underlying_price: float
    max_profit: Optional[float]
    max_loss: Optional[float]
    breakeven_prices: List[float]
    net_premium: float          # 正=收權利金, 負=付權利金
    pnl_curve: List[PnLPoint]  # 到期損益曲線
    # 組合 Greeks
    net_delta: float
    net_gamma: float
    net_theta: float
    net_vega: float


# ─────────────────────────────────────────
# Greeks 計算請求
# ─────────────────────────────────────────

class GreeksRequest(BaseModel):
    underlying_price: float = Field(..., gt=0)
    strike: float = Field(..., gt=0)
    time_to_expiry: float = Field(..., gt=0, description="年化到期時間，例如 30天 = 30/365")
    volatility: float = Field(..., gt=0, description="年化波動率，例如 0.25 = 25%")
    risk_free_rate: float = Field(0.053, description="無風險利率")
    option_type: OptionType
    dividend_yield: float = Field(0.0, ge=0)


class GreeksResponse(BaseModel):
    price: float
    delta: float
    gamma: float
    theta: float
    vega: float
    rho: float
    implied_volatility: Optional[float] = None
