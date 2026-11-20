"""Black-start recovery sequence simulator (deterministic, rule-based)."""
import numpy as np

PROCEDURE_DOCS = {
    "islanding": "knowledge/islanding.md",
    "cranking": "knowledge/cranking.md",
    "load-pickup": "knowledge/load-pickup.md",
}


def simulate_blackstart(scenario: str = "cloud-collapse", seed: int = 0):
    rng = np.random.default_rng(seed + len(scenario))
    base_nodes = ["G1-hydro", "G2-solar+storage", "S1-substation", "S2-substation", "F1-feeder", "F2-feeder", "H-hospital"]
    # scenario modifies initial fault
    faults = {
        "cloud-collapse": " utility solar fleet drops 82% in 12 min; evening ramp uncovered.",
        "wind-lull": "Wind output <8% for 6h combined with line overload.",
        "line-trip": "230kV line trip islands Dhaka-North; frequency dips to 48.6 Hz.",
        "cyber-outage": "SCADA comms lost for 2 substations; fallback to local control.",
    }
    desc = faults.get(scenario, faults["cloud-collapse"])
    steps = [
        {"id": 1, "name": "Stabilize islands", "action": "Open tie breakers; form 2 islands around G1 and G2.", "doc": "islanding", "load_mw": 0, "freq_hz": 49.2, "volt_pu": 0.97},
        {"id": 2, "name": "Cranking power", "action": "Start G1 hydro (black-start capable); energize S1 bus.", "doc": "cranking", "load_mw": 4, "freq_hz": 49.6, "volt_pu": 0.98},
        {"id": 3, "name": "Energize corridor", "action": "Energize line S1–S2 at reduced voltage; check synchronism.", "doc": "cranking", "load_mw": 9, "freq_hz": 49.8, "volt_pu": 0.99},
        {"id": 4, "name": "Priority load pickup", "action": "Pick up H-hospital (2 MW) + F1 block 1 (6 MW) in 2 MW steps.", "doc": "load-pickup", "load_mw": 17, "freq_hz": 50.0, "volt_pu": 1.0},
        {"id": 5, "name": "Synchronize islands", "action": "Sync G2 solar+storage island to main at zero phase difference.", "doc": "load-pickup", "load_mw": 26, "freq_hz": 50.0, "volt_pu": 1.0},
        {"id": 6, "name": "Full restoration", "action": "Pick up F2 in 3 MW blocks; restore normal reserves.", "doc": "load-pickup", "load_mw": 38, "freq_hz": 50.0, "volt_pu": 1.0},
    ]
    # add small noise to freq for realism, keep within stability band
    for s in steps:
        s["freq_hz"] = round(float(s["freq_hz"] + rng.normal(0, 0.03)), 2)
        s["volt_pu"] = round(float(s["volt_pu"] + rng.normal(0, 0.004)), 3)
        s["stable"] = bool(48.8 <= s["freq_hz"] <= 51.0 and 0.94 <= s["volt_pu"] <= 1.06)
        s["eta_min"] = int(5 + s["id"] * 4)
    # network graph nodes with energized step
    nodes = []
    energize_at = {"G1-hydro": 2, "S1-substation": 2, "S2-substation": 3, "G2-solar+storage": 3,
                   "F1-feeder": 4, "H-hospital": 4, "F2-feeder": 6}
    for i, name in enumerate(base_nodes):
        nodes.append({"id": name, "x": 60 + i * 110, "y": 120 + (i % 2) * 80,
                      "energized_at_step": energize_at.get(name, 6)})
    edges = [["G1-hydro", "S1-substation"], ["S1-substation", "S2-substation"],
             ["S2-substation", "F1-feeder"], ["S2-substation", "F2-feeder"],
             ["F1-feeder", "H-hospital"], ["G2-solar+storage", "S2-substation"]]
    return {
        "scenario": scenario,
        "description": desc,
        "steps": steps,
        "nodes": nodes,
        "edges": edges,
        "total_load_mw": steps[-1]["load_mw"],
        "restoration_time_min": sum(s["eta_min"] for s in steps),
        "model_version": "blackstart-v1.0-deterministic",
        "disclaimer": "Simulation only. LLM never controls the grid — operator approval required at each step.",
    }
