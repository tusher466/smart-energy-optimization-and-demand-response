from fastapi import APIRouter, Depends
from app.core.security import COMPUTE
from app.schemas.models import DemandRequest
from app.ml.demand import forecast_demand
from app.core.regions import get_region

router = APIRouter(prefix="/demand", tags=["demand"])


@router.post("/forecast")
def demand_forecast(req: DemandRequest, _=Depends(COMPUTE)):
    region = get_region(req.region_id)
    return forecast_demand(req.region_id, req.horizon_h, req.base_kw, region.peak_hours)
