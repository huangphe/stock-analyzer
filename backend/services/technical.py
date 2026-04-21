"""
技術指標計算服務
RSI, MA, Volume signals for stock screener
"""
from typing import List, Dict, Any, Optional
import pandas as pd
import numpy as np



# --- 行業別動態門檻配置 ---
SECTOR_PE_LIMITS = {
    "Technology": 30.0,
    "Communication Services": 25.0,
    "Healthcare": 25.0,
    "Consumer Cyclical": 22.0,
    "Consumer Defensive": 20.0,
    "Real Estate": 18.0,
    "Industrials": 15.0,
    "Financial Services": 15.0,
    "Basic Materials": 12.0,
    "Energy": 12.0,
    "Utilities": 15.0,
    "Default": 20.0
}

def compute_rsi(prices: List[float], period: int = 14) -> Optional[float]:
    """計算相對強弱指標 (RSI)，使用 Wilder 平滑法"""
    if len(prices) < period + 1:
        return None

    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    gains = [d if d > 0 else 0.0 for d in deltas]
    losses = [-d if d < 0 else 0.0 for d in deltas]

    # 初始平均值
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    # Wilder 平滑
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 2)


def compute_ma(prices: List[float], period: int) -> Optional[float]:
    """計算簡單移動平均線"""
    if len(prices) < period:
        return None
    return round(sum(prices[-period:]) / period, 4)


def compute_ema(prices: List[float], span: int) -> List[float]:
    """計算指數移動平均線 (EMA)"""
    if len(prices) < span:
        return []
    import pandas as pd
    return pd.Series(prices).ewm(span=span, adjust=False).mean().tolist()


def compute_macd(prices: List[float], slow: int = 26, fast: int = 12, signal: int = 9) -> Dict[str, Any]:
    """計算 MACD 指標"""
    if len(prices) < slow + signal:
        return {"macd": None, "signal": None, "hist": None, "is_golden_cross": False}
    
    ema_fast = compute_ema(prices, fast)
    ema_slow = compute_ema(prices, slow)
    
    # MACD Line = EMA(12) - EMA(26)
    macd_line = [f - s for f, s in zip(ema_fast, ema_slow)]
    
    # Signal Line = EMA(MACD Line, 9)
    signal_line = compute_ema(macd_line, signal)
    
    if not macd_line or not signal_line:
        return {"macd": None, "signal": None, "hist": None, "is_golden_cross": False}
    
    m = macd_line[-1]
    s = signal_line[-1]
    hist = m - s
    
    return {
        "macd": round(m, 4),
        "signal": round(s, 4),
        "hist": round(hist, 4),
        "is_golden_cross": m > s
    }


def compute_bollinger(prices: List[float], period: int = 20, std_dev: float = 2.0) -> Dict[str, Any]:
    """計算布林通道 (Bollinger Bands)"""
    if len(prices) < period:
        return {"upper": None, "middle": None, "lower": None, "pct_b": None, "bandwidth": None}
    window = prices[-period:]
    middle = sum(window) / period
    variance = sum((p - middle) ** 2 for p in window) / period
    std = variance ** 0.5
    upper = round(middle + std_dev * std, 4)
    lower = round(middle - std_dev * std, 4)
    middle = round(middle, 4)
    current = prices[-1]
    pct_b = round((current - lower) / (upper - lower), 4) if upper != lower else 0.5
    bandwidth = round((upper - lower) / middle, 4) if middle else None
    return {
        "upper": upper,
        "middle": middle,
        "lower": lower,
        "pct_b": pct_b,       # 0=下軌 0.5=中軌 1=上軌
        "bandwidth": bandwidth, # 寬度比率（越高越波動）
    }


