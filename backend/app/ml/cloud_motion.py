"""Cloud motion estimation via phase correlation (numpy only)."""
import numpy as np


def phase_correlation(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """Estimate (dx, dy) shift of b relative to a using phase correlation."""
    a = a - a.mean()
    b = b - b.mean()
    F1 = np.fft.fft2(a)
    F2 = np.fft.fft2(b)
    cross = F1 * np.conj(F2)
    cross /= (np.abs(cross) + 1e-8)
    corr = np.abs(np.fft.ifft2(cross))
    y, x = np.unravel_index(np.argmax(corr), corr.shape)
    h, w = a.shape
    dx = float(x if x < w / 2 else x - w)
    dy = float(y if y < h / 2 else y - h)
    # phase correlation gives shift to align b->a; invert sign so result = motion a->b
    return -dx, -dy


def estimate_motion(frame1: np.ndarray, frame2: np.ndarray) -> dict:
    dx, dy = phase_correlation(frame1, frame2)
    speed = float(np.hypot(dx, dy))
    angle = float(np.degrees(np.arctan2(dy, dx))) if speed > 1e-9 else 0.0
    return {"dx": dx, "dy": dy, "speed_px_per_step": speed, "angle_deg": angle}
