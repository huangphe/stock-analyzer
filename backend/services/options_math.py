"""
期權數學核心模組
Black-Scholes 定價模型 + Greeks 計算 + 隱含波動率反推
"""

import numpy as np
from scipy.stats import norm
from scipy.optimize import brentq
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class BlackScholes:
    """
    Black-Scholes-Merton 期權定價模型
    支援有股息的 Merton 延伸版本
    """

    @staticmethod
    def d1_d2(
        S: float,   # 標的價格
        K: float,   # 履約價
        T: float,   # 到期時間（年）
        r: float,   # 無風險利率
        sigma: float,  # 年化波動率
        q: float = 0.0,  # 股息率
    ) -> Tuple[float, float]:
        """計算 d1, d2"""
        d1 = (np.log(S / K) + (r - q + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
        d2 = d1 - sigma * np.sqrt(T)
        return d1, d2

    @classmethod
    def price(
        cls,
        S: float,
        K: float,
        T: float,
        r: float,
        sigma: float,
        option_type: str = "call",
        q: float = 0.0,
    ) -> float:
        """計算期權理論價格"""
        if T <= 0:
            # 到期時只有內在價值
            if option_type == "call":
                return max(S - K, 0)
            else:
                return max(K - S, 0)

        d1, d2 = cls.d1_d2(S, K, T, r, sigma, q)

        if option_type == "call":
            price = (
                S * np.exp(-q * T) * norm.cdf(d1)
                - K * np.exp(-r * T) * norm.cdf(d2)
            )
        else:  # put
            price = (
                K * np.exp(-r * T) * norm.cdf(-d2)
                - S * np.exp(-q * T) * norm.cdf(-d1)
            )
        return max(price, 0)

    @classmethod
    def greeks(
        cls,
        S: float,
        K: float,
        T: float,
        r: float,
        sigma: float,
        option_type: str = "call",
        q: float = 0.0,
    ) -> dict:
        """計算完整 Greeks"""
        if T <= 0:
            return {
                "price": cls.price(S, K, T, r, sigma, option_type, q),
                "delta": 1.0 if (option_type == "call" and S > K) else 0.0,
                "gamma": 0.0,
                "theta": 0.0,
                "vega": 0.0,
                "rho": 0.0,
            }

        d1, d2 = cls.d1_d2(S, K, T, r, sigma, q)
        sqrt_T = np.sqrt(T)
        exp_qT = np.exp(-q * T)
        exp_rT = np.exp(-r * T)
        nd1 = norm.pdf(d1)  # N'(d1)

        price = cls.price(S, K, T, r, sigma, option_type, q)

        # Delta
        if option_type == "call":
            delta = exp_qT * norm.cdf(d1)
        else:
            delta = exp_qT * (norm.cdf(d1) - 1)

        # Gamma（call 與 put 相同）
        gamma = (exp_qT * nd1) / (S * sigma * sqrt_T)

        # Theta（每日，除以 365）
        theta_call = (
            -(S * exp_qT * nd1 * sigma) / (2 * sqrt_T)
            - r * K * exp_rT * norm.cdf(d2)
            + q * S * exp_qT * norm.cdf(d1)
        ) / 365
        theta_put = (
            -(S * exp_qT * nd1 * sigma) / (2 * sqrt_T)
            + r * K * exp_rT * norm.cdf(-d2)
            - q * S * exp_qT * norm.cdf(-d1)
        ) / 365

        theta = theta_call if option_type == "call" else theta_put

        # Vega（1% 波動率變動）
        vega = (S * exp_qT * nd1 * sqrt_T) / 100

        # Rho（1% 利率變動）
        if option_type == "call":
            rho = (K * T * exp_rT * norm.cdf(d2)) / 100
        else:
            rho = -(K * T * exp_rT * norm.cdf(-d2)) / 100

        return {
            "price": round(price, 4),
            "delta": round(delta, 4),
            "gamma": round(gamma, 6),
            "theta": round(theta, 4),
            "vega": round(vega, 4),
            "rho": round(rho, 4),
        }

    @classmethod
    def implied_volatility(
        cls,
        market_price: float,
        S: float,
        K: float,
        T: float,
        r: float,
        option_type: str = "call",
        q: float = 0.0,
    ) -> Optional[float]:
        """
        使用 Brent 方法反推隱含波動率 (IV)
        返回 None 若無法收斂
        """
        if T <= 0 or market_price <= 0:
            return None

        # 最小價格檢查（內在價值）
        intrinsic = max(S - K, 0) if option_type == "call" else max(K - S, 0)
        if market_price < intrinsic * 0.99:
            return None

        def objective(sigma):
            return cls.price(S, K, T, r, sigma, option_type, q) - market_price

        try:
            iv = brentq(objective, 1e-6, 10.0, xtol=1e-6, maxiter=200)
            return round(iv, 4) if 0 < iv < 10 else None
        except (ValueError, RuntimeError):
            return None


class OptionsAnalyzer:
    """期權分析工具"""

    @staticmethod
    def pnl_at_expiry(
        legs: list,
        price_range: Optional[np.ndarray] = None,
        underlying_price: float = 100.0,
        contract_size: int = 100,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        計算到期損益曲線

        legs: [{"option_type": "call"|"put"|"stock", "action": "buy"|"sell",
                "strike": float, "premium": float, "quantity": int}]
        """
        if price_range is None:
            low = underlying_price * 0.6
            high = underlying_price * 1.4
            price_range = np.linspace(low, high, 300)

        total_pnl = np.zeros(len(price_range))

        for leg in legs:
            qty = leg.get("quantity", 1)
            premium = leg.get("premium", 0)
            action_sign = 1 if leg["action"] == "buy" else -1

            if leg["option_type"] == "stock":
                # 持有正股
                intrinsic = price_range - leg["strike"]  # strike = 買入成本
                leg_pnl = action_sign * intrinsic * qty * contract_size
            elif leg["option_type"] == "call":
                intrinsic = np.maximum(price_range - leg["strike"], 0)
                leg_pnl = action_sign * (intrinsic - premium) * qty * contract_size
            else:  # put
                intrinsic = np.maximum(leg["strike"] - price_range, 0)
                leg_pnl = action_sign * (intrinsic - premium) * qty * contract_size

            total_pnl += leg_pnl

        return price_range, total_pnl

    @staticmethod
    def find_breakevens(
        prices: np.ndarray, pnl: np.ndarray
    ) -> list:
        """找出損益平衡點"""
        breakevens = []
        for i in range(len(pnl) - 1):
            if pnl[i] * pnl[i + 1] < 0:  # 穿越零點
                # 線性插值
                be = prices[i] + (prices[i + 1] - prices[i]) * (-pnl[i]) / (pnl[i + 1] - pnl[i])
                breakevens.append(round(float(be), 2))
        return breakevens

    @staticmethod
    def aggregate_greeks(
        legs: list,
        underlying_price: float,
        r: float = 0.053,
    ) -> dict:
        """計算組合 Greeks"""
        net = {"delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}

        for leg in legs:
            if leg["option_type"] == "stock":
                net["delta"] += leg.get("quantity", 1) * (1 if leg["action"] == "buy" else -1)
                continue

            import datetime
            from dateutil import parser as dt_parser

            try:
                expiry_dt = dt_parser.parse(leg["expiry"])
                T = max((expiry_dt.date() - datetime.date.today()).days / 365, 1 / 365)
            except Exception:
                T = 30 / 365

            g = BlackScholes.greeks(
                S=underlying_price,
                K=leg["strike"],
                T=T,
                r=r,
                sigma=leg.get("iv", 0.30),
                option_type=leg["option_type"],
            )

            sign = 1 if leg["action"] == "buy" else -1
            qty = leg.get("quantity", 1)

            for key in net:
                net[key] += sign * qty * g.get(key, 0)

        return {k: round(v, 4) for k, v in net.items()}
