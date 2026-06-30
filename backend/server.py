from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import json  # noqa: F401
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
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

# ===== Models =====
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    plan: str = "free"  # free | creator | studio
    brand_logo: Optional[str] = None  # base64 data url for studio
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ReviewCreate(BaseModel):
    title: str
    video_url: str
    video_type: str  # youtube | vimeo | gdrive
    allow_download: bool = False

class Review(BaseModel):
    id: str
    owner_id: str
    title: str
    video_url: str
    video_type: str
    video_id: str  # extracted id for embedding
    allow_download: bool = False
    created_at: datetime

class AnnotationCreate(BaseModel):
    review_id: str
    timestamp: float  # in seconds
    tool: str  # arrow | circle | dashed | freehand | tick | cross | like | impressed | dislike | text
    color: str = "#5A67D8"
    points: List[Dict[str, float]]  # [{x: 0-1, y: 0-1}, ...] normalized
    text: Optional[str] = None  # for text/link tool
    link: Optional[str] = None

class CommentCreate(BaseModel):
    review_id: str
    text: str
    timestamp: Optional[float] = None
    parent_id: Optional[str] = None
    mentions: List[str] = []

# ===== Auth helpers =====
async def get_current_user(request: Request) -> User:
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
    udoc = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not udoc:
        raise HTTPException(401, "User not found")
    return User(**udoc)

def extract_video_info(url: str) -> Dict[str, str]:
    import re
    # YouTube
    m = re.search(r"(?:youtube\.com/(?:watch\?v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_\-]{6,})", url)
    if m:
        return {"video_type": "youtube", "video_id": m.group(1)}
    # Vimeo
    m = re.search(r"vimeo\.com/(\d+)", url)
    if m:
        return {"video_type": "vimeo", "video_id": m.group(1)}
    # Google Drive
    m = re.search(r"drive\.google\.com/file/d/([A-Za-z0-9_\-]+)", url)
    if m:
        return {"video_type": "gdrive", "video_id": m.group(1)}
    m = re.search(r"drive\.google\.com/open\?id=([A-Za-z0-9_\-]+)", url)
    if m:
        return {"video_type": "gdrive", "video_id": m.group(1)}
    return {"video_type": "unknown", "video_id": url}

# ===== Auth Routes =====
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
    # find or create user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": data["name"], "picture": data.get("picture")}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": data["name"],
            "picture": data.get("picture"), "plan": "free",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    response.set_cookie(
        key="session_token", value=session_token,
        max_age=7*24*60*60, httponly=True, secure=True, samesite="none", path="/",
    )
    udoc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": udoc}

