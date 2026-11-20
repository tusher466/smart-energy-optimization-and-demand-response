"""Live data providers with honest provenance.

Every function returns a dict with a ``source`` key:
  "synthetic"  -> offline fallback (no key, OFFLINE mode, or fetch failed)
  "live:xxx"   -> real data from provider xxx (plus fetched_at + cache note)

Rules:
- Never raise to callers on network failure: catch everything, return synthetic.
- File cache under .model_cache/live/ with TTL, so repeated calls are fast/offline-capable.
- ENERGY_BRAIN_OFFLINE=1 forces synthetic without touching the network (used by tests).
"""
import csv
import io
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

CACHE_DIR = Path(os.getenv("MODEL_CACHE_DIR", "./.model_cache")) / "live"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

JSON_TIMEOUT = float(os.getenv("LIVE_TIMEOUT_S", "6"))
TTL_HOURS = {
    "nrel": 24, "emaps": 1, "pjm": 1, "eia": 6, "openmeteo": 1,
    "nasapower": 12, "ciuk": 1, "opsd": 24 * 7, "entsoe": 1,
}

REGION_COORDS = {
    "bd-dhaka": {"lat": 23.81, "lon": 90.41, "emaps_zone": "BD"},
    "de-berlin": {"lat": 52.52, "lon": 13.41, "emaps_zone": "DE"},
    "us-pjm": {"lat": 39.0, "lon": -77.5, "emaps_zone": "US-MIDA-PJM"},
}


def is_offline() -> bool:
    return os.getenv("ENERGY_BRAIN_OFFLINE", "").lower() in ("1", "true", "yes")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _cache_get(key: str, ttl_h: float):
    p = CACHE_DIR / f"{key}.json"
    try:
        if not p.exists():
            return None
        obj = json.loads(p.read_text())
        age_h = (time.time() - obj.get("ts", 0)) / 3600.0
        if age_h > ttl_h:
            return None
        return obj.get("payload")
    except Exception:
        return None


def _cache_set(key: str, payload: dict):
    try:
        (CACHE_DIR / f"{key}.json").write_text(json.dumps({"ts": time.time(), "payload": payload}))
    except Exception:
        pass


def _cache_meta(key: str):
    p = CACHE_DIR / f"{key}.json"
    try:
        if p.exists():
            obj = json.loads(p.read_text())
            return {"cached_at": datetime.fromtimestamp(obj.get("ts", 0), timezone.utc).isoformat(timespec="seconds")}
    except Exception:
        pass
    return {}


def _get_json(url: str, params=None, headers=None, timeout: float = JSON_TIMEOUT):
    import httpx
    r = httpx.get(url, params=params, headers=headers, timeout=timeout, follow_redirects=True)
    r.raise_for_status()
    return r.json()


def _get_text(url: str, params=None, headers=None, timeout: float = JSON_TIMEOUT) -> str:
    import httpx
    r = httpx.get(url, params=params, headers=headers, timeout=timeout, follow_redirects=True)
    r.raise_for_status()
    return r.text


# ---------------------------------------------------------------- NREL NSRDB
def nrel_psm(lat: float, lon: float, year: int = 2022) -> dict:
    """High-resolution solar irradiance + met data (NREL NSRDB PSM v3). Needs NREL_API_KEY."""
    key = os.getenv("NREL_API_KEY", "")
    ckey, ttl = f"nrel_{round(lat,2)}_{round(lon,2)}_{year}", TTL_HOURS["nrel"]
    if not key or is_offline():
        note = "NREL_API_KEY missing, using synthetic irradiance." if not key else "Offline mode."
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:nrel-cached", "note": "Cached NREL PSM (offline).", **_cache_meta(ckey)}
        return {"source": "synthetic", "note": note}
    try:
        text = _get_text(
            "https://developer.nrel.gov/api/nsrdb/v2/solar/psm3-download.csv",
            params={"wkt": f"POINT({lon} {lat})", "names": str(year), "api_key": key,
                    "attributes": "ghi,dhi,dni,air_temperature,wind_speed",
                    "leap_day": "false", "utc": "false", "interval": "60"},
            timeout=30.0,
        )
        reader = csv.DictReader(io.StringIO(text))
        ghi, temp = [], []
        for row in reader:
            try:
                ghi.append(float(row.get("GHI") or row.get("ghi") or 0))
                temp.append(float(row.get("Temperature") or row.get("air_temperature") or row.get("T2m") or 25))
            except (TypeError, ValueError):
                continue
        if len(ghi) < 24:
            raise ValueError("NSRDB returned too few rows")
        payload = {"ghi_wm2": ghi, "temp_c": temp, "year": year,
                   "fetched_at": _now_iso(), "note": f"NREL NSRDB PSM v3, {len(ghi)} hourly rows."}
        _cache_set(ckey, payload)
        return {**payload, "source": "live:nrel"}
    except Exception as e:
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:nrel-cached", "note": f"NREL fetch failed ({e}); using cache."}
        return {"source": "synthetic", "note": f"NREL unavailable ({e}); synthetic fallback."}


