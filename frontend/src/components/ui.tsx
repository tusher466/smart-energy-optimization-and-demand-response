import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Inbox, TriangleAlert, RotateCcw } from 'lucide-react'

/* Animated count-up number */
export function useCountUp(target: number, dur = 900, started = true) {
  const [v, setV] = useState(0)
  const raf = useRef(0)
  useEffect(() => {
    if (!started || !isFinite(target)) { setV(target || 0); return }
    let t0: number | undefined
    const tick = (t: number) => {
      if (t0 === undefined) t0 = t
      const p = Math.min(1, (t - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setV(target * e)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [target, dur, started])
  return v
}

export function AnimatedNumber({ value, decimals = 0, prefix = '', suffix = '' }: {
  value: number; decimals?: number; prefix?: string; suffix?: string
}) {
  const v = useCountUp(value)
  return (
    <span className="num">
      {prefix}{v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  )
}

/* KPI card — same props as before, plus optional delta chip and entrance motion */
export function Kpi({ label, value, sub, delta, countTo, decimals = 0, prefix = '', suffix = '', loading = false }: {
  label: string; value: string; sub?: string; delta?: string;
  countTo?: number; decimals?: number; prefix?: string; suffix?: string; loading?: boolean
}) {
  return (
    <motion.div className="card card-lift p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}>
      <div className="muted text-xs uppercase tracking-wide flex items-center gap-2">
        {label}
        {delta && (
          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(95,143,107,.15)', color: '#5F8F6B' }}>{delta}</span>
        )}
      </div>
      <div className="font-serif-d text-3xl mt-1">
        {loading
          ? <div className="skeleton sk-value" role="status" aria-label={`Loading ${label}`} />
          : countTo !== undefined
            ? <AnimatedNumber value={countTo} decimals={decimals} prefix={prefix} suffix={suffix} />
            : <span className="num">{value}</span>}
      </div>
      {sub && <div className="muted text-sm mt-1">{sub}</div>}
    </motion.div>
  )
}

/* Explain drawer with smooth expand */
export function Explain({ title, body, counter, confidence }: {
  title: string; body: string; counter?: string; confidence?: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card p-4 mt-4">
      <button className="text-sm font-medium inline-flex items-center gap-1 hover:underline" onClick={() => setOpen(!open)}
        aria-expanded={open}>
        <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />
        {open ? 'Hide explanation' : `Explain: ${title}`}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }} style={{ overflow: 'hidden' }}>
            <div className="text-sm mt-2 space-y-2">
              <p>{body}</p>
              {counter && <p className="muted">Counterfactual: {counter}</p>}
              {confidence !== undefined && <p>Forecast confidence: <span className="num">{Math.round(confidence * 100)}%</span></p>}
              <p className="muted">Sources: synthetic offline data · model version pinned on each response · provenance shown on Ledger.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Skeleton({ h = 220 }: { h?: number }) {
  return <div className="skeleton w-full" style={{ height: h }} aria-label="Loading" role="status" />
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />
}

/* Keeps a loading state visible for at least `ms` so skeletons fade in and out
   smoothly instead of flashing on fast responses. */
export function useMinDelay(active: boolean, ms = 650) {
  const [show, setShow] = useState(active)
  const t0 = useRef(0)
  useEffect(() => {
    if (active) {
      t0.current = Date.now()
      setShow(true)
      return
    }
    const elapsed = Date.now() - t0.current
    if (elapsed >= ms || t0.current === 0) { setShow(false); return }
    const t = setTimeout(() => setShow(false), ms - elapsed)
    return () => clearTimeout(t)
  }, [active, ms])
  return show
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading table" className="space-y-2 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2 fade-up" style={{ animationDelay: `${Math.min(i * 60, 300)}ms` }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="skeleton sk-line flex-1" style={{ opacity: Math.max(0.35, 1 - i * 0.1) }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ h = 260 }: { h?: number }) {
  return <div className="sk-chart w-full" style={{ height: h }} role="status" aria-label="Loading chart" />
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading list" className="space-y-2.5 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 fade-up" style={{ animationDelay: `${Math.min(i * 70, 280)}ms` }}>
          <div className="skeleton sk-circle shrink-0" style={{ width: 26, height: 26, opacity: Math.max(0.4, 1 - i * 0.1) }} />
          <div className="skeleton sk-line flex-1" style={{ opacity: Math.max(0.4, 1 - i * 0.1) }} />
        </div>
      ))}
    </div>
  )
}

export function StatusDot({ ok, label }: { ok: boolean | null; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs muted">
      <span className={ok === null ? 'dot-busy' : 'dot-live'}
        style={ok === false ? { background: '#C2503A' } : undefined} />
      {label}
    </span>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center fade-up">
      <Inbox size={22} className="mx-auto muted icon-float" />
      <p className="font-medium mt-2">{title}</p>
      {hint && <p className="muted text-sm mt-1">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function QueryError({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="card p-6 text-center fade-up" role="alert" style={{ borderColor: '#C2503A66' }}>
      <TriangleAlert size={20} className="mx-auto icon-float" style={{ color: '#C2503A' }} />
      <p className="font-medium mt-2">Couldn't load this data</p>
      <p className="muted text-sm mt-1 max-w-md mx-auto">{message || 'The backend may be unreachable or your session expired. Check the connection, then retry.'}</p>
      <button className="btn-primary text-sm mt-3" onClick={onRetry}>
        <RotateCcw size={14} /> Retry
      </button>
    </div>
  )
}

export function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="toast fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] card px-4 py-2.5 text-sm font-medium"
      role="status" style={{ borderColor: '#E0A73A' }}>
      {msg}
    </div>
  )
}

/* Recharts tooltip */
export function ChartTip({ active, payload, label, units = '' }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs">
      <div className="muted mb-1">Hour <span className="num">{label}</span></div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.stroke || p.fill }} />
          <span className="muted">{p.name}</span>
          <span className="num ml-auto pl-3">{Number(p.value).toLocaleString()}{units}</span>
        </div>
      ))}
    </div>
  )
}
