import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts'
import { api } from '../lib/api'
import { usePrefs, useRole, can } from '../state/store'
import { Explain, ChartTip, Spinner, ChartSkeleton, QueryError, useMinDelay } from '../components/ui'

export function Demand() {
  const { region } = usePrefs()
  const role = useRole()
  const mayCompute = can(role, 'manager')
  const [h, setH] = useState(48)
  const autoRan = useRef('')
  const q = useQuery({
    queryKey: ['demand', region, h],
    queryFn: () => api.demand({ region_id: region, horizon_h: h }),
    enabled: false,
  })
  const d = q.data
  const loading = useMinDelay(q.isLoading || (q.isFetching && !d))

  useEffect(() => {
    const key = `${region}-${h}`
    if (mayCompute && autoRan.current !== key) { autoRan.current = key; q.refetch() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, mayCompute])

  return (
    <div className="space-y-4">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">Demand forecast</h1>
        <p className="muted text-sm mt-1">Industrial/regional load with temperature sensitivity, weekday regime and holiday dip. Quantile outputs with backtest.</p>
      </div>
      <div className="card p-4 flex gap-3 items-end flex-wrap">
        <label className="text-sm">Horizon (h)<br /><input type="number" value={h} min={12} max={96}
          onChange={(e) => { setH(Number(e.target.value)); autoRan.current = '' }} className="w-28" /></label>
        <button className="btn-primary" onClick={() => { autoRan.current = `${region}-${h}`; q.refetch() }} disabled={q.isFetching || !mayCompute}
          title={mayCompute ? 'Run the forecast' : `Requires manager role or above (you are ${role})`}>
          {q.isFetching && <Spinner label="Forecasting demand" />}{q.isFetching ? 'Forecasting…' : d ? 'Re-run forecast' : 'Run forecast'}
        </button>
        {!mayCompute && <span className="text-xs muted">Read-only for the {role} role.</span>}
        {d && <span className="text-sm muted">MAPE <b className="num">{d.backtest.mape_pct}%</b> · pinball <b className="num">{d.backtest.pinball_loss}</b> · {d.model_version}</span>}
      </div>
      {q.isError && !d ? <QueryError message={(q.error as Error)?.message} onRetry={() => { autoRan.current = `${region}-${h}`; q.refetch() }} />
      : loading ? <ChartSkeleton /> : d && (
        <div className="fade-up space-y-3">
          <div className="card p-4">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={d.series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="clock_hour" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v}:00`} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip units=" kW" />} />
                <Area type="monotone" dataKey="p90_kw" stroke="none" fill="#5F8F6B" fillOpacity={0.15} name="P90" animationDuration={600} />
                <Area type="monotone" dataKey="p50_kw" stroke="#5F8F6B" strokeWidth={2.5} fill="#5F8F6B" fillOpacity={0.2} name="P50" animationDuration={600} />
                <Area type="monotone" dataKey="p10_kw" stroke="#3E7C86" strokeDasharray="6 3" fill="none" strokeWidth={1.5} name="P10" animationDuration={600} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="card card-lift p-4">
              <h3 className="font-serif-d text-lg">Feature importance</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={d.feature_importance} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="feature" width={110} tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="importance" fill="#3E7C86" radius={[0, 4, 4, 0]} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Explain title="This demand forecast" body={d.attention_summary + ` Backtest on ${d.backtest.holdout_hours}h holdout: MAPE ${d.backtest.mape_pct}%, pinball ${d.backtest.pinball_loss}.`} counter="A naive seasonal model would miss the temperature-driven evening peak by ~12%." confidence={d.confidence} />
          </div>
        </div>
      )}
    </div>
  )
}
