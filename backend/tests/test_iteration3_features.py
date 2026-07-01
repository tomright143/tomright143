"""Iteration 3 backend tests: /content, /admin/content, local video type, GDrive rejection,
heartbeat + presence, /settings/profile brand gating.
"""
import os
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mc = MongoClient(MONGO_URL)
db = mc[DB_NAME]


def _mk_user(plan="free", is_admin=False):
    uid = f"user_it3_{plan}_{int(datetime.now().timestamp()*1000)}_{os.urandom(2).hex()}"
    token = f"test_session_{uid}"
    email = f"TEST_{uid}@example.com" if not is_admin else "tom@blackfx.net"
    doc = {
        "user_id": uid, "email": email, "name": f"{plan} user",
        "plan": plan, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if plan != "free":
        doc["plan_until"] = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    db.users.update_one({"email": email}, {"$set": doc}, upsert=True)
    u = db.users.find_one({"email": email})
    uid = u["user_id"]
    db.user_sessions.insert_one({
        "user_id": uid, "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return uid, token, email


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin():
    uid, tok, email = _mk_user(plan="free", is_admin=True)
    yield {"uid": uid, "token": tok, "email": email}


@pytest.fixture(scope="module")
def studio():
    uid, tok, email = _mk_user(plan="studio")
    yield {"uid": uid, "token": tok, "email": email}
    db.users.delete_one({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})


@pytest.fixture(scope="module")
def freeu():
    uid, tok, email = _mk_user(plan="free")
    yield {"uid": uid, "token": tok, "email": email}
    db.users.delete_one({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})


# ===== CMS content =====
def test_content_public_no_auth():
    r = requests.get(f"{BASE_URL}/api/content")
    assert r.status_code == 200
    body = r.json()
    for k in ("landing_headline", "landing_tagline", "footer_text", "plans"):
        assert k in body, f"missing key {k}"
    assert isinstance(body["plans"], dict)


def test_admin_content_update_and_reflect(admin, freeu):
    # 403 for non-admin
    r_forb = requests.post(f"{BASE_URL}/api/admin/content", headers=_h(freeu["token"]),
                           json={"landing_headline": "hack"})
    assert r_forb.status_code == 403

    new_head = f"TEST_headline_{int(datetime.now().timestamp())}"
    new_tag = "TEST_tagline_it3"
    new_footer = "TEST_footer_it3"
    plans = {"creator": {"name": "Creator++", "perks": ["p1", "p2"]}}
    r = requests.post(f"{BASE_URL}/api/admin/content", headers=_h(admin["token"]),
                      json={"landing_headline": new_head, "landing_tagline": new_tag,
                            "footer_text": new_footer, "plans": plans})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True

    # GET reflects
    g = requests.get(f"{BASE_URL}/api/content").json()
    assert g["landing_headline"] == new_head
    assert g["landing_tagline"] == new_tag
    assert g["footer_text"] == new_footer
    assert g["plans"].get("creator", {}).get("name") == "Creator++"


# ===== reviews with local + gdrive removed =====
def test_create_review_local(studio):
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(studio["token"]),
                      json={"title": "TEST_local", "video_url": "local://MyClip", "video_type": "local"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["video_type"] == "local"
    assert body["video_id"].startswith("local_")
    requests.delete(f"{BASE_URL}/api/reviews/{body['id']}", headers=_h(studio["token"]))


def test_create_review_gdrive_400(studio):
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(studio["token"]),
                      json={"title": "TEST_gd", "video_url": "https://drive.google.com/file/d/abc/view",
                            "video_type": "gdrive"})
    assert r.status_code == 400


def test_create_review_youtube_and_vimeo(studio):
    r_yt = requests.post(f"{BASE_URL}/api/reviews", headers=_h(studio["token"]),
                        json={"title": "TEST_yt", "video_url": "https://youtu.be/dQw4w9WgXcQ", "video_type": "youtube"})
    assert r_yt.status_code == 200
    assert r_yt.json()["video_type"] == "youtube"
    requests.delete(f"{BASE_URL}/api/reviews/{r_yt.json()['id']}", headers=_h(studio["token"]))

    r_vm = requests.post(f"{BASE_URL}/api/reviews", headers=_h(studio["token"]),
                        json={"title": "TEST_vm", "video_url": "https://vimeo.com/76979871", "video_type": "vimeo"})
    assert r_vm.status_code == 200, r_vm.text
    assert r_vm.json()["video_type"] == "vimeo"
    requests.delete(f"{BASE_URL}/api/reviews/{r_vm.json()['id']}", headers=_h(studio["token"]))


# ===== presence/heartbeat =====
def test_heartbeat_and_presence(studio):
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(studio["token"]),
                     json={"title": "TEST_pres", "video_url": "https://youtu.be/dQw4w9WgXcQ", "video_type": "youtube"})
    assert r.status_code == 200
    rid = r.json()["id"]

    hb = requests.post(f"{BASE_URL}/api/reviews/{rid}/heartbeat", headers=_h(studio["token"]))
    assert hb.status_code == 200
    assert hb.json()["ok"] is True

    p = requests.get(f"{BASE_URL}/api/reviews/{rid}/presence", headers=_h(studio["token"]))
    assert p.status_code == 200
    body = p.json()
    assert body["count"] >= 1
    uids = [u["user_id"] for u in body["users"]]
    assert studio["uid"] in uids

    requests.delete(f"{BASE_URL}/api/reviews/{rid}", headers=_h(studio["token"]))


# ===== profile branding gating =====
def test_settings_profile_studio_persists_brand(studio):
    payload = {"website": "https://example.com", "instagram": "@stud",
               "brand_accent": "#ff00aa", "brand_logo": "https://cdn.example.com/logo.png",
               "company": "TEST_Studio"}
    r = requests.post(f"{BASE_URL}/api/settings/profile", headers=_h(studio["token"]), json=payload)
    assert r.status_code == 200
    u = db.users.find_one({"user_id": studio["uid"]})
    assert u.get("website") == "https://example.com"
    assert u.get("instagram") == "@stud"
    assert u.get("brand_accent") == "#ff00aa"
    assert u.get("brand_logo") == "https://cdn.example.com/logo.png"


def test_settings_profile_free_does_not_persist_brand(freeu):
    payload = {"website": "https://nope.com", "instagram": "@nope",
               "brand_accent": "#000000", "brand_logo": "https://cdn.example.com/x.png",
               "company": "TEST_FreeCo"}
    r = requests.post(f"{BASE_URL}/api/settings/profile", headers=_h(freeu["token"]), json=payload)
    assert r.status_code == 200
    u = db.users.find_one({"user_id": freeu["uid"]})
    assert u.get("website") is None
    assert u.get("instagram") is None
    assert u.get("brand_accent") is None
    assert u.get("brand_logo") is None
    # non-gated field still persisted
    assert u.get("company") == "TEST_FreeCo"
