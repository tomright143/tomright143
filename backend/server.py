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
    m = re.search(r"drive\.google\.com/file/d/([A-Za-z0-9_\-]+)", url)
    if m: return {"video_type": "gdrive", "video_id": m.group(1)}
    m = re.search(r"drive\.google\.com/open\?id=([A-Za-z0-9_\-]+)", url)
    if m: return {"video_type": "gdrive", "video_id": m.group(1)}
    m = re.search(r"[?&]id=([A-Za-z0-9_\-]{10,})", url)
    if m and "drive.google" in url:
        return {"video_type": "gdrive", "video_id": m.group(1)}
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
    info = extract_video_info(payload.video_url)
    if info["video_type"] == "unknown":
        raise HTTPException(400, "Unsupported URL. Use YouTube, Vimeo, or Google Drive.")
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

@api_router.get("/billing/plans")
async def billing_plans():
    prices = await get_plan_prices()
    return {"prices": prices, "upi_id": UPI_ID, "qr_image": QR_IMAGE}

@api_router.post("/admin/plans")
async def admin_set_plans(request: Request):
    await require_admin(request)
    body = await request.json()
    prices = {k: int(v) for k, v in body.items() if k in PLAN_PRICES_DEFAULT}
    await db.config.update_one({"key": "plan_prices"}, {"$set": {"key": "plan_prices", "value": prices}}, upsert=True)
    return {"ok": True, "prices": prices}

@api_router.get("/billing/upi-qr")
async def upi_qr(plan: str, request: Request):
    user = await get_current_user(request)
    prices = await get_plan_prices()
    if plan not in prices:
        raise HTTPException(400, "Invalid plan")
    amount = prices[plan]
    upi_link = f"upi://pay?pa={UPI_ID}&pn=BlackFxtudio&am={amount}&cu=INR&tn=ReviewIO-{plan}"
    import qrcode, io, base64
    img = qrcode.make(upi_link)
    buf = io.BytesIO(); img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return {"qr": f"data:image/png;base64,{b64}", "upi_link": upi_link, "amount": amount}

@api_router.post("/billing/upi-request")
async def upi_request(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    plan = body.get("plan")
    txn_ref = body.get("txn_ref", "")
    gst_no = body.get("gst_no")
    prices = await get_plan_prices()
    if plan not in prices:
        raise HTTPException(400, "Invalid plan")
    amount = prices[plan]
    if gst_no:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"gst_no": gst_no}})
    base = amount / 1.18
    gst = amount - base
    pid = f"pay_{uuid.uuid4().hex[:10]}"
    upi_link = f"upi://pay?pa={UPI_ID}&pn=BlackFxtudio&am={amount}&cu=INR&tn=ReviewIO-{plan}-{pid}"
    await db.payments.insert_one({
        "id": pid, "user_id": user["user_id"], "email": user["email"], "name": user["name"],
        "plan": plan, "amount": amount, "base": round(base, 2), "gst": round(gst, 2),
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
    for f in ("gst_no", "company", "brand_logo"):
        if f in body:
            updates[f] = body[f]
    if user["plan"] != "studio" and "brand_logo" in updates:
        updates.pop("brand_logo")
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return {"ok": True}

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

@api_router.get("/")
async def root():
    return {"message": "Review.io API", "status": "ok"}

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
