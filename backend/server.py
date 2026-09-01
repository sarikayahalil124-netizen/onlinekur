from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, File, UploadFile, Response, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import time
import hashlib
import asyncio
import logging
import tempfile
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
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
        try:
            await check_alarms()
        except Exception as e:
            logger.error("alarm check error: %s", e)
        await asyncio.sleep(REFRESH_INTERVAL)


# ------------------------------------------------------------------ push (Emergent managed relay)
PUSH_BASE_URL = "https://integrations.emergentagent.com"
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
push_client = httpx.AsyncClient(base_url=PUSH_BASE_URL, headers={"X-Push-Key": PUSH_KEY}, timeout=10.0)


class RegisterPushBody(BaseModel):
    user_id: str
    platform: str  # "android" | "ios"
    device_token: str


@api_router.post("/register-push", status_code=201)
async def register_push(body: RegisterPushBody):
    resp = await push_client.post("/api/v1/push/users/register", json=body.model_dump())
    if resp.status_code == 401:
        raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
    if resp.status_code >= 500:
        raise HTTPException(502, "Push provider unavailable")
    resp.raise_for_status()
    return {"status": "registered"}


async def send_push(recipients: list, data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients:
        return
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    resp = await push_client.post("/api/v1/push/trigger", json=payload)
    resp.raise_for_status()


# ------------------------------------------------------------------ alarms
BASIS_LABEL = {"buy": "Alış", "sell": "Satış"}


def fmt_tr(value: float, dec: int) -> str:
    s = f"{value:,.{dec}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def alarm_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]), "code": doc["code"], "name": doc["name"],
        "basis": doc["basis"], "condition": doc["condition"], "target": doc["target"],
        "active": doc.get("active", True), "triggeredAt": doc.get("triggeredAt"),
        "createdAt": doc.get("createdAt"),
    }


class AlarmCreate(BaseModel):
    deviceId: str
    code: str
    name: str
    basis: str = "sell"
    condition: str = ">"
    target: float


class AlarmUpdate(BaseModel):
    active: Optional[bool] = None


