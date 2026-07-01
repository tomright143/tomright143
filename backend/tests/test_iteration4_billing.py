"""Iteration 4 backend tests: plan config, feature limit enforcement, offers, coupons.

Covers:
- GET /api/billing/plans (public prices+plans structure w/ enabled/limits/offer/effective_price)
- GET /api/plans/config (auth)
- POST /api/admin/plans/config (admin only, updates enabled/limits/offer)
- Enforcement: max_reviews for FREE users
- Enforcement: local_broadcast (FREE forbidden, CREATOR allowed)
- Enforcement: white_label gate on /settings/profile
- /auth/me includes limits object
- Coupons CRUD (admin), validate-coupon, redemption single-use, offer+coupon stacking
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

# ---- helpers ----------------------------------------------------------------
def _mk_user(plan="free", is_admin=False):
    tag = f"{plan}_{int(datetime.now().timestamp()*1000)}_{os.urandom(2).hex()}"
    uid = f"user_it4_{tag}"
    token = f"test_session_it4_{tag}"
    email = "tom@blackfx.net" if is_admin else f"TEST_it4_{tag}@example.com"
    doc = {
        "user_id": uid, "email": email, "name": f"{plan} it4 user",
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

# ---- fixtures ---------------------------------------------------------------
@pytest.fixture(scope="module")
def admin():
    uid, tok, email = _mk_user(plan="free", is_admin=True)
    yield {"uid": uid, "token": tok, "email": email}
    db.user_sessions.delete_many({"session_token": tok})

@pytest.fixture(scope="module")
def freeu():
    uid, tok, email = _mk_user(plan="free")
    yield {"uid": uid, "token": tok, "email": email}
    db.reviews.delete_many({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})
    db.users.delete_one({"user_id": uid})

@pytest.fixture(scope="module")
def creator():
    uid, tok, email = _mk_user(plan="creator")
    yield {"uid": uid, "token": tok, "email": email}
    db.reviews.delete_many({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})
    db.users.delete_one({"user_id": uid})

@pytest.fixture(scope="module")
def studio():
    uid, tok, email = _mk_user(plan="studio")
    yield {"uid": uid, "token": tok, "email": email}
    db.reviews.delete_many({"user_id": uid})
    db.user_sessions.delete_many({"user_id": uid})
    db.users.delete_one({"user_id": uid})

@pytest.fixture(scope="module", autouse=True)
def restore_plan_config():
    """Ensure plan_config resets to defaults after this module runs."""
    yield
    db.config.delete_one({"key": "plan_config"})
    db.coupons.delete_many({"code": {"$regex": "^TEST_IT4_|^SAVE20$|^STACK20$"}})
    db.coupon_redemptions.delete_many({"code": {"$regex": "^TEST_IT4_|^SAVE20$|^STACK20$"}})

# ---- 1. billing/plans + plans/config ----------------------------------------
def test_billing_plans_shape():
    r = requests.get(f"{BASE_URL}/api/billing/plans")
    assert r.status_code == 200
    body = r.json()
    assert "prices" in body and "plans" in body
    for pid in ("free", "creator", "studio", "business"):
        assert pid in body["plans"], f"plan {pid} missing"
        p = body["plans"][pid]
        assert "enabled" in p and "limits" in p and "offer" in p
        assert "price" in p and "effective_price" in p and "offer_percent" in p
        # limits keys
        for k in ("max_reviews", "max_reviewers", "ads_on_export", "white_label",
                  "local_broadcast", "pdf_export", "storage_gb"):
            assert k in p["limits"], f"limits missing {k} on {pid}"

def test_plans_config_requires_auth(freeu):
    r = requests.get(f"{BASE_URL}/api/plans/config", headers=_h(freeu["token"]))
    assert r.status_code == 200
    body = r.json()
    assert "free" in body and "creator" in body

def test_plans_config_no_auth_401():
    r = requests.get(f"{BASE_URL}/api/plans/config")
    assert r.status_code in (401, 403)

# ---- 2. admin plans/config update -------------------------------------------
def test_admin_plan_config_forbidden_for_non_admin(freeu):
    r = requests.post(f"{BASE_URL}/api/admin/plans/config", headers=_h(freeu["token"]),
                      json={"studio": {"offer": {"percent": 40}}})
    assert r.status_code == 403

def test_admin_set_offer_studio_and_effective_price(admin):
    future = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    r = requests.post(f"{BASE_URL}/api/admin/plans/config", headers=_h(admin["token"]),
                      json={"studio": {"offer": {"percent": 40, "until": future}}})
    assert r.status_code == 200, r.text
    # verify effective_price via public endpoint
    bp = requests.get(f"{BASE_URL}/api/billing/plans").json()
    studio = bp["plans"]["studio"]
    assert studio["offer_percent"] == 40
    base = studio["price"]
    assert studio["effective_price"] == round(base * 0.6)

# ---- 3. max_reviews enforcement (FREE) --------------------------------------
def test_max_reviews_enforcement_free(admin, freeu):
    # set free.limits.max_reviews to 2 for a tighter test
    r = requests.post(f"{BASE_URL}/api/admin/plans/config", headers=_h(admin["token"]),
                      json={"free": {"limits": {"max_reviews": 2}}})
    assert r.status_code == 200

    created_ids = []
    try:
        for i in range(2):
            rr = requests.post(f"{BASE_URL}/api/reviews", headers=_h(freeu["token"]),
                               json={"title": f"TEST_it4_free_{i}",
                                     "video_url": "https://youtu.be/dQw4w9WgXcQ",
                                     "video_type": "youtube"})
            assert rr.status_code == 200, rr.text
            created_ids.append(rr.json()["id"])

        # 3rd should fail with 403
        rr3 = requests.post(f"{BASE_URL}/api/reviews", headers=_h(freeu["token"]),
                            json={"title": "TEST_it4_free_over",
                                  "video_url": "https://youtu.be/dQw4w9WgXcQ",
                                  "video_type": "youtube"})
        assert rr3.status_code == 403, f"expected 403 got {rr3.status_code} {rr3.text}"
        assert "limit" in rr3.text.lower()
    finally:
        for rid in created_ids:
            requests.delete(f"{BASE_URL}/api/reviews/{rid}", headers=_h(freeu["token"]))
        # restore
        requests.post(f"{BASE_URL}/api/admin/plans/config", headers=_h(admin["token"]),
                      json={"free": {"limits": {"max_reviews": 3}}})

# ---- 4. local_broadcast enforcement -----------------------------------------
def test_local_broadcast_forbidden_free(freeu):
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(freeu["token"]),
                      json={"title": "TEST_it4_free_local", "video_url": "local://Clip",
                            "video_type": "local"})
    assert r.status_code == 403, r.text

def test_local_broadcast_allowed_creator(creator):
    r = requests.post(f"{BASE_URL}/api/reviews", headers=_h(creator["token"]),
                      json={"title": "TEST_it4_creator_local", "video_url": "local://Clip",
                            "video_type": "local"})
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    requests.delete(f"{BASE_URL}/api/reviews/{rid}", headers=_h(creator["token"]))

# ---- 5. white_label gating on /settings/profile -----------------------------
def test_white_label_persists_for_studio(studio):
    payload = {"website": "https://it4.example.com", "instagram": "@it4s",
               "brand_accent": "#123456", "company": "TEST_it4_studio"}
    r = requests.post(f"{BASE_URL}/api/settings/profile", headers=_h(studio["token"]),
                      json=payload)
    assert r.status_code == 200
    u = db.users.find_one({"user_id": studio["uid"]})
    assert u.get("website") == "https://it4.example.com"
    assert u.get("instagram") == "@it4s"
    assert u.get("brand_accent") == "#123456"

def test_white_label_ignored_for_free(freeu):
    payload = {"website": "https://it4free.example.com", "instagram": "@nope4",
               "brand_accent": "#abcdef", "company": "TEST_it4_free"}
    r = requests.post(f"{BASE_URL}/api/settings/profile", headers=_h(freeu["token"]),
                      json=payload)
    assert r.status_code == 200
    u = db.users.find_one({"user_id": freeu["uid"]})
    assert u.get("website") is None
    assert u.get("instagram") is None
    assert u.get("brand_accent") is None
    # non-branded field persisted
    assert u.get("company") == "TEST_it4_free"

# ---- 6. /auth/me includes limits --------------------------------------------
def test_auth_me_includes_limits(creator):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(creator["token"]))
    assert r.status_code == 200
    body = r.json()
    assert "limits" in body, "auth/me must include limits"
    assert body["limits"].get("local_broadcast") is True
    assert body["limits"].get("max_reviews") == -1

# ---- 7. Coupons CRUD + validate-coupon --------------------------------------
def test_coupon_create_list_delete(admin, creator):
    # ensure clean slate
    requests.delete(f"{BASE_URL}/api/admin/coupons/SAVE20", headers=_h(admin["token"]))
    db.coupon_redemptions.delete_many({"code": "SAVE20"})

    r = requests.post(f"{BASE_URL}/api/admin/coupons", headers=_h(admin["token"]),
                      json={"code": "SAVE20", "percent": 20})
    assert r.status_code == 200
    assert r.json()["coupon"]["percent"] == 20

    lst = requests.get(f"{BASE_URL}/api/admin/coupons", headers=_h(admin["token"]))
    assert lst.status_code == 200
    codes = [c["code"] for c in lst.json()]
    assert "SAVE20" in codes
    save = next(c for c in lst.json() if c["code"] == "SAVE20")
    assert "redemptions" in save

    # validate-coupon
    v = requests.post(f"{BASE_URL}/api/billing/validate-coupon", headers=_h(creator["token"]),
                      json={"plan": "creator", "code": "SAVE20"})
    assert v.status_code == 200
    body = v.json()
    assert body["valid"] is True
    assert body["percent"] == 20
    base = body["base_price"]
    # amount = round(base * 0.8) (assuming no active offer on creator)
    assert body["amount"] == round(base * 0.8)

    # delete
    d = requests.delete(f"{BASE_URL}/api/admin/coupons/SAVE20", headers=_h(admin["token"]))
    assert d.status_code == 200
    lst2 = requests.get(f"{BASE_URL}/api/admin/coupons", headers=_h(admin["token"]))
    assert "SAVE20" not in [c["code"] for c in lst2.json()]

def test_coupon_admin_only(freeu):
    r = requests.get(f"{BASE_URL}/api/admin/coupons", headers=_h(freeu["token"]))
    assert r.status_code == 403
    r2 = requests.post(f"{BASE_URL}/api/admin/coupons", headers=_h(freeu["token"]),
                       json={"code": "HACK", "percent": 90})
    assert r2.status_code == 403

# ---- 8. Coupon single-use ---------------------------------------------------
def test_coupon_single_use(admin, creator):
    # create coupon
    requests.delete(f"{BASE_URL}/api/admin/coupons/SAVE20", headers=_h(admin["token"]))
    db.coupon_redemptions.delete_many({"code": "SAVE20", "user_id": creator["uid"]})
    requests.post(f"{BASE_URL}/api/admin/coupons", headers=_h(admin["token"]),
                  json={"code": "SAVE20", "percent": 20})

    # First: upi-qr returns discounted amount
    q = requests.get(f"{BASE_URL}/api/billing/upi-qr",
                     params={"plan": "creator", "coupon": "SAVE20"},
                     headers=_h(creator["token"]))
    assert q.status_code == 200
    qb = q.json()
    assert qb["coupon_percent"] == 20
    assert qb["amount"] == round(qb["base_price"] * 0.8)

    # Submit upi-request (records redemption)
    ur = requests.post(f"{BASE_URL}/api/billing/upi-request", headers=_h(creator["token"]),
                       json={"plan": "creator", "coupon": "SAVE20", "txn_ref": "TEST_TXN_IT4"})
    assert ur.status_code == 200

    # Now second validate-coupon for SAME user must be invalid
    v2 = requests.post(f"{BASE_URL}/api/billing/validate-coupon", headers=_h(creator["token"]),
                       json={"plan": "creator", "code": "SAVE20"})
    assert v2.status_code == 200
    body = v2.json()
    assert body["valid"] is False
    assert "already used" in (body.get("message") or "").lower()

    # cleanup
    db.payments.delete_many({"user_id": creator["uid"]})
    db.coupon_redemptions.delete_many({"code": "SAVE20"})
    requests.delete(f"{BASE_URL}/api/admin/coupons/SAVE20", headers=_h(admin["token"]))

# ---- 9. Offer + coupon stack ------------------------------------------------
def test_offer_and_coupon_stack(admin, studio):
    # ensure studio offer 40% (from earlier admin_set test) + create STACK20
    future = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    requests.post(f"{BASE_URL}/api/admin/plans/config", headers=_h(admin["token"]),
                  json={"studio": {"offer": {"percent": 40, "until": future}}})
    requests.delete(f"{BASE_URL}/api/admin/coupons/STACK20", headers=_h(admin["token"]))
    db.coupon_redemptions.delete_many({"code": "STACK20", "user_id": studio["uid"]})
    requests.post(f"{BASE_URL}/api/admin/coupons", headers=_h(admin["token"]),
                  json={"code": "STACK20", "percent": 20})

    q = requests.get(f"{BASE_URL}/api/billing/upi-qr",
                     params={"plan": "studio", "coupon": "STACK20"},
                     headers=_h(studio["token"]))
    assert q.status_code == 200
    body = q.json()
    base = body["base_price"]
    assert body["offer_percent"] == 40
    assert body["coupon_percent"] == 20
    assert body["amount"] == round(base * 0.6 * 0.8)

    # cleanup
    db.coupon_redemptions.delete_many({"code": "STACK20"})
    requests.delete(f"{BASE_URL}/api/admin/coupons/STACK20", headers=_h(admin["token"]))
    # remove offer
    requests.post(f"{BASE_URL}/api/admin/plans/config", headers=_h(admin["token"]),
                  json={"studio": {"offer": {}}})

# ---- 10. Disabled plan behaviour --------------------------------------------
def test_disabled_plan_flag_reflects(admin):
    # disable business
    r = requests.post(f"{BASE_URL}/api/admin/plans/config", headers=_h(admin["token"]),
                      json={"business": {"enabled": False}})
    assert r.status_code == 200
    bp = requests.get(f"{BASE_URL}/api/billing/plans").json()
    assert bp["plans"]["business"]["enabled"] is False
    # restore
    requests.post(f"{BASE_URL}/api/admin/plans/config", headers=_h(admin["token"]),
                  json={"business": {"enabled": True}})
