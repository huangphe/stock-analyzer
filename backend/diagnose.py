import os
import sys
import asyncio
import logging
import json

# 設定路徑以便匯入後端模組
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.data_fetcher import USStockFetcher, TWStockFetcher
from services.options_math import BlackScholes
from core.config import settings
from core.database import SessionLocal, engine
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Diagnose")

async def test_us_quote():
    print("Testing US Quote (AAPL)...")
    try:
        quote = USStockFetcher.get_quote("AAPL")
        print(f"Success: AAPL Price = {quote['price']}")
        return "PASS", f"Price: {quote['price']}"
    except Exception as e:
        print(f"Failed: {e}")
        return "FAIL", str(e)

async def test_tw_quote():
    print("\nTesting TW Quote (2330)...")
    try:
        quote = TWStockFetcher.get_quote("2330")
        print(f"Success: 2330 Price = {quote['price']}")
        return "PASS", f"Price: {quote['price']}"
    except Exception as e:
        print(f"Failed: {e}")
        return "FAIL", str(e)

async def test_options_chain():
    print("\nTesting Options Chain (TSLA)...")
    try:
        chain = USStockFetcher.get_options_chain("TSLA")
        print(f"Success: Found {len(chain['calls'])} calls and {len(chain['puts'])} puts.")
        return "PASS", f"{len(chain['calls'])} calls"
    except Exception as e:
        print(f"Failed: {e}")
        return "FAIL", str(e)

async def test_greeks():
    print("\nTesting Black-Scholes Greeks...")
    try:
        # S=100, K=100, T=0.1, r=0.05, sigma=0.2
        g = BlackScholes.greeks(S=100, K=100, T=0.1, r=0.05, sigma=0.2, option_type="call")
        print(f"Success: Delta = {g['delta']}")
        return "PASS", f"Delta: {g['delta']}"
    except Exception as e:
        print(f"Failed: {e}")
        return "FAIL", str(e)

async def test_database():
    print("\nTesting Database Connection (Supabase)...")
    try:
        async with SessionLocal() as session:
            # 執行簡單的 SELECT 1
            result = await session.execute(text("SELECT 1"))
            val = result.scalar()
            print(f"Success: Database Connection SELECT 1 = {val}")
            return "PASS", "Connected to Supabase"
    except Exception as e:
        print(f"Failed: {e}")
        return "FAIL", str(e)

async def run_all():
    results = []
    
    # Test Data Fetching
    status, note = await test_us_quote()
    results.append({"Feature": "US Market Quote", "Status": status, "Note": note})
    
    status, note = await test_tw_quote()
    results.append({"Feature": "TW Market Quote", "Status": status, "Note": note})
    
    status, note = await test_options_chain()
    results.append({"Feature": "Options Chain Data", "Status": status, "Note": note})
    
    status, note = await test_greeks()
    results.append({"Feature": "Greeks Calculation", "Status": status, "Note": note})

    # Test DB
    status, note = await test_database()
    results.append({"Feature": "Database (Supabase)", "Status": status, "Note": note})

    print("\n" + "="*50)
    print("DIAGNOSTIC SUMMARY")
    print("="*50)
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(run_all())
