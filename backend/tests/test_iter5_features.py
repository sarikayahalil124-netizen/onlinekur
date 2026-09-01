"""Iteration 5: AI alarm-from-chat, transcribe endpoint, regressions."""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL') or 'https://github-mobile-6.preview.emergentagent.com'
BASE_URL = BASE_URL.rstrip('/')

DEVICE_ALARM = "itest-alarm-iter5"
DEVICE_NORMAL = "itest-normal-iter5"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # cleanup ai messages
    for d in (DEVICE_ALARM, DEVICE_NORMAL):
        try:
            s.delete(f"{BASE_URL}/api/ai/messages?deviceId={d}", timeout=15)
        except Exception:
            pass
    # cleanup alarms created
    try:
        r = s.get(f"{BASE_URL}/api/alarms?deviceId={DEVICE_ALARM}", timeout=15)
        if r.ok:
            for a in r.json().get("items", []):
                s.delete(f"{BASE_URL}/api/alarms/{a['id']}", timeout=10)
    except Exception:
        pass


# ---------- regression: basic public endpoints ----------
class TestPublic:
    def test_prices_ok(self, api):
        r = api.get(f"{BASE_URL}/api/prices", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "items" in j and isinstance(j["items"], list)
        assert any(it["code"] == "USD" for it in j["items"]), "USD must be present"

    def test_meta_ok(self, api):
        r = api.get(f"{BASE_URL}/api/meta", timeout=15)
        assert r.status_code == 200
        assert r.json().get("app") == "ONLİNE KUR"


# ---------- AI chat: alarm intent ----------
class TestAiChatAlarm:
    def test_alarm_intent_creates_alarm(self, api):
        payload = {"deviceId": DEVICE_ALARM, "message": "Dolar 55 lira olunca haber ver"}
        r = api.post(f"{BASE_URL}/api/ai/chat", json=payload, timeout=90)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("alarmCreated") is True, f"alarmCreated should be true, got: {j}"
        assert isinstance(j.get("alarm"), dict), f"alarm object missing: {j}"
        alarm = j["alarm"]
        assert alarm["code"] == "USD", f"code should be USD, got {alarm}"
        assert alarm["condition"] == ">", f"condition should be >, got {alarm}"
        assert abs(float(alarm["target"]) - 55.0) < 0.01
        # directive must NOT leak into reply
        assert "[[ALARM" not in j.get("reply", ""), f"Directive leaked: {j['reply']!r}"
        assert "]]" not in j.get("reply", "").split("ALARM")[0] or "[[ALARM" not in j["reply"]

    def test_alarm_persisted_in_list(self, api):
        r = api.get(f"{BASE_URL}/api/alarms?deviceId={DEVICE_ALARM}", timeout=15)
        assert r.status_code == 200
        items = r.json().get("items", [])
        usd_alarms = [a for a in items if a["code"] == "USD" and abs(a["target"] - 55.0) < 0.01]
        assert len(usd_alarms) >= 1, f"USD@55 alarm not found in list: {items}"

    def test_non_alarm_message(self, api):
        payload = {"deviceId": DEVICE_NORMAL, "message": "Merhaba nasılsın"}
        r = api.post(f"{BASE_URL}/api/ai/chat", json=payload, timeout=90)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("alarmCreated") is False or j.get("alarmCreated") is None
        assert j.get("alarm") in (None, {}), f"alarm must be None: {j}"
        assert "[[ALARM" not in j.get("reply", ""), f"Directive leaked in non-alarm: {j['reply']!r}"


# ---------- transcribe endpoint ----------
class TestTranscribeEndpoint:
    def test_endpoint_exists_missing_file(self, api):
        # Direct call without a file -> FastAPI returns 422 validation error, NOT 404.
        r = requests.post(f"{BASE_URL}/api/ai/transcribe", timeout=15)
        assert r.status_code != 404, "Endpoint must exist"
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code}: {r.text}"

    def test_empty_file_returns_400(self, api):
        files = {"file": ("empty.m4a", io.BytesIO(b""), "audio/m4a")}
        r = requests.post(f"{BASE_URL}/api/ai/transcribe", files=files, timeout=15)
        assert r.status_code != 404
        assert r.status_code in (400, 422), f"expected 400 for empty audio, got {r.status_code}: {r.text}"


# ---------- AI regression ----------
class TestAiRegression:
    def test_commentary(self, api):
        r = api.post(f"{BASE_URL}/api/ai/commentary", timeout=90)
        assert r.status_code == 200, r.text
        assert r.json().get("commentary"), "commentary must be non-empty"

    def test_portfolio_advice(self, api):
        body = {"holdings": [{"code": "USD", "name": "Amerikan Doları", "type": "currency",
                              "qty": 10, "buyPrice": 45.0}]}
        r = api.post(f"{BASE_URL}/api/ai/portfolio-advice", json=body, timeout=90)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("advice"), "advice must be non-empty"
        assert j.get("totalValue", 0) > 0

    def test_ai_messages_get_and_clear(self, api):
        r = api.get(f"{BASE_URL}/api/ai/messages?deviceId={DEVICE_ALARM}", timeout=15)
        assert r.status_code == 200
        assert "items" in r.json()
        r2 = api.delete(f"{BASE_URL}/api/ai/messages?deviceId={DEVICE_NORMAL}", timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("ok") is True
