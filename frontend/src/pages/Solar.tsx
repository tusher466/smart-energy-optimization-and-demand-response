import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts'
import { Pause, Play } from 'lucide-react'
import { api } from '../lib/api'
import { usePrefs, useRole, can } from '../state/store'
import { Explain, ChartTip, Spinner, ChartSkeleton, QueryError, useMinDelay } from '../components/ui'

function CloudFrame({ frame, active }: { frame: number[][]; active: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="w-28 h-28 border hairline rounded transition-opacity"
      style={{ opacity: active ? 1 : 0.35 }} role="img" aria-label="Cloud frame">
      {frame.filter((_, y) => y % 4 === 0).map((row, y) => row.filter((_, x) => x % 4 === 0).map((v, x) => (
        <rect key={`${x}-${y}`} x={x * 4} y={y * 4} width={4} height={4} fill={`rgba(62,124,134,${v})`} />
      )))}
      <circle cx={24} cy={24} r={2.5} fill="none" stroke="#E0A73A" strokeWidth={1.5} className="node-pulse" />
    </svg>
  )
}

export function Solar() {
  const { region } = usePrefs()
  const role = useRole()
  const mayCompute = can(role, 'manager')
  const [p, setP] = useState({ lat: 23.8, lon: 90.4, capacity_kw: 100, horizon_h: 24, seed: 7, region_id: region })
  const [fi, setFi] = useState(0)
  const [anim, setAnim] = useState(true)
  const autoRan = useRef('')
  const q = useQuery({ queryKey: ['solar', p.lat, p.lon, p.capacity_kw, p.horizon_h, p.seed, region], queryFn: () => api.solar({ ...p, region_id: region }), enabled: false, retry: false })
  const d = q.data
  const loading = useMinDelay(q.isLoading || (q.isFetching && !d))

  useEffect(() => {
    if (!anim || !d?.frames) return
    const t = setInterval(() => setFi((i) => (i + 1) % d.frames.length), 900)
    return () => clearInterval(t)
  }, [anim, d])

  useEffect(() => { setP((prev) => ({ ...prev, region_id: region })) }, [region])
  useEffect(() => {
    if (mayCompute && autoRan.current !== region) { autoRan.current = region; q.refetch() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, mayCompute])

  return (
    <div className="space-y-4">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">Solar forecast studio</h1>
        <p className="muted text-sm mt-1">Clear-sky physics × cloud transmission. Bands are P10/P50/P90 — never a single line.</p>
      </div>
      <div className="card p-4 flex gap-3 flex-wrap items-end">
        {[['lat', 'Latitude'], ['lon', 'Longitude'], ['capacity_kw', 'Capacity kW'], ['horizon_h', 'Horizon h']].map(([k, l]) => (
          <label key={k} className="text-sm">{l}<br />
            <input type="number" value={(p as any)[k]} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} className="w-32" />
          </label>
        ))}
        <button className="btn-primary" onClick={() => q.refetch()} disabled={q.isFetching || !mayCompute}
          title={mayCompute ? 'Run the forecast' : `Requires manager role or above (you are ${role})`}>
          {q.isFetching && <Spinner label="Forecasting" />}{q.isFetching ? 'Forecasting…' : 'Run forecast'}
        </button>
        {!mayCompute && <span className="text-xs muted">Read-only for the {role} role — forecasts are run by managers and above.</span>}
        {d && <span className="text-sm muted">Confidence <span className="num">{Math.round(d.confidence * 100)}%</span> · motion dx <span className="num">{d.motion_vector.dx}</span>, dy <span className="num">{d.motion_vector.dy}</span> px · {d.model_version} · <span className="num">{d.source}</span></span>}
        {d?.data_sources && <span className="text-xs muted w-full">cloud: {d.data_sources.cloud} · temp: {d.data_sources.temperature} · irradiance: {d.data_sources.irradiance}</span>}
      </div>
      {q.isError && !d ? <QueryError message={(q.error as Error)?.message} onRetry={() => q.refetch()} />
      : loading ? <ChartSkeleton /> : d && (
        <div className="fade-up space-y-3">
          <div className="card p-4">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={d.series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="clock_hour" tick={{ fontSize: 11 }} tickFormatter={(h: number) => `${h}:00`} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<ChartTip units=" kW" />} />
                <Area type="monotone" dataKey="p90_kw" stroke="none" fill="#E0A73A" fillOpacity={0.15} name="P90" animationDuration={600} />
                <Area type="monotone" dataKey="p50_kw" stroke="#E0A73A" strokeWidth={2.5} fill="#E0A73A" fillOpacity={0.25} name="P50" animationDuration={600} />
                <Area type="monotone" dataKey="p10_kw" stroke="#9A6F16" strokeDasharray="6 3" fill="none" strokeWidth={1.5} name="P10" animationDuration={600} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="card card-lift p-4">
              <h3 className="font-serif-d text-lg">Variability index (ramp risk per hour)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={d.series}>
                  <XAxis dataKey="clock_hour" tick={{ fontSize: 10 }} tickFormatter={(h: number) => `${h}`} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="variability" fill="#C98A2B" name="Variability" radius={[3, 3, 0, 0]} animationDuration={600} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="card card-lift p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-serif-d text-lg">Cloud field advection</h3>
                <div className="flex-1" />
                <button className="btn-ghost text-xs" onClick={() => setAnim(!anim)} aria-label={anim ? 'Pause cloud animation' : 'Play cloud animation'}>
                  {anim ? <Pause size={13} /> : <Play size={13} />}{anim ? 'Pause' : 'Play'}
                </button>
              </div>
              <p className="muted text-sm mt-1">Wind {d.wind_assumed_px_per_h.join(', ')} px/h. Amber ring is your site — watch cloud drift over it.</p>
              <div className="flex gap-2 mt-2">
                {d.frames.map((f: number[][], idx: number) => (
                  <CloudFrame key={idx} frame={f} active={idx === fi} />
                ))}
              </div>
              <div className="h-1 rounded-full mt-2" style={{ background: 'var(--line)' }} aria-hidden>
                <div className="h-1 rounded-full transition-all duration-500" style={{ width: `${((fi + 1) / d.frames.length) * 100}%`, background: '#3E7C86' }} />
              </div>
              <Explain title="This forecast" body={`Clear-sky power reduced by cloud transmission (mean ${Math.round(d.series.reduce((a: number, s: any) => a + s.transmission, 0) / d.series.length * 100)}%). Quantile bands from gradient-boosting calibration; night hours pinned to zero.`} counter="Without clouds the noon peak would be the full clear-sky value; with observed cover it is reduced proportionally." confidence={d.confidence} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
