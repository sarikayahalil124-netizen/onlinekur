"""
Iteration 4 tests - AI assistant + Portfolio advice
- POST /api/ai/chat (single + multi-turn continuity)
- POST /api/ai/commentary
- POST /api/ai/portfolio-advice (math verification: totalValue, totalCost)
- GET/DELETE /api/ai/messages (history persistence + clear)
- Regression: /api/prices, /api/meta
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://github-mobile-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def device_id():
    did = f"TEST_ai_{uuid.uuid4().hex[:10]}"
    yield did
    # Cleanup
    try:
        requests.delete(f"{API}/ai/messages", params={"deviceId": did}, timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module")
def prices_index():
    """Fetch current prices, index by code."""
    r = requests.get(f"{API}/prices", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data.get("items", [])
    return {i["code"]: i for i in items if i.get("sell") is not None}


# ---------------- Regression ----------------
class TestRegression:
    def test_meta(self):
        r = requests.get(f"{API}/meta", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["app"] == "ONLİNE KUR"
        assert d["status"] in ("guncel", "gecikmeli", "veri_alinamiyor")

    def test_prices(self, prices_index):
        # prices_index built with sell filtered -- must have at least USD
        assert "USD" in prices_index, "USD price not available"
        usd = prices_index["USD"]
        assert isinstance(usd["sell"], (int, float))
        assert usd["sell"] > 0


# ---------------- AI Commentary ----------------
class TestAiCommentary:
    def test_commentary_returns_grounded_text(self):
        r = requests.post(f"{API}/ai/commentary", timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "commentary" in data and "at" in data
        assert isinstance(data["commentary"], str)
        assert len(data["commentary"].strip()) > 30, "commentary too short"


# ---------------- AI Chat ----------------
class TestAiChat:
    def test_reject_empty_message(self, device_id):
        r = requests.post(f"{API}/ai/chat", json={"deviceId": device_id, "message": "   "}, timeout=30)
        assert r.status_code == 400

    def test_chat_reply(self, device_id):
        r = requests.post(
            f"{API}/ai/chat",
            json={"deviceId": device_id, "message": "Dolar bugün ne durumda? Kısa cevap ver."},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data
        assert isinstance(data["reply"], str) and len(data["reply"].strip()) > 10

    def test_chat_history_persisted(self, device_id):
        r = requests.get(f"{API}/ai/messages", params={"deviceId": device_id}, timeout=15)
        assert r.status_code == 200
        items = r.json().get("items", [])
        # After first chat: 1 user + 1 assistant
        assert len(items) >= 2
        roles = [m["role"] for m in items]
        assert "user" in roles and "assistant" in roles

    def test_chat_multi_turn_continuity(self, device_id):
        # Second turn
        r = requests.post(
            f"{API}/ai/chat",
            json={"deviceId": device_id, "message": "Peki ya Euro? Aynı formatta yaz."},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        assert len(r.json()["reply"].strip()) > 5
        # History now should have >=4 messages
        h = requests.get(f"{API}/ai/messages", params={"deviceId": device_id}, timeout=15)
        assert h.status_code == 200
        assert len(h.json()["items"]) >= 4

    def test_clear_history(self, device_id):
        r = requests.delete(f"{API}/ai/messages", params={"deviceId": device_id}, timeout=15)
        assert r.status_code == 200
        h = requests.get(f"{API}/ai/messages", params={"deviceId": device_id}, timeout=15)
        assert h.status_code == 200
        assert h.json()["items"] == []


# ---------------- AI Portfolio Advice ----------------
class TestPortfolioAdvice:
    def test_reject_empty_portfolio(self):
        r = requests.post(f"{API}/ai/portfolio-advice", json={"holdings": []}, timeout=30)
        assert r.status_code == 400

    def test_portfolio_math_and_advice(self, prices_index):
        assert "USD" in prices_index
        usd = prices_index["USD"]
        qty = 1000.0
        buy_price = 45.0
        body = {"holdings": [
            {"code": "USD", "name": usd["name"], "type": "currency", "qty": qty, "buyPrice": buy_price}
        ]}
        r = requests.post(f"{API}/ai/portfolio-advice", json=body, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "advice" in data and "totalValue" in data and "totalCost" in data
        assert isinstance(data["advice"], str) and len(data["advice"].strip()) > 20

        expected_value = round(usd["sell"] * qty, 2)
        expected_cost = round(buy_price * qty, 2)
        # small tolerance for rounding
        assert abs(data["totalValue"] - expected_value) < 1.0, (
            f"totalValue mismatch: expected {expected_value}, got {data['totalValue']}"
        )
        assert abs(data["totalCost"] - expected_cost) < 0.01, (
            f"totalCost mismatch: expected {expected_cost}, got {data['totalCost']}"
        )

    def test_portfolio_multi_holdings(self, prices_index):
        holdings = []
        for code in ("USD", "EUR"):
            if code in prices_index:
                holdings.append({
                    "code": code, "name": prices_index[code]["name"],
                    "type": "currency", "qty": 100.0, "buyPrice": None
                })
        if len(holdings) < 2:
            pytest.skip("USD/EUR not both available")
        r = requests.post(f"{API}/ai/portfolio-advice", json={"holdings": holdings}, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        expected = sum(prices_index[h["code"]]["sell"] * h["qty"] for h in holdings)
        assert abs(data["totalValue"] - round(expected, 2)) < 1.0
        assert data["totalCost"] == 0.0  # no buyPrice provided


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
