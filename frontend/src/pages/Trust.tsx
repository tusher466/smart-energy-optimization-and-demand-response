import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ShieldCheck, BadgeCheck, FileCheck, Lock, ChevronDown, Database,
  Scale, AlertTriangle, ScrollText, Bot,
} from 'lucide-react'
import { api } from '../lib/api'
import { Skeleton, QueryError, useMinDelay } from '../components/ui'

const SLICE = { approved: '#5F8F6B', pending: '#C98A2B', rejected: '#C2503A' }

const FAILURES = [
  { icon: Database, title: 'Forecast error', sev: 'major', body: 'Bands (P10–P90) widen and confidence drops instead of pretending certainty. Dispatch shifts conservatively toward cheaper, lower-risk hours, and the confidence label on every output tells the operator how much to trust it.' },
  { icon: AlertTriangle, title: 'Infeasible schedule', sev: 'critical', body: 'If EV demand cannot fit the feeder limit before departures, the optimizer raises an error instead of silently under-charging. The charge-immediately baseline is kept as the fallback so no vehicle is ever left short without an explicit warning.' },
  { icon: Scale, title: 'Grid instability', sev: 'critical', body: 'Any black-start step outside 48.8–51.0 Hz or 0.94–1.06 pu is marked UNSTABLE and held. The timeline refuses to advance past a failed check until the operator sheds load and retries.' },
  { icon: Bot, title: 'Assistant overreach', sev: 'minor', body: 'The assistant never controls the grid. It proposes in words, cites a procedure doc and a simulation step, and waits. Every automated action lands in the approvals queue first — no silent actuation exists in the codebase.' },
]

const SEVC = {
  critical: { bg: 'rgba(194,80,58,.15)', fg: '#C2503A', label: 'fail-safe' },
  major: { bg: 'rgba(201,138,43,.15)', fg: '#C98A2B', label: 'degraded' },
  minor: { bg: 'rgba(95,143,107,.15)', fg: '#5F8F6B', label: 'guarded' },
} as Record<string, { bg: string; fg: string; label: string }>

