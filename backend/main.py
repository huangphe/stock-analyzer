"""
Stock Analyzer - 全方位股市分析平台
支援台股、美股正股與期權策略分析
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from routers import stocks, options, strategies, screener
from core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Stock Analyzer API 啟動中...")
    yield
    logger.info("🛑 Stock Analyzer API 關閉")


app = FastAPI(
    title="Stock Analyzer API",
    description="台股 + 美股正股與期權策略分析平台",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS 設定（允許前端連線）
origins = list(settings.ALLOWED_ORIGINS)
if settings.EXTRA_ALLOWED_ORIGIN:
    origins.append(settings.EXTRA_ALLOWED_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 註冊路由
app.include_router(stocks.router, prefix="/api/stocks", tags=["Stocks 股票"])
app.include_router(options.router, prefix="/api/options", tags=["Options 期權"])
app.include_router(strategies.router, prefix="/api/strategies", tags=["Strategies 策略"])
app.include_router(screener.router, prefix="/api/screener", tags=["Screener 選股篩選器"])


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "Stock Analyzer API",
        "status": "running",
        "version": "1.0.0",
        "markets": ["TW", "US"],
        "features": ["stocks", "options", "strategy_analysis"],
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
