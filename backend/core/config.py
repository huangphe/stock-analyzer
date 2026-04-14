from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # 應用設定
    APP_NAME: str = "Stock Analyzer"
    DEBUG: bool = False
    API_VERSION: str = "v1"

    # CORS（本地 + Vercel 雲端）
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        # Vercel 生產 & 預覽網域（將 xxx 換成你的實際專案名稱）
        "https://stock-analyzer.vercel.app",
        "https://stock-analyzer-git-main.vercel.app",
    ]

    # 若設定此環境變數可完全覆蓋 CORS（部署後在 Render 設定）
    EXTRA_ALLOWED_ORIGIN: str = ""

    # 資料庫 (Supabase)
    DATABASE_URL: str = ""

    # Redis 快取（可選）
    REDIS_URL: str = ""
    CACHE_TTL: int = 300  # 5 分鐘

    # Finnhub API（美股報價主要來源）
    FINNHUB_API_KEY: str = ""

    # Fugle Market Data API（台股歷史 K 線主要來源）
    FUGLE_API_KEY: str = ""

    # 無風險利率（用於 Black-Scholes）
    RISK_FREE_RATE: float = 0.053  # 美國 10 年公債殖利率（近似）
    RISK_FREE_RATE_TW: float = 0.015  # 台灣 10 年公債殖利率（近似）

    # 取得期權鏈重試機制
    MAX_RETRIES: int = 3

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