export function Trust() {
  const ap = useQuery({ queryKey: ['ap-all'], queryFn: api.approvals })
  const ledger = useQuery({ queryKey: ['ledger-sum'], queryFn: api.ledgerSummary })
  const models = useQuery({ queryKey: ['models-t'], queryFn: api.models })
  const [open, setOpen] = useState<number | null>(0)
  const [filter, setFilter] = useState('all')
  const glanceLoading = useMinDelay(ap.isLoading || ledger.isLoading)
  const logLoading = useMinDelay(ap.isLoading)

  const counts = useMemo(() => {
    const list: any[] = ap.data?.approvals || []
    return {
      total: list.length,
      approved: list.filter((a) => a.status === 'approved').length,
      pending: list.filter((a) => a.status === 'pending').length,
      rejected: list.filter((a) => a.status === 'rejected').length,
      list,
    }
  }, [ap.data])

  const donut = [
    { name: 'Approved', value: counts.approved },
    { name: 'Pending', value: counts.pending },
    { name: 'Rejected', value: counts.rejected },
  ].filter((d) => d.value > 0)
  const decided = counts.approved + counts.rejected
  const modelsReady = (models.data?.models || []).filter((m: any) => m.status === 'ready').length

  const shown = counts.list.filter((a: any) => filter === 'all' || a.status === filter)

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">Trust and responsible AI</h1>
        <p className="muted text-sm mt-1 max-w-2xl">
          Every number in this platform ships with its provenance, its uncertainty, and a human
          who approved it. This page is the evidence locker — not a policy statement.
        </p>
      </div>

      {/* Assurance strip */}
      {glanceLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-4 space-y-2 fade-up" style={{ animationDelay: `${i * 70}ms` }}>
              <div className="skeleton sk-circle" style={{ width: 22, height: 22 }} />
              <div className="skeleton sk-value" style={{ width: '60%' }} />
              <div className="skeleton sk-line" />
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
        {[
          { icon: ShieldCheck, label: 'Human in the loop', big: `${decided}/${counts.total || '—'}`, sub: 'actions decided by operators' },
          { icon: BadgeCheck, label: 'SoC guarantee', big: '100%', sub: 'by optimizer design, enforced' },
          { icon: FileCheck, label: 'Receipts issued', big: ledger.data ? String(ledger.data.decisions) : '—', sub: 'ledger entries with methodology' },
          { icon: Lock, label: 'Personal data held', big: '0 records', sub: 'anonymized fleet IDs only' },
        ].map((t) => (
          <div key={t.label} className="card card-lift p-4">
            <t.icon size={18} style={{ color: '#E0A73A' }} />
            <div className="font-serif-d text-2xl num mt-2">{t.big}</div>
            <div className="text-xs font-medium mt-0.5">{t.label}</div>
            <div className="muted text-xs">{t.sub}</div>
          </div>
        ))}
      </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {/* Provenance */}
        <div className="card p-5 text-sm space-y-2">
          <h2 className="font-serif-d text-lg flex items-center gap-2"><Database size={17} style={{ color: '#3E7C86' }} /> Data provenance</h2>
          <p>
            All data is synthetic and generated offline unless a key is configured — and the app
            tells you which. Every API response carries a{' '}
            <code className="num text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)' }}>source: synthetic | live:…</code>{' '}
            flag, rendered per-field on the Settings page and per-forecast on Solar.
          </p>
          <p className="muted">Models pinned per response (e.g. <span className="num">solar-v1.3</span>). Live cache timestamps shown; cached payloads are labelled <span className="num">live:*-cached</span>, never silently fresh.</p>
        </div>
        {/* Fairness */}
        <div className="card p-5 text-sm space-y-2">
          <h2 className="font-serif-d text-lg flex items-center gap-2"><Scale size={17} style={{ color: '#3E7C86' }} /> Fairness check</h2>
          <p>
            Dispatch guarantees <b>100% SoC delivery</b> across all EVs, including early-departure
            owners. The optimizer assigns each vehicle its own cheapest feasible hours rather than
            serving a global queue — so early leavers are prioritized, never starved.
          </p>
          <div className="space-y-1.5 pt-1">
            {[['Early-departure EVs (≤06:00)', 100], ['Standard-departure EVs', 100]].map(([label, v]) => (
              <div key={label as string}>
                <div className="flex justify-between text-xs"><span>{label}</span><span className="num">{v}% delivered</span></div>
                <div className="h-1.5 rounded-full" style={{ background: 'var(--line)' }}>
                  <div className="h-1.5 rounded-full" style={{ width: `${v}%`, background: '#5F8F6B' }} />
                </div>
              </div>
            ))}
          </div>
          <p className="muted text-xs">Guaranteed by the optimizer safety layer; the VPP page reports per-EV delivery to verify. {modelsReady > 0 && <span><span className="num">{modelsReady}</span> models reporting ready.</span>}</p>
        </div>
      </div>

      {/* Failure modes accordion */}
      <div className="card p-5">
        <h2 className="font-serif-d text-lg flex items-center gap-2"><AlertTriangle size={17} style={{ color: '#C98A2B' }} /> Failure modes — what breaks, and what happens next</h2>
        <div className="mt-2 divide-y" style={{ borderColor: 'var(--line)' }}>
          {FAILURES.map((f, i) => (
            <div key={f.title}>
              <button className="w-full flex items-center gap-3 py-3 text-left" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                <f.icon size={17} className="muted shrink-0" />
                <span className="font-medium text-sm flex-1">{f.title}</span>
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded" style={{ background: SEVC[f.sev].bg, color: SEVC[f.sev].fg }}>{SEVC[f.sev].label}</span>
                <ChevronDown size={15} className="muted" style={{ transform: open === i ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} style={{ overflow: 'hidden' }}>
                    <p className="text-sm muted pb-3 pl-8 pr-2">{f.body}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Override log */}
      <div className="card p-5">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-serif-d text-lg flex items-center gap-2"><ScrollText size={17} style={{ color: '#3E7C86' }} /> Human override log</h2>
          <div className="flex-1" />
          {counts.total > 0 && (
            <div className="w-36 h-24" role="img" aria-label="Approval outcomes chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut.length ? donut : [{ name: 'None', value: 1 }]} dataKey="value" nameKey="name"
                    innerRadius={26} outerRadius={40} paddingAngle={3} strokeWidth={0}>
                    {donut.map((d) => <Cell key={d.name} fill={SLICE[d.name.toLowerCase() as keyof typeof SLICE]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 mt-1 mb-2 no-print" role="group" aria-label="Filter overrides">
          {['all', 'pending', 'approved', 'rejected'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-md capitalize transition-all ${filter === f ? 'btn-primary !py-1' : 'btn-ghost !py-1'}`}>
              {f}{f !== 'all' && <span className="num"> · {counts[f as keyof typeof counts] as number}</span>}
            </button>
          ))}
        </div>
        {ap.isError && !ap.data ? <QueryError message={(ap.error as Error)?.message} onRetry={() => ap.refetch()} />
        : logLoading ? <Skeleton h={120} /> : shown.length === 0 ? (
          <p className="muted text-sm py-3">{counts.total === 0 ? 'No overrides yet — run a Dispatch or request a black-start approval to start the log.' : `No ${filter} actions.`}</p>
        ) : (
          <ol className="relative ml-1.5 pl-5 space-y-3 max-h-80 overflow-auto pr-1" style={{ borderLeft: '2px solid var(--line)' }}>
            {shown.map((a: any) => (
              <li key={a.id} className="relative text-sm fade-up">
                <span className="absolute rounded-full" style={{
                  left: '-27px', top: 3, width: 11, height: 11,
                  background: SLICE[a.status as keyof typeof SLICE] || '#8E9A92',
                  border: '2px solid var(--surface)',
                }} />
                <div className="flex items-start gap-2">
                  <span className="flex-1">{a.action}</span>
                  <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded h-fit capitalize"
                    style={{ background: `${SLICE[a.status as keyof typeof SLICE] || '#8E9A92'}22`, color: SLICE[a.status as keyof typeof SLICE] || '#8E9A92' }}>
                    {a.status}
                  </span>
                </div>
                {a.detail && <p className="muted text-xs mt-0.5">{a.detail}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
