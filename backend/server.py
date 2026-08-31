from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import time
import asyncio
import logging
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime, timedelta, timezone
from typing import Optional, Any

import httpx
import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ------------------------------------------------------------------ config
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

GOLD_URL = os.environ.get('ALTINKAYNAK_GOLD_URL', 'https://static.altinkaynak.com/public/Gold')
CURRENCY_URL = os.environ.get('ALTINKAYNAK_CURRENCY_URL', 'https://static.altinkaynak.com/public/Currency')
REFRESH_INTERVAL = int(os.environ.get('REFRESH_INTERVAL_SECONDS', '10'))
ANOMALY_THRESHOLD_PCT = float(os.environ.get('ANOMALY_THRESHOLD_PCT', '30'))
STALE_SECONDS = int(os.environ.get('STALE_SECONDS', '90'))

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALG = 'HS256'
JWT_EXPIRE_MINUTES = int(os.environ.get('JWT_EXPIRE_MINUTES', '1440'))
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@onlinekur.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'OnlineKur2026!')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("onlinekur")

app = FastAPI(title="ONLİNE KUR API")
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

# ------------------------------------------------------------------ priority / decimals
GOLD_PRIORITY = ["GA", "PGA", "HH_T", "CH_T", "PB", "B_T", "PC", "PY", "PT", "PA", "A_T", "PG", "PR"]
CURRENCY_PRIORITY = ["USD", "EUR", "GBP", "CHF"]


def decimals_for(ptype: str) -> int:
    return 4 if ptype == 'currency' else 2


# ------------------------------------------------------------------ in-memory market cache
# code -> record dict
MARKET: dict[str, dict] = {}
PROVIDER = {
    "status": "connecting",          # ok | delayed | down | connecting
    "goldOk": False,
    "currencyOk": False,
    "lastSuccess": None,             # iso str
    "lastSuccessTs": 0.0,            # epoch
    "latencyMs": None,
    "lastError": None,
    "activeCount": 0,
    "source": "Altınkaynak",
}


# ------------------------------------------------------------------ number parsing / formatting
def parse_tr_number(raw: Any) -> Optional[Decimal]:
    """Turkish formatted number string -> Decimal. '6.770,60' -> 6770.60, '48,010' -> 48.010"""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    # If it already looks like a plain decimal (from admin manual input possibly)
    if re.fullmatch(r"-?\d+(\.\d+)?", s):
        try:
            return Decimal(s)
        except InvalidOperation:
            return None
    s = s.replace(".", "").replace(",", ".")
    s = re.sub(r"[^0-9.\-]", "", s)
    try:
        return Decimal(s) if s not in ("", "-", ".") else None
    except InvalidOperation:
        return None


def quantize(value: Decimal, dec: int) -> float:
    q = Decimal(1).scaleb(-dec)  # 0.01 or 0.0001
    return float(value.quantize(q, rounding=ROUND_HALF_UP))


def apply_margin(base: Decimal, mtype: str, mval) -> Decimal:
    try:
        v = Decimal(str(mval))
    except (InvalidOperation, TypeError):
        v = Decimal(0)
    if mtype == 'pct':
        return base * (Decimal(1) + v / Decimal(100))
    return base + v


# ------------------------------------------------------------------ rule defaults
def default_rule() -> dict:
    return {
        "mode": "auto",
        "manualBuy": None,
        "manualSell": None,
        "useGlobalMargin": True,
        "marginBuyType": "tl",
        "marginBuyValue": 0,
        "marginSellType": "tl",
        "marginSellValue": 0,
    }


def default_global() -> dict:
    base = {"marginBuyType": "tl", "marginBuyValue": 0, "marginSellType": "tl", "marginSellValue": 0}
    return {"gold": dict(base), "currency": dict(base)}


# ------------------------------------------------------------------ poller
async def fetch_endpoint(clientx: httpx.AsyncClient, url: str) -> list:
    r = await clientx.get(url, timeout=8.0)
    r.raise_for_status()
    return r.json()


