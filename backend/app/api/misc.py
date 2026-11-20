import csv
import io
from fastapi import APIRouter, Depends
from app.core.security import ANY_AUTH, COMPUTE, OPERATE, ADMIN_ONLY
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.db import get_db
from app.services.ledger_models import DecisionLog, Approval
from app.schemas.models import LedgerLog, ApprovalCreate
from app.ml.solar import forecast_solar
from app.ml.demand import forecast_demand
from app.ml.vpp import dispatch_fleet
from app.core.regions import get_region

router = APIRouter(tags=["ledger"])


@router.get("/regions")
def list_regions(_=Depends(ANY_AUTH)):
    from app.core.regions import REGIONS
    return {"regions": [
        {"id": r.id, "name": r.name, "country": r.country, "currency": r.currency,
         "currency_symbol": r.currency_symbol,
         "carbon_avg": r.grid_carbon_g_per_kwh_avg, "carbon_marginal": r.grid_carbon_g_per_kwh_marginal,
         "feeder_limit_kw": r.feeder_limit_kw, "peak_hours": r.peak_hours,
         "tariffs": [t.__dict__ for t in r.tariffs], "notes": r.notes}
        for r in REGIONS.values()]}


@router.get("/regions/{region_id}")
def get_region_one(region_id: str, _=Depends(ANY_AUTH)):
    r = get_region(region_id)
    return {"id": r.id, "name": r.name, "currency": r.currency, "currency_symbol": r.currency_symbol,
            "carbon_avg": r.grid_carbon_g_per_kwh_avg, "carbon_marginal": r.grid_carbon_g_per_kwh_marginal,
            "feeder_limit_kw": r.feeder_limit_kw, "peak_hours": r.peak_hours,
            "tariffs": [t.__dict__ for t in r.tariffs]}


@router.get("/regions/{region_id}/live")
def region_live(region_id: str, _=Depends(ANY_AUTH)):
    """Live context bundle for a region; every field carries its own provenance."""
    from app.data import providers as pv
    r = get_region(region_id)
    try:
        b = pv.region_live_bundle(region_id)
    except Exception as e:
        return {"region_id": region_id, "source": "synthetic", "note": f"Bundle failed ({e})."}
    carbon, met = b["carbon"], b["met"]
    carbon_val = carbon.get("carbon_g_per_kwh")
    if carbon_val is None:  # fall back to static profile factors
        carbon_val = r.grid_carbon_g_per_kwh_marginal
        carbon_src = "synthetic (static profile factor)"
    else:
        carbon_src = carbon.get("source", "synthetic")
    met_now = {}
    if met.get("source", "").startswith("live"):
        met_now = {"temp_c": (met.get("temp_c") or [None])[0],
                   "cloud_cover_pct": (met.get("cloud_cover_pct") or [None])[0],
                   "source": met["source"]}
    else:
        met_now = {"source": "synthetic", "note": met.get("note", "")}
    return {
        "region_id": region_id,
        "carbon_g_per_kwh": carbon_val,
        "carbon_source": carbon_src,
        "carbon_note": carbon.get("note", ""),
        "met_now": met_now,
        "load": {"source": b["load"].get("source"), "note": b["load"].get("note"),
                 "points": len(b["load"].get("load_mw", []) or [])},
        "irradiance": {"source": b["irradiance"].get("source"), "note": b["irradiance"].get("note")},
        "fetched_at": b.get("fetched_at"),
    }


@router.post("/integrations/refresh")
def integrations_refresh(_=Depends(OPERATE)):
    """Actively probe the free (keyless) providers now; key-gated ones report config state."""
    from app.data import providers as pv
    results = {}
    if pv.is_offline():
        return {"ok": False, "note": "ENERGY_BRAIN_OFFLINE=1; probing skipped.", "results": {}}
    probes = {
        "openmeteo:dhaka": lambda: pv.open_meteo(23.81, 90.41),
        "openmeteo:berlin": lambda: pv.open_meteo(52.52, 13.41),
        "openmeteo:pjm": lambda: pv.open_meteo(39.0, -77.5),
        "nasapower:dhaka": lambda: pv.nasa_power(23.81, 90.41),
        "ciuk": pv.carbon_intensity_uk,
        "opsd": pv.opsd_german_load,
        "nrel": lambda: pv.nrel_psm(23.81, 90.41),
        "emaps:BD": lambda: pv.electricitymaps_carbon("BD"),
        "pjm": pv.pjm_load_forecast,
        "eia": pv.eia_texas_wind_hourly,
    }
    for name, fn in probes.items():
        try:
            r = fn()
            results[name] = {"source": r.get("source"), "note": r.get("note", "")[:160]}
        except Exception as e:
            results[name] = {"source": "synthetic", "note": f"Probe error: {e}"}
    from app.data.connectors import integrations_status as st
    return {"ok": True, "results": results, "status": st()}


