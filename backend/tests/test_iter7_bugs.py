"""Iteration 7 regression tests: history range param, transcribe with real audio, regressions."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://github-mobile-6.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    return sess


def _pick_currency_code(s):
    r = s.get(f"{API}/prices", timeout=15)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    for it in items:
        if it["type"] == "currency" and it.get("marketSell"):
            return it["code"]
    return items[0]["code"] if items else "USD"


# ---------------- BUG1: history range param no longer 500s ----------------
class TestHistoryRange:
    def test_all_ranges_return_200(self, s):
        code = _pick_currency_code(s)
        for rng in ["1s", "6s", "12s", "1G", "1H", "1A"]:
            r = s.get(f"{API}/history/{code}", params={"range": rng}, timeout=15)
            assert r.status_code == 200, f"range={rng}: {r.status_code} {r.text[:200]}"
            body = r.json()
            assert body["code"] == code
            assert body["range"] == rng
            assert "points" in body and isinstance(body["points"], list)
            assert len(body["points"]) <= 80, f"range={rng} has {len(body['points'])} points"

    def test_default_range_is_1G(self, s):
        code = _pick_currency_code(s)
        r = s.get(f"{API}/history/{code}", timeout=15)
        assert r.status_code == 200
        assert r.json()["range"] == "1G"

    def test_1s_window_not_wider_than_1G(self, s):
        code = _pick_currency_code(s)
        r_short = s.get(f"{API}/history/{code}", params={"range": "1s"}, timeout=15).json()
        r_long = s.get(f"{API}/history/{code}", params={"range": "1G"}, timeout=15).json()
        pts_short, pts_long = r_short["points"], r_long["points"]
        if pts_short and pts_long:
            # 1s first ts must be >= 1G first ts (more recent or equal)
            assert pts_short[0]["ts"] >= pts_long[0]["ts"], "1s window should not start earlier than 1G"


# ---------------- BUG2: transcribe with real audio ----------------
class TestTranscribe:
    def test_empty_file_returns_400(self, s):
        files = {"file": ("empty.m4a", b"", "audio/m4a")}
        r = s.post(f"{API}/ai/transcribe", files=files, timeout=30)
        assert r.status_code == 400, r.text

    def test_transcribe_real_audio_from_tts(self, s):
        # 1) generate an mp3 via /api/ai/tts
        r = s.post(f"{API}/ai/tts", json={"text": "Dolar bugün kırk sekiz lira"}, timeout=60)
        assert r.status_code == 200, f"tts failed: {r.status_code} {r.text[:200]}"
        url = r.json()["url"]
        # url is served under /api/... — the tts endpoint returns "/ai/tts-audio/{key}.mp3"
        audio_url = url if url.startswith("http") else f"{API}{url}"
        rg = s.get(audio_url, timeout=30)
        assert rg.status_code == 200, f"audio fetch failed: {rg.status_code}"
        audio_bytes = rg.content
        assert len(audio_bytes) > 500, "audio file suspiciously small"

        # 2) upload to transcribe
        files = {"file": ("recording.mp3", audio_bytes, "audio/mpeg")}
        r2 = s.post(f"{API}/ai/transcribe", files=files, timeout=60)
        assert r2.status_code == 200, f"transcribe failed: {r2.status_code} {r2.text[:200]}"
        text = (r2.json().get("text") or "").strip()
        assert text, "transcription text should be non-empty"


# ---------------- Regressions ----------------
class TestRegressions:
    def test_meta_ok(self, s):
        r = s.get(f"{API}/meta", timeout=15)
        assert r.status_code == 200
        assert "status" in r.json()

    def test_prices_ok(self, s):
        r = s.get(f"{API}/prices", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("items"), list)

    def test_ai_commentary_ok(self, s):
        r = s.post(f"{API}/ai/commentary", timeout=90)
        assert r.status_code == 200, r.text[:200]
        assert r.json().get("commentary")

    def test_ai_chat_alarm_intent(self, s):
        device = "TEST_iter7_device"
        # clear prior msgs
        s.delete(f"{API}/ai/messages", params={"deviceId": device})
        payload = {"deviceId": device, "message": "USD 100 lira olunca bana haber ver"}
        r = s.post(f"{API}/ai/chat", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body.get("reply")
        # alarm should be created for USD > 100
        assert body.get("alarmCreated") is True, f"expected alarmCreated=True, got: {body}"
        alarm = body.get("alarm")
        assert alarm and alarm.get("code") == "USD" and alarm.get("target") == 100
        # cleanup
        try:
            s.delete(f"{API}/alarms/{alarm['id']}", timeout=10)
        except Exception:
            pass
        s.delete(f"{API}/ai/messages", params={"deviceId": device})

    def test_portfolio_advice_ok(self, s):
        code = _pick_currency_code(s)
        # get name
        r0 = s.get(f"{API}/prices/{code}", timeout=15)
        name = r0.json().get("name", code) if r0.status_code == 200 else code
        payload = {"holdings": [{"code": code, "name": name, "type": "currency", "qty": 1000, "buyPrice": 30}]}
        r = s.post(f"{API}/ai/portfolio-advice", json=payload, timeout=90)
        assert r.status_code == 200, r.text[:200]
        assert r.json().get("advice")
