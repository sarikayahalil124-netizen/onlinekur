"""ONLİNE KUR API tests — public + admin flows."""
import os
import time
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
    tok = r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------- meta / feed ----------------------------
class TestMeta:
    def test_meta(self, s):
        r = s.get(f"{BASE}/api/meta", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("app", "source", "status", "lastSuccess"):
            assert k in d, f"missing {k}"
        assert d["source"] == "Altınkaynak"
        assert d["status"] in ("guncel", "gecikmeli", "veri_alinamiyor")


# ---------------------------- prices ---------------------------------
class TestPrices:
    def test_prices_all(self, s):
        r = s.get(f"{BASE}/api/prices?type=all", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["feedStatus"] == "guncel"
        items = d["items"]
        assert len(items) >= 10
        types = {i["type"] for i in items}
        assert "gold" in types and "currency" in types
        for i in items[:5]:
            for k in ("code", "buy", "sell", "marketBuy", "marketSell", "decimals", "dir", "status"):
                assert k in i, f"item missing {k}"

    def test_prices_gold_filter(self, s):
        r = s.get(f"{BASE}/api/prices?type=gold", timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert items and all(i["type"] == "gold" for i in items)

    def test_prices_currency_filter(self, s):
        r = s.get(f"{BASE}/api/prices?type=currency", timeout=15)
        assert r.status_code == 200
        items = r.json()["items"]
        assert items and all(i["type"] == "currency" for i in items)

    def test_usd_number_parsing(self, s):
        r = s.get(f"{BASE}/api/prices/USD", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # USD sell should be in ~40-70 TL range, not 4.8 nor 4823
        assert 30 < d["sell"] < 100, f"USD sell out of range: {d['sell']}"
        assert 30 < d["buy"] < 100
        assert d["decimals"] == 4

    def test_gram_altin_parsing(self, s):
        r = s.get(f"{BASE}/api/prices/GA", timeout=15)
        assert r.status_code == 200
        d = r.json()
        # Gram Altın sell in ~4000-15000 TL range
        assert 3000 < d["sell"] < 20000, f"GA sell out of range: {d['sell']}"
        assert d["decimals"] == 2
        assert isinstance(d.get("history"), list)

    def test_history_endpoint(self, s):
        r = s.get(f"{BASE}/api/history/USD?range=1G", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["code"] == "USD" and d["range"] == "1G"
        assert isinstance(d["points"], list)


# ---------------------------- auth -----------------------------------
class TestAuth:
    def test_login_wrong_pw(self, s):
        r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_login_ok(self, s):
        r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("access_token")

    def test_admin_health_no_token(self, s):
        r = s.get(f"{BASE}/api/admin/health", timeout=15)
        assert r.status_code == 401

    def test_admin_products_no_token(self, s):
        r = s.get(f"{BASE}/api/admin/products", timeout=15)
        assert r.status_code == 401

    def test_admin_health_with_token(self, s, auth):
        r = s.get(f"{BASE}/api/admin/health", headers=auth, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["provider"] == "Altınkaynak"
        assert "anomalyThreshold" in d
        assert "refreshInterval" in d


# ---------------------------- admin margin flow ----------------------
class TestMarginFlow:
    CODE = "USD"

    @pytest.fixture(autouse=True)
    def _reset_after(self, s, auth):
        yield
        # revert: zero out draft margin for this product & publish
        s.put(f"{BASE}/api/admin/products/{self.CODE}", headers=auth,
              json={"draft": {"mode": "auto", "useGlobalMargin": False,
                              "marginBuyType": "tl", "marginBuyValue": 0,
                              "marginSellType": "tl", "marginSellValue": 0,
                              "manualBuy": None, "manualSell": None}}, timeout=15)
        s.post(f"{BASE}/api/admin/publish", headers=auth, timeout=15)

    def test_margin_draft_and_publish(self, s, auth):
        # baseline market sell
        r0 = s.get(f"{BASE}/api/prices/{self.CODE}", timeout=15)
        assert r0.status_code == 200
        base_market_sell = r0.json()["marketSell"]

        # set draft margin +0.5 TL on sell, disable global margin
        r1 = s.put(f"{BASE}/api/admin/products/{self.CODE}", headers=auth,
                   json={"draft": {"mode": "auto", "useGlobalMargin": False,
                                   "marginSellType": "tl", "marginSellValue": 0.5,
                                   "marginBuyType": "tl", "marginBuyValue": 0}}, timeout=15)
        assert r1.status_code == 200

        # products list shows draft change
        r2 = s.get(f"{BASE}/api/admin/products", headers=auth, timeout=15)
        assert r2.status_code == 200
        pd = r2.json()
        assert pd["hasDraftChanges"] is True
        row = next(i for i in pd["items"] if i["code"] == self.CODE)
        assert row["draftPrice"]["sell"] != row["publishedPrice"]["sell"]

        # publish
        r3 = s.post(f"{BASE}/api/admin/publish", headers=auth, timeout=15)
        assert r3.status_code == 200

        # after publish, /api/prices/USD sell = marketSell + 0.5 (allow small tolerance for a fresh poll)
        time.sleep(1)
        r4 = s.get(f"{BASE}/api/prices/{self.CODE}", timeout=15)
        d = r4.json()
        # delta between published sell and current marketSell should be exactly the margin
        delta = round(d["sell"] - d["marketSell"], 4)
        assert abs(delta - 0.5) < 0.0002, f"margin delta not applied: sell={d['sell']} market={d['marketSell']} delta={delta} (baseMarket={base_market_sell})"


# ---------------------------- manual price ---------------------------
class TestManual:
    CODE = "EUR"

    @pytest.fixture(autouse=True)
    def _reset(self, s, auth):
        yield
        s.put(f"{BASE}/api/admin/products/{self.CODE}", headers=auth,
              json={"draft": {"mode": "auto", "useGlobalMargin": True,
                              "manualBuy": None, "manualSell": None,
                              "marginBuyType": "tl", "marginBuyValue": 0,
                              "marginSellType": "tl", "marginSellValue": 0}}, timeout=15)
        s.post(f"{BASE}/api/admin/publish", headers=auth, timeout=15)

    def test_manual_price(self, s, auth):
        r1 = s.put(f"{BASE}/api/admin/products/{self.CODE}", headers=auth,
                   json={"draft": {"mode": "manual", "manualBuy": "99.1234", "manualSell": "100.5678"}}, timeout=15)
        assert r1.status_code == 200
        r2 = s.post(f"{BASE}/api/admin/publish", headers=auth, timeout=15)
        assert r2.status_code == 200
        time.sleep(1)
        r3 = s.get(f"{BASE}/api/prices/{self.CODE}", timeout=15)
        d = r3.json()
        assert d["manual"] is True, f"manual flag not true: {d}"
        assert d["buy"] == 99.1234
        assert d["sell"] == 100.5678


# ---------------------------- global margin --------------------------
class TestGlobalMargin:
    @pytest.fixture(autouse=True)
    def _reset(self, s, auth):
        yield
        s.put(f"{BASE}/api/admin/global-margin", headers=auth,
              json={"gold": {"marginBuyType": "tl", "marginBuyValue": 0,
                             "marginSellType": "tl", "marginSellValue": 0},
                    "currency": {"marginBuyType": "tl", "marginBuyValue": 0,
                                 "marginSellType": "tl", "marginSellValue": 0}}, timeout=15)
        s.post(f"{BASE}/api/admin/publish", headers=auth, timeout=15)

    def test_global_margin_flow(self, s, auth):
        r = s.put(f"{BASE}/api/admin/global-margin", headers=auth,
                  json={"currency": {"marginSellType": "tl", "marginSellValue": 0.25,
                                     "marginBuyType": "tl", "marginBuyValue": 0}}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["draft"]["currency"]["marginSellValue"] == 0.25
        # publish
        r2 = s.post(f"{BASE}/api/admin/publish", headers=auth, timeout=15)
        assert r2.status_code == 200
        time.sleep(1)
        # Pick a currency that uses global margin (default is useGlobalMargin=True)
        r3 = s.get(f"{BASE}/api/prices/GBP", timeout=15)
        d3 = r3.json()
        delta = round(d3["sell"] - d3["marketSell"], 4)
        assert abs(delta - 0.25) < 0.0002, f"global margin not applied on GBP: {d3}"
