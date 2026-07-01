from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
DEFAULT_ADMIN = "tom@blackfx.net"
UPI_ID = "tomright143-1@okhdfcbank"
QR_IMAGE = "https://customer-assets.emergentagent.com/job_stream-annotate-app/artifacts/cszxr9k2_IMG_0135.jpeg"

# ===== Models =====
class ReviewCreate(BaseModel):
    title: str
    video_url: str
    video_type: str
    allow_download: bool = False

class AnnotationCreate(BaseModel):
    review_id: str
    timestamp: float
    tool: str
    color: str = "#5A67D8"
    brush: float = 3
    points: List[Dict[str, float]]
    text: Optional[str] = None
    link: Optional[str] = None

class CommentCreate(BaseModel):
    review_id: str
    text: str
    timestamp: Optional[float] = None
    parent_id: Optional[str] = None
    mentions: List[str] = []

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def is_admin_user(email: str) -> bool:
    if email == DEFAULT_ADMIN:
        return True
    return False  # checked async via db elsewhere

async def get_current_user(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        raise HTTPException(401, "Invalid session")
    exp = sess["expires_at"]
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    # rolling: extend if used within last 5 days of expiry
    if (exp - datetime.now(timezone.utc)) < timedelta(days=25):
        new_exp = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        await db.user_sessions.update_one({"session_token": token}, {"$set": {"expires_at": new_exp}})
    udoc = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not udoc:
        raise HTTPException(401, "User not found")
    return udoc

async def require_admin(request: Request):
    user = await get_current_user(request)
    admin_doc = await db.admins.find_one({"email": user["email"]}, {"_id": 0})
    if user["email"] != DEFAULT_ADMIN and not admin_doc:
        raise HTTPException(403, "Admin only")
    return user

def extract_video_info(url: str):
    m = re.search(r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_\-]{6,})", url)
    if m: return {"video_type": "youtube", "video_id": m.group(1)}
    m = re.search(r"vimeo\.com/(\d+)", url)
    if m: return {"video_type": "vimeo", "video_id": m.group(1)}
    return {"video_type": "unknown", "video_id": url}

# ===== Auth =====
@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(400, "session_id required")
    async with httpx.AsyncClient() as ac:
        r = await ac.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": session_id})
        if r.status_code != 200:
            raise HTTPException(401, "Invalid session_id")
        data = r.json()
    email = data["email"]
    # capture referral if present
    ref = body.get("ref")
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": data["name"], "picture": data.get("picture"), "last_login": now_iso()}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": data["name"],
            "picture": data.get("picture"), "plan": "free",
            "gst_no": None, "company": None, "brand_logo": None,
            "referred_by": ref, "referrals_count": 0,
            "created_at": now_iso(), "last_login": now_iso(),
        })
        # credit referrer
        if ref:
            await db.users.update_one({"user_id": ref}, {"$inc": {"referrals_count": 1}})
    session_token = data["session_token"]
    expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": expires_at, "created_at": now_iso(),
    })
    response.set_cookie("session_token", session_token, max_age=30*24*60*60,
                        httponly=True, secure=True, samesite="none", path="/")
    udoc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": udoc}

@api_router.get("/auth/me")
async def me(request: Request):
    u = await get_current_user(request)
    # Backfill plan_until for any paid user missing it
    if u.get("plan") and u["plan"] != "free" and not u.get("plan_until"):
        until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"plan_until": until}})
        u["plan_until"] = until
    admin_doc = await db.admins.find_one({"email": u["email"]}, {"_id": 0})
    u["is_admin"] = (u["email"] == DEFAULT_ADMIN) or bool(admin_doc)
    u["limits"] = await plan_limits(u["plan"])
    return u

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ===== Reviews =====
@api_router.post("/reviews")
async def create_review(payload: ReviewCreate, request: Request):
    user = await get_current_user(request)
    lim = await plan_limits(user["plan"])
    if payload.video_type == "local":
        if not lim.get("local_broadcast"):
            raise HTTPException(403, "Live local broadcast isn't available on your plan. Upgrade to use it.")
        info = {"video_type": "local", "video_id": f"local_{uuid.uuid4().hex[:8]}"}
    else:
        info = extract_video_info(payload.video_url)
        if info["video_type"] == "unknown":
            raise HTTPException(400, "Unsupported URL. Use YouTube or Vimeo, or pick a local file for live broadcast.")
    max_reviews = lim.get("max_reviews", -1)
    if max_reviews != -1:
        cnt = await db.reviews.count_documents({"owner_id": user["user_id"]})
        if cnt >= max_reviews:
            raise HTTPException(403, f"You've reached your plan's limit of {max_reviews} active reviews. Upgrade or delete one to add more.")
    rid = f"rev_{uuid.uuid4().hex[:12]}"
    share_token = f"sh_{uuid.uuid4().hex[:14]}"
    doc = {
        "id": rid, "owner_id": user["user_id"], "owner_name": user["name"],
        "title": payload.title, "video_url": payload.video_url,
        "video_type": info["video_type"], "video_id": info["video_id"],
        "allow_download": payload.allow_download, "share_token": share_token,
        "view_count": 0, "stars": 0, "created_at": now_iso(),
    }
    await db.reviews.insert_one(doc)
    doc.pop("_id", None)
    # Referral bonus: 3 projects + 10 referrals = free creator month
    proj_count = await db.reviews.count_documents({"owner_id": user["user_id"]})
    if proj_count >= 3 and user.get("referrals_count", 0) >= 10 and user["plan"] == "free":
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"plan": "creator", "plan_until": (datetime.now(timezone.utc)+timedelta(days=30)).isoformat(), "bonus": True}})
    return doc

