def test_ledger_and_regions(client):
    client.post("/api/v1/ledger/reset")
    r = client.get("/api/v1/regions")
    assert len(r.json()["regions"]) == 3
    client.post("/api/v1/ledger/seed")
    s = client.get("/api/v1/ledger/summary").json()
    assert s["decisions"] >= 3
    assert s["total_saved"] > 0


def test_approvals_flow(client):
    a = client.post("/api/v1/approvals", json={"action": "Test approve", "module": "vpp"}).json()
    d = client.post(f"/api/v1/approvals/{a['id']}/decide", params={"approve": True}).json()
    assert d["status"] == "approved"