def analyze_stock(bars: List[Dict], monthly_bars: Optional[List[Dict]] = None, quote: Optional[Dict] = None) -> Dict[str, Any]:
    """計算技術指標並產生左側/右側交易信號，整合基本面與流動性分析"""
    if not bars or len(bars) < 20:
        return {}

    closes = [b["close"] for b in bars]
    highs = [b["high"] for b in bars]
    lows = [b["low"] for b in bars]
    volumes = [b.get("volume") or 0 for b in bars]

    rsi = compute_rsi(closes)
    ma20 = compute_ma(closes, 20)
    ma60 = compute_ma(closes, 60)
    daily_macd = compute_macd(closes)
    bollinger = compute_bollinger(closes)

    current_price = closes[-1]

    # --- 漲停強勢股邏輯 (台股專用) ---
    # 規則：10天內有漲停 (+9.8%)，但排除連續 3 天漲停
    limit_up_threshold = 0.098
    days_to_check = 10
    limit_up_count = 0
    max_consecutive = 0
    current_consecutive = 0
    has_limit_up_recent = False

    limit_up_dates = []  # 記錄近 10 天中每次漲停的日期與漲幅

    if len(closes) >= days_to_check + 1:
        # 檢查過去 10 個交易日
        relevant_bars = bars[-(days_to_check + 1):]
        for i in range(1, len(relevant_bars)):
            prev = relevant_bars[i-1]["close"]
            curr = relevant_bars[i]["close"]
            change = (curr - prev) / prev if prev > 0 else 0

            if change >= limit_up_threshold:
                limit_up_count += 1
                current_consecutive += 1
                has_limit_up_recent = True
                limit_up_dates.append({
                    "date": relevant_bars[i].get("date", ""),
                    "change_pct": round(change * 100, 2),
                })
            else:
                current_consecutive = 0

            max_consecutive = max(max_consecutive, current_consecutive)

    # --- 月線 MACD 金叉邏輯 ---
    monthly_macd = None
    if monthly_bars and len(monthly_bars) >= 35:
        m_closes = [b["close"] for b in monthly_bars]
        monthly_macd = compute_macd(m_closes)

    # 52週高低點
    high_52w = max(highs)
    low_52w = min(lows)

    # 成交量分析
    vols_nonzero = [v for v in volumes if v > 0]
    avg_vol_20 = sum(vols_nonzero[-20:]) / min(20, len(vols_nonzero)) if vols_nonzero else None
    latest_vol = vols_nonzero[-1] if vols_nonzero else None
    vol_ratio = round(latest_vol / avg_vol_20, 2) if (avg_vol_20 and latest_vol and avg_vol_20 > 0) else None

    # --- 流動性計算 (Dollar Volume) ---
    # 台股 TradeVolume 是股數，成交額 = 價 * 量
    turnover = (current_price * latest_vol) if latest_vol else 0
    avg_turnover_20 = (ma20 * avg_vol_20) if (ma20 and avg_vol_20) else 0

    # --- 訊號彙整 ---
    left_side_signals = []
    if rsi is not None and rsi < 35:
        left_side_signals.append(f"RSI {rsi:.1f} 超賣")
    if ma20 and current_price < ma20 * 0.92:
        left_side_signals.append(f"偏離 MA20")
    if bollinger["pct_b"] is not None and bollinger["pct_b"] < 0.05:
        left_side_signals.append("觸及 BB 下軌")
    if daily_macd["macd"] is not None and not daily_macd["is_golden_cross"] and daily_macd["hist"] is not None and daily_macd["hist"] > -0.01:
        left_side_signals.append("MACD 死叉收窄")

    right_side_signals = []
    if ma20 and current_price > ma20:
        right_side_signals.append(f"站上 MA20")
    if vol_ratio is not None and vol_ratio >= 1.5:
        right_side_signals.append(f"爆量 ({vol_ratio}x)")
    if daily_macd["is_golden_cross"]:
        right_side_signals.append("MACD 日線金叉")
    if bollinger["pct_b"] is not None and 0.4 <= bollinger["pct_b"] <= 0.6 and vol_ratio and vol_ratio >= 1.3:
        right_side_signals.append("BB 中軌放量")
    
    # --- 回調至 MA20 放量陽線 ---
    # 條件：最近 5 個交易日內，任一天滿足：
    #   低點 ≤ MA20 × 1.02（觸及均線，含 2% 容忍）
    #   收盤 > 開盤（陽線）
    #   成交量 ≥ 20 日均量 × 1.5（放量）
    pullback_to_ma20 = False
    pullback_bar = None  # 觸發條件的那根K棒明細
    if ma20 and avg_vol_20 and len(bars) >= 5:
        for bar in bars[-5:]:
            b_low   = bar.get("low", 0)
            b_open  = bar.get("open", 0)
            b_close = bar.get("close", 0)
            b_vol   = bar.get("volume", 0) or 0
            touched = b_low <= ma20 * 1.02          # 低點觸及均線
            bullish = b_close > b_open              # 陽線
            heavy   = b_vol >= avg_vol_20 * 1.5     # 放量
            if touched and bullish and heavy:
                pullback_to_ma20 = True
                pullback_bar = {
                    "date": bar.get("date", ""),
                    "vol_ratio": round(b_vol / avg_vol_20, 2),
                }
                break

    # 強勢股策略訊號
    strategy_signals = []
    if has_limit_up_recent and max_consecutive < 3:
        strategy_signals.append("漲停強勢回調/整理")
    if monthly_macd and monthly_macd["is_golden_cross"]:
        strategy_signals.append("月線 MACD 金叉")
    if pullback_to_ma20:
        strategy_signals.append("回調MA20放量陽線")

    # 強勢股最終判定：
    # - Phase 1（無月線）：近10天有漲停 + 非連板 → 進入月線初選
    # - Phase 2（有月線）：近10天漲停 + 非連板 + 月線MACD金叉 + 回調MA20放量陽線
    limit_up_ok = has_limit_up_recent and max_consecutive < 3
    if monthly_bars and monthly_macd is not None:
        is_momentum_candidate = (
            limit_up_ok
            and monthly_macd["is_golden_cross"]
            and pullback_to_ma20
        )
    else:
        is_momentum_candidate = limit_up_ok  # Phase 1 初選

    # 美股動能候選：接近 52W 高 (≥90%) + 站上 MA20 + 爆量 + MACD 金叉
    near_52w_high = current_price >= high_52w * 0.90 if high_52w else False
    is_us_momentum_candidate = (
        near_52w_high
        and (ma20 is not None and current_price > ma20)
        and (vol_ratio is not None and vol_ratio >= 1.5)
        and daily_macd["is_golden_cross"]
    )

    # 深度超賣候選：RSI < 35 + BB %b < 0.1 + left_score >= 2
    is_oversold_candidate = (
        (rsi is not None and rsi < 35)
        and (bollinger["pct_b"] is not None and bollinger["pct_b"] < 0.1)
    )

    # --- 基本面過濾與品質動能判定 ---
    pe_ratio = quote.get("pe_ratio") if quote else None
    pb_ratio = quote.get("pb_ratio") if quote else None
    market_cap = quote.get("market_cap") if quote else None
    
    # 根據用戶要求：PE 為負值（虧損）則排除推薦
    is_profitable = True
    if pe_ratio is not None and pe_ratio < 0:
        is_profitable = False
        is_momentum_candidate = False
        is_us_momentum_candidate = False
        is_oversold_candidate = False

    # 品質動能：動能強 + 有獲利 + 估值在行業合理區間
    sector = quote.get("sector", "Default") if quote else "Default"
    pe_limit = SECTOR_PE_LIMITS.get(sector, SECTOR_PE_LIMITS["Default"])
    
    is_valuation_ok = pe_ratio is not None and pe_ratio > 0 and pe_ratio < pe_limit

    is_quality_momentum = (
        (is_momentum_candidate or is_us_momentum_candidate)
        and is_profitable
        and is_valuation_ok
    )

    return {
        "price": round(current_price, 4),
        "rsi": rsi,
        "ma20": ma20,
        "vol_ratio": vol_ratio,
        "turnover": round(turnover, 0),
        "avg_turnover_20": round(avg_turnover_20, 0),
        "pe_ratio": pe_ratio,
        "pb_ratio": pb_ratio,
        "market_cap": market_cap,
        "sector": quote.get("sector") if quote else None,
        "industry": quote.get("industry") if quote else None,
        "daily_macd": daily_macd,
        "bollinger": bollinger,
        "left_side_signals": left_side_signals,
        "right_side_signals": right_side_signals,
        "strategy_signals": strategy_signals,
        "monthly_macd": monthly_macd,
        "is_momentum_candidate": is_momentum_candidate,
        "is_us_momentum_candidate": is_us_momentum_candidate,
        "is_oversold_candidate": is_oversold_candidate,
        "is_quality_momentum": is_quality_momentum,
        "is_profitable": is_profitable,
        "limit_up_dates": limit_up_dates,
        "pullback_bar": pullback_bar,
        "left_score": len(left_side_signals),
        "right_score": len(right_side_signals) + (1 if has_limit_up_recent else 0),
    }