@api_router.get("/reviews")
async def list_reviews(request: Request):
    user = await get_current_user(request)
    rows = await db.reviews.find({"owner_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows

@api_router.get("/reviews/{review_id}")
async def get_review(review_id: str, request: Request):
    await get_current_user(request)
    r = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    if not r: raise HTTPException(404, "Not found")
    return r

@api_router.delete("/reviews/{review_id}")
async def del_review(review_id: str, request: Request):
    user = await get_current_user(request)
    await db.reviews.delete_one({"id": review_id, "owner_id": user["user_id"]})
    await db.annotations.delete_many({"review_id": review_id})
    await db.comments.delete_many({"review_id": review_id})
    return {"ok": True}

@api_router.patch("/reviews/{review_id}")
async def update_review(review_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    updates = {k: v for k, v in body.items() if k in ("title", "allow_download", "video_url")}
    if "video_url" in updates:
        info = extract_video_info(updates["video_url"])
        if info["video_type"] == "unknown":
            raise HTTPException(400, "Unsupported URL")
        updates["video_type"] = info["video_type"]
        updates["video_id"] = info["video_id"]
    await db.reviews.update_one({"id": review_id, "owner_id": user["user_id"]}, {"$set": updates})
    r = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    return r

@api_router.post("/billing/cancel")
async def cancel_plan(request: Request):
    user = await get_current_user(request)
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"cancel_at_end": True}})
    # Add notification
    await db.notifications.insert_one({
        "id": f"ntf_{uuid.uuid4().hex[:10]}", "user_id": user["user_id"],
        "kind": "billing", "title": "Plan cancelled",
        "body": f"Your {user['plan']} plan will remain active until expiry, then revert to free.",
        "read": False, "created_at": now_iso(),
    })
    return {"ok": True}

@api_router.get("/notifications")
async def list_notifications(request: Request):
    user = await get_current_user(request)
    # Auto-add expiry notification if plan expiring within 7d
    if user.get("plan_until") and user["plan"] != "free":
        try:
            until = datetime.fromisoformat(user["plan_until"]).replace(tzinfo=timezone.utc) if "T" in user["plan_until"] else datetime.fromisoformat(user["plan_until"])
            days_left = (until - datetime.now(timezone.utc)).days
            if 0 <= days_left <= 7:
                existing = await db.notifications.find_one({"user_id": user["user_id"], "kind": "expiry-soon"})
                if not existing:
                    await db.notifications.insert_one({
                        "id": f"ntf_{uuid.uuid4().hex[:10]}", "user_id": user["user_id"],
                        "kind": "expiry-soon", "title": "Expiring soon",
                        "body": f"Your {user['plan']} plan expires in {days_left} days. Pay advance to keep it active.",
                        "read": False, "created_at": now_iso(),
                    })
        except Exception:
            pass
    rows = await db.notifications.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return rows