def ingest(items: list, ptype: str):
    """Normalize + anomaly check + history-worthy detection. Returns list of (code, changed)."""
    for it in items:
        code = str(it.get("Kod", "")).strip()
        if not code:
            continue
        name = str(it.get("Aciklama", "")).strip() or code
        buy = parse_tr_number(it.get("Alis"))
        sell = parse_tr_number(it.get("Satis"))
        provider_ts = str(it.get("GuncellenmeZamani", "")).strip()
        if buy is None or sell is None:
            continue
        dec = decimals_for(ptype)
        prev = MARKET.get(code)
        # anomaly: reject absurd jumps vs last good
        if prev is not None and prev.get("sellDec"):
            try:
                old = Decimal(str(prev["sellDec"]))
                if old > 0:
                    dev = abs(sell - old) / old * Decimal(100)
                    if dev > Decimal(str(ANOMALY_THRESHOLD_PCT)):
                        logger.warning("Anomaly rejected %s: %s -> %s (%.1f%%)", code, old, sell, dev)
                        continue
            except (InvalidOperation, TypeError):
                pass

        changed = prev is None or prev.get("providerUpdatedAt") != provider_ts
        direction = "flat"
        prev_sell = prev.get("sellDec") if prev else None
        if prev is not None and changed:
            try:
                po = Decimal(str(prev["sellDec"]))
                if sell > po:
                    direction = "up"
                elif sell < po:
                    direction = "down"
            except (InvalidOperation, TypeError):
                direction = "flat"
        elif prev is not None:
            direction = prev.get("dir", "flat")

        MARKET[code] = {
            "code": code,
            "name": name,
            "type": ptype,
            "buyDec": str(buy),
            "sellDec": str(sell),
            "buy": quantize(buy, dec),
            "sell": quantize(sell, dec),
            "prevSell": float(prev_sell) if prev_sell not in (None,) else None,
            "dir": direction,
            "decimals": dec,
            "providerUpdatedAt": provider_ts,
            "receivedAt": datetime.now(timezone.utc).isoformat(),
        }
        if changed:
            asyncio.create_task(_save_history(code, ptype, float(buy), float(sell), provider_ts))
            asyncio.create_task(_ensure_config(code, ptype, name))


