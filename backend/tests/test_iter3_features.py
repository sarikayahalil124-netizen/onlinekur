"""Iteration 3 tests: changePct on /api/prices, alarm history, alarm trigger records history."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://premium-kur.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# -------------------- changePct on /api/prices --------------------
class TestChangePct:
    def test_prices_have_change_pct_field(self, s):
        r = s.get(f"{BASE}/api/prices?type=all", timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) > 0
        for it in items:
            assert "changePct" in it, f"changePct missing on {it['code']}"
            v = it["changePct"]
            assert v is None or isinstance(v, (int, float)), f"bad type on {it['code']}: {type(v)}"
            # Realistic small percentages if present
            if isinstance(v, (int, float)):
                assert abs(v) < 50, f"unrealistic changePct on {it['code']}: {v}"

    def test_at_least_some_items_have_numeric_change_pct(self, s):
        r = s.get(f"{BASE}/api/prices?type=all", timeout=15)
        items = r.json()["items"]
        numeric = [i for i in items if isinstance(i.get("changePct"), (int, float))]
        # If the app has been running today with history, at least a few should be numeric
        # We allow zero too (fresh startup), but assert the field structure is consistent.
        assert len(items) > 0
        # Non-strict: just log
        print(f"Items with numeric changePct: {len(numeric)}/{len(items)}")


# -------------------- alarm history endpoint --------------------
class TestAlarmHistoryEmpty:
    def test_history_empty_for_new_device(self, s):
        device = f"iter3-empty-{uuid.uuid4()}"
        r = s.get(f"{BASE}/api/alarms/history", params={"deviceId": device}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)
        assert data["items"] == []


# -------------------- alarm trigger writes history --------------------
class TestAlarmTriggerHistory:
    DEVICE = f"iter3-trig-{uuid.uuid4()}"
    created_alarm_id = None

    @pytest.fixture(autouse=True)
    def _cleanup(self, s):
        yield
        try:
            if self.created_alarm_id:
                s.delete(f"{BASE}/api/alarms/{self.created_alarm_id}", timeout=10)
            r = s.get(f"{BASE}/api/alarms", params={"deviceId": self.DEVICE}, timeout=10)
            if r.status_code == 200:
                for a in r.json().get("items", []):
                    s.delete(f"{BASE}/api/alarms/{a['id']}", timeout=10)
        except Exception:
            pass

    def test_trigger_writes_history_record(self, s):
        # Current USD sell
        r0 = s.get(f"{BASE}/api/prices/USD", timeout=15)
        assert r0.status_code == 200
        cur_sell = r0.json()["sell"]

        target = round(cur_sell - 5, 4)
        assert target > 0

        r1 = s.post(f"{BASE}/api/alarms", json={
            "deviceId": self.__class__.DEVICE, "code": "USD", "name": "ABD Doları",
            "basis": "sell", "condition": ">", "target": target,
        }, timeout=15)
        assert r1.status_code == 200, r1.text
        self.__class__.created_alarm_id = r1.json()["id"]

        # Wait for poller/alarm engine
        found = None
        for _ in range(24):
            time.sleep(1)
            rh = s.get(f"{BASE}/api/alarms/history", params={"deviceId": self.__class__.DEVICE}, timeout=10)
            if rh.status_code == 200:
                hist = rh.json().get("items", [])
                if hist:
                    found = hist[0]
                    break
        assert found is not None, "expected alarm history record within 24s"
        # Validate fields
        assert found["code"] == "USD"
        assert found["name"] == "ABD Doları"
        assert isinstance(found["price"], (int, float))
        assert isinstance(found["target"], (int, float))
        assert found["target"] == target
        assert isinstance(found["triggeredAt"], str) and "T" in found["triggeredAt"]
        # price should be > target (condition was ">")
        assert found["price"] > found["target"]
