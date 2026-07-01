"""Tests for the 10-point fork feature list: reset endpoint, is_admin, cancel, shared auth, root."""
import os
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://worxpher-review.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mc = MongoClient(MONGO_URL)
db = mc[DB_NAME]


def _mk_user(plan="free", email_prefix="TEST_", is_admin=False):
    uid = f"user_{plan}_{int(datetime.now().timestamp()*1000)}"
    token = f"test_session_{uid}"
    email = f"{email_prefix}{uid}@example.com" if not is_admin else "tom@blackfx.net"
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


@pytest.fixture(scope="module")
def admin():
    uid, tok, email = _mk_user(plan="free", is_admin=True)
    yield {"uid": uid, "token": tok, "email": email}


@pytest.fixture(scope="module")
def paid():
    uid, tok, email = _mk_user(plan="creator")
    yield {"uid": uid, "token": tok, "email": email}
    db.users.delete_one({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})


@pytest.fixture(scope="module")
def freeu():
    uid, tok, email = _mk_user(plan="free")
    yield {"uid": uid, "token": tok, "email": email}
    db.users.delete_one({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ===== Root =====
def test_root_returns_worxpher():
    r = requests.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    assert r.json()["message"] == "Worxpher API"


# ===== auth/me is_admin =====
def test_auth_me_admin_flag_true(admin):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin["token"]))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == "tom@blackfx.net"
    assert data["is_admin"] is True


def test_auth_me_admin_flag_false_for_regular(freeu):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(freeu["token"]))
    assert r.status_code == 200
    assert r.json()["is_admin"] is False


# ===== billing/cancel =====
def test_billing_cancel_sets_flag(paid):
    r = requests.post(f"{BASE_URL}/api/billing/cancel", headers=_h(paid["token"]))
    assert r.status_code == 200
    assert r.json()["ok"] is True
    u = db.users.find_one({"user_id": paid["uid"]})
    assert u.get("cancel_at_end") is True


# ===== shared auth =====
def test_shared_requires_auth_and_returns_review(paid, freeu):
    # create review as paid
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(paid["token"]),
                     json={"title": "TEST_shared", "video_url": "https://youtu.be/dQw4w9WgXcQ", "video_type": "youtube"})
    assert r.status_code == 200, r.text
    review = r.json()
    token = review["share_token"]

    # unauth -> 401
    r_unauth = requests.get(f"{BASE_URL}/api/shared/{token}")
    assert r_unauth.status_code == 401

    # non-owner authenticated -> 200 with review
    r_auth = requests.get(f"{BASE_URL}/api/shared/{token}", headers=_h(freeu["token"]))
    assert r_auth.status_code == 200, r_auth.text
    body = r_auth.json()
    assert body["review"]["id"] == review["id"]

    # cleanup
    requests.delete(f"{BASE_URL}/api/reviews/{review['id']}", headers=_h(paid["token"]))


# ===== admin reset =====
def test_admin_reset_wipes_target_user(admin, freeu):
    # freeu creates review + annotation + comment
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(freeu["token"]),
                     json={"title": "TEST_reset", "video_url": "https://youtu.be/dQw4w9WgXcQ", "video_type": "youtube"})
    assert r.status_code == 200
    rid = r.json()["id"]
    ra = requests.post(f"{BASE_URL}/api/annotations", headers=_h(freeu["token"]),
                     json={"review_id": rid, "timestamp": 1.0, "tool": "arrow", "color": "#5A67D8", "brush": 3, "points": [{"x": 0, "y": 0}]})
    assert ra.status_code == 200
    rc = requests.post(f"{BASE_URL}/api/comments", headers=_h(freeu["token"]),
                     json={"review_id": rid, "text": "hi", "timestamp": 2.0})
    assert rc.status_code == 200

    # non-admin should get 403
    r_forb = requests.post(f"{BASE_URL}/api/admin/users/{freeu['uid']}/reset", headers=_h(freeu["token"]))
    assert r_forb.status_code == 403

    # unknown user -> 404
    r_404 = requests.post(f"{BASE_URL}/api/admin/users/nonexistent_user/reset", headers=_h(admin["token"]))
    assert r_404.status_code == 404

    # admin resets
    r_ok = requests.post(f"{BASE_URL}/api/admin/users/{freeu['uid']}/reset", headers=_h(admin["token"]))
    assert r_ok.status_code == 200, r_ok.text
    data = r_ok.json()
    assert data["ok"] is True
    assert data["reviews_deleted"] >= 1
    assert data["annotations_deleted"] >= 1
    assert data["comments_deleted"] >= 1

    # verify DB
    assert db.reviews.count_documents({"owner_id": freeu["uid"]}) == 0
    assert db.annotations.count_documents({"owner_id": freeu["uid"]}) == 0
    assert db.comments.count_documents({"owner_id": freeu["uid"]}) == 0
