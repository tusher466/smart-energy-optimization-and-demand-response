"""Live connectors with automatic synthetic fallback.

Real fetching lives in :mod:`app.data.providers`. This module keeps the
original function names used across the codebase and adds status helpers.
"""
import os
from app.data import providers as pv


def nrel_irradiance(lat: float, lon: float):
    r = pv.nrel_psm(lat, lon)
    if r["source"] == "synthetic":
        return {"source": "synthetic", "note": r.get("note", "")}
    return {"source": "live", "provider": "nrel", "points": len(r.get("ghi_wm2", []))}


def electricitymaps_carbon(region: str):
    zone = pv.REGION_COORDS.get(region, {}).get("emaps_zone", region)
    r = pv.electricitymaps_carbon(zone)
    if r["source"] == "synthetic":
        return {"source": "synthetic", "note": r.get("note", "")}
    return {"source": "live", "provider": "emaps", "carbon_g_per_kwh": r.get("carbon_g_per_kwh")}


def integrations_status():
    """Backwards-compatible list plus provenance details for the UI."""
    out = []
    for row in pv.providers_status():
        out.append({
            "name": row["name"],
            "live": row["source"] == "live",
            "source": "live" if row["source"] == "live" else "synthetic",
            "detail": row.get("detail", ""),
            "updated_at": row.get("updated_at"),
            "configured": row.get("configured", False),
        })
    # keep the legacy LLM row keyed the same way older UI expects
    return out
