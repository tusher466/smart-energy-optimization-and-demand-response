# Impact

KPIs: cost saved %, CO2 avoided t/yr (marginal factor selectable), peak reduction %, forecast MAPE, SoC-guarantee rate 100%.

Responsible AI: every output ships with drivers, counterfactual, confidence band, data source and model version. Assistant is proposal-only with human-in-the-loop approvals.

Bias mitigation: fairness panel reports SoC delivery for early vs normal departures; optimizer prioritizes per-vehicle feasible hours so early leavers are not starved.

Privacy: no personal data; fleet IDs anonymized; SQLite local by default; no telemetry.

Methodology: money = kWh x time-of-use tariff; CO2 = shifted kWh x marginal (or average) factor; peak = baseline minus smart peak at feeder.