@api_router.get("/auth/me")
async def me(request: Request):
    user = await get_current_user(request)
    return user.model_dump()

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
        raise HTTPException(400, "Unsupported video URL. Use YouTube, Vimeo, or Google Drive.")
    rid = f"rev_{uuid.uuid4().hex[:12]}"
    doc = {
        "id": rid, "owner_id": user.user_id, "title": payload.title,
        "video_url": payload.video_url, "video_type": info["video_type"],
        "video_id": info["video_id"], "allow_download": payload.allow_download,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/reviews")
async def list_reviews(request: Request):
    user = await get_current_user(request)
    rows = await db.reviews.find({"owner_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return rows

@api_router.get("/reviews/{review_id}")
async def get_review(review_id: str, request: Request):
    await get_current_user(request)
    r = await db.reviews.find_one({"id": review_id}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Not found")
    return r

@api_router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, request: Request):
    user = await get_current_user(request)
    await db.reviews.delete_one({"id": review_id, "owner_id": user.user_id})
    await db.annotations.delete_many({"review_id": review_id})
    await db.comments.delete_many({"review_id": review_id})
    return {"ok": True}

# ===== Annotations =====
@api_router.post("/annotations")
async def create_annotation(payload: AnnotationCreate, request: Request):
    user = await get_current_user(request)
    aid = f"ann_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": aid, "review_id": payload.review_id, "owner_id": user.user_id,
        "owner_name": user.name, "owner_picture": user.picture,
        "timestamp": payload.timestamp, "tool": payload.tool, "color": payload.color,
        "points": payload.points, "text": payload.text, "link": payload.link,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.annotations.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/annotations/{review_id}")
async def list_annotations(review_id: str, request: Request):
    await get_current_user(request)
    rows = await db.annotations.find({"review_id": review_id}, {"_id": 0}).sort("timestamp", 1).to_list(1000)
    return rows

@api_router.delete("/annotations/{ann_id}")
async def del_annotation(ann_id: str, request: Request):
    user = await get_current_user(request)
    await db.annotations.delete_one({"id": ann_id, "owner_id": user.user_id})
    return {"ok": True}

# ===== Comments =====
@api_router.post("/comments")
async def create_comment(payload: CommentCreate, request: Request):
    user = await get_current_user(request)
    cid = f"cmt_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": cid, "review_id": payload.review_id, "owner_id": user.user_id,
        "owner_name": user.name, "owner_picture": user.picture,
        "text": payload.text, "timestamp": payload.timestamp,
        "parent_id": payload.parent_id, "mentions": payload.mentions,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.comments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/comments/{review_id}")
async def list_comments(review_id: str, request: Request):
    await get_current_user(request)
    rows = await db.comments.find({"review_id": review_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return rows

# ===== Subscription (MOCKED Razorpay) =====
@api_router.post("/billing/subscribe")
async def subscribe(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    plan = body.get("plan")
    if plan not in ("free", "creator", "studio"):
        raise HTTPException(400, "Invalid plan")
    # MOCKED: instantly upgrade — in real, integrate Razorpay order_id flow
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"plan": plan}})
    udoc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return {"ok": True, "mocked": True, "user": udoc}

@api_router.post("/settings/brand-logo")
async def set_brand_logo(request: Request):
    user = await get_current_user(request)
    if user.plan != "studio":
        raise HTTPException(403, "Studio plan required for white-label branding")
    body = await request.json()
    logo = body.get("brand_logo", "")
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"brand_logo": logo}})
    return {"ok": True}

@api_router.get("/team")
async def get_team(request: Request):
    await get_current_user(request)
    # Returns all users as the "internal team" for @mentions and P2P
    rows = await db.users.find({}, {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1}).to_list(200)
    return rows

# ===== WebRTC Signaling =====
class SignalHub:
    def __init__(self):
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}
    async def connect(self, room: str, peer: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room, {})[peer] = ws
        # notify others
        await self.broadcast(room, peer, {"type": "peer-joined", "peer": peer})
        # send current peers list
        peers = [p for p in self.rooms[room].keys() if p != peer]
        await ws.send_json({"type": "peers", "peers": peers})
    def disconnect(self, room: str, peer: str):
        if room in self.rooms and peer in self.rooms[room]:
            del self.rooms[room][peer]
            if not self.rooms[room]:
                del self.rooms[room]
    async def broadcast(self, room: str, sender: str, msg: dict):
        for p, ws in list(self.rooms.get(room, {}).items()):
            if p != sender:
                try:
                    await ws.send_json(msg)
                except Exception:
                    pass
    async def send_to(self, room: str, target: str, msg: dict):
        ws = self.rooms.get(room, {}).get(target)
        if ws:
            try:
                await ws.send_json(msg)
            except Exception:
                pass

hub = SignalHub()

@app.websocket("/api/ws/{review_id}")
async def ws_signal(ws: WebSocket, review_id: str, peer: str):
    await hub.connect(review_id, peer, ws)
    try:
        while True:
            data = await ws.receive_json()
            target = data.get("target")
            data["from"] = peer
            if target:
                await hub.send_to(review_id, target, data)
            else:
                await hub.broadcast(review_id, peer, data)
    except WebSocketDisconnect:
        hub.disconnect(review_id, peer)
        await hub.broadcast(review_id, peer, {"type": "peer-left", "peer": peer})
    except Exception:
        hub.disconnect(review_id, peer)

@api_router.get("/")
async def root():
    return {"message": "Zero-Storage Video Review API", "status": "ok"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
