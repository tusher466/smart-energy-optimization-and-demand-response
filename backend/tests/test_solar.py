def test_solar_bands_monotonic(client):
    r = client.post("/api/v1/solar/forecast", json={"lat": 23.8, "lon": 90.4, "capacity_kw": 100, "horizon_h": 24})
    assert r.status_code == 200, r.text
    s = r.json()["series"]
    assert len(s) == 24
    for row in s:
        assert row["p10_kw"] <= row["p50_kw"] <= row["p90_kw"]


def test_solar_cloud_motion(client):
    r = client.post("/api/v1/solar/forecast", json={"lat": 23.8, "lon": 90.4, "capacity_kw": 50, "horizon_h": 12, "seed": 7})
    mv = r.json()["motion_vector"]
    # wind assumed (2..3.5, 0.8..1.8) px/h, frames advected by half-step -> estimate ~ (1..1.75,0.4..0.9)
    assert abs(mv["dx"]) < 6 and abs(mv["dy"]) < 6