@api_router.post("/alarms")
async def create_alarm(body: AlarmCreate):
    if body.basis not in ("buy", "sell") or body.condition not in (">", "<") or body.target <= 0:
        raise HTTPException(status_code=400, detail="Geçersiz alarm")
    doc = {
        "deviceId": body.deviceId, "code": body.code, "name": body.name,
        "basis": body.basis, "condition": body.condition, "target": body.target,
        "active": True, "deleted": False, "triggeredAt": None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.alarms.insert_one(doc)
    doc["_id"] = res.inserted_id
    return alarm_out(doc)


@api_router.get("/alarms")
async def list_alarms(deviceId: str):
    docs = await db.alarms.find({"deviceId": deviceId, "deleted": False}).sort("createdAt", -1).to_list(200)
    return {"items": [alarm_out(d) for d in docs]}


@api_router.get("/alarms/history")
async def alarm_history(deviceId: str):
    docs = await db.alarm_history.find({"deviceId": deviceId}).sort("triggeredAt", -1).to_list(200)
    return {"items": [{
        "id": str(d["_id"]), "code": d["code"], "name": d["name"],
        "basis": d["basis"], "condition": d["condition"], "target": d["target"],
        "price": d["price"], "decimals": d.get("decimals", 2), "triggeredAt": d["triggeredAt"],
    } for d in docs]}


@api_router.put("/alarms/{alarm_id}")
async def update_alarm(alarm_id: str, body: AlarmUpdate):
    try:
        aid = ObjectId(alarm_id)
    except InvalidId:
        raise HTTPException(status_code=404, detail="Alarm bulunamadı")
    if body.active is not None:
        await db.alarms.update_one({"_id": aid}, {"$set": {"active": body.active, "triggeredAt": None}})
    return {"ok": True}


@api_router.delete("/alarms/{alarm_id}")
async def delete_alarm(alarm_id: str):
    try:
        aid = ObjectId(alarm_id)
    except InvalidId:
        raise HTTPException(status_code=404, detail="Alarm bulunamadı")
    await db.alarms.update_one({"_id": aid}, {"$set": {"deleted": True}})
    return {"ok": True}


async def check_alarms():
    """Evaluate active alarms against published prices; push on trigger, re-arm on release."""
    alarms = await db.alarms.find({"deleted": False, "active": True}).to_list(1000)
    if not alarms:
        return
    global_pub = await get_global("published")
    price_cache: dict[str, dict] = {}
    for a in alarms:
        code = a["code"]
        if code not in price_cache:
            market = MARKET.get(code)
            if market is None:
                continue
            cfg = await db.product_configs.find_one({"_id": code})
            rule = (cfg or {}).get("published", default_rule())
            price_cache[code] = {**compute_price(market, rule, global_pub, market["decimals"]),
                                 "decimals": market["decimals"]}
        priced = price_cache.get(code)
        if not priced:
            continue
        price = priced["buy"] if a["basis"] == "buy" else priced["sell"]
        hit = price > a["target"] if a["condition"] == ">" else price < a["target"]
        if hit and not a.get("triggeredAt"):
            now = datetime.now(timezone.utc).isoformat()
            await db.alarms.update_one({"_id": a["_id"]}, {"$set": {"triggeredAt": now}})
            dec = priced["decimals"]
            cond_txt = "hedefin üzerine çıktı" if a["condition"] == ">" else "hedefin altına indi"
            await db.alarm_history.insert_one({
                "deviceId": a["deviceId"], "alarmId": str(a["_id"]),
                "code": code, "name": a["name"], "basis": a["basis"],
                "condition": a["condition"], "target": a["target"],
                "price": price, "decimals": dec, "triggeredAt": now,
            })
            try:
                await send_push(
                    recipients=[a["deviceId"]],
                    data={
                        "title": f"🔔 {a['name']} hedefe ulaştı",
                        "message": f"{BASIS_LABEL[a['basis']]} fiyatı {fmt_tr(price, dec)} oldu, {fmt_tr(a['target'], dec)} {cond_txt}.",
                        "action_url": f"/product/{code}",
                    },
                    idempotency_key=f"{a['_id']}-{now}",
                )
            except Exception as e:
                logger.warning("Push failed (non-blocking): %s", e)
        elif not hit and a.get("triggeredAt"):
            await db.alarms.update_one({"_id": a["_id"]}, {"$set": {"triggeredAt": None}})


# ------------------------------------------------------------------ day high/low
IST_TZ = ZoneInfo("Europe/Istanbul")


async def day_range(code: str) -> dict:
    now_ist = datetime.now(IST_TZ)
    day_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    pipeline = [
        {"$match": {"code": code, "ts": {"$gte": day_start}}},
        {"$group": {"_id": None, "highSell": {"$max": "$sell"}, "lowSell": {"$min": "$sell"},
                    "highBuy": {"$max": "$buy"}, "lowBuy": {"$min": "$buy"}}},
    ]
    rows = await db.price_history.aggregate(pipeline).to_list(1)
    return rows[0] if rows else {}


async def day_opens() -> dict:
    """First (opening) raw price of the current IST day per code -> for % change."""
    now_ist = datetime.now(IST_TZ)
    day_start = now_ist.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).isoformat()
    pipeline = [
        {"$match": {"ts": {"$gte": day_start}}},
        {"$sort": {"ts": 1}},
        {"$group": {"_id": "$code", "openSell": {"$first": "$sell"}, "openBuy": {"$first": "$buy"}}},
    ]
    rows = await db.price_history.aggregate(pipeline).to_list(2000)
    return {r["_id"]: r for r in rows}


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
    opens = await day_opens()
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
                "providerUpdatedAt": None, "changePct": None,
            })
            continue
        dec = market["decimals"]
        priced = compute_price(market, cfg.get("published", default_rule()), global_pub, dec)
        op = opens.get(code, {}).get("openSell")
        change_pct = round((market["sell"] - op) / op * 100, 2) if op and op > 0 else None
        out.append({
            "code": code, "name": market["name"], "type": market["type"],
            "buy": priced["buy"], "sell": priced["sell"],
            "marketBuy": market["buy"], "marketSell": market["sell"],
            "decimals": dec, "dir": market["dir"],
            "status": "veri_alinamiyor" if st == "veri_alinamiyor" else st,
            "manual": priced["manual"], "order": cfg.get("order", 999),
            "providerUpdatedAt": market["providerUpdatedAt"],
            "receivedAt": market["receivedAt"],
            "changePct": change_pct,
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
    rule = cfg.get("published", default_rule())
    priced = compute_price(market, rule, global_pub, dec)
    hist = await db.price_history.find({"code": code}).sort("ts", -1).limit(200).to_list(200)
    hist = list(reversed([{"buy": h["buy"], "sell": h["sell"], "ts": h["ts"]} for h in hist]))
    # intraday high/low (published-price terms)
    day = await day_range(code)
    if day and day.get("highSell") is not None:
        hi_m = {**market, "buyDec": str(day.get("highBuy")), "sellDec": str(day.get("highSell"))}
        lo_m = {**market, "buyDec": str(day.get("lowBuy")), "sellDec": str(day.get("lowSell"))}
        day_high = compute_price(hi_m, rule, global_pub, dec)["sell"]
        day_low = compute_price(lo_m, rule, global_pub, dec)["sell"]
        day_high = max(day_high, priced["sell"])
        day_low = min(day_low, priced["sell"])
    else:
        day_high = priced["sell"]
        day_low = priced["sell"]
    return {
        "code": code, "name": market["name"], "type": market["type"],
        "buy": priced["buy"], "sell": priced["sell"],
        "marketBuy": market["buy"], "marketSell": market["sell"],
        "decimals": dec, "dir": market["dir"], "manual": priced["manual"],
        "status": feed_status(), "source": PROVIDER["source"],
        "providerUpdatedAt": market["providerUpdatedAt"],
        "receivedAt": market["receivedAt"],
        "dayHigh": day_high,
        "dayLow": day_low,
        "history": hist,
    }


@api_router.get("/history/{code}")
async def get_history(code: str, range_: str = Query("1G", alias="range")):
    # Hour-based windows so intraday movement is visible for a live-price app.
    ranges_hours = {"1s": 1, "6s": 6, "12s": 12, "1G": 24, "1H": 168, "1A": 720}
    hours = ranges_hours.get(range_, 24)
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    docs = await db.price_history.find({"code": code, "ts": {"$gte": since}}).sort("ts", 1).to_list(5000)
    # Downsample to at most ~80 points for a clean chart.
    max_points = 80
    if len(docs) > max_points:
        step = len(docs) / max_points
        sampled = [docs[min(int(i * step), len(docs) - 1)] for i in range(max_points)]
        sampled[-1] = docs[-1]
        docs = sampled
    return {"code": code, "range": range_,
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


class ReorderBody(BaseModel):
    codes: list[str]


@api_router.put("/admin/reorder")
async def reorder_products(body: ReorderBody, _: dict = Depends(current_admin)):
    for idx, code in enumerate(body.codes):
        await db.product_configs.update_one({"_id": code}, {"$set": {"order": idx}})
    return {"ok": True, "count": len(body.codes)}


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


# ------------------------------------------------------------------ AI assistant (Gemini 3.5 Flash via Emergent LLM key)
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AI_PROVIDER = "gemini"
AI_MODEL = "gemini-3.5-flash"

stt_client = OpenAISpeechToText(EMERGENT_LLM_KEY) if EMERGENT_LLM_KEY else None
tts_client = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY) if EMERGENT_LLM_KEY else None
TTS_MODEL = "tts-1"
TTS_VOICE = "nova"
TTS_DIR = Path(tempfile.gettempdir()) / "onlinekur_tts"
TTS_DIR.mkdir(parents=True, exist_ok=True)


def clean_for_tts(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|`]", "", text)
    # strip most emoji / pictographic symbols
    text = re.sub(r"[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF\u2190-\u21FF\u2B00-\u2BFF]", "", text)
    return re.sub(r"\s+", " ", text).strip()

AI_PERSONA = (
    "Sen 'ONLİNE KUR' uygulamasının Türkçe konuşan altın ve döviz piyasası asistanısın. "
    "Kısa, net ve samimi yanıtlar ver. Yalnızca sana verilen güncel fiyat verilerine dayan; "
    "asla uydurma fiyat verme. Yatırım yorumu yaparken bunun kesin bir tavsiye olmadığını, "
    "kişisel karar ve risk gerektirdiğini nazikçe hatırlat. Yanıtların sade Türkçe olsun ve "
    "mobil ekrana uygun kısa paragraflar veya madde işaretleri şeklinde yazılsın."
)


def _dec_for(ptype: str) -> int:
    return 2 if ptype == "gold" else 4


async def market_snapshot_text(limit: int = 24) -> str:
    global_pub = await get_global("published")
    configs = await db.product_configs.find({"active": True}).to_list(1000)
    opens = await day_opens()
    rows = []
    for cfg in configs:
        code = cfg["_id"]
        market = MARKET.get(code)
        if market is None:
            continue
        dec = market["decimals"]
        priced = compute_price(market, cfg.get("published", default_rule()), global_pub, dec)
        op = opens.get(code, {}).get("openSell")
        change = round((market["sell"] - op) / op * 100, 2) if op and op > 0 else None
        rows.append((cfg.get("order", 999), code, {
            "name": market["name"], "type": market["type"],
            "buy": priced["buy"], "sell": priced["sell"], "changePct": change, "dec": dec,
        }))
    rows.sort(key=lambda x: (x[0], x[1]))
    lines = []
    for _, code, r in rows[:limit]:
        chg = f"%{r['changePct']:+.2f}" if r["changePct"] is not None else "-"
        kind = "Altın" if r["type"] == "gold" else "Döviz"
        lines.append(
            f"- {r['name']} ({code}) [{kind}]: Alış {fmt_tr(r['buy'], r['dec'])} / "
            f"Satış {fmt_tr(r['sell'], r['dec'])} · Günlük {chg}"
        )
    ts = PROVIDER.get("lastSuccess") or "-"
    return f"Güncel piyasa verileri (güncelleme: {ts}):\n" + "\n".join(lines)


def _ai_chat(system_message: str, session_id: str) -> LlmChat:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(503, "AI anahtarı yapılandırılmamış")
    return LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_message
    ).with_model(AI_PROVIDER, AI_MODEL)


async def _codes_catalog() -> dict:
    """code -> name for all active products (for AI alarm intent)."""
    configs = await db.product_configs.find({"active": True}).to_list(1000)
    out = {}
    for cfg in configs:
        code = cfg["_id"]
        market = MARKET.get(code)
        out[code] = (market or {}).get("name") or cfg.get("name", code)
    return out


ALARM_DIRECTIVE_RE = re.compile(r"\[\[ALARM:\s*(\{.*?\})\s*\]\]", re.DOTALL)


async def _handle_alarm_directive(reply: str, device_id: str, catalog: dict):
    """If the AI emitted an [[ALARM:{...}]] directive, create the alarm and strip it."""
    m = ALARM_DIRECTIVE_RE.search(reply)
    if not m:
        return reply, None
    cleaned = ALARM_DIRECTIVE_RE.sub("", reply).strip()
    try:
        spec = json.loads(m.group(1))
        code = str(spec.get("code", "")).upper()
        basis = spec.get("basis", "sell")
        condition = spec.get("condition", ">")
        target = float(spec.get("target"))
    except Exception:
        return cleaned, None
    if code not in catalog or basis not in ("buy", "sell") or condition not in (">", "<") or target <= 0:
        return cleaned, None
    doc = {
        "deviceId": device_id, "code": code, "name": catalog[code],
        "basis": basis, "condition": condition, "target": target,
        "active": True, "deleted": False, "triggeredAt": None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.alarms.insert_one(doc)
    doc["_id"] = res.inserted_id
    return cleaned, alarm_out(doc)


class AiChatBody(BaseModel):
    deviceId: str
    message: str


@api_router.get("/ai/messages")
async def ai_messages(deviceId: str):
    docs = await db.ai_messages.find({"deviceId": deviceId}).sort("ts", 1).to_list(300)
    return {"items": [{"role": d["role"], "content": d["content"], "ts": d["ts"]} for d in docs]}


@api_router.delete("/ai/messages")
async def ai_clear(deviceId: str):
    await db.ai_messages.delete_many({"deviceId": deviceId})
    return {"ok": True}


@api_router.post("/ai/chat")
async def ai_chat(body: AiChatBody):
    msg = body.message.strip()
    if not msg:
        raise HTTPException(400, "Mesaj boş")
    snapshot = await market_snapshot_text()
    catalog = await _codes_catalog()
    code_list = ", ".join(f"{c}={n}" for c, n in list(catalog.items())[:60])
    prev = await db.ai_messages.find({"deviceId": body.deviceId}).sort("ts", -1).to_list(10)
    prev.reverse()
    transcript = "\n".join(
        f"{'Kullanıcı' if m['role'] == 'user' else 'Asistan'}: {m['content']}" for m in prev
    )
    alarm_rules = (
        "\n\nALARM KURMA: Kullanıcı bir ürün belirli bir fiyata gelince/geçince/düşünce haber "
        "verilmesini isterse (ör. 'USD 50 olunca haber ver', 'gram altın 7000'in altına inince "
        "uyar'), yanıtının EN SONUNA ayrı bir satırda tam olarak şu formatta gizli bir komut ekle: "
        "[[ALARM:{\"code\":\"USD\",\"basis\":\"sell\",\"condition\":\">\",\"target\":50}]] — "
        "condition: fiyat hedefin üstüne çıkınca '>', altına inince '<'. basis genelde 'sell'. "
        "code SADECE şu listeden olmalı: " + code_list + ". Kullanıcı alarm istemiyorsa bu komutu "
        "ASLA ekleme. Komutu kullanıcıya gösterme; ayrıca alarmın kurulduğunu doğal bir cümleyle söyle."
    )
    system = AI_PERSONA + "\n\n" + snapshot + alarm_rules
    if transcript:
        system += "\n\nÖnceki konuşma:\n" + transcript
    chat = _ai_chat(system, f"chat-{body.deviceId}")
    try:
        reply = str(await chat.send_message(UserMessage(text=msg)))
    except Exception as e:
        logger.warning("AI chat error: %s", e)
        raise HTTPException(502, "AI yanıtı alınamadı")
    reply, alarm = await _handle_alarm_directive(reply, body.deviceId, catalog)
    now = datetime.now(timezone.utc).isoformat()
    await db.ai_messages.insert_many([
        {"deviceId": body.deviceId, "role": "user", "content": msg, "ts": now},
        {"deviceId": body.deviceId, "role": "assistant", "content": reply, "ts": now},
    ])
    return {"reply": reply, "alarmCreated": alarm is not None, "alarm": alarm}


@api_router.post("/ai/transcribe")
async def ai_transcribe(file: UploadFile = File(...)):
    if stt_client is None:
        raise HTTPException(503, "Ses tanıma yapılandırılmamış")
    suffix = Path(file.filename or "recording.m4a").suffix.lower() or ".m4a"
    if suffix.lstrip(".") not in ("m4a", "mp4", "mp3", "wav", "webm", "mpeg", "mpga"):
        suffix = ".m4a"
    data = await file.read(25 * 1024 * 1024 + 1)
    if not data:
        raise HTTPException(400, "Boş ses dosyası")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Ses dosyası 25 MB'tan küçük olmalı")
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name
        with open(tmp_path, "rb") as fh:
            result = await stt_client.transcribe(fh, language="tr")
        text = (result.text if hasattr(result, "text") else str(result)).strip()
        return {"text": text}
    except Exception as e:
        logger.warning("Transcription error: %s", e)
        raise HTTPException(502, "Ses metne çevrilemedi")
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass


class TtsBody(BaseModel):
    text: str


@api_router.post("/ai/tts")
async def ai_tts(body: TtsBody):
    if tts_client is None:
        raise HTTPException(503, "Seslendirme yapılandırılmamış")
    text = clean_for_tts(body.text)[:4000]
    if not text:
        raise HTTPException(400, "Seslendirilecek metin yok")
    key = hashlib.sha256(f"{text}|{TTS_VOICE}|1.0|{TTS_MODEL}|mp3".encode()).hexdigest()
    path = TTS_DIR / f"{key}.mp3"
    if not path.exists():
        try:
            audio = await tts_client.generate_speech(
                text=text, model=TTS_MODEL, voice=TTS_VOICE, response_format="mp3"
            )
        except Exception as e:
            logger.warning("TTS error: %s", e)
            raise HTTPException(502, "Ses üretilemedi")
        path.write_bytes(audio)
    return {"url": f"/ai/tts-audio/{key}.mp3"}


@api_router.get("/ai/tts-audio/{key}.mp3")
async def ai_tts_audio(key: str):
    if not re.fullmatch(r"[a-f0-9]{64}", key):
        raise HTTPException(404, "Bulunamadı")
    path = TTS_DIR / f"{key}.mp3"
    if not path.exists():
        raise HTTPException(404, "Ses bulunamadı")
    return Response(
        content=path.read_bytes(),
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=31536000"},
    )


@api_router.post("/ai/commentary")
async def ai_commentary():
    snapshot = await market_snapshot_text()
    chat = _ai_chat(AI_PERSONA, f"commentary-{int(time.time() // 300)}")
    prompt = (
        "Aşağıdaki güncel verilere göre bugünkü altın ve döviz piyasasına dair kısa bir genel "
        "yorum yaz (en fazla 4-5 cümle veya madde). Öne çıkan yükseliş ve düşüşleri vurgula.\n\n"
        + snapshot
    )
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning("AI commentary error: %s", e)
        raise HTTPException(502, "AI yorumu alınamadı")
    return {"commentary": str(reply), "at": datetime.now(timezone.utc).isoformat()}


class Holding(BaseModel):
    code: str
    name: str
    type: str = "currency"
    qty: float
    buyPrice: Optional[float] = None


class PortfolioBody(BaseModel):
    holdings: list[Holding]


@api_router.post("/ai/portfolio-advice")
async def ai_portfolio_advice(body: PortfolioBody):
    if not body.holdings:
        raise HTTPException(400, "Portföy boş")
    global_pub = await get_global("published")
    lines = []
    total_val = 0.0
    total_cost = 0.0
    for h in body.holdings:
        market = MARKET.get(h.code)
        cfg = await db.product_configs.find_one({"_id": h.code})
        if market is None or cfg is None:
            continue
        dec = market["decimals"]
        priced = compute_price(market, cfg.get("published", default_rule()), global_pub, dec)
        cur = priced["sell"]
        val = cur * h.qty
        total_val += val
        line = f"- {h.name} ({h.code}): {fmt_tr(h.qty, 2)} adet × {fmt_tr(cur, dec)} = {fmt_tr(val, 2)} TL"
        if h.buyPrice:
            cost = h.buyPrice * h.qty
            total_cost += cost
            line += f" (maliyet {fmt_tr(h.buyPrice, dec)} → K/Z {fmt_tr(val - cost, 2)} TL)"
        lines.append(line)
    if not lines:
        raise HTTPException(400, "Portföydeki varlıklar için güncel fiyat yok")
    summary = "\n".join(lines)
    summary += f"\n\nToplam güncel değer: {fmt_tr(total_val, 2)} TL"
    if total_cost:
        summary += (
            f"\nToplam maliyet: {fmt_tr(total_cost, 2)} TL · "
            f"Toplam K/Z: {fmt_tr(total_val - total_cost, 2)} TL"
        )
    chat = _ai_chat(AI_PERSONA, f"advice-{int(time.time())}")
    prompt = (
        "Kullanıcının portföyü aşağıda. Güncel piyasaya göre kısa bir değerlendirme yap: "
        "dağılımı yorumla, dikkat edilebilecek noktaları belirt ve genel bir öneri sun "
        "(kesin tavsiye değil). En fazla 6 madde ile yaz.\n\nPORTFÖY:\n"
        + summary + "\n\n" + await market_snapshot_text()
    )
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logger.warning("AI advice error: %s", e)
        raise HTTPException(502, "AI değerlendirmesi alınamadı")
    return {"advice": str(reply), "totalValue": round(total_val, 2), "totalCost": round(total_cost, 2)}


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