@api_router.post("/notifications/read")
async def mark_read(request: Request):
    user = await get_current_user(request)
    await db.notifications.update_many({"user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.post("/reviews/{review_id}/star")
async def star_review(review_id: str, request: Request):
    await get_current_user(request)
    await db.reviews.update_one({"id": review_id}, {"$inc": {"stars": 1}})
    return {"ok": True}

# ===== Public shared access =====
@api_router.get("/shared/{token}")
async def get_shared(token: str, request: Request):
    r = await db.reviews.find_one({"share_token": token}, {"_id": 0})
    if not r: raise HTTPException(404, "Not found")
    # REQUIRE authentication for shared access
    u = await get_current_user(request)
    viewer_email = u["email"]
    # Add to allowed viewers if first time
    is_owner = (u["user_id"] == r["owner_id"])
    if not is_owner:
        existing_viewer = await db.review_viewers.find_one({"review_id": r["id"], "user_id": u["user_id"]})
        if not existing_viewer:
            owner = await db.users.find_one({"user_id": r["owner_id"]}, {"_id": 0})
            owner_lim = await plan_limits((owner or {}).get("plan", "free"))
            max_rev = owner_lim.get("max_reviewers", -1)
            if max_rev != -1:
                vcount = await db.review_viewers.count_documents({"review_id": r["id"]})
                if vcount >= max_rev:
                    raise HTTPException(403, "This review has reached its reviewer limit for the owner's plan.")
            await db.review_viewers.insert_one({
                "review_id": r["id"], "user_id": u["user_id"],
                "name": u["name"], "email": u["email"], "joined_at": now_iso(),
            })
            # Notify owner
            await db.notifications.insert_one({
                "id": f"ntf_{uuid.uuid4().hex[:10]}", "user_id": r["owner_id"],
                "kind": "join", "title": f"{u['name']} joined the review",
                "body": f"{u['email']} opened your shared link.", "review_id": r["id"],
                "read": False, "created_at": now_iso(),
            })
    new_count = (r.get("view_count") or 0) + 1
    await db.reviews.update_one({"id": r["id"]}, {"$set": {"view_count": new_count}})
    await db.share_views.update_one(
        {"review_id": r["id"], "viewer": viewer_email},
        {"$inc": {"count": 1}, "$set": {"last": now_iso()}}, upsert=True,
    )
    v = await db.share_views.find_one({"review_id": r["id"], "viewer": viewer_email}, {"_id": 0})
    viewer_count = v["count"] if v else 1
    return {"review": r, "viewer_count": viewer_count, "show_ad": viewer_count >= 3 and (viewer_count - 3) % 3 == 0}

@api_router.get("/reviews/{review_id}/viewers")
async def list_viewers(review_id: str, request: Request):
    user = await get_current_user(request)
    r = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    if not r or r["owner_id"] != user["user_id"]:
        raise HTTPException(403, "Owner only")
    return await db.review_viewers.find({"review_id": review_id}, {"_id": 0}).to_list(200)

# ===== Live presence (heartbeat) =====
@api_router.post("/reviews/{review_id}/heartbeat")
async def presence_heartbeat(review_id: str, request: Request):
    user = await get_current_user(request)
    r = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Not found")
    await db.presence.update_one(
        {"review_id": review_id, "user_id": user["user_id"]},
        {"$set": {
            "review_id": review_id, "user_id": user["user_id"],
            "name": user["name"], "picture": user.get("picture"), "email": user["email"],
            "is_owner": user["user_id"] == r["owner_id"],
            "last_seen": now_iso(),
        }},
        upsert=True,
    )
    return {"ok": True}

@api_router.get("/reviews/{review_id}/presence")
async def presence_list(review_id: str, request: Request):
    await get_current_user(request)
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=15)).isoformat()
    # opportunistic cleanup of stale rows to keep the collection bounded
    stale = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
    await db.presence.delete_many({"last_seen": {"$lt": stale}})
    rows = await db.presence.find({"review_id": review_id, "last_seen": {"$gte": cutoff}}, {"_id": 0}).to_list(200)
    return {"count": len(rows), "users": rows}

# ===== Annotations =====
@api_router.post("/annotations")
async def create_annotation(payload: AnnotationCreate, request: Request):
    user = await get_current_user(request)
    aid = f"ann_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": aid, "review_id": payload.review_id, "owner_id": user["user_id"],
        "owner_name": user["name"], "owner_picture": user.get("picture"),
        "timestamp": payload.timestamp, "tool": payload.tool, "color": payload.color,
        "brush": payload.brush, "points": payload.points,
        "text": payload.text, "link": payload.link, "created_at": now_iso(),
    }
    await db.annotations.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/annotations/{review_id}")
async def list_annotations(review_id: str):
    rows = await db.annotations.find({"review_id": review_id}, {"_id": 0}).sort("timestamp", 1).to_list(2000)
    return rows

@api_router.delete("/annotations/{ann_id}")
async def del_annotation(ann_id: str, request: Request):
    user = await get_current_user(request)
    await db.annotations.delete_one({"id": ann_id, "owner_id": user["user_id"]})
    return {"ok": True}

