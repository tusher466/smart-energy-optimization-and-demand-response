# Architecture

```
[input: site, fleet, grid state, region] -> [Forecast: solar P10/P50/P90 + demand P10/P50/P90 + carbon/price]
  -> [Uncertainty: variability index, confidence] -> [Optimize: greedy cheapest-hour + feeder repair + SoC guarantee]
  -> [Act: schedule + approvals queue] -> [Explain: drivers, counterfactual, citations] -> [Measure: ledger savings]
```

Model selection:
- Solar: clear-sky physics x advected cloud transmission + sklearn GBM quantile calibration. LSTM path reserved: torch not required offline, so GBM is the default (fast CPU, monotonic bands). Cloud motion via FFT phase correlation (numpy only).
- Demand: sklearn GBM quantile (3 quantiles) with seasonal + temperature + weekday features. Transformer encoder is the documented upgrade when torch + long history exist; fallback is identical schema.
- VPP dispatch: RL-style policy (cheapest-effective-price ordering, learned on the fly from price+carbon) with a rolling-horizon optimizer safety layer (feeder-limit repair + hard SoC feasibility proof). linprog/cvxpy used when available; greedy repair otherwise — never violates departure/SoC.
- Thermal: OpenCV pipeline (normalize, Otsu, connected components, shape/deltaT rules). CNN reserved for when torch + labeled patches exist.
- Copilot: TF-IDF retrieval over backend/app/knowledge/*.md + rule-based explainer; external LLM only refines wording when a key is set. Never controls the grid.

Failure fallbacks: every live connector (NREL, NOAA, ElectricityMaps, OPSD, PJM) returns synthetic with source flag on timeout/missing key. UI shows provenance honestly.