async def _save_history(code: str, ptype: str, buy: float, sell: float, provider_ts: str):
    try:
        await db.price_history.insert_one({
            "code": code, "type": ptype, "buy": buy, "sell": sell,
            "providerUpdatedAt": provider_ts,
            "ts": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.error("history save failed %s: %s", code, e)


async def _ensure_config(code: str, ptype: str, name: str):
    try:
        existing = await db.product_configs.find_one({"_id": code})
        if existing is None:
            priority = (GOLD_PRIORITY if ptype == 'gold' else CURRENCY_PRIORITY)
            order = priority.index(code) if code in priority else 500 + len(code)
            await db.product_configs.insert_one({
                "_id": code, "type": ptype, "name": name,
                "active": True, "order": order,
                "draft": default_rule(), "published": default_rule(),
                "createdAt": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        logger.error("ensure config failed %s: %s", code, e)


async def poll_once():
    async with httpx.AsyncClient() as cx:
        t0 = time.perf_counter()
        gold_ok = curr_ok = False
        err = None
        try:
            gold = await fetch_endpoint(cx, GOLD_URL)
            ingest(gold, 'gold')
            gold_ok = True
        except Exception as e:
            err = f"Gold: {e}"
            logger.error("gold fetch failed: %s", e)
        try:
            curr = await fetch_endpoint(cx, CURRENCY_URL)
            ingest(curr, 'currency')
            curr_ok = True
        except Exception as e:
            err = f"{(err + ' | ') if err else ''}Currency: {e}"
            logger.error("currency fetch failed: %s", e)

        latency = round((time.perf_counter() - t0) * 1000)
        PROVIDER["goldOk"] = gold_ok
        PROVIDER["currencyOk"] = curr_ok
        PROVIDER["latencyMs"] = latency
        if gold_ok or curr_ok:
            PROVIDER["lastSuccess"] = datetime.now(timezone.utc).isoformat()
            PROVIDER["lastSuccessTs"] = time.time()
            PROVIDER["status"] = "ok" if (gold_ok and curr_ok) else "delayed"
        else:
            PROVIDER["status"] = "down"
        if err:
            PROVIDER["lastError"] = err
        PROVIDER["activeCount"] = len(MARKET)


async def poller_loop():
    while True:
        try:
            await poll_once()
        except Exception as e:
            logger.error("poller error: %s", e)
        await asyncio.sleep(REFRESH_INTERVAL)


# ------------------------------------------------------------------ auth helpers
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def issue_token(admin_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": admin_id, "email": email, "role": "admin",
        "iat": now, "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def current_admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    unauth = HTTPException(status_code=401, detail="Yetkisiz erişim",
                           headers={"WWW-Authenticate": "Bearer"})
    if creds is None or creds.scheme.lower() != "bearer":
        raise unauth
    try:
        claims = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG],
                            options={"require": ["sub", "exp", "iat"]})
    except jwt.PyJWTError:
        raise unauth
    if claims.get("role") != "admin":
        raise unauth
    try:
        aid = ObjectId(claims["sub"])
    except (InvalidId, TypeError):
        raise unauth
    admin = await db.admins.find_one({"_id": aid, "active": True})
    if admin is None:
        raise unauth
    return admin


# ------------------------------------------------------------------ price computation
def compute_price(market: dict, rule: dict, global_pub: dict, dec: int) -> dict:
    manual = False
    if rule.get("mode") == "manual" and rule.get("manualBuy") and rule.get("manualSell"):
        b = parse_tr_number(rule["manualBuy"])
        s = parse_tr_number(rule["manualSell"])
        if b is not None and s is not None:
            buy, sell, manual = b, s, True
        else:
            buy, sell = Decimal(market["buyDec"]), Decimal(market["sellDec"])
    else:
        mb = Decimal(market["buyDec"])
        ms = Decimal(market["sellDec"])
        if rule.get("useGlobalMargin", True):
            g = global_pub.get(market["type"], {})
            buy = apply_margin(mb, g.get("marginBuyType", "tl"), g.get("marginBuyValue", 0))
            sell = apply_margin(ms, g.get("marginSellType", "tl"), g.get("marginSellValue", 0))
        else:
            buy = apply_margin(mb, rule.get("marginBuyType", "tl"), rule.get("marginBuyValue", 0))
            sell = apply_margin(ms, rule.get("marginSellType", "tl"), rule.get("marginSellValue", 0))
    return {"buy": quantize(buy, dec), "sell": quantize(sell, dec), "manual": manual}


def feed_status() -> str:
    if not PROVIDER["lastSuccessTs"]:
        return "veri_alinamiyor"
    age = time.time() - PROVIDER["lastSuccessTs"]
    if PROVIDER["status"] == "down" or age > STALE_SECONDS * 4:
        return "veri_alinamiyor"
    if age > STALE_SECONDS or PROVIDER["status"] == "delayed":
        return "gecikmeli"
    return "guncel"


async def get_global(kind: str = "published") -> dict:
    doc = await db.global_margin.find_one({"_id": "global_margin"})
    if not doc:
        d = default_global()
        await db.global_margin.insert_one({"_id": "global_margin", "draft": d,
                                           "published": default_global()})
        return default_global() if kind == "published" else d
    return doc.get(kind, default_global())


# ------------------------------------------------------------------ public endpoints
@api_router.get("/")
async def root():
    return {"app": "ONLİNE KUR", "source": "Altınkaynak"}


@api_router.get("/meta")
async def meta():
    return {
        "app": "ONLİNE KUR",
        "source": PROVIDER["source"],
        "status": feed_status(),
        "lastSuccess": PROVIDER["lastSuccess"],
        "latencyMs": PROVIDER["latencyMs"],
        "activeCount": PROVIDER["activeCount"],
    }


@api_router.get("/prices")
async def get_prices(type: str = "all"):
    global_pub = await get_global("published")
    configs = await db.product_configs.find({"active": True}).to_list(1000)
    st = feed_status()
    out = []
    for cfg in configs:
        code = cfg["_id"]
        if type in ("gold", "currency") and cfg["type"] != type:
            continue
        market = MARKET.get(code)
        if market is None:
            out.append({
                "code": code, "name": cfg.get("name", code), "type": cfg["type"],
                "buy": None, "sell": None, "marketBuy": None, "marketSell": None,
                "decimals": decimals_for(cfg["type"]), "dir": "flat",
                "status": "veri_yok", "manual": False, "order": cfg.get("order", 999),
                "providerUpdatedAt": None,
            })
            continue
        dec = market["decimals"]
        priced = compute_price(market, cfg.get("published", default_rule()), global_pub, dec)
        out.append({
            "code": code, "name": market["name"], "type": market["type"],
            "buy": priced["buy"], "sell": priced["sell"],
            "marketBuy": market["buy"], "marketSell": market["sell"],
            "decimals": dec, "dir": market["dir"],
            "status": "veri_alinamiyor" if st == "veri_alinamiyor" else st,
            "manual": priced["manual"], "order": cfg.get("order", 999),
            "providerUpdatedAt": market["providerUpdatedAt"],
            "receivedAt": market["receivedAt"],
        })
    out.sort(key=lambda x: (x["order"], x["code"]))
    return {"source": PROVIDER["source"], "feedStatus": st,
            "lastSuccess": PROVIDER["lastSuccess"], "items": out}


@api_router.get("/prices/{code}")
async def get_price(code: str):
    cfg = await db.product_configs.find_one({"_id": code})
    market = MARKET.get(code)
    if cfg is None or market is None:
        raise HTTPException(status_code=404, detail="Veri Yok")
    global_pub = await get_global("published")
    dec = market["decimals"]
    priced = compute_price(market, cfg.get("published", default_rule()), global_pub, dec)
    hist = await db.price_history.find({"code": code}).sort("ts", -1).limit(200).to_list(200)
    hist = list(reversed([{"buy": h["buy"], "sell": h["sell"], "ts": h["ts"]} for h in hist]))
    return {
        "code": code, "name": market["name"], "type": market["type"],
        "buy": priced["buy"], "sell": priced["sell"],
        "marketBuy": market["buy"], "marketSell": market["sell"],
        "decimals": dec, "dir": market["dir"], "manual": priced["manual"],
        "status": feed_status(), "source": PROVIDER["source"],
        "providerUpdatedAt": market["providerUpdatedAt"],
        "receivedAt": market["receivedAt"],
        "history": hist,
    }


@api_router.get("/history/{code}")
async def get_history(code: str, range: str = "1G"):
    ranges = {"1G": 1, "1H": 7, "1A": 30, "3A": 90, "6A": 180, "1Y": 365}
    days = ranges.get(range, 1)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    docs = await db.price_history.find({"code": code, "ts": {"$gte": since}}).sort("ts", 1).to_list(2000)
    return {"code": code, "range": range,
            "points": [{"buy": d["buy"], "sell": d["sell"], "ts": d["ts"]} for d in docs]}


# ------------------------------------------------------------------ auth endpoints
class LoginRequest(BaseModel):
    email: str
    password: str


@api_router.post("/auth/login")
async def login(body: LoginRequest):
    email = body.email.strip().lower()
    admin = await db.admins.find_one({"email": email, "active": True})
    dummy = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.9q7p7f8qQJQ6o9K4Qw4g2M7x0S9k8e"
    stored = admin["password_hash"] if admin else dummy
    if admin is None or not verify_password(body.password, stored):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    token = issue_token(str(admin["_id"]), email)
    return {"access_token": token, "token_type": "bearer", "email": email}


@api_router.get("/admin/me")
async def admin_me(admin: dict = Depends(current_admin)):
    return {"id": str(admin["_id"]), "email": admin["email"]}


# ------------------------------------------------------------------ admin endpoints
@api_router.get("/admin/health")
async def admin_health(_: dict = Depends(current_admin)):
    gold_count = len([m for m in MARKET.values() if m["type"] == "gold"])
    curr_count = len([m for m in MARKET.values() if m["type"] == "currency"])
    return {
        "provider": "Altınkaynak",
        "status": PROVIDER["status"],
        "feedStatus": feed_status(),
        "goldOk": PROVIDER["goldOk"],
        "currencyOk": PROVIDER["currencyOk"],
        "lastSuccess": PROVIDER["lastSuccess"],
        "latencyMs": PROVIDER["latencyMs"],
        "lastError": PROVIDER["lastError"],
        "goldCount": gold_count,
        "currencyCount": curr_count,
        "activeCount": PROVIDER["activeCount"],
        "refreshInterval": REFRESH_INTERVAL,
        "anomalyThreshold": ANOMALY_THRESHOLD_PCT,
    }


@api_router.get("/admin/products")
async def admin_products(_: dict = Depends(current_admin)):
    global_draft = await get_global("draft")
    global_pub = await get_global("published")
    configs = await db.product_configs.find({}).to_list(1000)
    out = []
    for cfg in configs:
        code = cfg["_id"]
        market = MARKET.get(code)
        dec = decimals_for(cfg["type"])
        row = {
            "code": code, "name": cfg.get("name", code), "type": cfg["type"],
            "active": cfg.get("active", True), "order": cfg.get("order", 999),
            "draft": cfg.get("draft", default_rule()),
            "published": cfg.get("published", default_rule()),
            "marketBuy": market["buy"] if market else None,
            "marketSell": market["sell"] if market else None,
            "decimals": dec,
            "providerUpdatedAt": market["providerUpdatedAt"] if market else None,
        }
        if market:
            row["publishedPrice"] = compute_price(market, cfg.get("published", default_rule()), global_pub, dec)
            row["draftPrice"] = compute_price(market, cfg.get("draft", default_rule()), global_draft, dec)
        else:
            row["publishedPrice"] = None
            row["draftPrice"] = None
        out.append(row)
    out.sort(key=lambda x: (x["order"], x["code"]))
    # detect unpublished changes
    dirty = any(c.get("draft") != c.get("published") for c in configs) or (global_draft != global_pub)
    return {"items": out, "globalDraft": global_draft, "globalPublished": global_pub, "hasDraftChanges": dirty}


class ProductUpdate(BaseModel):
    active: Optional[bool] = None
    order: Optional[int] = None
    draft: Optional[dict] = None


@api_router.put("/admin/products/{code}")
async def update_product(code: str, body: ProductUpdate, _: dict = Depends(current_admin)):
    cfg = await db.product_configs.find_one({"_id": code})
    if cfg is None:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı")
    update = {}
    if body.active is not None:
        update["active"] = body.active
    if body.order is not None:
        update["order"] = body.order
    if body.draft is not None:
        merged = {**default_rule(), **cfg.get("draft", {}), **body.draft}
        update["draft"] = merged
    if update:
        await db.product_configs.update_one({"_id": code}, {"$set": update})
    return {"ok": True}


class GlobalUpdate(BaseModel):
    gold: Optional[dict] = None
    currency: Optional[dict] = None


@api_router.put("/admin/global-margin")
async def update_global(body: GlobalUpdate, _: dict = Depends(current_admin)):
    draft = await get_global("draft")
    if body.gold is not None:
        draft["gold"] = {**draft.get("gold", {}), **body.gold}
    if body.currency is not None:
        draft["currency"] = {**draft.get("currency", {}), **body.currency}
    await db.global_margin.update_one({"_id": "global_margin"}, {"$set": {"draft": draft}}, upsert=True)
    return {"ok": True, "draft": draft}


@api_router.post("/admin/publish")
async def publish(_: dict = Depends(current_admin)):
    configs = await db.product_configs.find({}).to_list(1000)
    for cfg in configs:
        await db.product_configs.update_one({"_id": cfg["_id"]},
                                            {"$set": {"published": cfg.get("draft", default_rule())}})
    gdoc = await db.global_margin.find_one({"_id": "global_margin"})
    if gdoc:
        await db.global_margin.update_one({"_id": "global_margin"},
                                          {"$set": {"published": gdoc.get("draft", default_global())}})
    return {"ok": True}


@api_router.post("/admin/revert-draft")
async def revert_draft(_: dict = Depends(current_admin)):
    configs = await db.product_configs.find({}).to_list(1000)
    for cfg in configs:
        await db.product_configs.update_one({"_id": cfg["_id"]},
                                            {"$set": {"draft": cfg.get("published", default_rule())}})
    gdoc = await db.global_margin.find_one({"_id": "global_margin"})
    if gdoc:
        await db.global_margin.update_one({"_id": "global_margin"},
                                          {"$set": {"draft": gdoc.get("published", default_global())}})
    return {"ok": True}


# ------------------------------------------------------------------ startup
app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    # seed admin
    await db.admins.create_index("email", unique=True)
    email = ADMIN_EMAIL.strip().lower()
    if await db.admins.find_one({"email": email}) is None:
        await db.admins.insert_one({
            "email": email, "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin", "active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin: %s", email)
    # ensure global margin doc
    if await db.global_margin.find_one({"_id": "global_margin"}) is None:
        await db.global_margin.insert_one({"_id": "global_margin",
                                           "draft": default_global(), "published": default_global()})
    # start poller
    asyncio.create_task(poller_loop())
    logger.info("ONLİNE KUR poller started (interval=%ss)", REFRESH_INTERVAL)


@app.on_event("shutdown")
async def shutdown():
    client.close()
