import asyncio
import json
from fastapi import APIRouter, Depends
from app.core.security import OPERATE
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.schemas.models import VPPRequest, ApprovalCreate
from app.ml.vpp import dispatch_fleet
from app.core.regions import get_region
from app.core.db import get_db
from app.services.ledger_models import DecisionLog, Approval

router = APIRouter(prefix="/vpp", tags=["vpp"])


def _run(req: VPPRequest):
    region = get_region(req.region_id)
    return dispatch_fleet(region, req.horizon_h, req.n_ev, req.seed, req.lambda_co2, req.mu_peak)


@router.post("/dispatch")
def vpp_dispatch(req: VPPRequest, db: Session = Depends(get_db), _=Depends(OPERATE)):
    out = _run(req)
    region = get_region(req.region_id)
    db.add(DecisionLog(module="vpp", region_id=req.region_id, action=f"Dispatch {req.n_ev} EVs smart",
                       saved_money=out["saved_cost"], currency=region.currency,
                       co2_avoided_kg=out["co2_avoided_kg"], peak_shaved_kw=out["peak_shaved_kw"],
                       confidence=out["confidence"], explanation=out["explanation"]))
    db.add(Approval(action=f"Approve VPP dispatch ({req.n_ev} EVs, saves {region.currency_symbol}{out['saved_cost']})",
                    module="vpp", detail=out["explanation"], status="pending"))
    db.commit()
    return out


@router.get("/stream")
async def vpp_stream(region_id: str = "bd-dhaka", n_ev: int = 8, seed: int = 3, token: str | None = None):
    from app.core.security import verify_query_token, RANK
    u = verify_query_token(token)
    if RANK.get(u.role, 0) < RANK["operator"]:
        from fastapi import HTTPException
        raise HTTPException(403, "Requires role: operator or admin.")
    async def gen():
        req = VPPRequest(region_id=region_id, n_ev=n_ev, seed=seed)
        out = _run(req)
        agg = out["smart"]["agg_kw"]
        for i, v in enumerate(agg):
            yield f"data: {json.dumps({'hour': i, 'agg_kw': v})}\n\n"
            await asyncio.sleep(0.05)
        yield f"data: {json.dumps({'done': True, 'saved_cost': out['saved_cost']})}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")
