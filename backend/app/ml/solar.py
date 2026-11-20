"""Solar forecast: physics clear-sky x cloud transmission + quantile bands.
Uses sklearn quantile GBM when available, else physics + calibrated spread."""
import numpy as np
from app.data.synthetic import clear_sky_power, make_cloud_field, advect, synthetic_site_temperature
from app.ml.cloud_motion import estimate_motion

MODEL_VERSION = "solar-v1.3-sklearn-fallback"


def _try_sklearn_quantiles(X: np.ndarray, y: np.ndarray):
    try:
        from sklearn.ensemble import GradientBoostingRegressor
        models = {}
        for alpha, tag in [(0.1, "p10"), (0.5, "p50"), (0.9, "p90")]:
            m = GradientBoostingRegressor(loss="quantile", alpha=alpha, n_estimators=60,
                                          max_depth=2, random_state=0)
            m.fit(X, y)
            models[tag] = m
        return models
    except Exception:
        return None


def forecast_solar(lat: float, lon: float, capacity_kw: float, horizon_h: int = 24,
                   seed: int = 7, tilt: float = 20.0):
    rng = np.random.default_rng(seed)
    hours = np.arange(horizon_h, dtype=float)
    clock = (9 + hours) % 24  # start at 09:00 local for demo
    # cloud fields advected by wind vector
    size = 48
    cover = 0.30 + 0.1 * np.sin(seed)
    f0 = make_cloud_field(size=size, cover=float(np.clip(cover, 0.15, 0.5)), seed=seed)
    wind = (2.0 + rng.random() * 1.5, 0.8 + rng.random())  # px per hour
    frames = [f0]
    for _ in range(1, 4):
        frames.append(advect(frames[-1], wind[0] / 2, wind[1] / 2))
    motion = estimate_motion(frames[0], frames[1])
    # transmission over site: sample center pixel evolving with advection + noise
    trans = []
    field = f0.copy()
    for h in range(horizon_h):
        field = advect(field, wind[0], wind[1])
        cx, cy = size // 2, size // 2
        c = float(field[cy, cx])
        gust = float(rng.normal(0, 0.04))
        t = float(np.clip(1.0 - 0.85 * c + gust, 0.08, 1.0))
        trans.append(t)
    trans = np.array(trans)
    temp = synthetic_site_temperature(hours, seed=seed)
    data_sources = {"cloud": "synthetic (advected cloud field)",
                    "temperature": "synthetic (diurnal model)",
                    "irradiance": "synthetic (clear-sky physics)"}
    # --- Live data blend (graceful: any failure keeps synthetic) ---
    try:
        from app.data import providers as _pv
        if not _pv.is_offline():
            met = _pv.open_meteo(lat, lon)
            if met.get("source", "").startswith("live") and len(met.get("cloud_cover_pct", [])) >= horizon_h:
                import numpy as _np
                cc = _np.array(met["cloud_cover_pct"][:horizon_h], dtype=float) / 100.0
                live_trans = _np.clip(1.0 - 0.85 * cc, 0.08, 1.0)
                trans = 0.5 * trans + 0.5 * live_trans  # blend model clouds with GFS-based clouds
                data_sources["cloud"] = f"{met['source']} (Open-Meteo GFS/ICON blend)"
                if len(met.get("temp_c", [])) >= horizon_h:
                    temp = _np.array(met["temp_c"][:horizon_h], dtype=float)
                    data_sources["temperature"] = met["source"]
    except Exception:
        pass
    clear = np.array([clear_sky_power(float(cl), capacity_kw, lat) for cl in clock])
    # temperature derate
    clear = clear * (1 - 0.0035 * np.maximum(0, temp - 25))
    p50_raw = clear * trans
    # train quantile model on synthetic history (physics features) to get calibrated bands
    hist_h = 24 * 14
    hx = np.arange(hist_h)
    hclock = (9 + hx) % 24
    hclear = np.array([clear_sky_power(float(c), capacity_kw, lat) for c in hclock])
    htrans = np.clip(0.9 - 0.5 * np.random.default_rng(seed + 1).random(hist_h), 0.1, 1.0)
    hy = hclear * htrans
    X_hist = np.column_stack([hclock, hclear, np.sin(2 * np.pi * hclock / 24), np.cos(2 * np.pi * hclock / 24)])
    X_now = np.column_stack([clock, clear, np.sin(2 * np.pi * clock / 24), np.cos(2 * np.pi * clock / 24)])
    models = _try_sklearn_quantiles(X_hist, hy)
    if models is not None:
        p10 = np.maximum(0, models["p10"].predict(X_now) * (0.55 + 0.45 * trans))
        p50 = np.maximum(0, models["p50"].predict(X_now) * (0.6 + 0.4 * trans))
        p90 = np.maximum(0, models["p90"].predict(X_now) * (0.65 + 0.35 * trans) + 0.02 * capacity_kw * (clear > 1))
        # blend with physics to keep day/night correct
        night = clear < 0.5
        p10[night] = 0.0
        p50[night] = 0.0
        p90[night] = 0.0
        p50 = 0.5 * p50 + 0.5 * p50_raw
    else:
        spread = 0.18 + 0.25 * (1 - trans)
        p50 = np.maximum(0, p50_raw)
        p10 = np.maximum(0, p50 * (1 - spread))
        p90 = p50 * (1 + spread * 0.9) + 0.5
    # enforce monotonicity P10<=P50<=P90
    p10 = np.minimum(p10, p50)
    p90 = np.maximum(p90, p50)
    # variability index: ramp-rate risk from transmission volatility
    vari = []
    for i in range(horizon_h):
        lo = max(0, i - 1)
        hi = min(horizon_h, i + 2)
        v = float(np.std(trans[lo:hi]) * 2.0 + np.std((p90 - p10)[lo:hi]) / max(1.0, capacity_kw) * 4)
        vari.append(float(np.clip(v, 0, 1)))
    # confidence: high when clear & stable
    conf = float(np.clip(0.95 - np.mean(vari) * 0.6 - float(np.mean(1 - trans)) * 0.3, 0.5, 0.97))
    series = []
    for i in range(horizon_h):
        series.append({
            "hour": int(i), "clock_hour": int(clock[i]),
            "p10_kw": round(float(p10[i]), 2), "p50_kw": round(float(p50[i]), 2),
            "p90_kw": round(float(p90[i]), 2),
            "transmission": round(float(trans[i]), 3),
            "variability": round(float(vari[i]), 3),
            "temperature_c": round(float(temp[i]), 1),
        })
    return {
        "series": series,
        "motion_vector": {k: round(float(v), 2) for k, v in motion.items()},
        "wind_assumed_px_per_h": [round(float(wind[0]), 2), round(float(wind[1]), 2)],
        "frames": [f.astype(float).round(3).tolist() for f in frames[:3]],
        "confidence": round(conf, 3),
        "model_version": MODEL_VERSION,
        "source": "live-mix" if any(str(v).startswith("live") for v in data_sources.values()) else "synthetic",
        "data_sources": data_sources,
    }
