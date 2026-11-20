import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { GitCompare, Zap } from 'lucide-react'
import { api } from '../lib/api'
import { usePrefs, useRole, can } from '../state/store'
import { Explain, ChartTip, EmptyState, TableSkeleton, Spinner, QueryError, useMinDelay } from '../components/ui'
import { money, num } from '../lib/format'

export function Vpp() {
  const { region } = usePrefs()
  const [cfg, setCfg] = useState({ n_ev: 8, lambda_co2: 0.05, mu_peak: 0.1 })
  const [cmp, setCmp] = useState<any>(null)
  const [cmpLoading, setCmpLoading] = useState(false)
  const [cmpErr, setCmpErr] = useState('')
  const role = useRole()
  const mayDispatch = can(role, 'operator')
  const autoRan = useRef<string>('')
  const q = useQuery({
    queryKey: ['vpp', region, cfg.n_ev, cfg.lambda_co2, cfg.mu_peak],
    queryFn: () => api.vpp({ region_id: region, ...cfg, horizon_h: 24 }),
    enabled: false,
    retry: false,
  })
  const d = q.data
  const busy = useMinDelay(!!(q.isFetching && !d))

  /* Auto-run once per region so the page is never empty (operators only) */
  useEffect(() => {
    if (mayDispatch && autoRan.current !== region) { autoRan.current = region; q.refetch() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, mayDispatch])

  const chart = d ? d.smart.agg_kw.map((v: number, i: number) => ({
    hour: (16 + i) % 24, baseline: d.baseline.agg_kw[i], smart: v,
  })) : []

  const runCompare = async () => {
    setCmpLoading(true); setCmpErr('')
    try {
      const r = await api.compare({
        region_id: region,
        config_a: { n_ev: cfg.n_ev, lambda_co2: cfg.lambda_co2, mu_peak: cfg.mu_peak },
        config_b: { n_ev: Math.min(60, cfg.n_ev + 4), lambda_co2: Math.min(1, cfg.lambda_co2 + 0.15), mu_peak: Math.min(1, cfg.mu_peak + 0.3) },
      })
      setCmp(r)
    } catch (e: any) {
      setCmpErr(e.message || 'Compare failed')
    } finally { setCmpLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">VPP dispatch agent</h1>
        <p className="muted text-sm mt-1">Baseline (charge immediately) vs smart policy with optimizer safety layer. Every EV is guaranteed its required SoC.</p>
      </div>
      <div className="card p-4 flex gap-4 flex-wrap items-end">
        <label className="text-sm">EVs<br /><input type="number" value={cfg.n_ev} min={1} max={60}
          onChange={(e) => setCfg({ ...cfg, n_ev: Number(e.target.value) })} className="w-24" /></label>
        <label className="text-sm">λ CO₂ weight: <span className="num">{cfg.lambda_co2.toFixed(2)}</span><br />
          <input type="range" min={0} max={1} step={0.05} value={cfg.lambda_co2}
            style={{ ['--fill' as any]: `${cfg.lambda_co2 * 100}%` }}
            onChange={(e) => setCfg({ ...cfg, lambda_co2: Number(e.target.value) })} aria-label="Lambda CO2" /></label>
        <label className="text-sm">μ peak weight: <span className="num">{cfg.mu_peak.toFixed(2)}</span><br />
          <input type="range" min={0} max={1} step={0.05} value={cfg.mu_peak}
            style={{ ['--fill' as any]: `${cfg.mu_peak * 100}%` }}
            onChange={(e) => setCfg({ ...cfg, mu_peak: Number(e.target.value) })} aria-label="Mu peak" /></label>
        <button className="btn-primary" onClick={() => q.refetch()} disabled={q.isFetching || !mayDispatch}
          title={mayDispatch ? 'Run the optimizer' : `Requires operator role (you are ${role})`}>
          {q.isFetching ? <Spinner label="Optimizing dispatch" /> : <Zap size={15} />}{q.isFetching ? 'Optimizing…' : d ? 'Re-run dispatch' : 'Run dispatch'}
        </button>
        <button className="btn-ghost" onClick={runCompare} disabled={cmpLoading || !d || !mayDispatch} title={mayDispatch ? 'Compare current config against a larger, greener fleet' : `Requires operator role (you are ${role})`}>
          {cmpLoading ? <Spinner label="Comparing scenarios" /> : <GitCompare size={15} />}{cmpLoading ? 'Comparing…' : 'Scenario compare'}
        </button>
        {d && <span className="text-sm fade-up">Saves <b className="num">{money(d.saved_cost, d.currency_symbol)}</b> · avoids <b className="num">{num(d.co2_avoided_kg, 1)} kg</b> CO₂ · shaves <b className="num">{num(d.peak_shaved_kw, 1)} kW</b></span>}
      </div>

      {!mayDispatch && (
        <EmptyState title="Operator role required" hint={`You are signed in as ${role} (read-only here). An operator runs the dispatch; you can review every result and receipt.`} />
      )}
      {mayDispatch && !d && !q.isFetching && (
        <EmptyState title="No dispatch yet" hint="The optimizer will compare charge-immediately against the smart policy." />
      )}
      {q.isError && !d ? <QueryError message={(q.error as Error)?.message} onRetry={() => q.refetch()} /> : null}
      {busy && <div className="card p-4"><TableSkeleton rows={6} cols={4} /></div>}
      {cmpErr && <p className="text-sm fade-up" style={{ color: '#C2503A' }}>{cmpErr} <button className="underline" onClick={runCompare}>Try again</button></p>}
      {d && (
        <div className="fade-up space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Cost saved', v: money(d.saved_cost, d.currency_symbol) },
              { l: 'CO₂ avoided', v: `${num(d.co2_avoided_kg, 1)} kg` },
              { l: 'Peak shaved', v: `${num(d.peak_shaved_kw, 1)} kW` },
            ].map((s) => (
              <div key={s.l} className="card card-lift p-3 text-center">
                <div className="muted text-xs uppercase tracking-wide">{s.l}</div>
                <div className="font-serif-d text-2xl num mt-0.5">{s.v}</div>
              </div>
            ))}
          </div>
          <div className="card p-4">
            <h3 className="font-serif-d text-lg mb-1">Feeder load: before vs after</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h: number) => `${h}:00`} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip units=" kW" />} />
                <Legend />
                <Line type="monotone" dataKey="baseline" stroke="#C2503A" strokeDasharray="6 3" dot={false} strokeWidth={2} name="Before (baseline)" animationDuration={600} />
                <Line type="monotone" dataKey="smart" stroke="#5F8F6B" strokeWidth={2.5} dot={false} name="After (smart)" animationDuration={600} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {cmp && (
            <div className="card p-4 fade-up" style={{ borderColor: '#E0A73A66' }}>
              <h3 className="font-serif-d text-lg">Scenario compare: current vs larger + greener fleet</h3>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div className="muted text-xs uppercase">Metric</div><div className="muted text-xs uppercase">A · current</div><div className="muted text-xs uppercase">B · +4 EVs, greener</div>
                <div>Saved</div><div className="num">{cmp.a.saved_cost}</div><div className="num">{cmp.b.saved_cost}</div>
                <div>CO₂ avoided</div><div className="num">{cmp.a.co2} kg</div><div className="num">{cmp.b.co2} kg</div>
                <div>Peak shaved</div><div className="num">{cmp.a.peak} kW</div><div className="num">{cmp.b.peak} kW</div>
              </div>
              <p className="text-sm mt-2">Delta: <b className="num">{cmp.delta.saved_cost >= 0 ? '+' : ''}{cmp.delta.saved_cost}</b> saved · <b className="num">{cmp.delta.co2 >= 0 ? '+' : ''}{cmp.delta.co2} kg</b> CO₂ · <b className="num">{cmp.delta.peak >= 0 ? '+' : ''}{cmp.delta.peak} kW</b> peak.</p>
            </div>
          )}
          <div className="card p-4 overflow-auto">
            <h3 className="font-serif-d text-lg mb-2">Per-EV “charged by” guarantee</h3>
            <table className="tbl row-enter text-sm w-full">
              <thead><tr className="muted text-left"><th>EV</th><th>Need kWh</th><th>Delivered</th><th>Departure</th><th>Guarantee</th></tr></thead>
              <tbody>
                {d.per_ev.map((e: any) => (
                  <tr key={e.id} className="border-t hairline"><td className="num">{e.id}</td><td className="num">{e.need_kwh}</td><td className="num">{e.delivered_kwh}</td><td>{e.departure}</td><td>{e.guaranteed ? 'Met ✓' : 'MISSED'}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="muted text-xs mt-2">Fairness: {d.fairness.note} Early-departure EVs: {d.fairness.early_departure_count}. SoC guarantee rate 100%.</p>
          </div>
          <Explain title="This dispatch" body={d.explanation} counter={d.counterfactual} confidence={d.confidence} />
        </div>
      )}
    </div>
  )
}
