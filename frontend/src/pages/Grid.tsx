import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pause, Play, Send } from 'lucide-react'
import { api } from '../lib/api'
import { useRole, can } from '../state/store'
import { Explain, Skeleton, Spinner, QueryError, useMinDelay } from '../components/ui'

export function Grid() {
  const [scenario, setScenario] = useState('cloud-collapse')
  const [step, setStep] = useState(6)
  const [auto, setAuto] = useState(false)
  const [q, setQ] = useState('Why islands first?')
  const [ans, setAns] = useState<any>(null)
  const [asking, setAsking] = useState(false)
  const [askErr, setAskErr] = useState('')
  const [notice, setNotice] = useState('')
  const role = useRole()
  const mayCompute = can(role, 'manager')
  const mayApprove = can(role, 'operator')
  const sim = useQuery({ queryKey: ['grid', scenario], queryFn: () => api.gridSim({ scenario }) })
  const timer = useRef<number | null>(null)
  const d = sim.data
  const simBusy = useMinDelay(sim.isLoading || (sim.isFetching && !d))
  const askBusy = useMinDelay(asking, 500)

  /* Autoplay through recovery steps */
  useEffect(() => {
    if (!auto) return
    timer.current = window.setInterval(() => {
      setStep((s) => {
        if (s >= 6) { setAuto(false); return s }
        return s + 1
      })
    }, 1100)
    return () => { if (timer.current) window.clearInterval(timer.current) }
  }, [auto])

  useEffect(() => { setStep(1); setAuto(true) }, [scenario])

  const ask = async () => {
    setAsking(true); setAskErr('')
    try { setAns(await api.copilot({ question: q, scenario })) }
    catch (e: any) { setAskErr(e.message || 'Assistant is unreachable right now.') }
    finally { setAsking(false) }
  }

  const requestApproval = async (s: any) => {
    try {
      await api.createApproval(`Approve black-start step ${s.id}: ${s.name} (${scenario})`, 'grid',
        `${s.action} [${s.freq_hz} Hz, ${s.volt_pu} pu]`)
      setNotice(`Step ${s.id} “${s.name}” sent to the approvals queue — operator sign-off required.`)
    } catch {
      setNotice('Could not reach the approvals queue — is the backend running?')
    }
    setTimeout(() => setNotice(''), 4000)
  }

  return (
    <div className="space-y-4">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">Grid operator copilot</h1>
        <p className="muted text-sm mt-1">Deterministic black-start simulator. The assistant explains and proposes only — the operator approves every step.</p>
      </div>
      <div className="card p-4 flex gap-3 items-end flex-wrap">
        <label className="text-sm">Scenario<br />
          <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <option value="cloud-collapse">Cloud collapse</option>
            <option value="wind-lull">Wind lull</option>
            <option value="line-trip">Line trip</option>
            <option value="cyber-outage">Cyber outage</option>
          </select>
        </label>
        <button className="btn-primary" onClick={() => { setStep(1); setAuto(true); sim.refetch() }} disabled={sim.isFetching || !mayCompute}
          title={mayCompute ? 'Run the black-start simulation' : `Requires manager role or above (you are ${role})`}>
          {sim.isFetching ? <Spinner label="Simulating restoration" /> : auto ? <Pause size={15} /> : <Play size={15} />}{sim.isFetching ? 'Simulating…' : auto ? 'Pause replay' : 'Replay restoration'}
        </button>
        <input type="range" min={1} max={6} value={step} aria-label="Simulation step"
          style={{ ['--fill' as any]: `${((step - 1) / 5) * 100}%` }}
          onChange={(e) => { setStep(Number(e.target.value)); setAuto(false) }} className="w-40" />
        <span className="text-sm num">step {step}/6</span>
        {d && <span className="text-sm muted">{d.description} Restoration {d.restoration_time_min} min.</span>}
      </div>
      {sim.isError && !d ? <QueryError message={(sim.error as Error)?.message} onRetry={() => sim.refetch()} />
      : simBusy ? <Skeleton h={320} /> : d && (
        <div className="grid md:grid-cols-2 gap-3 fade-up">
          <div className="card p-4">
            <h3 className="font-serif-d text-lg">Network re-energization</h3>
            <div className="h-1.5 rounded-full mt-2" style={{ background: 'var(--line)' }} aria-hidden>
              <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${(step / 6) * 100}%`, background: '#5F8F6B' }} />
            </div>
            <svg viewBox="0 0 760 220" className="w-full mt-2" role="img" aria-label="Network graph">
              {d.edges.map(([a, b]: string[], i: number) => {
                const na = d.nodes.find((n: any) => n.id === a), nb = d.nodes.find((n: any) => n.id === b)
                const on = Math.min(na.energized_at_step, nb.energized_at_step) <= step
                return <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                  className={on ? 'flow-line' : undefined}
                  stroke={on ? '#E0A73A' : '#3a4440'} strokeWidth={on ? 3 : 1.5}
                  style={{ transition: 'stroke 500ms' }} />
              })}
              {d.nodes.map((n: any) => {
                const on = n.energized_at_step <= step
                return (
                  <g key={n.id}>
                    <circle cx={n.x} cy={n.y} r={16} fill={on ? '#E0A73A' : 'none'}
                      className={on ? 'node-pulse' : undefined}
                      stroke={on ? '#E0A73A' : '#8E9A92'} strokeWidth={2}
                      style={{ transition: 'fill 500ms, stroke 500ms' }} />
                    <text x={n.x} y={n.y + 32} textAnchor="middle" fontSize={10} fill="currentColor">{n.id}</text>
                  </g>
                )
              })}
            </svg>
            <ol className="mt-2 space-y-1 text-sm rise-list">
              {d.steps.filter((s: any) => s.id <= step).map((s: any) => (
                <li key={s.id} className="border-l-2 pl-2 fade-up" style={{ borderColor: s.stable ? '#5F8F6B' : '#C2503A' }}>
                  <b>{s.id}. {s.name}</b> — {s.action}
                  <span className="muted"> [{s.doc}.md · <span className="num">{s.freq_hz} Hz</span> · <span className="num">{s.volt_pu} pu</span> · {s.stable ? 'stable' : 'UNSTABLE'}]</span>
                  <button className="btn-ghost text-xs ml-2 no-print" onClick={() => requestApproval(s)} disabled={!mayApprove}
                    title={mayApprove ? 'Send to the approvals queue' : `Requires operator role (you are ${role})`}>
                    <Send size={12} /> Request approval
                  </button>
                </li>
              ))}
            </ol>
            {notice && <p className="text-xs mt-2 fade-up" style={{ color: '#5F8F6B' }}>{notice}</p>}
          </div>
          <div className="card p-4">
            <h3 className="font-serif-d text-lg">Assistant (proposal only)</h3>
            <p className="muted text-xs">Human-in-the-loop: proposals require operator approval. Cites procedure doc + step.</p>
            <div className="flex gap-2 mt-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} className="flex-1" aria-label="Question"
                onKeyDown={(e) => { if (e.key === 'Enter') ask() }} placeholder="Ask about the recovery plan…" />
              <button className="btn-primary" onClick={ask} disabled={asking || !mayCompute}
                title={mayCompute ? 'Ask the copilot' : `Requires manager role or above (you are ${role})`}>
                {asking && <Spinner label="Thinking" />} {asking ? 'Thinking…' : 'Ask'}</button>
            </div>
            {askBusy && <div className="mt-3"><Skeleton h={90} /></div>}
            {askErr && !asking && <p className="text-sm mt-3 fade-up" style={{ color: '#C2503A' }}>{askErr}</p>}
            {ans && !asking && (
              <div className="text-sm mt-3 space-y-2 fade-up">
                <p>{ans.answer}</p>
                <p className="muted">Cited: {ans.cited_docs.join(', ')} · step {ans.simulation_step_ref} · {ans.llm} · {ans.badge}</p>
                {ans.retrieved.map((r: any) => <p key={r.doc} className="muted text-xs">[<span className="num">{r.doc}</span>.md score {r.score}] {r.excerpt.slice(0, 220)}…</p>)}
              </div>
            )}
            <Explain title="Recovery plan" body={d.steps.map((s: any) => `${s.id}. ${s.name}`).join(' → ') + '. Each step checks frequency/voltage before proceeding.'} counter="Without islanding, cold-load pickup would collapse frequency below 48.8 Hz." confidence={0.9} />
          </div>
        </div>
      )}
    </div>
  )
}
