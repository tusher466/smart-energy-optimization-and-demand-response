"""Synthetic data generators. Everything works offline; live connectors fall back here."""
import numpy as np


def seeded_rng(seed: int | None = None):
    return np.random.default_rng(seed if seed is not None else 42)


def clear_sky_power(hour: float, capacity_kw: float, lat: float = 23.8) -> float:
    """Simple clear-sky model: sine lobe between 6h and 18h, latitude derate."""
    if hour < 6 or hour > 18:
        return 0.0
    # solar noon at 12; elevation proxy
    elev = np.sin(np.pi * (hour - 6) / 12.0)
    lat_factor = float(np.cos(np.radians(abs(lat) - 23.5) * 0.9))
    lat_factor = max(0.55, lat_factor)
    tilt_bonus = 1.0
    return float(max(0.0, elev) * capacity_kw * lat_factor * tilt_bonus)


def make_cloud_field(size: int = 64, cover: float = 0.35, seed: int = 0) -> np.ndarray:
    rng = seeded_rng(seed)
    # smooth random field via filtered noise
    raw = rng.random((size, size))
    # box blur 3x3 twice
    from scipy.ndimage import uniform_filter
    try:
        smooth = uniform_filter(raw, size=5)
    except Exception:
        smooth = raw
    thresh = np.quantile(smooth, 1.0 - cover)
    cloud = np.clip((smooth - thresh) / max(1e-6, (smooth.max() - thresh)), 0, 1)
    return cloud.astype(float)


def advect(field: np.ndarray, dx: float, dy: float) -> np.ndarray:
    """Shift a cloud field by (dx, dy) pixels with wrap-around."""
    return np.roll(np.roll(field, int(round(dy)), axis=0), int(round(dx))) if False else _advect(field, dx, dy)


def _advect(field: np.ndarray, dx: float, dy: float) -> np.ndarray:
    # integer roll + fractional bilinear via scipy if available
    ix, iy = int(np.floor(dx)), int(np.floor(dy))
    fx, fy = dx - ix, dy - iy
    base = np.roll(np.roll(field, iy, axis=0), ix, axis=1)
    if fx == 0 and fy == 0:
        return base
    # bilinear with wrapped neighbour
    right = np.roll(base, 1, axis=1)
    down = np.roll(base, 1, axis=0)
    diag = np.roll(right, 1, axis=0)
    return (base * (1 - fx) * (1 - fy) + right * fx * (1 - fy) + down * (1 - fx) * fy + diag * fx * fy)


def synthetic_site_temperature(hours: np.ndarray, base: float = 30.0, seed: int = 0) -> np.ndarray:
    rng = seeded_rng(seed)
    daily = 4.5 * np.sin(2 * np.pi * (hours - 9) / 24.0)
    noise = rng.normal(0, 0.6, size=hours.shape)
    return base + daily + noise


def synthetic_load(hours: np.ndarray, base_kw: float = 180.0, region_peak: list | None = None,
                   temp: np.ndarray | None = None, seed: int = 0) -> np.ndarray:
    rng = seeded_rng(seed)
    region_peak = region_peak or [18, 19, 20]
    load = np.full(hours.shape, base_kw, dtype=float)
    hod = np.mod(hours, 24)
    dow = (np.floor(hours / 24) % 7)
    weekday = (dow < 5).astype(float)
    # commercial shape: morning ramp, midday plateau, evening peak
    shape = 0.55 + 0.30 * np.exp(-((hod - 10) ** 2) / 18) + 0.35 * np.exp(-((hod - 19) ** 2) / 8)
    shape += 0.08 * np.exp(-((hod - 14) ** 2) / 20)
    load = base_kw * shape * (0.55 + 0.45 * weekday)
    # weekend dip
    weekend = 1 - weekday
    load = load * (1 - 0.25 * weekend)
    if temp is not None:
        load = load + 2.2 * np.maximum(0, temp - 28.0)  # cooling sensitivity
    peak_boost = np.isin(hod.astype(int), region_peak).astype(float) * base_kw * 0.12
    load = load + peak_boost
    load = load + rng.normal(0, base_kw * 0.02, size=load.shape)
    # industrial production index slow drift
    ipi = 1.0 + 0.05 * np.sin(2 * np.pi * hours / (24 * 30))
    load = load * ipi
    return np.maximum(5.0, load)