# ------------------------------------------------------- Electricity Maps
def electricitymaps_carbon(zone: str) -> dict:
    """Real-time grid CO2 intensity + fossil share (Electricity Maps v3). Needs ELECTRICITY_MAPS_KEY."""
    key = os.getenv("ELECTRICITY_MAPS_KEY", "")
    ckey, ttl = f"emaps_{zone}", TTL_HOURS["emaps"]
    if not key or is_offline():
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:emaps-cached", "note": "Cached Electricity Maps (offline)."}
        return {"source": "synthetic", "note": "ELECTRICITY_MAPS_KEY missing; static factors."}
    try:
        j = _get_json("https://api.electricitymaps.com/v3/carbon-intensity/latest",
                      params={"zone": zone}, headers={"auth-token": key})
        payload = {"carbon_g_per_kwh": float(j["carbonIntensity"]),
                   "fossil_pct": float(j.get("fossilFuelPercentage", -1)),
                   "zone": zone, "fetched_at": _now_iso(),
                   "note": "Electricity Maps v3 latest carbon intensity."}
        _cache_set(ckey, payload)
        return {**payload, "source": "live:emaps"}
    except Exception as e:
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:emaps-cached", "note": f"Fetch failed ({e}); using cache."}
        return {"source": "synthetic", "note": f"Electricity Maps unavailable ({e})."}


# ------------------------------------------------------------------ PJM
def _pjm_headers():
    key = os.getenv("PJM_API_KEY", "")
    return {"Ocp-Apim-Subscription-Key": key} if key else {}


def pjm_load_forecast() -> dict:
    """PJM 7-day hourly load forecast (PJM Data Miner). Needs PJM_API_KEY (free subscription)."""
    if not os.getenv("PJM_API_KEY", "") or is_offline():
        return {"source": "synthetic", "note": "PJM_API_KEY missing; synthetic load shape."}
    try:
        j = _get_json("https://api.pjm.com/api/v1/load_frcstd_7_day",
                      params={"download": "false", "rowCount": 200, "sort": "forecast_datetime_utc_ending:Ascending"},
                      headers=_pjm_headers())
        items = j if isinstance(j, list) else j.get("items", j.get("Items", []))
        vals = [float(x.get("forecast_load_mw") or x.get("load_mw") or 0) for x in items[:168]]
        vals = [v for v in vals if v > 0]
        if len(vals) < 24:
            raise ValueError("PJM returned too few rows")
        return {"source": "live:pjm", "load_mw": vals, "fetched_at": _now_iso(),
                "note": f"PJM Data Miner load_frcstd_7_day, {len(vals)} hourly points."}
    except Exception as e:
        return {"source": "synthetic", "note": f"PJM unavailable ({e})."}


# ------------------------------------------------------------------ EIA
def eia_texas_wind_hourly() -> dict:
    """US EIA v2 hourly wind generation, Texas (EBA ERCOT). Needs EIA_API_KEY (free)."""
    key = os.getenv("EIA_API_KEY", "")
    ckey, ttl = "eia_ercot_wnd", TTL_HOURS["eia"]
    if not key or is_offline():
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:eia-cached", "note": "Cached EIA (offline)."}
        return {"source": "synthetic", "note": "EIA_API_KEY missing; synthetic wind."}
    try:
        j = _get_json(
            "https://api.eia.gov/v2/electricity/rto/fuel-type-data/data/",
            params={"frequency": "hourly", "data[0]": "value", "sort[0][column]": "period",
                    "sort[0][direction]": "desc", "offset": 0, "length": 48,
                    "facets[respondent][]": "ERCO", "facets[fueltype][]": "WND",
                    "api_key": key},
        )
        rows = j.get("response", {}).get("data", [])
        vals = [float(r["value"]) for r in reversed(rows) if r.get("value") not in (None, "")]
        if len(vals) < 12:
            raise ValueError("EIA returned too few rows")
        payload = {"wind_mwh": vals, "fetched_at": _now_iso(),
                   "note": "EIA v2 RTO fuel-type hourly wind, ERCOT."}
        _cache_set(ckey, payload)
        return {**payload, "source": "live:eia"}
    except Exception as e:
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:eia-cached", "note": f"EIA fetch failed ({e}); using cache."}
        return {"source": "synthetic", "note": f"EIA unavailable ({e})."}