@router.post("/integrations/opsd-refresh")
def integrations_opsd_refresh(_=Depends(OPERATE)):
    """One-time cached download of the OPSD time_series package (large, ~100MB+)."""
    from app.data import providers as pv
    return pv.opsd_refresh()


@router.post("/ledger/log")
def ledger_log(entry: LedgerLog, db: Session = Depends(get_db), _=Depends(OPERATE)):
    row = DecisionLog(**entry.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.get("/ledger/summary")
def ledger_summary(db: Session = Depends(get_db), _=Depends(ANY_AUTH)):
    rows = db.query(DecisionLog).all()
    return {
        "total_saved": round(sum(r.saved_money or 0 for r in rows), 2),
        "total_co2_kg": round(sum(r.co2_avoided_kg or 0 for r in rows), 2),
        "total_peak_kw": round(sum(r.peak_shaved_kw or 0 for r in rows), 1),
        "decisions": len(rows),
        "methodology": "CO2 = shifted kWh x marginal emission factor (selectable avg/marginal). Money = kWh x time-of-use tariff. Peak = baseline peak minus smart peak.",
    }


@router.get("/ledger/entries")
def ledger_entries(limit: int = 50, db: Session = Depends(get_db), _=Depends(ANY_AUTH)):
    rows = db.query(DecisionLog).order_by(DecisionLog.id.desc()).limit(limit).all()
    return {"entries": [
        {"id": r.id, "module": r.module, "region_id": r.region_id, "action": r.action,
         "saved_money": r.saved_money, "currency": r.currency, "co2_avoided_kg": r.co2_avoided_kg,
         "peak_shaved_kw": r.peak_shaved_kw, "confidence": r.confidence,
         "created_at": str(r.created_at)} for r in rows]}


@router.get("/ledger/export.csv")
def ledger_export(db: Session = Depends(get_db), _=Depends(ANY_AUTH)):
    rows = db.query(DecisionLog).order_by(DecisionLog.id).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "module", "region", "action", "saved_money", "currency", "co2_kg", "peak_kw", "confidence", "created_at"])
    for r in rows:
        w.writerow([r.id, r.module, r.region_id, r.action, r.saved_money, r.currency,
                    r.co2_avoided_kg, r.peak_shaved_kw, r.confidence, r.created_at])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=ledger.csv"})


@router.post("/ledger/seed")
def ledger_seed(db: Session = Depends(get_db), _=Depends(ADMIN_ONLY)):
    demo = [
        ("vpp", "bd-dhaka", "Dispatch 8 EVs smart", 118.5, "BDT", 64.2, 96.5, 0.91),
        ("solar", "bd-dhaka", "Solar forecast day-ahead", 42.0, "BDT", 38.0, 0.0, 0.89),
        ("demand", "de-berlin", "Demand forecast weekly", 63.4, "EUR", 51.3, 12.0, 0.88),
    ]
    for m, reg, act, money, cur, co2, peak, conf in demo:
        db.add(DecisionLog(module=m, region_id=reg, action=act, saved_money=money,
                           currency=cur, co2_avoided_kg=co2, peak_shaved_kw=peak,
                           confidence=conf, explanation="Seeded demo entry."))
    db.commit()
    return {"seeded": len(demo)}


@router.post("/ledger/reset")
def ledger_reset(db: Session = Depends(get_db), _=Depends(ADMIN_ONLY)):
    db.query(DecisionLog).delete()
    db.query(Approval).delete()
    db.commit()
    return {"ok": True}


@router.get("/approvals")
def approvals_list(status: str = "pending", db: Session = Depends(get_db), _=Depends(ANY_AUTH)):
    q = db.query(Approval)
    if status != "all":
        q = q.filter(Approval.status == status)
    rows = q.order_by(Approval.id.desc()).limit(50).all()
    return {"approvals": [{"id": r.id, "action": r.action, "module": r.module,
                           "detail": r.detail, "status": r.status} for r in rows]}


