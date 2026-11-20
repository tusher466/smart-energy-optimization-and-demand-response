from pydantic import BaseModel, Field
from typing import List, Optional


class SolarRequest(BaseModel):
    lat: float = 23.8
    lon: float = 90.4
    capacity_kw: float = Field(default=100.0, gt=0, le=100000)
    tilt: float = 20.0
    horizon_h: int = Field(default=24, ge=1, le=48)
    seed: int = 7
    region_id: str = "bd-dhaka"


class DemandRequest(BaseModel):
    region_id: str = "bd-dhaka"
    horizon_h: int = Field(default=48, ge=1, le=96)
    base_kw: float = 180.0
    seed: int = 11


class VPPRequest(BaseModel):
    region_id: str = "bd-dhaka"
    n_ev: int = Field(default=8, ge=1, le=60)
    horizon_h: int = 24
    lambda_co2: float = Field(default=0.05, ge=0, le=2)
    mu_peak: float = Field(default=0.1, ge=0, le=2)
    seed: int = 3
    carbon_method: str = "marginal"


class GridRequest(BaseModel):
    scenario: str = "cloud-collapse"
    seed: int = 0


class CopilotRequest(BaseModel):
    question: str
    scenario: str = "cloud-collapse"
    step_id: Optional[int] = None


class LedgerLog(BaseModel):
    module: str
    region_id: str = ""
    action: str = ""
    saved_money: float = 0.0
    currency: str = ""
    co2_avoided_kg: float = 0.0
    peak_shaved_kw: float = 0.0
    confidence: float = 0.0
    explanation: str = ""


class ApprovalCreate(BaseModel):
    action: str
    module: str = ""
    detail: str = ""


class ScenarioCompare(BaseModel):
    region_id: str = "bd-dhaka"
    config_a: dict = {}
    config_b: dict = {}


class SimulateDay(BaseModel):
    region_id: str = "bd-dhaka"
    seed: int = 3
