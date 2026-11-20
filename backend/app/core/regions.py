"""Region profiles: tariffs, carbon factors, currency. Cross-border from day one."""
from dataclasses import dataclass
from typing import Dict, List


@dataclass(frozen=True)
class TariffBlock:
    name: str
    start_hour: int
    end_hour: int
    price_per_kwh: float  # in local currency


@dataclass(frozen=True)
class RegionProfile:
    id: str
    name: str
    country: str
    currency: str
    currency_symbol: str
    grid_carbon_g_per_kwh_avg: float
    grid_carbon_g_per_kwh_marginal: float
    feeder_limit_kw: float
    peak_hours: List[int]
    tariffs: List[TariffBlock]
    notes: str


REGIONS: Dict[str, RegionProfile] = {
    "bd-dhaka": RegionProfile(
        id="bd-dhaka",
        name="Dhaka, Bangladesh",
        country="Bangladesh",
        currency="BDT",
        currency_symbol="৳",
        grid_carbon_g_per_kwh_avg=670.0,
        grid_carbon_g_per_kwh_marginal=740.0,
        feeder_limit_kw=420.0,
        peak_hours=[18, 19, 20, 21, 22],
        tariffs=[
            TariffBlock("Off-peak", 0, 6, 7.5),
            TariffBlock("Day", 6, 18, 10.2),
            TariffBlock("Evening peak", 18, 23, 14.8),
            TariffBlock("Night", 23, 24, 7.5),
        ],
        notes="Evening peak 18-23h, gas-dominated grid with high carbon factor.",
    ),
    "de-berlin": RegionProfile(
        id="de-berlin",
        name="Berlin, Germany (EU)",
        country="Germany",
        currency="EUR",
        currency_symbol="€",
        grid_carbon_g_per_kwh_avg=381.0,
        grid_carbon_g_per_kwh_marginal=480.0,
        feeder_limit_kw=520.0,
        peak_hours=[8, 9, 17, 18, 19],
        tariffs=[
            TariffBlock("Night", 0, 6, 0.22),
            TariffBlock("Day-ahead avg", 6, 17, 0.34),
            TariffBlock("Evening", 17, 21, 0.41),
            TariffBlock("Night", 21, 24, 0.26),
        ],
        notes="Day-ahead price shape, OPSD-style load, lower carbon, high renewables share midday.",
    ),
    "us-pjm": RegionProfile(
        id="us-pjm",
        name="PJM (US East)",
        country="United States",
        currency="USD",
        currency_symbol="$",
        grid_carbon_g_per_kwh_avg=452.0,
        grid_carbon_g_per_kwh_marginal=580.0,
        feeder_limit_kw=600.0,
        peak_hours=[14, 15, 16, 17, 18],
        tariffs=[
            TariffBlock("Off-peak", 0, 7, 0.09),
            TariffBlock("Shoulder", 7, 14, 0.14),
            TariffBlock("Peak LMP", 14, 19, 0.21),
            TariffBlock("Evening", 19, 24, 0.12),
        ],
        notes="LMP-style peak afternoon, PJM load shape.",
    ),
}


def get_region(region_id: str) -> RegionProfile:
    return REGIONS.get(region_id, REGIONS["bd-dhaka"])


def price_for_hour(region: RegionProfile, hour: int) -> float:
    h = hour % 24
    for t in region.tariffs:
        if t.start_hour <= h < t.end_hour:
            return t.price_per_kwh
    return region.tariffs[0].price_per_kwh
