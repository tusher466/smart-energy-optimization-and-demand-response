import base64
import io
import numpy as np
import cv2
from fastapi import APIRouter, UploadFile, File, Depends
from app.core.security import COMPUTE, ANY_AUTH
from sqlalchemy.orm import Session
from app.ml.thermal import generate_thermal_sample, inspect_temperature_map
from app.core.regions import get_region, price_for_hour
from app.core.db import get_db
from app.services.ledger_models import DecisionLog

router = APIRouter(prefix="/panels", tags=["panels"])


def _price_for(region_id: str) -> tuple[float, str]:
    r = get_region(region_id)
    return price_for_hour(r, 12), r.currency_symbol


@router.get("/samples")
def samples(_=Depends(ANY_AUTH)):
    return {"samples": ["roof-a", "roof-b", "plant-c"]}


@router.post("/inspect")
async def inspect(sample_id: str = "roof-a", region_id: str = "bd-dhaka",
                  capacity_kw: float = 50.0, file: UploadFile | None = File(default=None),
                  db: Session = Depends(get_db), _=Depends(COMPUTE)):
    if file is not None:
        raw = await file.read()
        arr = np.frombuffer(raw, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            # fallback: try PIL
            from PIL import Image
            pil = Image.open(io.BytesIO(raw)).convert("L").resize((320, 240))
            img = np.array(pil)
        # map grayscale 0-255 to 25-65 C
        temp = 25 + img.astype(float) / 255 * 40
    else:
        seeds = {"roof-a": 21, "roof-b": 42, "plant-c": 63}
        temp = generate_thermal_sample(sample_id, seed=seeds.get(sample_id, 21))
    price, sym = _price_for(region_id)
    out = inspect_temperature_map(temp, capacity_kw, price, sym)
    png_b64 = base64.b64encode(out.pop("overlay_png")).decode()
    out["overlay_png_b64"] = png_b64
    db.add(DecisionLog(module="panels", region_id=region_id,
                       action=f"Inspect {sample_id}: {out['defect_count']} defects",
                       saved_money=0.0, currency=get_region(region_id).currency,
                       co2_avoided_kg=0.0, peak_shaved_kw=0.0, confidence=0.86,
                       explanation=out["explanation"]))
    db.commit()
    return out