# ===== Comments =====
@api_router.post("/comments")
async def create_comment(payload: CommentCreate, request: Request):
    user = await get_current_user(request)
    cid = f"cmt_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": cid, "review_id": payload.review_id, "owner_id": user["user_id"],
        "owner_name": user["name"], "owner_picture": user.get("picture"),
        "text": payload.text, "timestamp": payload.timestamp,
        "parent_id": payload.parent_id, "mentions": payload.mentions,
        "created_at": now_iso(),
    }
    await db.comments.insert_one(doc)
    doc.pop("_id", None)
    r = await db.reviews.find_one({"id": payload.review_id}, {"_id": 0})
    if r and r["owner_id"] != user["user_id"]:
        await db.notifications.insert_one({
            "id": f"ntf_{uuid.uuid4().hex[:10]}", "user_id": r["owner_id"],
            "kind": "comment", "title": f"{user['name']} commented",
            "body": payload.text[:80], "review_id": payload.review_id,
            "read": False, "created_at": now_iso(),
        })
    return doc

@api_router.get("/comments/{review_id}")
async def list_comments(review_id: str):
    rows = await db.comments.find({"review_id": review_id}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return rows

@api_router.get("/team")
async def get_team(request: Request):
    await get_current_user(request)
    rows = await db.users.find({}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1}).to_list(500)
    return rows

# ===== Billing (UPI flow) =====
PLAN_PRICES_DEFAULT = {"creator": 299, "studio": 799, "business": 1499}

async def get_plan_prices():
    doc = await db.config.find_one({"key": "plan_prices"}, {"_id": 0})
    return doc["value"] if doc else PLAN_PRICES_DEFAULT

DEFAULT_PLAN_CONFIG = {
    "free":     {"enabled": True, "limits": {"max_reviews": 3, "max_reviewers": 3, "ads_on_export": True, "white_label": False, "local_broadcast": False, "pdf_export": True, "storage_gb": 0}, "offer": {}},
    "creator":  {"enabled": True, "limits": {"max_reviews": -1, "max_reviewers": 10, "ads_on_export": False, "white_label": False, "local_broadcast": True, "pdf_export": True, "storage_gb": 0}, "offer": {}},
    "studio":   {"enabled": True, "limits": {"max_reviews": -1, "max_reviewers": -1, "ads_on_export": False, "white_label": True, "local_broadcast": True, "pdf_export": True, "storage_gb": 0}, "offer": {}},
    "business": {"enabled": True, "limits": {"max_reviews": -1, "max_reviewers": -1, "ads_on_export": False, "white_label": True, "local_broadcast": True, "pdf_export": True, "storage_gb": 20}, "offer": {}},
}

async def get_plan_config():
    doc = await db.config.find_one({"key": "plan_config"}, {"_id": 0})
    saved = (doc or {}).get("value") or {}
    cfg = {}
    for pid, base in DEFAULT_PLAN_CONFIG.items():
        merged = {"enabled": base["enabled"], "limits": dict(base["limits"]), "offer": dict(base.get("offer") or {})}
        s = saved.get(pid) or {}
        if "enabled" in s: merged["enabled"] = bool(s["enabled"])
        if isinstance(s.get("limits"), dict): merged["limits"].update(s["limits"])
        if isinstance(s.get("offer"), dict): merged["offer"] = s["offer"]
        cfg[pid] = merged
    return cfg

def active_offer_percent(planobj):
    off = planobj.get("offer") or {}
    pct = int(off.get("percent") or 0)
    if pct <= 0: return 0
    until = off.get("until")
    if until:
        try:
            if datetime.fromisoformat(until).date() < datetime.now(timezone.utc).date():
                return 0
        except Exception:
            return 0
    return pct

async def plan_limits(plan):
    cfg = await get_plan_config()
    p = cfg.get(plan) or cfg["free"]
    return p["limits"]

async def validate_coupon_doc(code, plan, user):
    if not code: return (0, None, "")
    c = await db.coupons.find_one({"code": code.strip().upper()}, {"_id": 0})
    if not c or not c.get("active", True): return (0, None, "Invalid coupon")
    exp = c.get("expires_at")
    if exp:
        try:
            if datetime.fromisoformat(exp).date() < datetime.now(timezone.utc).date():
                return (0, None, "Coupon expired")
        except Exception:
            pass
    if c.get("plans") and plan not in c["plans"]:
        return (0, None, "Coupon not valid for this plan")
    if c.get("new_users_only") and user.get("plan") != "free":
        return (0, None, "Coupon is for new users only")
    used = await db.coupon_redemptions.find_one({"code": c["code"], "user_id": user["user_id"]})
    if used:
        return (0, None, "Coupon already used")
    return (int(c.get("percent") or 0), c, "")

async def compute_amount(plan, coupon_code, user):
    prices = await get_plan_prices()
    if plan not in prices:
        raise HTTPException(400, "Invalid plan")
    cfg = await get_plan_config()
    base = prices[plan]
    offer_pct = active_offer_percent(cfg.get(plan) or {})
    coupon_pct, cdoc, cmsg = await validate_coupon_doc(coupon_code, plan, user)
    final = round(base * (1 - offer_pct / 100) * (1 - coupon_pct / 100))
    return {"base_price": base, "offer_percent": offer_pct, "coupon_percent": coupon_pct,
            "coupon_doc": cdoc, "coupon_message": cmsg, "amount": max(1, final)}