@router.post("/approvals")
def approvals_create(a: ApprovalCreate, db: Session = Depends(get_db), _=Depends(OPERATE)):
    row = Approval(action=a.action, module=a.module, detail=a.detail, status="pending")
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.post("/approvals/{aid}/decide")
def approvals_decide(aid: int, approve: bool = True, db: Session = Depends(get_db), _=Depends(OPERATE)):
    row = db.query(Approval).filter(Approval.id == aid).first()
    if not row:
        return {"error": "not found"}
    row.status = "approved" if approve else "rejected"
    db.commit()
    return {"id": aid, "status": row.status}


@router.get("/integrations/status")
def integrations_status(_=Depends(ANY_AUTH)):
    from app.data.connectors import integrations_status as st
    return {"integrations": st()}


@router.get("/models/status")
def models_status(_=Depends(ANY_AUTH)):
    from app.ml.solar import MODEL_VERSION as sv
    from app.ml.demand import MODEL_VERSION as dv
    from app.ml.vpp import MODEL_VERSION as vv
    return {"models": [
        {"name": "solar", "version": sv, "status": "ready"},
        {"name": "demand", "version": dv, "status": "ready"},
        {"name": "vpp", "version": vv, "status": "ready"},
        {"name": "thermal", "version": "thermal-v1.1-opencv", "status": "ready"},
        {"name": "blackstart", "version": "blackstart-v1.0-deterministic", "status": "ready"},
    ]}


@router.get("/health")
def health():
    return {"status": "ok", "app": "Smart energy optimization and demand response"}


@router.post("/simulate/day")
def simulate_day(payload: dict, db: Session = Depends(get_db), _=Depends(COMPUTE)):
    region_id = payload.get("region_id", "bd-dhaka")
    seed = int(payload.get("seed", 3))
    region = get_region(region_id)
    sol = forecast_solar(23.8, 90.4, 100.0, 24, seed)
    dem = forecast_demand(region_id, 24, 180.0, region.peak_hours, seed)
    vpp = dispatch_fleet(region, 24, 8, seed)
    timeline = []
    for i in range(24):
        timeline.append({
            "hour": i,
            "solar_kw": sol["series"][i]["p50_kw"],
            "demand_kw": dem["series"][i]["p50_kw"],
            "ev_smart_kw": vpp["smart"]["ev_kw"][i],
            "ev_base_kw": vpp["baseline"]["ev_kw"][i],
        })
    db.add(DecisionLog(module="simulate-day", region_id=region_id,
                       action="Simulate a day (24h in one call)",
                       saved_money=vpp["saved_cost"], currency=region.currency,
                       co2_avoided_kg=vpp["co2_avoided_kg"], peak_shaved_kw=vpp["peak_shaved_kw"],
                       confidence=0.9, explanation=vpp["explanation"]))
    db.commit()
    solar_kwh = round(sum(s["p50_kw"] for s in sol["series"]), 1)
    return {
        "timeline": timeline,
        "kpis": {"saved_cost": vpp["saved_cost"], "currency_symbol": region.currency_symbol,
                 "currency": region.currency, "co2_kg": vpp["co2_avoided_kg"],
                 "peak_shaved_kw": vpp["peak_shaved_kw"], "solar_kwh": solar_kwh,
                 "forecast_confidence": sol["confidence"]},
        "explanation": vpp["explanation"],
        "counterfactual": vpp["counterfactual"],
    }


@router.post("/scenarios/compare")
def scenarios_compare(payload: dict, _=Depends(COMPUTE)):
    # payload: {region_id, config_a: {n_ev, lambda_co2}, config_b: {...}}
    region_id = payload.get("region_id", "bd-dhaka")
    ca = payload.get("config_a", {})
    cb = payload.get("config_b", {})
    region = get_region(region_id)
    ra = dispatch_fleet(region, 24, int(ca.get("n_ev", 8)), 3, float(ca.get("lambda_co2", 0.05)), float(ca.get("mu_peak", 0.1)))
    rb = dispatch_fleet(region, 24, int(cb.get("n_ev", 12)), 3, float(cb.get("lambda_co2", 0.2)), float(cb.get("mu_peak", 0.3)))
    return {
        "a": {"saved_cost": ra["saved_cost"], "co2": ra["co2_avoided_kg"], "peak": ra["peak_shaved_kw"]},
        "b": {"saved_cost": rb["saved_cost"], "co2": rb["co2_avoided_kg"], "peak": rb["peak_shaved_kw"]},
        "delta": {"saved_cost": round(rb["saved_cost"] - ra["saved_cost"], 2),
                  "co2": round(rb["co2_avoided_kg"] - ra["co2_avoided_kg"], 2),
                  "peak": round(rb["peak_shaved_kw"] - ra["peak_shaved_kw"], 1)},
    }
