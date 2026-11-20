import numpy as np
from app.data.synthetic import make_cloud_field, advect
from app.ml.cloud_motion import estimate_motion


def test_cloud_motion_tolerance():
    f0 = make_cloud_field(size=48, cover=0.3, seed=5)
    f1 = advect(f0, 3.0, 1.0)
    m = estimate_motion(f0, f1)
    assert abs(m["dx"] - 3.0) < 1.5
    assert abs(m["dy"] - 1.0) < 1.5
