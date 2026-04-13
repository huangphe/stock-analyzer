"""
期權策略組合分析模組
支援常見策略自動建立 + 自訂多腳位組合
"""

import numpy as np
from typing import List, Optional
from models.schemas import (
    StrategyType, StrategyAnalysisRequest, StrategyAnalysisResponse,
    PnLPoint, StrategyLeg, OptionType
)
from services.options_math import BlackScholes, OptionsAnalyzer
import logging

logger = logging.getLogger(__name__)


class StrategyBuilder:
    """策略建立與分析引擎"""

    # 預設策略模板（協助前端快速填入腳位）
    STRATEGY_DESCRIPTIONS = {
        StrategyType.COVERED_CALL: {
            "name_zh": "備兌買權 (Covered Call)",
            "description": "持有正股 + 賣出 Call，賺取權利金、降低成本基礎",
            "market_view": "中性偏多",
            "risk": "有限利潤（上方被蓋住），下方仍有股票風險",
        },
        StrategyType.CASH_SECURED_PUT: {
            "name_zh": "現金擔保賣權 (CSP)",
            "description": "持有現金 + 賣出 Put，等待攤低成本買入股票",
            "market_view": "中性偏多",
            "risk": "股票大跌風險（但等同於以更低價買股）",
        },
        StrategyType.BULL_CALL_SPREAD: {
            "name_zh": "多頭價差 (Bull Call Spread)",
            "description": "買入低履約價 Call + 賣出高履約價 Call，成本較低的看多策略",
            "market_view": "看多",
            "risk": "最大損失 = 淨付出權利金",
        },
        StrategyType.BEAR_PUT_SPREAD: {
            "name_zh": "空頭價差 (Bear Put Spread)",
            "description": "買入高履約價 Put + 賣出低履約價 Put，成本較低的看空策略",
            "market_view": "看空",
            "risk": "最大損失 = 淨付出權利金",
        },
        StrategyType.IRON_CONDOR: {
            "name_zh": "鐵兀鷹 (Iron Condor)",
            "description": "賣出 OTM Put + 買入更低 Put + 賣出 OTM Call + 買入更高 Call，4腳位",
            "market_view": "區間盤整",
            "risk": "有限損失，超出區間時虧損",
        },
        StrategyType.IRON_BUTTERFLY: {
            "name_zh": "鐵蝴蝶 (Iron Butterfly)",
            "description": "賣出 ATM Call + 賣出 ATM Put + 買入 OTM Call + 買入 OTM Put",
            "market_view": "極度盤整",
            "risk": "有限損失，但收益區間窄",
        },
        StrategyType.STRADDLE: {
            "name_zh": "跨式 (Straddle)",
            "description": "買入 ATM Call + 買入 ATM Put，預期大幅波動但方向不確定",
            "market_view": "大幅波動",
            "risk": "最大損失 = 兩份權利金，需大幅波動才能獲利",
        },
        StrategyType.STRANGLE: {
            "name_zh": "勒式 (Strangle)",
            "description": "買入 OTM Call + 買入 OTM Put，成本低於 Straddle",
            "market_view": "大幅波動",
            "risk": "最大損失 = 兩份權利金，需更大波動才獲利",
        },
        StrategyType.LONG_CALL: {
            "name_zh": "買入買權 (Long Call)",
            "description": "看多，槓桿方式參與上漲",
            "market_view": "強烈看多",
            "risk": "最大損失 = 權利金",
        },
        StrategyType.LONG_PUT: {
            "name_zh": "買入賣權 (Long Put)",
            "description": "看空或避險",
            "market_view": "看空 / 避險",
            "risk": "最大損失 = 權利金",
        },
    }

    @classmethod
    def analyze(cls, request: StrategyAnalysisRequest) -> StrategyAnalysisResponse:
        """主分析入口"""
        S = request.underlying_price
        contract_size = request.contract_size
        legs_dict = [leg.model_dump() for leg in request.legs]

        # 計算損益曲線
        low = S * 0.55
        high = S * 1.45
        price_range = np.linspace(low, high, 400)
        prices, pnl = OptionsAnalyzer.pnl_at_expiry(
            legs_dict, price_range, S, contract_size
        )

        # 損益平衡點
        breakevens = OptionsAnalyzer.find_breakevens(prices, pnl)

        # 最大獲利 / 最大虧損
        max_profit = float(np.max(pnl))
        max_loss = float(np.min(pnl))

        # 淨權利金
        net_premium = cls._calculate_net_premium(request.legs, contract_size)

        # 組合 Greeks
        net_greeks = cls._calculate_net_greeks(request.legs, S)

        # 格式化損益曲線
        pnl_curve = [
            PnLPoint(
                price=round(float(p), 2),
                pnl=round(float(pl), 2),
                pnl_pct=round(float(pl) / (S * contract_size) * 100, 2) if S > 0 else 0,
            )
            for p, pl in zip(prices[::2], pnl[::2])  # 每隔 2 點取樣，減少資料量
        ]

        return StrategyAnalysisResponse(
            strategy_type=request.strategy_type,
            symbol=request.symbol,
            underlying_price=S,
            max_profit=max_profit if not np.isinf(max_profit) else None,
            max_loss=max_loss if not np.isinf(abs(max_loss)) else None,
            breakeven_prices=breakevens,
            net_premium=net_premium,
            pnl_curve=pnl_curve,
            net_delta=net_greeks.get("delta", 0),
            net_gamma=net_greeks.get("gamma", 0),
            net_theta=net_greeks.get("theta", 0),
            net_vega=net_greeks.get("vega", 0),
        )

    @staticmethod
    def _calculate_net_premium(legs: List[StrategyLeg], contract_size: int) -> float:
        """計算淨權利金（正=收入，負=支出）"""
        total = 0.0
        for leg in legs:
            sign = -1 if leg.action == "buy" else 1  # 買=付出，賣=收入
            total += sign * leg.premium * leg.quantity * contract_size
        return round(total, 2)

    @staticmethod
    def _calculate_net_greeks(
        legs: List[StrategyLeg],
        underlying_price: float,
        r: float = 0.053,
    ) -> dict:
        """計算組合 Greeks（簡化版）"""
        net = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0}
        import datetime

        for leg in legs:
            try:
                expiry_dt = datetime.date.fromisoformat(leg.expiry)
                T = max((expiry_dt - datetime.date.today()).days / 365, 1 / 365)
            except Exception:
                T = 30 / 365

            g = BlackScholes.greeks(
                S=underlying_price,
                K=leg.strike,
                T=T,
                r=r,
                sigma=0.30,  # 預設 30% IV（實際應從市場取得）
                option_type=leg.option_type.value,
            )

            sign = 1 if leg.action == "buy" else -1
            for key in net:
                net[key] += sign * leg.quantity * g.get(key, 0)

        return {k: round(v, 4) for k, v in net.items()}

    @classmethod
    def get_strategy_template(
        cls,
        strategy_type: StrategyType,
        underlying_price: float,
        expiry: str,
    ) -> dict:
        """
        根據策略類型自動產生建議腳位模板
        便於前端預填
        """
        S = underlying_price
        desc = cls.STRATEGY_DESCRIPTIONS.get(strategy_type, {})

        templates = {
            StrategyType.COVERED_CALL: [
                {"option_type": "stock", "action": "buy", "strike": S, "premium": 0, "quantity": 1},
                {"option_type": "call", "action": "sell", "strike": round(S * 1.05, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
            StrategyType.CASH_SECURED_PUT: [
                {"option_type": "put", "action": "sell", "strike": round(S * 0.95, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
            StrategyType.BULL_CALL_SPREAD: [
                {"option_type": "call", "action": "buy", "strike": round(S, 0), "expiry": expiry, "premium": 0, "quantity": 1},
                {"option_type": "call", "action": "sell", "strike": round(S * 1.05, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
            StrategyType.BEAR_PUT_SPREAD: [
                {"option_type": "put", "action": "buy", "strike": round(S, 0), "expiry": expiry, "premium": 0, "quantity": 1},
                {"option_type": "put", "action": "sell", "strike": round(S * 0.95, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
            StrategyType.IRON_CONDOR: [
                {"option_type": "put", "action": "buy", "strike": round(S * 0.90, 0), "expiry": expiry, "premium": 0, "quantity": 1},
                {"option_type": "put", "action": "sell", "strike": round(S * 0.95, 0), "expiry": expiry, "premium": 0, "quantity": 1},
                {"option_type": "call", "action": "sell", "strike": round(S * 1.05, 0), "expiry": expiry, "premium": 0, "quantity": 1},
                {"option_type": "call", "action": "buy", "strike": round(S * 1.10, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
            StrategyType.STRADDLE: [
                {"option_type": "call", "action": "buy", "strike": round(S, 0), "expiry": expiry, "premium": 0, "quantity": 1},
                {"option_type": "put", "action": "buy", "strike": round(S, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
            StrategyType.STRANGLE: [
                {"option_type": "call", "action": "buy", "strike": round(S * 1.05, 0), "expiry": expiry, "premium": 0, "quantity": 1},
                {"option_type": "put", "action": "buy", "strike": round(S * 0.95, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
            StrategyType.LONG_CALL: [
                {"option_type": "call", "action": "buy", "strike": round(S, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
            StrategyType.LONG_PUT: [
                {"option_type": "put", "action": "buy", "strike": round(S, 0), "expiry": expiry, "premium": 0, "quantity": 1},
            ],
        }

        return {
            "strategy_type": strategy_type,
            "description": desc,
            "suggested_legs": templates.get(strategy_type, []),
        }
