"""
回測引擎核心模組
支援單股歷史回測、策略驗證與性能指標計算
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from datetime import datetime


class BacktestEngine:
    """執行歷史回測並計算指標"""

    def __init__(
        self,
        initial_capital: float = 1_000_000,
        stop_loss: float = -0.08,
        take_profit: float = 0.20,
        fee_rate: float = 0.001425,  # 台股手續費率預設 (0.1425%)
    ):
        self.initial_capital = initial_capital
        self.stop_loss = stop_loss
        self.take_profit = take_profit
        self.fee_rate = fee_rate

    def run(self, df: pd.DataFrame, symbol: str = "Stock") -> Dict[str, Any]:
        """
        執行回測
        df 必須包含: ['date', 'close', 'signal']
        signal: 1 (Buy), -1 (Sell), 0 (Hold)
        """
        if df.empty or "signal" not in df.columns:
            return {"error": "Invalid data or missing signals"}

        capital = self.initial_capital
        position = 0.0
        entry_price = 0.0
        equity_curve = []
        trades = []

        for i, row in df.iterrows():
            price = float(row["close"])
            signal = int(row["signal"])
            date = str(row["date"])

            # 當前資產價值
            current_equity = capital + (position * price)
            equity_curve.append({"date": date, "equity": round(current_equity, 2)})

            # 已持倉：檢查出場條件
            if position > 0:
                unrealized_ret = (price - entry_price) / entry_price
                
                # 停損、停利、或策略出場訊號
                should_exit = (
                    unrealized_ret <= self.stop_loss or 
                    unrealized_ret >= self.take_profit or 
                    signal == -1
                )
                
                if should_exit:
                    sell_value = position * price * (1 - self.fee_rate)
                    capital += sell_value
                    ret = (price - entry_price) / entry_price
                    trades.append({
                        "entry_date": entry_date,
                        "exit_date": date,
                        "entry_price": entry_price,
                        "exit_price": price,
                        "return_pct": round(ret * 100, 2),
                        "profit": round(sell_value - (position * entry_price), 2)
                    })
                    position = 0
                    entry_price = 0

            # 未持倉：檢查進場條件
            elif signal == 1:
                # 考慮手續費後的購買力（買滿）
                buy_cost_ratio = 1 + self.fee_rate
                position = (capital / buy_cost_ratio) / price
                capital -= (position * price * buy_cost_ratio)
                entry_price = price
                entry_date = date

        # 計算最後一天的總資產
        final_equity = capital + (position * df.iloc[-1]["close"])
        
        return {
            "symbol": symbol,
            "initial_capital": self.initial_capital,
            "final_equity": round(final_equity, 2),
            "total_return_pct": round((final_equity - self.initial_capital) / self.initial_capital * 100, 2),
            "trades": trades,
            "equity_curve": equity_curve,
            "metrics": self._calculate_metrics(equity_curve, trades)
        }

    def _calculate_metrics(self, equity_curve: List[Dict], trades: List[Dict]) -> Dict[str, Any]:
        """計算進階回測指標"""
        if not equity_curve:
            return {}

        equities = [e["equity"] for e in equity_curve]
        
        # 最大回撤 (MDD)
        peak = equities[0]
        max_drawdown = 0
        for e in equities:
            if e > peak:
                peak = e
            drawdown = (e - peak) / peak
            if drawdown < max_drawdown:
                max_drawdown = drawdown

        # 勝率 (Win Rate)
        wins = [t for t in trades if t["return_pct"] > 0]
        win_rate = len(wins) / len(trades) if trades else 0

        return {
            "max_drawdown_pct": round(max_drawdown * 100, 2),
            "win_rate_pct": round(win_rate * 100, 2),
            "total_trades": len(trades),
            "avg_return_per_trade_pct": round(np.mean([t["return_pct"] for t in trades]), 2) if trades else 0
        }