@api_router.get("/billing/plans")
async def billing_plans():
    prices = await get_plan_prices()
    cfg = await get_plan_config()
    plans = {}
    for pid, pc in cfg.items():
        base = prices.get(pid, 0)
        offer_pct = active_offer_percent(pc)
        plans[pid] = {
            "enabled": pc["enabled"], "limits": pc["limits"], "offer": pc.get("offer") or {},
            "price": base, "offer_percent": offer_pct,
            "effective_price": round(base * (1 - offer_pct / 100)),
        }
    return {"prices": prices, "upi_id": UPI_ID, "qr_image": QR_IMAGE, "plans": plans}

@api_router.post("/admin/plans")
async def admin_set_plans(request: Request):
    await require_admin(request)
    body = await request.json()
    prices = {k: int(v) for k, v in body.items() if k in PLAN_PRICES_DEFAULT}
    await db.config.update_one({"key": "plan_prices"}, {"$set": {"key": "plan_prices", "value": prices}}, upsert=True)
    return {"ok": True, "prices": prices}

@api_router.get("/plans/config")
async def plans_config(request: Request):
    await get_current_user(request)
    return await get_plan_config()

@api_router.post("/admin/plans/config")
async def admin_set_plan_config(request: Request):
    await require_admin(request)
    body = await request.json()  # {plan: {enabled, limits:{...}, offer:{percent, until}}}
    # Persist ONLY the deltas over DEFAULT_PLAN_CONFIG so future default changes
    # still apply to untouched fields (avoids freezing a full snapshot).
    doc = await db.config.find_one({"key": "plan_config"}, {"_id": 0})
    saved = dict((doc or {}).get("value") or {})
    for pid, val in (body or {}).items():
        if pid not in DEFAULT_PLAN_CONFIG:
            continue
        slot = dict(saved.get(pid) or {})
        if "enabled" in val: slot["enabled"] = bool(val["enabled"])
        if isinstance(val.get("limits"), dict): slot["limits"] = {**(slot.get("limits") or {}), **val["limits"]}
        if isinstance(val.get("offer"), dict): slot["offer"] = val["offer"]
        saved[pid] = slot
    await db.config.update_one({"key": "plan_config"}, {"$set": {"key": "plan_config", "value": saved}}, upsert=True)
    return {"ok": True, "plans": await get_plan_config()}

@api_router.post("/admin/plans/config/reset")
async def admin_reset_plan_config(request: Request):
    await require_admin(request)
    await db.config.delete_one({"key": "plan_config"})
    return {"ok": True, "plans": await get_plan_config()}

# ===== Coupons =====
@api_router.get("/admin/coupons")
async def list_coupons(request: Request):
    await require_admin(request)
    rows = await db.coupons.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
    for c in rows:
        c["redemptions"] = await db.coupon_redemptions.count_documents({"code": c["code"]})
    return rows

@api_router.post("/admin/coupons")
async def create_coupon(request: Request):
    await require_admin(request)
    b = await request.json()
    code = (b.get("code") or "").strip().upper()
    if not code: raise HTTPException(400, "Code required")
    doc = {
        "code": code, "percent": int(b.get("percent") or 0),
        "plans": b.get("plans") or [],  # [] = any plan
        "new_users_only": bool(b.get("new_users_only")),
        "description": (b.get("description") or "").strip(),
        "expires_at": b.get("expires_at") or None,
        "active": True, "created_at": now_iso(),
    }
    await db.coupons.update_one({"code": code}, {"$set": doc}, upsert=True)
    return {"ok": True, "coupon": doc}