# ------------------------------------------------------------- Open-Meteo
def open_meteo(lat: float, lon: float) -> dict:
    """Free GFS/ICON-based forecast: cloud cover, irradiance, temperature (Open-Meteo, no key).

    Open-Meteo blends NOAA GFS + DWD ICON + others into free JSON — this is our
    machine-readable route to GFS cloud-cover data (NOMADS GRIB2 is the raw
    alternative, documented in DATA_SOURCES.txt).
    """
    ckey, ttl = f"openmeteo_{round(lat,2)}_{round(lon,2)}", TTL_HOURS["openmeteo"]
    if is_offline():
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:openmeteo-cached", "note": "Cached Open-Meteo (offline)."}
        return {"source": "synthetic", "note": "Offline mode; synthetic clouds."}
    try:
        j = _get_json("https://api.open-meteo.com/v1/forecast",
                      params={"latitude": lat, "longitude": lon,
                              "hourly": "temperature_2m,cloud_cover,shortwave_radiation",
                              "forecast_days": 3, "timezone": "auto"})
        h = j.get("hourly", {})
        n = min(48, len(h.get("time", [])))
        payload = {"time": h.get("time", [])[:n],
                   "cloud_cover_pct": [float(v) for v in h.get("cloud_cover", [])[:n]],
                   "ghi_wm2": [float(v) for v in (h.get("shortwave_radiation", []) or [])[:n]],
                   "temp_c": [float(v) for v in h.get("temperature_2m", [])[:n]],
                   "fetched_at": _now_iso(),
                   "note": "Open-Meteo forecast (GFS/ICON blend): cloud cover, irradiance, temp."}
        _cache_set(ckey, payload)
        return {**payload, "source": "live:openmeteo"}
    except Exception as e:
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:openmeteo-cached", "note": f"Fetch failed ({e}); using cache."}
        return {"source": "synthetic", "note": f"Open-Meteo unavailable ({e})."}


# ------------------------------------------------------------ NASA POWER
def nasa_power(lat: float, lon: float) -> dict:
    """Free NASA POWER hourly solar irradiance + temperature climatology/actuals (no key)."""
    from datetime import timedelta
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=2)
    ckey, ttl = f"nasapower_{round(lat,2)}_{round(lon,2)}", TTL_HOURS["nasapower"]
    if is_offline():
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:nasapower-cached", "note": "Cached NASA POWER (offline)."}
        return {"source": "synthetic", "note": "Offline mode; synthetic irradiance."}
    try:
        j = _get_json("https://power.larc.nasa.gov/api/temporal/hourly/point",
                      params={"parameters": "ALLSKY_SFC_SW_DWN,T2M", "community": "RE",
                              "longitude": lon, "latitude": lat, "format": "JSON",
                              "start": start.strftime("%Y%m%d"), "end": end.strftime("%Y%m%d")},
                      timeout=15.0)
        props = j.get("properties", {}).get("parameter", {})
        ghi = props.get("ALLSKY_SFC_SW_DWN", {})
        t2m = props.get("T2M", {})
        keys = sorted(ghi.keys())
        ghi_vals = [float(ghi[k]) if ghi[k] not in (-999, None) else 0.0 for k in keys]
        tmp_vals = [float(t2m.get(k, 25)) for k in keys]
        if len(ghi_vals) < 24:
            raise ValueError("NASA POWER returned too few hours")
        payload = {"ghi_wm2": ghi_vals[-72:], "temp_c": tmp_vals[-72:],
                   "fetched_at": _now_iso(), "note": "NASA POWER hourly ALLSKY_SFC_SW_DWN + T2M."}
        _cache_set(ckey, payload)
        return {**payload, "source": "live:nasapower"}
    except Exception as e:
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:nasapower-cached", "note": f"Fetch failed ({e}); using cache."}
        return {"source": "synthetic", "note": f"NASA POWER unavailable ({e})."}


