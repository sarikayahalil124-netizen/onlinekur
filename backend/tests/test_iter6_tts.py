"""Iteration 6 - Text-to-Speech (TTS) tests + regression."""
import os
import re
import io
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://github-mobile-6.preview.emergentagent.com").rstrip("/")
DEVICE_ID = "itest-iter6-tts"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # cleanup ai messages for our device id
    try:
        s.delete(f"{BASE_URL}/api/ai/messages", params={"deviceId": DEVICE_ID}, timeout=10)
    except Exception:
        pass


# -------------------------- TTS: main flow --------------------------
class TestTTS:
    def test_tts_generate_returns_url(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/ai/tts", json={"text": "Merhaba dolar 48 lira"}, timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data
        assert re.fullmatch(r"/ai/tts-audio/[a-f0-9]{64}\.mp3", data["url"]), data["url"]
        pytest.tts_url = data["url"]

    def test_tts_audio_fetch(self, api_client):
        url = getattr(pytest, "tts_url", None)
        assert url, "previous test must set url"
        r = api_client.get(f"{BASE_URL}/api{url}", timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("audio/mpeg"), r.headers.get("content-type")
        assert len(r.content) > 1000, f"body too small: {len(r.content)}"

    def test_tts_empty_text_400(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/ai/tts", json={"text": ""}, timeout=15)
        assert r.status_code == 400, r.text

    def test_tts_whitespace_only_400(self, api_client):
        # whitespace-only should also be 400 (clean_for_tts strips)
        r = api_client.post(f"{BASE_URL}/api/ai/tts", json={"text": "   \n  "}, timeout=15)
        assert r.status_code == 400, r.text

    def test_tts_audio_invalid_key_404(self, api_client):
        # regex-guarded: non-hex key must 404
        r = api_client.get(f"{BASE_URL}/api/ai/tts-audio/invalidkey.mp3", timeout=15)
        assert r.status_code == 404, r.text

    def test_tts_audio_valid_hex_but_missing_404(self, api_client):
        # 64 hex chars but never generated -> 404
        fake = "0" * 64
        r = api_client.get(f"{BASE_URL}/api/ai/tts-audio/{fake}.mp3", timeout=15)
        assert r.status_code == 404, r.text

    def test_tts_cache_same_key(self, api_client):
        r1 = api_client.post(f"{BASE_URL}/api/ai/tts", json={"text": "test cache aynı metin"}, timeout=45)
        r2 = api_client.post(f"{BASE_URL}/api/ai/tts", json={"text": "test cache aynı metin"}, timeout=45)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["url"] == r2.json()["url"]


# -------------------------- Regression --------------------------
class TestRegression:
    def test_prices_ok(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/prices", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and isinstance(j["items"], list)

    def test_ai_chat_ok(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/ai/chat",
                            json={"deviceId": DEVICE_ID, "message": "Merhaba"}, timeout=60)
        assert r.status_code == 200, r.text
        assert "reply" in r.json() and r.json()["reply"]

    def test_ai_commentary_ok(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/ai/commentary", timeout=60)
        assert r.status_code == 200, r.text
        assert "commentary" in r.json()

    def test_ai_portfolio_advice_ok(self, api_client):
        body = {"holdings": [{"code": "USD", "name": "Amerikan Doları", "type": "currency", "qty": 10, "buyPrice": 40.0}]}
        r = api_client.post(f"{BASE_URL}/api/ai/portfolio-advice", json=body, timeout=60)
        assert r.status_code == 200, r.text
        assert "advice" in r.json()

    def test_ai_transcribe_empty_returns_error(self, api_client):
        # No file field -> FastAPI 422; empty file -> our 400
        s = requests.Session()
        files = {"file": ("empty.m4a", io.BytesIO(b""), "audio/m4a")}
        r = s.post(f"{BASE_URL}/api/ai/transcribe", files=files, timeout=20)
        assert r.status_code in (400, 422), f"got {r.status_code}: {r.text}"
