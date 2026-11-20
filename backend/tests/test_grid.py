def test_grid_simulation_steps(client):
    r = client.post("/api/v1/grid/simulate", json={"scenario": "line-trip"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["steps"]) == 6
    assert all(s["stable"] for s in j["steps"])


def test_grid_copilot_cites(client):
    r = client.post("/api/v1/grid/copilot", json={"question": "Why islands first?", "scenario": "line-trip"})
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["cited_docs"]) > 0
    assert "human-in-the-loop" in j["badge"]