def calculate_all_indicators(bars: List[Dict]) -> pd.DataFrame:
    """計算全歷史技術指標，回傳 DataFrame"""
    if not bars:
        return pd.DataFrame()
        
    df = pd.DataFrame(bars)
    closes = df["close"].tolist()
    
    # 基本指標
    df["ma20"] = df["close"].rolling(window=20).mean()
    df["ma60"] = df["close"].rolling(window=60).mean()
    
    # RSI
    rsi_list = [compute_rsi(closes[:i+1]) for i in range(len(closes))]
    df["rsi"] = rsi_list
    
    # MACD
    ema12 = df["close"].ewm(span=12, adjust=False).mean()
    ema26 = df["close"].ewm(span=26, adjust=False).mean()
    df["macd"] = ema12 - ema26
    df["signal_line"] = df["macd"].ewm(span=9, adjust=False).mean()
    df["macd_hist"] = df["macd"] - df["signal_line"]
    
    # Bollinger
    df["bb_middle"] = df["close"].rolling(window=20).mean()
    df["bb_std"] = df["close"].rolling(window=20).std()
    df["bb_upper"] = df["bb_middle"] + (df["bb_std"] * 2)
    df["bb_lower"] = df["bb_middle"] - (df["bb_std"] * 2)
    df["pct_b"] = (df["close"] - df["bb_lower"]) / (df["bb_upper"] - df["bb_lower"])
    
    # 52W High (假設 250 交易日)
    df["high_52w"] = df["high"].rolling(window=250, min_periods=1).max()
    
    # 成交量比率
    df["vol_ma20"] = df["volume"].rolling(window=20).mean()
    df["vol_ratio"] = df["volume"] / df["vol_ma20"]
    
    return df


def apply_strategy_signals(df: pd.DataFrame, strategy: str = "momentum") -> pd.DataFrame:
    """根據策略類型在 DataFrame 中標記 signal (1=Buy, -1=Sell, 0=None)"""
    df = df.copy()
    df["signal"] = 0
    
    if strategy == "momentum":
        # 動能策略：站上 MA20 + MACD 金叉 + 爆量 (可擴展)
        buy_cond = (
            (df["close"] > df["ma20"]) & 
            (df["macd"] > df["signal_line"]) & 
            (df["vol_ratio"] >= 1.5)
        )
        sell_cond = (df["close"] < df["ma20"]) | (df["rsi"] > 80)
        
        df.loc[buy_cond, "signal"] = 1
        df.loc[sell_cond, "signal"] = -1
        
    elif strategy == "rsi_oversold":
        # 超賣回補：RSI < 30 + 價格觸及 BB 下軌
        buy_cond = (df["rsi"] < 30) & (df["pct_b"] < 0.1)
        sell_cond = (df["rsi"] > 60) | (df["close"] > df["ma20"])
        
        df.loc[buy_cond, "signal"] = 1
        df.loc[sell_cond, "signal"] = -1
        
    return df