@api_router.get("/coupons/active")
async def active_coupons(request: Request):
    user = await get_current_user(request)
    today = datetime.now(timezone.utc).date()
    rows = await db.coupons.find({"active": True}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for c in rows:
        exp = c.get("expires_at")
        if exp:
            try:
                if datetime.fromisoformat(exp).date() < today:
                    continue
            except Exception:
                pass
        if c.get("new_users_only") and user.get("plan") != "free":
            continue
        used = await db.coupon_redemptions.find_one({"code": c["code"], "user_id": user["user_id"]})
        if used:
            continue
        out.append({"code": c["code"], "percent": c["percent"], "description": c.get("description", ""),
                    "expires_at": c.get("expires_at"), "new_users_only": c.get("new_users_only", False)})
    return out

@api_router.delete("/admin/coupons/{code}")
async def delete_coupon(code: str, request: Request):
    await require_admin(request)
    await db.coupons.delete_one({"code": code.strip().upper()})
    return {"ok": True}

@api_router.post("/billing/validate-coupon")
async def validate_coupon(request: Request):
    user = await get_current_user(request)
    b = await request.json()
    plan = b.get("plan"); code = b.get("code")
    calc = await compute_amount(plan, code, user)
    valid = calc["coupon_percent"] > 0
    return {"valid": valid, "percent": calc["coupon_percent"], "message": calc["coupon_message"] or ("Coupon applied" if valid else ""),
            "amount": calc["amount"], "base_price": calc["base_price"], "offer_percent": calc["offer_percent"]}

@api_router.get("/billing/upi-qr")
async def upi_qr(plan: str, request: Request, coupon: str = ""):
    user = await get_current_user(request)
    calc = await compute_amount(plan, coupon, user)
    amount = calc["amount"]
    upi_link = f"upi://pay?pa={UPI_ID}&pn=BlackFxtudio&am={amount}&cu=INR&tn=Worxpher-{plan}"
    import qrcode, io, base64
    img = qrcode.make(upi_link)
    buf = io.BytesIO(); img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"qr": f"data:image/png;base64,{b64}", "upi_link": upi_link, "amount": amount,
            "base_price": calc["base_price"], "offer_percent": calc["offer_percent"], "coupon_percent": calc["coupon_percent"]}

@api_router.post("/billing/upi-request")
async def upi_request(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    plan = body.get("plan")
    txn_ref = body.get("txn_ref", "")
    gst_no = body.get("gst_no")
    coupon = body.get("coupon", "")
    calc = await compute_amount(plan, coupon, user)
    amount = calc["amount"]
    if gst_no:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"gst_no": gst_no}})
    base = amount / 1.18
    gst = amount - base
    pid = f"pay_{uuid.uuid4().hex[:10]}"
    upi_link = f"upi://pay?pa={UPI_ID}&pn=BlackFxtudio&am={amount}&cu=INR&tn=Worxpher-{plan}-{pid}"
    await db.payments.insert_one({
        "id": pid, "user_id": user["user_id"], "email": user["email"], "name": user["name"],
        "plan": plan, "amount": amount, "base": round(base, 2), "gst": round(gst, 2),
        "coupon": (calc["coupon_doc"] or {}).get("code"), "offer_percent": calc["offer_percent"], "coupon_percent": calc["coupon_percent"],
        "txn_ref": txn_ref, "status": "pending", "upi_link": upi_link, "created_at": now_iso(),
    })
    return {"ok": True, "payment_id": pid, "upi_id": UPI_ID, "qr_image": QR_IMAGE,
            "amount": amount, "upi_link": upi_link}

@api_router.get("/billing/payments")
async def list_my_payments(request: Request):
    user = await get_current_user(request)
    rows = await db.payments.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows

@api_router.get("/billing/upi-info")
async def upi_info():
    return {"upi_id": UPI_ID, "qr_image": QR_IMAGE}

