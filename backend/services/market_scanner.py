"""
台股市場掃描器
- 主池：TW_UNIVERSE（已驗證 Yahoo Finance 可查詢的主要流動性股票）
- 補充：TWSE STOCK_DAY_ALL 今日漲停（捕捉靜態清單未涵蓋的新興強勢股）
"""
import requests
import logging
from typing import List

logger = logging.getLogger(__name__)

TWSE_BASE = "https://openapi.twse.com.tw/v1"

# 主要流動性台股池（已確認 Yahoo Finance {code}.TW 可查詢）
# analyze_stock 用實際 6mo 日線驗證近 10 天是否有漲停，今日漲不漲停不影響入池
TW_UNIVERSE = [
    # 半導體 / IC 設計
    "2330", "2454", "2303", "2308", "3711", "2379", "2337", "3034",
    "2344", "2395", "2385", "3443", "3008", "2369", "2492",
    "2351", "2449", "3019", "2356", "2404",
    "2408", "2388", "2367",
    # 電子製造 / 代工 / 組裝
    "2317", "2382", "2357", "2301", "2377", "2353", "2397",
    "2324", "2347", "2376", "2354", "4938", "3481", "2409", "2412",
    "2328", "2365", "2362", "2360",
    # 金融 / 保險 / 證券
    "2881", "2882", "2886", "2891", "2884", "2885", "2887",
    "2890", "2883", "2892", "5880", "2801",
    # 傳產 / 鋼鐵 / 塑化 / 食品
    "2002", "1301", "1303", "1326", "2006", "2015", "2007", "1402",
    "2105", "2103", "1216", "2207", "2201", "1101",
    # 生技 / 醫療（已確認可查詢）
    "1789",
    # 網通 / 其他科技（已確認可查詢）
    "2498", "3231", "3026", "6669", "2439",
    # ETF
    "0050", "0056",
]


class TWMarketScanner:

    @classmethod
    def get_limit_up_candidates(cls) -> List[str]:
        """
        今日 TWSE 漲停快照（漲幅 >= 9.8%）。
        用於補充 TW_UNIVERSE 未涵蓋的新興強勢股。
        注意：analyze_stock 會用 6mo 日線二次確認近 10 天是否有漲停。
        """
        try:
            url = f"{TWSE_BASE}/exchangeReport/STOCK_DAY_ALL"
            resp = requests.get(url, timeout=10)
            if not resp.content or resp.status_code != 200:
                return []

            data = resp.json()
            candidates = []

            def _f(val) -> float:
                try:
                    return float(str(val).replace(",", ""))
                except Exception:
                    return 0.0

            for item in data:
                code = item.get("Code", "")
                if not code or len(code) != 4 or not code.isdigit():
                    continue
                close = _f(item.get("ClosingPrice", 0))
                change = _f(item.get("Change", 0))
                if close <= 0:
                    continue
                prev_close = close - change
                if prev_close <= 0:
                    continue
                if change / prev_close >= 0.098:
                    candidates.append(code)

            logger.info(f"TWSE 今日漲停補充股: {len(candidates)} 檔")
            return candidates

        except Exception as e:
            logger.error(f"TWMarketScanner 錯誤: {e}")
            return []

    @classmethod
    def get_tw_universe(cls) -> List[str]:
        """回傳主要流動性台股候選池"""
        return list(TW_UNIVERSE)
