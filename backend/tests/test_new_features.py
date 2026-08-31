"""Iteration 2 new-feature tests: dayHigh/Low, alarms CRUD & trigger, register-push, admin reorder."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://premium-kur.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@onlinekur.com"
ADMIN_PASSWORD = "OnlineKur2026!Admin"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def token(s):
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# -------------------- prices sorted by order --------------------
class TestPricesOrder:
    def test_prices_sorted_by_order(self, s):
        r = s.get(f"{BASE}/api/prices?type=all", timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        orders = [i.get("order", 999) for i in items]
        assert orders == sorted(orders), f"items not sorted by order: {orders[:10]}"

    def test_prices_currency_only(self, s):
        r = s.get(f"{BASE}/api/prices?type=currency", timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["type"] == "currency" for i in items)


# -------------------- day high/low --------------------
class TestDayRange:
    def test_usd_day_range_present(self, s):
        r = s.get(f"{BASE}/api/prices/USD", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "dayHigh" in d and "dayLow" in d
        assert isinstance(d["dayHigh"], (int, float))
        assert isinstance(d["dayLow"], (int, float))
        assert d["dayLow"] <= d["sell"] <= d["dayHigh"], f"invariant broken: low={d['dayLow']} sell={d['sell']} high={d['dayHigh']}"

    def test_gold_day_range(self, s):
        r = s.get(f"{BASE}/api/prices/GA", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["dayLow"] <= d["sell"] <= d["dayHigh"]


# -------------------- register-push (placeholder key -> graceful error) --------------------
class TestRegisterPush:
    def test_register_push_graceful(self, s):
        body = {"user_id": f"test-device-{uuid.uuid4()}", "platform": "android", "device_token": "dummy-token-xyz"}
        r = s.post(f"{BASE}/api/register-push", json=body, timeout=20)
        # With placeholder EMERGENT_PUSH_KEY, upstream should 401 -> our API surfaces 500 with a clean message,
        # or 502 if provider is unavailable. Anything <600 and not a crash is acceptable.
        assert r.status_code in (200, 201, 500, 502), f"unexpected: {r.status_code} {r.text}"
        # Still, backend should NOT crash: subsequent meta ping must succeed
        m = s.get(f"{BASE}/api/meta", timeout=10)
        assert m.status_code == 200


# -------------------- alarms CRUD + trigger --------------------
class TestAlarms:
    DEVICE = f"test-device-{uuid.uuid4()}"

    @pytest.fixture(autouse=True)
    def _cleanup(self, s):
        yield
        # cleanup any leftover alarms for this device
        try:
            r = s.get(f"{BASE}/api/alarms", params={"deviceId": self.DEVICE}, timeout=15)
            if r.status_code == 200:
                for a in r.json().get("items", []):
                    s.delete(f"{BASE}/api/alarms/{a['id']}", timeout=10)
        except Exception:
            pass

    def test_create_list_trigger_reset_delete(self, s):
        # get current USD price
        r0 = s.get(f"{BASE}/api/prices/USD", timeout=15)
        assert r0.status_code == 200
        usd = r0.json()
        cur_sell = usd["sell"]
        # target well below current -> "> target" triggers immediately
        target = round(cur_sell - 5, 4)
        assert target > 0

        # CREATE
        r1 = s.post(f"{BASE}/api/alarms", json={
            "deviceId": self.DEVICE, "code": "USD", "name": "ABD Doları",
            "basis": "sell", "condition": ">", "target": target,
        }, timeout=15)
        assert r1.status_code == 200, r1.text
        alarm = r1.json()
        assert alarm["code"] == "USD"
        assert alarm["target"] == target
        assert alarm["active"] is True
        assert alarm["triggeredAt"] is None
        alarm_id = alarm["id"]

        # LIST
        r2 = s.get(f"{BASE}/api/alarms", params={"deviceId": self.DEVICE}, timeout=15)
        assert r2.status_code == 200
        items = r2.json()["items"]
        assert any(a["id"] == alarm_id for a in items)

        # WAIT for poller to trigger (interval 10s, allow up to 20s)
        triggered = False
        for _ in range(24):
            time.sleep(1)
            rl = s.get(f"{BASE}/api/alarms", params={"deviceId": self.DEVICE}, timeout=10)
            if rl.status_code == 200:
                a = next((x for x in rl.json()["items"] if x["id"] == alarm_id), None)
                if a and a.get("triggeredAt"):
                    triggered = True
                    break
        assert triggered, "alarm should have been triggered within 20s"

        # RESET via PUT active=false
        r3 = s.put(f"{BASE}/api/alarms/{alarm_id}", json={"active": False}, timeout=15)
        assert r3.status_code == 200
        rl = s.get(f"{BASE}/api/alarms", params={"deviceId": self.DEVICE}, timeout=10)
        a = next(x for x in rl.json()["items"] if x["id"] == alarm_id)
        assert a["active"] is False
        assert a["triggeredAt"] is None, "triggeredAt should be reset when active=false"

        # DELETE (soft)
        r4 = s.delete(f"{BASE}/api/alarms/{alarm_id}", timeout=15)
        assert r4.status_code == 200
        rl = s.get(f"{BASE}/api/alarms", params={"deviceId": self.DEVICE}, timeout=10)
        assert not any(x["id"] == alarm_id for x in rl.json()["items"])

    def test_bad_condition_rejected(self, s):
        r = s.post(f"{BASE}/api/alarms", json={
            "deviceId": self.DEVICE, "code": "USD", "name": "ABD Doları",
            "basis": "sell", "condition": "==", "target": 40.0,
        }, timeout=10)
        assert r.status_code == 400


# -------------------- admin reorder --------------------
class TestReorder:
    def test_reorder_requires_auth(self, s):
        r = s.put(f"{BASE}/api/admin/reorder", json={"codes": ["USD", "EUR"]}, timeout=10)
        assert r.status_code == 401

    def test_reorder_reflects_in_prices(self, s, auth):
        # snapshot current currency order
        r0 = s.get(f"{BASE}/api/prices?type=currency", timeout=15)
        assert r0.status_code == 200
        original_codes = [i["code"] for i in r0.json()["items"]]
        assert len(original_codes) >= 2
        reversed_codes = list(reversed(original_codes))

        try:
            # apply reversed order
            r1 = s.put(f"{BASE}/api/admin/reorder", headers=auth,
                       json={"codes": reversed_codes}, timeout=15)
            assert r1.status_code == 200
            assert r1.json().get("ok") is True

            # verify /prices reflects new order
            r2 = s.get(f"{BASE}/api/prices?type=currency", timeout=15)
            assert r2.status_code == 200
            new_codes = [i["code"] for i in r2.json()["items"]]
            assert new_codes == reversed_codes, f"order not reflected: {new_codes} vs {reversed_codes}"
        finally:
            # restore original
            s.put(f"{BASE}/api/admin/reorder", headers=auth,
                  json={"codes": original_codes}, timeout=15)