# ----------------------------------------------------- Carbon Intensity UK
def carbon_intensity_uk() -> dict:
    """Free real-time GB grid carbon intensity + 48h forecast (National Grid ESO, no key)."""
    ckey, ttl = "ciuk", TTL_HOURS["ciuk"]
    if is_offline():
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:ciuk-cached", "note": "Cached CI-UK (offline)."}
        return {"source": "synthetic", "note": "Offline mode."}
    try:
        j = _get_json("https://api.carbonintensity.org.uk/intensity")
        cur = j["data"][0]
        payload = {"carbon_g_per_kwh": float(cur["intensity"]["actual"] or cur["intensity"]["forecast"]),
                   "index": cur["intensity"]["index"], "from": cur["from"],
                   "fetched_at": _now_iso(), "note": "Carbon Intensity UK (GB grid, ESO)."}
        _cache_set(ckey, payload)
        return {**payload, "source": "live:ciuk"}
    except Exception as e:
        cached = _cache_get(ckey, ttl)
        if cached:
            return {**cached, "source": "live:ciuk-cached", "note": f"Fetch failed ({e}); using cache."}
        return {"source": "synthetic", "note": f"CI-UK unavailable ({e})."}


# ------------------------------------------------------------------ OPSD
OPSD_URL = ("https://data.open-power-system-data.org/time_series/2020-10-06/"
            "time_series_60min_singleindex.csv")


def opsd_status() -> dict:
    p = CACHE_DIR / "opsd_de_load.json"
    if p.exists():
        try:
            obj = json.loads(p.read_text())
            return {"source": "live:opsd-cached" if not is_offline() else "synthetic",
                    "note": f"OPSD DE load cached ({obj.get('n', '?')} hourly points).",
                    **_cache_meta("opsd_de_load")}
        except Exception:
            pass
    return {"source": "synthetic", "note": "OPSD package not cached; use POST /integrations/opsd-refresh. Synthetic load shape."}


def opsd_german_load(n: int = 168) -> dict:
    """German TSO load slice from OPSD time_series package (cached; no key needed)."""
    st = opsd_status()
    if st["source"] == "synthetic":
        return {"source": "synthetic", "note": st["note"]}
    try:
        obj = json.loads((CACHE_DIR / "opsd_de_load.json").read_text())
        vals = obj["load_mw"][-n:]
        return {"source": "live:opsd-cached", "load_mw": vals,
                "note": f"OPSD DE_transmission load, last {len(vals)}h.", **_cache_meta("opsd_de_load")}
    except Exception as e:
        return {"source": "synthetic", "note": f"OPSD cache unreadable ({e})."}


def opsd_refresh() -> dict:
    """Download OPSD time_series package once (~100MB+) and cache the DE load column."""
    if is_offline():
        return {"ok": False, "note": "Offline mode; download skipped."}
    import httpx
    try:
        col_idx, load = None, []
        with httpx.stream("GET", OPSD_URL, timeout=300.0, follow_redirects=True) as r:
            r.raise_for_status()
            text = io.TextIOWrapper(r.iter_bytes(), encoding="utf-8", errors="ignore")
            reader = csv.reader(text)
            header = next(reader)
            for i, name in enumerate(header):
                if name.strip().lower() in ("de_load_actual_entsoe_transparency", "de_load_actual_entsoe",
                                            "de_load_entsoe_transparency"):
                    col_idx = i
                    break
            if col_idx is None:
                for i, name in enumerate(header):
                    if name.startswith("DE_load"):
                        col_idx = i
                        break
            if col_idx is None:
                return {"ok": False, "note": "DE load column not found in OPSD header."}
            for row in reader:
                try:
                    load.append(float(row[col_idx]))
                except (ValueError, IndexError):
                    continue
        (CACHE_DIR / "opsd_de_load.json").write_text(json.dumps({"load_mw": load[-24 * 90:], "n": len(load)}))
        return {"ok": True, "note": f"OPSD cached: {len(load)} hourly DE load points."}
    except Exception as e:
        return {"ok": False, "note": f"OPSD download failed ({e})."}


# ---------------------------------------------------------------- ENTSO-E
def entsoe_status() -> dict:
    if os.getenv("ENTSOE_API_KEY", "") and not is_offline():
        return {"source": "live:entsoe",
                "note": "ENTSO-E Transparency key present (day-ahead prices, load, wind/solar forecasts via web API)."}
    return {"source": "synthetic",
            "note": "ENTSOE_API_KEY missing; EU load/price from synthetic shapes. Key is free at transparency.entsoe.eu."}


