from fastapi.testclient import TestClient


def _anon(client: TestClient):
    """A client call without credentials (override the admin default headers)."""
    return {"Authorization": "Bearer invalid-token"}


def test_login_wrong_password(client):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "nope"})
    assert r.status_code == 401


def test_lockout_after_repeated_failures(client):
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"username": "ghost", "password": "x"})
    r = client.post("/api/v1/auth/login", json={"username": "ghost", "password": "x"})
    assert r.status_code == 429


def test_me_returns_role(client, viewer_headers):
    r = client.get("/api/v1/auth/me", headers=viewer_headers)
    assert r.json()["role"] == "viewer"


def test_no_token_is_401(client):
    c2 = TestClient(client.app)
    assert c2.get("/api/v1/regions").status_code == 401


def test_viewer_read_only(client, viewer_headers):
    assert client.get("/api/v1/regions", headers=viewer_headers).status_code == 200
    assert client.get("/api/v1/ledger/summary", headers=viewer_headers).status_code == 200
    # compute endpoints are forbidden for viewers
    r = client.post("/api/v1/solar/forecast", headers=viewer_headers,
                    json={"lat": 23.8, "lon": 90.4, "capacity_kw": 10, "horizon_h": 6})
    assert r.status_code == 403
    r = client.post("/api/v1/vpp/dispatch", headers=viewer_headers,
                    json={"region_id": "bd-dhaka", "n_ev": 2})
    assert r.status_code == 403


def test_manager_can_forecast_but_not_dispatch(client, manager_headers):
    r = client.post("/api/v1/solar/forecast", headers=manager_headers,
                    json={"lat": 23.8, "lon": 90.4, "capacity_kw": 10, "horizon_h": 6})
    assert r.status_code == 200
    r = client.post("/api/v1/vpp/dispatch", headers=manager_headers,
                    json={"region_id": "bd-dhaka", "n_ev": 2})
    assert r.status_code == 403
    r = client.post("/api/v1/ledger/reset", headers=manager_headers)
    assert r.status_code == 403


def test_operator_can_dispatch_and_decide(client, operator_headers):
    r = client.post("/api/v1/vpp/dispatch", headers=operator_headers,
                    json={"region_id": "bd-dhaka", "n_ev": 2})
    assert r.status_code == 200
    aids = [a["id"] for a in client.get("/api/v1/approvals", headers=operator_headers).json()["approvals"]]
    assert aids, "dispatch should create an approval"
    d = client.post(f"/api/v1/approvals/{aids[0]}/decide?approve=true", headers=operator_headers)
    assert d.json()["status"] == "approved"


def test_admin_user_crud(client):
    # create
    r = client.post("/api/v1/users", json={"username": "temp_mgr", "password": "pw1234", "role": "manager"})
    assert r.status_code == 200, r.text
    uid = r.json()["id"]
    # non-admin cannot list users
    from tests.conftest import _login
    vh = {"Authorization": f"Bearer {_login(client, 'viewer', 'view123')}"}
    assert client.get("/api/v1/users", headers=vh).status_code == 403
    # admin edits role + deactivates, then deletes
    assert client.patch(f"/api/v1/users/{uid}", json={"role": "operator"}).status_code == 200
    assert client.patch(f"/api/v1/users/{uid}", json={"is_active": False}).status_code == 200
    assert client.delete(f"/api/v1/users/{uid}").status_code == 200


def test_builtin_admin_protected(client):
    users = client.get("/api/v1/users").json()["users"]
    admin = next(u for u in users if u["username"] == "admin")
    assert client.patch(f"/api/v1/users/{admin['id']}", json={"role": "viewer"}).status_code == 400
    assert client.delete(f"/api/v1/users/{admin['id']}").status_code == 400
