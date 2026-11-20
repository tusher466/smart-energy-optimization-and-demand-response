import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from app.core.security import COMPUTE, ANY_AUTH, verify_query_token, RANK
from app.schemas.models import GridRequest, CopilotRequest
from app.ml.gridsim import simulate_blackstart
from app.services.copilot import answer_question

router = APIRouter(prefix="/grid", tags=["grid"])

SCENARIOS = ["cloud-collapse", "wind-lull", "line-trip", "cyber-outage"]


@router.get("/scenarios")
def scenarios(_=Depends(ANY_AUTH)):
    return {"scenarios": SCENARIOS}


@router.post("/simulate")
def grid_simulate(req: GridRequest, _=Depends(COMPUTE)):
    return simulate_blackstart(req.scenario, req.seed)


@router.get("/stream")
async def grid_stream(scenario: str = "cloud-collapse", token: str | None = None):
    u = verify_query_token(token)
    if RANK.get(u.role, 0) < RANK["manager"]:
        raise HTTPException(403, "Requires role: manager, operator or admin.")
    async def gen():
        sim = simulate_blackstart(scenario)
        for s in sim["steps"]:
            yield f"data: {json.dumps(s)}\n\n"
            await asyncio.sleep(0.4)
        yield f"data: {json.dumps({'done': True})}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")


@router.post("/copilot")
def grid_copilot(req: CopilotRequest, _=Depends(COMPUTE)):
    sim = simulate_blackstart(req.scenario)
    ans = answer_question(req.question, sim)
    return ans
