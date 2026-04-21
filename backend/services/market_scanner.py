"""
台股市場掃描器
- 主池：TW_UNIVERSE（已驗證 Yahoo Finance 可查詢的主要流動性股票）
- 近10天漲停：讀取 backend/data/limit_up_log.json（由 GitHub Actions 每日收盤後更新）
  fallback：即時呼叫 TWSE STOCK_DAY_ALL 取今日漲停（僅當 log 為空時）
"""
import json
import os
import requests
import logging
from datetime import date, timedelta
from typing import List, Dict

logger = logging.getLogger(__name__)

TWSE_BASE = "https://openapi.twse.com.tw/v1"

# log 檔位置（相對於此檔案向上兩層，即 backend/data/）
_LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "limit_up_log.json")

# 主要流動性台股池（已確認 Yahoo Finance {code}.TW 可查詢）
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
    # 生技 / 醫療
    "1789",
    # 網通 / 其他科技
    "2498", "3231", "3026", "6669", "2439",
    # ETF
    "0050", "0056",
]


def _load_log() -> Dict[str, List[str]]:
    """讀取持久化漲停 log"""
    try:
        path = os.path.abspath(_LOG_PATH)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        logger.warning(f"讀取 limit_up_log.json 失敗: {e}")
    return {}


class TWMarketScanner:

    @classmethod
    def get_rolling_limit_up(cls, days: int = 10) -> List[str]:
        """
        取近 N 天的漲停股（去重）。
        來源：backend/data/limit_up_log.json（GitHub Actions 每日更新）。
        若 log 為空（初次部署），fallback 到即時 TWSE API 取今日漲停。
        """
        log = _load_log()

        if log:
            cutoff = (date.today() - timedelta(days=days)).isoformat()
            result: set = set()
            for day, codes in log.items():
                if day >= cutoff:
                    result.update(codes)
            symbols = list(result)
            logger.info(f"Rolling {days}d 漲停股（from log）: {len(symbols)} 檔，涵蓋 {len([d for d in log if d >= cutoff])} 天")
            return symbols

        # fallback：log 還沒資料時用即時 API
        logger.info("limit_up_log 為空，fallback 到即時 TWSE API")
        return cls._fetch_today_limit_up()

    @classmethod
    def get_limit_up_candidates(cls) -> List[str]:
        """
        相容舊 API：回傳今日漲停快照。
        screener.py 用此來補充 TW_UNIVERSE 未涵蓋的新興強勢股。
        """
        log = _load_log()
        today = date.today().isoformat()

        # 優先用 log 中的今日資料
        if today in log:
            return log[today]

        # fallback：即時呼叫
        return cls._fetch_today_limit_up()

    @classmethod
    def _fetch_today_limit_up(cls) -> List[str]:
        """即時從 TWSE 抓今日漲停（>=9.8%）"""
        try:
            url = f"{TWSE_BASE}/exchangeReport/STOCK_DAY_ALL"
            resp = requests.get(url, timeout=10, verify=False)
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

            logger.info(f"TWSE 即時漲停股: {len(candidates)} 檔")
            return candidates

        except Exception as e:
            logger.error(f"TWMarketScanner _fetch_today_limit_up 錯誤: {e}")
            return []

    @classmethod
    def get_tw_universe(cls) -> List[str]:
        """回傳主要流動性台股候選池"""
        return list(TW_UNIVERSE)