@api_router.post("/settings/profile")
async def update_profile(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    updates = {}
    for f in ("gst_no", "company"):
        if f in body:
            updates[f] = body[f]
    # White-label branding fields require the white_label plan limit
    lim = await plan_limits(user["plan"])
    if lim.get("white_label"):
        for f in ("brand_logo", "brand_accent", "website", "instagram"):
            if f in body:
                updates[f] = body[f]
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return {"ok": True}

# ===== Site content (Admin CMS) =====
DEFAULT_CONTENT = {
    "landing_headline": "Review video without hosting it.",
    "landing_tagline": "Stream from YouTube or Vimeo, or broadcast a local file live from your computer. Annotate in real-time with vector tools, thread feedback like Instagram, jump on a P2P call — all in one workspace.",
    "footer_text": "Worxpher",
    "plans": {},
}

@api_router.get("/content")
async def get_content():
    doc = await db.config.find_one({"key": "site_content"}, {"_id": 0})
    c = dict(DEFAULT_CONTENT)
    if doc and doc.get("value"):
        c.update(doc["value"])
    return c

@api_router.post("/admin/content")
async def set_content(request: Request):
    await require_admin(request)
    body = await request.json()
    allowed = {}
    for k in ("landing_headline", "landing_tagline", "footer_text"):
        if k in body and isinstance(body[k], str):
            allowed[k] = body[k]
    if "plans" in body and isinstance(body["plans"], dict):
        allowed["plans"] = body["plans"]
    existing = await db.config.find_one({"key": "site_content"}, {"_id": 0})
    merged = dict(existing.get("value") if existing else {})
    merged.update(allowed)
    await db.config.update_one({"key": "site_content"}, {"$set": {"key": "site_content", "value": merged}}, upsert=True)
    return {"ok": True, "content": merged}

# ===== Dashboard analytics =====
@api_router.get("/me/stats")
async def my_stats(request: Request):
    user = await get_current_user(request)
    total = await db.reviews.count_documents({"owner_id": user["user_id"]})
    # this month
    start_month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    this_month = await db.reviews.count_documents({"owner_id": user["user_id"], "created_at": {"$gte": start_month}})
    total_stars = 0
    async for r in db.reviews.find({"owner_id": user["user_id"]}, {"_id": 0, "stars": 1}):
        total_stars += r.get("stars") or 0
    total_annotations = await db.annotations.count_documents({"owner_id": user["user_id"]})
    return {
        "total_projects": total, "monthly_projects": this_month,
        "total_stars": total_stars, "total_annotations": total_annotations,
        "referrals": user.get("referrals_count", 0),
        "bonus_eligible": (user.get("referrals_count", 0) >= 10 and total >= 3),
    }

# ===== Admin =====
@api_router.get("/admin/stats")
async def admin_stats(request: Request):
    await require_admin(request)
    users_total = await db.users.count_documents({})
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    active_today = await db.users.count_documents({"last_login": {"$gte": today}})
    by_plan = {}
    async for u in db.users.find({}, {"_id": 0, "plan": 1}):
        by_plan[u.get("plan", "free")] = by_plan.get(u.get("plan", "free"), 0) + 1
    reviews_total = await db.reviews.count_documents({})
    pending_payments = await db.payments.count_documents({"status": "pending"})
    return {"users_total": users_total, "active_today": active_today, "by_plan": by_plan,
            "reviews_total": reviews_total, "pending_payments": pending_payments}

@api_router.get("/admin/users")
async def admin_users(request: Request):
    await require_admin(request)
    rows = await db.users.find({}, {"_id": 0}).sort("last_login", -1).to_list(500)
    return rows

@api_router.post("/admin/users/{user_id}/reset")
async def reset_user_data(user_id: str, request: Request):
    await require_admin(request)
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    review_ids = [r["id"] async for r in db.reviews.find({"owner_id": user_id}, {"_id": 0, "id": 1})]
    reviews_deleted = await db.reviews.delete_many({"owner_id": user_id})
    anns_deleted = await db.annotations.delete_many({"owner_id": user_id})
    comments_deleted = await db.comments.delete_many({"owner_id": user_id})
    # also clean annotations/comments that belonged to the user's reviews
    if review_ids:
        await db.annotations.delete_many({"review_id": {"$in": review_ids}})
        await db.comments.delete_many({"review_id": {"$in": review_ids}})
        await db.review_viewers.delete_many({"review_id": {"$in": review_ids}})
    return {
        "ok": True,
        "reviews_deleted": reviews_deleted.deleted_count,
        "annotations_deleted": anns_deleted.deleted_count,
        "comments_deleted": comments_deleted.deleted_count,
    }

@api_router.get("/admin/payments")
async def admin_payments(request: Request):
    await require_admin(request)
    rows = await db.payments.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return rows

@api_router.post("/admin/payments/{pid}/approve")
async def approve_payment(pid: str, request: Request):
    await require_admin(request)
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    if not p: raise HTTPException(404, "Not found")
    until = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    await db.users.update_one({"user_id": p["user_id"]}, {"$set": {"plan": p["plan"], "plan_until": until}})
    await db.payments.update_one({"id": pid}, {"$set": {"status": "approved", "approved_at": now_iso()}})
    # single-use per user: burn the coupon only on approval (idempotent)
    if p.get("coupon") and (p.get("coupon_percent") or 0) > 0:
        await db.coupon_redemptions.update_one(
            {"code": p["coupon"], "user_id": p["user_id"]},
            {"$set": {"code": p["coupon"], "user_id": p["user_id"], "used_at": now_iso()}},
            upsert=True,
        )
    # generate invoice
    inv_id = f"inv_{uuid.uuid4().hex[:10]}"
    await db.invoices.insert_one({
        "id": inv_id, "user_id": p["user_id"], "email": p["email"], "name": p["name"],
        "plan": p["plan"], "amount": p["amount"], "base": p["base"], "gst": p["gst"],
        "payment_id": pid, "created_at": now_iso(),
    })
    return {"ok": True}

@api_router.get("/admin/admins")
async def list_admins(request: Request):
    await require_admin(request)
    rows = await db.admins.find({}, {"_id": 0}).to_list(100)
    rows.append({"email": DEFAULT_ADMIN, "default": True})
    return rows

@api_router.post("/admin/admins")
async def add_admin(request: Request):
    await require_admin(request)
    body = await request.json()
    email = body.get("email", "").strip().lower()
    if not email: raise HTTPException(400, "email required")
    await db.admins.update_one({"email": email}, {"$set": {"email": email, "added_at": now_iso()}}, upsert=True)
    return {"ok": True}

@api_router.delete("/admin/admins/{email}")
async def del_admin(email: str, request: Request):
    await require_admin(request)
    if email == DEFAULT_ADMIN: raise HTTPException(400, "Cannot remove default")
    await db.admins.delete_one({"email": email})
    return {"ok": True}

@api_router.get("/admin/ads")
async def list_ads(request: Request):
    await require_admin(request)
    return await db.ads.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.post("/admin/ads")
async def add_ad(request: Request):
    await require_admin(request)
    body = await request.json()
    aid = f"ad_{uuid.uuid4().hex[:8]}"
    doc = {
        "id": aid, "title": body.get("title", "Sponsored"),
        "video_url": body.get("video_url"), "image_url": body.get("image_url"),
        "duration": body.get("duration", 15), "budget": body.get("budget", 0),
        "expiry": body.get("expiry"), "active": True,
        "plays": 0, "clicks": 0, "created_at": now_iso(),
    }
    await db.ads.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/admin/ads/{aid}")
async def del_ad(aid: str, request: Request):
    await require_admin(request)
    await db.ads.delete_one({"id": aid})
    return {"ok": True}

@api_router.get("/ads/serve")
async def serve_ad():
    ad = await db.ads.find_one({"active": True}, {"_id": 0}, sort=[("plays", 1)])
    if ad:
        await db.ads.update_one({"id": ad["id"]}, {"$inc": {"plays": 1}})
        # daily play count
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await db.ad_plays.update_one({"ad_id": ad["id"], "day": day}, {"$inc": {"count": 1}}, upsert=True)
    return ad or {"id": "default", "title": "Sponsored placement", "duration": 15}

@api_router.post("/ads/{aid}/click")
async def click_ad(aid: str):
    await db.ads.update_one({"id": aid}, {"$inc": {"clicks": 1}})
    return {"ok": True}

# ===== Invoices =====
@api_router.get("/invoices")
async def list_invoices(request: Request):
    user = await get_current_user(request)
    rows = await db.invoices.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows

# ===== WebRTC Signaling =====
class SignalHub:
    def __init__(self):
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}
    async def connect(self, room, peer, ws):
        await ws.accept()
        self.rooms.setdefault(room, {})[peer] = ws
        await self.broadcast(room, peer, {"type": "peer-joined", "peer": peer})
        await ws.send_json({"type": "peers", "peers": [p for p in self.rooms[room].keys() if p != peer]})
    def disconnect(self, room, peer):
        if room in self.rooms and peer in self.rooms[room]:
            del self.rooms[room][peer]
            if not self.rooms[room]: del self.rooms[room]
    async def broadcast(self, room, sender, msg):
        for p, ws in list(self.rooms.get(room, {}).items()):
            if p != sender:
                try: await ws.send_json(msg)
                except Exception: pass
    async def send_to(self, room, target, msg):
        ws = self.rooms.get(room, {}).get(target)
        if ws:
            try: await ws.send_json(msg)
            except Exception: pass

