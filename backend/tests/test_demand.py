def test_demand_bands_and_backtest(client):
    r = client.post("/api/v1/demand/forecast", json={"region_id": "bd-dhaka", "horizon_h": 24})
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["series"]) == 24
    for row in j["series"]:
        assert row["p10_kw"] <= row["p50_kw"] <= row["p90_kw"]
    assert j["backtest"]["mape_pct"] < 25


def test_demand_feature_importance(client):
    r = client.post("/api/v1/demand/forecast", json={"region_id": "de-berlin", "horizon_h": 12})
    fi = r.json()["feature_importance"]
    assert len(fi) >= 5
    assert abs(sum(f["importance"] for f in fi) - 1.0) < 0.05