# ------------------------------------------------- unified region bundle
def region_live_bundle(region_id: str) -> dict:
    """Best-effort live context for a region: carbon, clouds, temp, irradiance.

    Always returns the same schema; every field carries its own provenance so the
    UI can label each number honestly.
    """
    coords = REGION_COORDS.get(region_id, REGION_COORDS["bd-dhaka"])
    lat, lon = coords["lat"], coords["lon"]

    carbon = electricitymaps_carbon(coords["emaps_zone"])
    if carbon["source"] == "synthetic" and region_id == "de-berlin":
        alt = carbon_intensity_uk()  # free EU proxy, honestly labelled
        if alt["source"].startswith("live"):
            alt = {**alt, "note": alt.get("note", "") + " Used as EU proxy for Berlin (GB grid)."}
            carbon = alt

    met = open_meteo(lat, lon)
    ghi = nrel_psm(lat, lon) if os.getenv("NREL_API_KEY", "") else {"source": "synthetic",
                                                                   "note": "NREL key missing; trying NASA POWER."}
    if ghi["source"] == "synthetic":
        alt = nasa_power(lat, lon)
        if alt["source"].startswith("live"):
            ghi = alt

    load = opsd_german_load() if region_id == "de-berlin" else \
        (pjm_load_forecast() if region_id == "us-pjm" else
         ({"source": "synthetic", "note": "EIA Texas wind context available via provider."}))

    return {"carbon": carbon, "met": met, "irradiance": ghi, "load": load,
            "fetched_at": _now_iso()}


def providers_status() -> list:
    """Fast status list (no network probing): key presence + cache freshness."""
    def row(name: str, key_env: str, cache_keys: list, live_prefix: str, detail: str,
            free_nokey: bool = False):
        configured = free_nokey or bool(os.getenv(key_env, ""))
        fresh = []
        for ck in cache_keys:
            m = _cache_meta(ck)
            if m:
                fresh.append(m["cached_at"])
        if configured and fresh and not is_offline():
            src, det = "live", f"{detail} Cache updated {max(fresh)}."
        elif configured and not is_offline():
            src, det = "live", f"{detail} No cache yet — will fetch on use."
        elif fresh:
            src, det = "synthetic", f"{detail} Offline/cached copy from {max(fresh)}."
        else:
            src, det = "synthetic", f"{detail} {'Free, no key.' if free_nokey else 'Key missing — set ' + key_env + '.'}"
        return {"name": name, "source": src if src == "live" else "synthetic",
                "live_prefix": live_prefix, "configured": configured,
                "detail": det, "updated_at": max(fresh) if fresh else None}

    latlon = [(f"openmeteo_{la}_{lo}") for la, lo in
              [(23.81, 90.41), (52.52, 13.41), (39.0, -77.5)]]
    nrelk = [f"nrel_{la}_{lo}_2022" for la, lo in
             [(23.81, 90.41), (52.52, 13.41), (39.0, -77.5)]]
    return [
        row("NREL NSRDB (irradiance + met)", "NREL_API_KEY", nrelk, "live:nrel",
            "High-resolution solar irradiance (PSM v3)."),
        row("NOAA GFS cloud cover → via Open-Meteo", "", latlon, "live:openmeteo",
            "GFS/ICON cloud-cover, irradiance, temperature forecast JSON.", free_nokey=True),
        row("NASA POWER (solar climatology)", "", ["nasapower_23.81_90.41"], "live:nasapower",
            "Free hourly irradiance + temperature.", free_nokey=True),
        row("Electricity Maps (grid CO₂)", "ELECTRICITY_MAPS_KEY",
            ["emaps_BD", "emaps_DE", "emaps_US-MIDA-PJM"], "live:emaps",
            "Real-time carbon intensity + fossil share."),
        row("Carbon Intensity UK (GB grid)", "", ["ciuk"], "live:ciuk",
            "Free GB intensity + forecast; EU proxy for Berlin.", free_nokey=True),
        row("Open Power System Data / OPSD (EU load)", "", ["opsd_de_load"], "live:opsd-cached",
            "German TSO load series; one-time cached download.", free_nokey=True),
        row("PJM Data Miner (load forecast)", "PJM_API_KEY", [], "live:pjm",
            "7-day hourly load forecast (free subscription key)."),
        row("US EIA v2 (wind/generation)", "EIA_API_KEY", ["eia_ercot_wnd"], "live:eia",
            "Hourly generation by fuel (free key)."),
        row("ENTSO-E Transparency (EUprices/load)", "ENTSOE_API_KEY", [], "live:entsoe",
            "Day-ahead prices, load, wind/solar forecasts (free key)."),
        row("Assistant LLM (OpenAI/Anthropic)", "OPENAI_API_KEY", [], "live",
            "Explanation wording only; never controls the grid."),
    ]