hub = SignalHub()
bcast_hub = SignalHub()

@app.websocket("/api/ws/{review_id}")
async def ws_signal(ws: WebSocket, review_id: str, peer: str):
    await hub.connect(review_id, peer, ws)
    try:
        while True:
            data = await ws.receive_json()
            target = data.get("target")
            data["from"] = peer
            if target: await hub.send_to(review_id, target, data)
            else: await hub.broadcast(review_id, peer, data)
    except WebSocketDisconnect:
        hub.disconnect(review_id, peer)
        await hub.broadcast(review_id, peer, {"type": "peer-left", "peer": peer})
    except Exception:
        hub.disconnect(review_id, peer)

@app.websocket("/api/ws/broadcast/{review_id}")
async def ws_broadcast(ws: WebSocket, review_id: str, peer: str, role: str = "viewer"):
    await bcast_hub.connect(review_id, peer, ws)
    # tell everyone what role this peer has so the broadcaster knows to offer
    await bcast_hub.broadcast(review_id, peer, {"type": "role", "peer": peer, "role": role})
    try:
        while True:
            data = await ws.receive_json()
            target = data.get("target")
            data["from"] = peer
            if target: await bcast_hub.send_to(review_id, target, data)
            else: await bcast_hub.broadcast(review_id, peer, data)
    except WebSocketDisconnect:
        bcast_hub.disconnect(review_id, peer)
        await bcast_hub.broadcast(review_id, peer, {"type": "peer-left", "peer": peer})
    except Exception:
        bcast_hub.disconnect(review_id, peer)

@api_router.get("/")
async def root():
    return {"message": "Worxpher API", "status": "ok"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
