"""
FastAPI Backend Integration Test for IRIS
Tests /api/parse-intent, /api/watch-and-strike, and /api/chat with the new native engine.
"""

import sys
import os
import asyncio
from pydantic import BaseModel

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app, ChatRequest, WatchAndStrikeRequest, IntentRequest, parse_intent_route, chat_endpoint, setup_watch_and_strike

async def run_api_tests():
    print("\n=== Testing FastAPI Backend API with Native Engine ===")
    
    # 1. Test Parse Intent (<1ms rule-based routing)
    print("\n1. Testing /api/parse-intent...")
    req1 = IntentRequest(command="When critical error appears in terminal, copy to incident form")
    res1 = await parse_intent_route(req1)
    print("Parsed Intent:", res1)
    assert res1["status"] == "success"

    # 2. Test Watch & Strike Setup (Autonomous zero-vision OCR + UIA)
    print("\n2. Testing /api/watch-and-strike setup...")
    req2 = WatchAndStrikeRequest(
        source_bbox={"x": 50, "y": 100, "w": 400, "h": 300},
        target_bbox={"x": 500, "y": 100, "w": 300, "h": 200},
        condition="when critical error occurs",
        action_text="paste incident details",
        mode="when"
    )
    res2 = await setup_watch_and_strike(req2)
    print("Watch & Strike Response:", res2)
    assert res2["status"] == "success"
    task_id = res2["task_id"]

    # 3. Test Chat with Native Screen Grounding
    print("\n3. Testing /api/chat with OCR + UIA Context Grounding...")
    req3 = ChatRequest(text="What is on my screen right now?")
    res3 = await chat_endpoint(req3)
    print("Chat Response:", res3)
    assert "response" in res3

    # Clean up watcher
    import watcher
    watcher.stop_watcher(task_id)
    print("\n=== All Backend API Endpoints Verified Successfully! ===")

if __name__ == "__main__":
    asyncio.run(run_api_tests())
