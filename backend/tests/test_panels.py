def test_panels_inspect(client):
    r = client.post("/api/v1/panels/inspect", params={"sample_id": "roof-a", "region_id": "bd-dhaka"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["defect_count"] >= 1
    assert j["efficiency_loss_pct"] > 0
    assert j["overlay_png_b64"][:10]


def test_panels_samples(client):
    r = client.get("/api/v1/panels/samples")
    assert "roof-a" in r.json()["samples"]
