"""Panel health inspector: synthetic thermal + OpenCV defect detection."""
import numpy as np
import cv2

DEFECT_INFO = {
    "hotspot": {"label": "Hotspot cell", "loss_per_defect_kw": 0.012},
    "diode": {"label": "Bypass diode failure", "loss_per_defect_kw": 0.06},
    "soiling": {"label": "Soiling band", "loss_per_defect_kw": 0.03},
    "string": {"label": "String-level fault", "loss_per_defect_kw": 0.12},
}


def generate_thermal_sample(sample_id: str = "roof-a", seed: int = 21, size: tuple = (320, 240)):
    rng = np.random.default_rng(seed + hash(sample_id) % 1000)
    w, h = size
    base = 38 + rng.normal(0, 1.2, (h, w))
    # panel grid lines (cooler)
    for y in range(0, h, 30):
        base[y:y + 2, :] -= 3.0
    for x in range(0, w, 40):
        base[:, x:x + 2] -= 3.0
    truth = []
    # hotspot cells (small round)
    for _ in range(3):
        cx, cy = int(rng.integers(20, w - 20)), int(rng.integers(20, h - 20))
        cv2.circle(base, (cx, cy), 7, 58.0, -1)
        truth.append(("hotspot", cx, cy))
    # diode: elongated hot strip
    cv2.rectangle(base, (30, 40), (110, 58), 62.0, -1)
    truth.append(("diode", 70, 49))
    # soiling band
    cv2.rectangle(base, (150, 150), (300, 175), 47.0, -1)
    truth.append(("soiling", 225, 162))
    base += rng.normal(0, 0.8, (h, w))
    return np.clip(base, 20, 80)


def inspect_temperature_map(temp_c: np.ndarray, capacity_kw: float = 50.0,
                             elec_price: float = 0.14, currency_symbol: str = "$"):
    tmin, tmax = float(temp_c.min()), float(temp_c.max())
    norm = ((temp_c - tmin) / max(1e-6, (tmax - tmin)) * 255).astype(np.uint8)
    blur = cv2.GaussianBlur(norm, (5, 5), 0)
    _, th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    # keep only hot tail
    hot = (norm > int(0.62 * 255)).astype(np.uint8) * 255
    n, labels, stats, cent = cv2.connectedComponentsWithStats(hot, connectivity=8)
    defects = []
    overlay = cv2.applyColorMap(norm, cv2.COLORMAP_INFERNO)
    median = float(np.median(temp_c))
    for i in range(1, n):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < 25 or area > 8000:
            continue
        w = int(stats[i, cv2.CC_STAT_WIDTH])
        hgt = int(stats[i, cv2.CC_STAT_HEIGHT])
        cx, cy = float(cent[i][0]), float(cent[i][1])
        xi = int(np.clip(int(cx), 0, temp_c.shape[1] - 1))
        yi = int(np.clip(int(cy), 0, temp_c.shape[0] - 1))
        tcell = float(temp_c[yi, xi])
        delta = round(tcell - median, 1)
        aspect = max(w, hgt) / max(1, min(w, hgt))
        if area > 1500:
            dtype = "string" if aspect > 3 else "soiling"
        elif aspect > 2.5 and area > 300:
            dtype = "diode"
        elif delta > 12:
            dtype = "hotspot"
        elif area > 400:
            dtype = "soiling"
        else:
            dtype = "hotspot"
        sev = "critical" if delta > 18 or dtype in ("string", "diode") else ("major" if delta > 10 else "minor")
        x, y = int(stats[i, cv2.CC_STAT_LEFT]), int(stats[i, cv2.CC_STAT_TOP])
        cv2.rectangle(overlay, (x, y), (x + w, y + hgt), (0, 255, 255), 2)
        cv2.putText(overlay, dtype[:3].upper(), (x, max(0, y - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        defects.append({
            "id": f"D{i}", "type": dtype, "label": DEFECT_INFO[dtype]["label"],
            "bbox": [x, y, w, hgt], "centroid": [round(cx, 1), round(cy, 1)],
            "area_px": area, "temp_c": round(tcell, 1), "delta_t": delta,
            "severity": sev,
        })
    # cap to top 8 by severity*delta
    rank = {"critical": 3, "major": 2, "minor": 1}
    defects = sorted(defects, key=lambda d: (rank[d["severity"]], d["delta_t"]), reverse=True)[:8]
    loss_kw = sum(DEFECT_INFO[d["type"]]["loss_per_defect_kw"] * capacity_kw / 10 for d in defects)
    loss_pct = min(35.0, len(defects) * 1.8 + sum(d["delta_t"] for d in defects) * 0.08)
    yearly_kwh = loss_kw * 1400
    yearly_money = yearly_kwh * elec_price
    # encode overlay as PNG bytes -> caller converts to base64
    ok, buf = cv2.imencode(".png", overlay)
    png = buf.tobytes() if ok else b""
    # also encode original thermal colormap thumb
    return {
        "defects": defects,
        "defect_count": len(defects),
        "efficiency_loss_pct": round(float(loss_pct), 1),
        "loss_kw": round(float(loss_kw), 2),
        "yearly_kwh_lost": round(float(yearly_kwh), 0),
        "yearly_money_lost": round(float(yearly_money), 2),
        "currency_symbol": currency_symbol,
        "median_temp_c": round(median, 1),
        "max_temp_c": round(tmax, 1),
        "overlay_png": png,
        "model_version": "thermal-v1.1-opencv",
        "explanation": f"{len(defects)} thermal anomalies detected (median {median:.1f}°C, max {tmax:.1f}°C). "
                       f"Estimated {loss_pct:.1f}% efficiency loss. Counterfactual: without repair, ~{yearly_kwh:.0f} kWh/yr continues to be lost.",
    }
