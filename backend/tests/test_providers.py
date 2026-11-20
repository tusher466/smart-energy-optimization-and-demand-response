import os
import pytest
from app.data import providers as pv


@pytest.fixture(autouse=True)
def offline(monkeypatch, tmp_path):
    monkeypatch.setenv("ENERGY_BRAIN_OFFLINE", "1")
    for k in ["NREL_API_KEY", "ELECTRICITY_MAPS_KEY", "PJM_API_KEY", "EIA_API_KEY", "ENTSOE_API_KEY"]:
        monkeypatch.delenv(k, raising=False)
    # isolate the file cache: live data cached by earlier runs must not leak in
    monkeypatch.setattr(pv, "CACHE_DIR", tmp_path)


def test_nrel_without_key_is_synthetic():
    r = pv.nrel_psm(23.81, 90.41)
    assert r["source"] == "synthetic"


def test_open_meteo_offline_is_synthetic():
    r = pv.open_meteo(52.52, 13.41)
    assert r["source"] == "synthetic"


def test_providers_never_raise_offline():
    for fn in [pv.carbon_intensity_uk, pv.pjm_load_forecast, pv.eia_texas_wind_hourly,
               pv.opsd_german_load, lambda: pv.electricitymaps_carbon("DE")]:
        assert fn()["source"] == "synthetic"


def test_cache_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(pv, "CACHE_DIR", tmp_path)
    pv._cache_set("t_k", {"a": 1})
    assert pv._cache_get("t_k", 1) == {"a": 1}
    assert pv._cache_get("t_k", -1) is None  # expired TTL


def test_region_bundle_offline_all_synthetic():
    b = pv.region_live_bundle("de-berlin")
    assert b["carbon"]["source"] == "synthetic"
    assert b["met"]["source"] == "synthetic"
    assert b["irradiance"]["source"] == "synthetic"
    assert set(b) == {"carbon", "met", "irradiance", "load", "fetched_at"}


def test_solar_offline_reports_synthetic_sources():
    from app.ml.solar import forecast_solar
    out = forecast_solar(23.8, 90.4, 50.0, 6, seed=1)
    assert out["source"] == "synthetic"
    assert all(v.startswith("synthetic") for v in out["data_sources"].values())
    for row in out["series"]:
        assert row["p10_kw"] <= row["p50_kw"] <= row["p90_kw"]


def test_solar_live_cloud_blend(monkeypatch):
    monkeypatch.delenv("ENERGY_BRAIN_OFFLINE", raising=False)
    monkeypatch.setattr(pv, "open_meteo", lambda lat, lon: {
        "source": "live:openmeteo", "cloud_cover_pct": [10.0] * 48,
        "temp_c": [30.0] * 48, "ghi_wm2": [500.0] * 48})
    from app.ml.solar import forecast_solar
    out = forecast_solar(23.8, 90.4, 50.0, 6, seed=1)
    assert out["source"] == "live-mix"
    assert out["data_sources"]["cloud"].startswith("live")
    for row in out["series"]:
        assert row["p10_kw"] <= row["p50_kw"] <= row["p90_kw"]


def test_status_lists_all_providers():
    rows = pv.providers_status()
    assert len(rows) >= 9
    names = " ".join(r["name"] for r in rows)
    for needle in ["NREL", "GFS", "NASA", "Electricity Maps", "OPSD", "PJM", "EIA", "ENTSO-E"]:
        assert needle in names
    for r in rows:
        assert "detail" in r and r["source"] in ("live", "synthetic")
