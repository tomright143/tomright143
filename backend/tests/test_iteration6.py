"""Iteration 6 backend tests: /coupons/active, admin coupon description, presence email."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://worxpher-review.preview.emergentagent.com").rstrip("/")

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN")
FREE_TOKEN = os.environ.get("FREE_TOKEN")
STUDIO_TOKEN = os.environ.get("STUDIO_TOKEN")


def h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


TEST_COUPONS_TO_DELETE = []
TEST_REVIEWS_TO_DELETE = []


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    # Delete created coupons
    for code in TEST_COUPONS_TO_DELETE:
        try:
            requests.delete(f"{BASE_URL}/api/admin/coupons/{code}", headers=h(ADMIN_TOKEN), timeout=10)
        except Exception:
            pass


# ===== Auth sanity =====
def test_auth_admin_me():
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=h(ADMIN_TOKEN), timeout=10)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["email"] == "tom@blackfx.net"
    assert d.get("is_admin") is True


def test_auth_free_me():
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=h(FREE_TOKEN), timeout=10)
    assert r.status_code == 200
    assert r.json()["plan"] == "free"


def test_auth_studio_me():
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=h(STUDIO_TOKEN), timeout=10)
    assert r.status_code == 200
    assert r.json()["plan"] == "studio"


# ===== POST /api/admin/coupons with description =====
def test_admin_create_coupon_with_description_general():
    code = f"TESTGEN{int(time.time())}"
    TEST_COUPONS_TO_DELETE.append(code)
    payload = {
        "code": code,
        "percent": 15,
        "new_users_only": False,
        "description": "General launch offer — 15% off",
        "expires_at": "2027-12-31",
    }
    r = requests.post(f"{BASE_URL}/api/admin/coupons", headers=h(ADMIN_TOKEN), json=payload, timeout=10)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert data["coupon"]["description"] == payload["description"]
    assert data["coupon"]["percent"] == 15

    # Verify persisted via GET /admin/coupons
    r2 = requests.get(f"{BASE_URL}/api/admin/coupons", headers=h(ADMIN_TOKEN), timeout=10)
    assert r2.status_code == 200
    codes = {c["code"]: c for c in r2.json()}
    assert code in codes
    assert codes[code]["description"] == payload["description"]
    assert codes[code]["new_users_only"] is False


def test_admin_create_coupon_new_users_only():
    code = f"TESTNEW{int(time.time())}"
    TEST_COUPONS_TO_DELETE.append(code)
    payload = {
        "code": code,
        "percent": 25,
        "new_users_only": True,
        "description": "New users only — 25% off",
        "expires_at": "2027-12-31",
    }
    r = requests.post(f"{BASE_URL}/api/admin/coupons", headers=h(ADMIN_TOKEN), json=payload, timeout=10)
    assert r.status_code == 200
    assert r.json()["coupon"]["new_users_only"] is True


# ===== GET /api/coupons/active eligibility =====
def test_coupons_active_free_user_sees_general_and_new_users_only():
    r = requests.get(f"{BASE_URL}/api/coupons/active", headers=h(FREE_TOKEN), timeout=10)
    assert r.status_code == 200
    active = r.json()
    codes = {c["code"] for c in active}
    # General coupon visible to free
    gen = [c for c in TEST_COUPONS_TO_DELETE if c.startswith("TESTGEN")]
    new_only = [c for c in TEST_COUPONS_TO_DELETE if c.startswith("TESTNEW")]
    for g in gen:
        assert g in codes, f"General coupon {g} should be visible to free user"
    for n in new_only:
        assert n in codes, f"new_users_only coupon {n} should be visible to free user"

    # Field validation on one coupon
    sample = next((c for c in active if c["code"] in gen), None)
    assert sample is not None
    for field in ("code", "percent", "description", "expires_at", "new_users_only"):
        assert field in sample


def test_coupons_active_studio_user_excludes_new_users_only():
    r = requests.get(f"{BASE_URL}/api/coupons/active", headers=h(STUDIO_TOKEN), timeout=10)
    assert r.status_code == 200
    active = r.json()
    codes = {c["code"] for c in active}
    new_only = [c for c in TEST_COUPONS_TO_DELETE if c.startswith("TESTNEW")]
    for n in new_only:
        assert n not in codes, f"new_users_only coupon {n} must NOT appear for studio user"
    # General coupons should still be visible
    gen = [c for c in TEST_COUPONS_TO_DELETE if c.startswith("TESTGEN")]
    for g in gen:
        assert g in codes


def test_coupons_active_expired_excluded():
    code = f"TESTEXP{int(time.time())}"
    TEST_COUPONS_TO_DELETE.append(code)
    payload = {"code": code, "percent": 10, "description": "expired", "expires_at": "2020-01-01"}
    r = requests.post(f"{BASE_URL}/api/admin/coupons", headers=h(ADMIN_TOKEN), json=payload, timeout=10)
    assert r.status_code == 200
    r2 = requests.get(f"{BASE_URL}/api/coupons/active", headers=h(FREE_TOKEN), timeout=10)
    codes = {c["code"] for c in r2.json()}
    assert code not in codes, "Expired coupon must be excluded"


def test_coupons_active_requires_auth():
    r = requests.get(f"{BASE_URL}/api/coupons/active", timeout=10)
    assert r.status_code in (401, 403)


# ===== Presence returns email =====
def test_presence_returns_email():
    # Create a review as free user
    payload = {"title": "TEST_presence", "video_type": "youtube", "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
    r = requests.post(f"{BASE_URL}/api/reviews", headers=h(FREE_TOKEN), json=payload, timeout=10)
    assert r.status_code == 200, r.text
    review_id = r.json()["id"]
    TEST_REVIEWS_TO_DELETE.append(review_id)

    # Heartbeat
    r2 = requests.post(f"{BASE_URL}/api/reviews/{review_id}/heartbeat", headers=h(FREE_TOKEN), timeout=10)
    assert r2.status_code == 200

    # Get presence
    r3 = requests.get(f"{BASE_URL}/api/reviews/{review_id}/presence", headers=h(FREE_TOKEN), timeout=10)
    assert r3.status_code == 200
    d = r3.json()
    assert d["count"] >= 1
    assert len(d["users"]) >= 1
    u = d["users"][0]
    # Required fields: name, picture, is_owner, email
    for field in ("name", "picture", "is_owner", "email"):
        assert field in u, f"presence user missing field: {field}"
    assert "@example.com" in u["email"]
    assert u["is_owner"] is True

    # Cleanup review
    requests.delete(f"{BASE_URL}/api/reviews/{review_id}", headers=h(FREE_TOKEN), timeout=10)
