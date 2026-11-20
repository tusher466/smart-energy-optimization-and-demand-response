def test_vpp_soc_guarantee(client):
    r = client.post("/api/v1/vpp/dispatch", json={"region_id": "bd-dhaka", "n_ev": 8})
    assert r.status_code == 200, r.text
    j = r.json()
    for ev in j["per_ev"]:
        assert ev["guaranteed"] is True
        assert ev["delivered_kwh"] + 1e-6 >= ev["need_kwh"] - 0.01 if "need_kwh" in ev else True


def test_vpp_saves_money(client):
    r = client.post("/api/v1/vpp/dispatch", json={"region_id": "us-pjm", "n_ev": 6})
    j = r.json()
    assert j["smart"]["cost"] <= j["baseline"]["cost"]
    assert j["smart"]["peak_kw"] <= j["baseline"]["peak_kw"] + 1e-6
