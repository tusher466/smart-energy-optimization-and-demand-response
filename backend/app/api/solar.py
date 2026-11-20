from fastapi import APIRouter, Depends
from app.core.security import COMPUTE, ANY_AUTH
from app.schemas.models import SolarRequest
from app.ml.solar import forecast_solar

router = APIRouter(prefix="/solar", tags=["solar"])


@router.post("/forecast")
def solar_forecast(req: SolarRequest, _=Depends(COMPUTE)):
    return forecast_solar(req.lat, req.lon, req.capacity_kw, req.horizon_h, req.seed, req.tilt)


@router.get("/status")
def solar_status(_=Depends(ANY_AUTH)):
    from app.ml.solar import MODEL_VERSION
    return {"model_version": MODEL_VERSION, "source": "synthetic", "torch": False}
