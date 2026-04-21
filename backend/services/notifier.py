"""
Telegram 推送服務
"""

import requests
import logging
from datetime import datetime
from core.config import settings

logger = logging.getLogger(__name__)


def send_telegram(message: str) -> bool:
    """發送 HTML 格式訊息到 Telegram Bot"""
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        logger.warning("Telegram 未設定 BOT_TOKEN 或 CHAT_ID，略過推送")
        return False
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        resp = requests.post(url, json={
            "chat_id": settings.TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
        }, timeout=10)
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Telegram 推送失敗: {e}")
        return False


def format_screener_result(results: dict, strategy: str | None) -> str:
    """格式化選股結果為 Telegram 訊息"""
    strategy_label = {
        "tw_momentum": "台股強勢股 HOT",
        "us_momentum": "美股動能突破",
        "rsi_oversold": "跨市場超賣抄底",
    }.get(strategy or "", "左右側雙訊號")

    now = datetime.now().strftime("%m/%d %H:%M")
    lines = [
        f"<b>📊 選股掃描完成 [{strategy_label}]</b>",
        f"掃描 {results.get('total_scanned', 0)} 支 · {now}",
        "",
    ]

    right = results.get("right_side") or []
    if right:
        lines.append("<b>▶ 右側（突破/動能）前 5 名</b>")
        for stock in right[:5]:
            sig = "、".join(stock.get("right_side_signals") or stock.get("strategy_signals") or [])
            change = stock.get("change_pct")
            change_str = f"+{change:.2f}%" if change and change >= 0 else f"{change:.2f}%" if change else ""
            lines.append(f"  <b>{stock['symbol']}</b> {stock.get('name', '')} ${stock['price']:.2f} {change_str}")
            if sig:
                lines.append(f"  <i>{sig}</i>")

    left = results.get("left_side") or []
    if left:
        lines.append("")
        lines.append("<b>◀ 左側（超賣/抄底）前 5 名</b>")
        for stock in left[:5]:
            sig = "、".join(stock.get("left_side_signals") or [])
            lines.append(f"  <b>{stock['symbol']}</b> {stock.get('name', '')} RSI {stock.get('rsi', '—')}")
            if sig:
                lines.append(f"  <i>{sig}</i>")

    return "\n".join(lines)
