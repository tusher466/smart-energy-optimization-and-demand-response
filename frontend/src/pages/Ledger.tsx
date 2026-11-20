import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useRole, can } from '../state/store'
import { Kpi, TableSkeleton, QueryError, Toast, useMinDelay } from '../components/ui'
import { num } from '../lib/format'

export function Ledger() {
  const role = useRole()
  const isAdmin = can(role, 'admin')
  const [toast, setToast] = useState('')
  const s = useQuery({ queryKey: ['ledger-sum'], queryFn: api.ledgerSummary })
  const e = useQuery({ queryKey: ['ledger-entries'], queryFn: api.ledgerEntries })
  const d = s.data
  const eLoading = useMinDelay(e.isLoading)

  const adminAct = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn()
      s.refetch(); e.refetch()
      setToast(okMsg)
    } catch (err: any) {
      setToast(err.message || 'Action failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">Carbon and cost ledger</h1>
        <p className="muted text-sm mt-1" title="CO2 = shifted kWh × marginal emission factor (selectable avg/marginal). Money = kWh × time-of-use tariff. Peak = baseline peak minus smart peak.">
          Every decision is logged with methodology. <span className="underline">Hover for methodology.</span>
        </p>
      </div>
      {s.isError && !d ? <QueryError message={(s.error as Error)?.message} onRetry={() => s.refetch()} /> : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
        <Kpi label="Cumulative saved" value="—" countTo={d?.total_saved} decimals={0} loading={s.isLoading} sub={`${d?.decisions || 0} decisions · mixed currencies`} />
        <Kpi label="CO₂ avoided" value="—" countTo={d?.total_co2_kg} decimals={0} suffix=" kg" loading={s.isLoading} sub="marginal factor" />
        <Kpi label="Peak shaved" value="—" countTo={d?.total_peak_kw} decimals={1} suffix=" kW" loading={s.isLoading} sub="sum of events" />
        <Kpi label="Decisions" value="—" countTo={d?.decisions} decimals={0} loading={s.isLoading} sub="SQLite · SQLAlchemy" />
      </div>
      )}
      <div className="card p-4 flex gap-2 flex-wrap">
        <button className="btn-primary" onClick={async () => {
          try {
            const t = localStorage.getItem('eb_token')
            const r = await fetch('/api/v1/ledger/export.csv', { headers: t ? { Authorization: `Bearer ${t}` } : {} })
            if (!r.ok) throw new Error(`Export failed (HTTP ${r.status})`)
            const blob = await r.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = 'ledger.csv'; a.click()
            URL.revokeObjectURL(url)
            setToast('Ledger exported as CSV')
          } catch (err: any) {
            setToast(err.message || 'Export failed')
          }
        }}>Export CSV</button>
        <button className="btn-ghost no-print" onClick={() => window.print()}>Print-friendly report</button>
        {isAdmin && (
          <>
            <button className="btn-ghost" onClick={() => adminAct(() => api.ledgerSeed(), 'Demo dataset loaded')}>Load demo dataset</button>
            <button className="btn-ghost" onClick={() => { if (window.confirm('Clear all ledger entries and approvals?')) adminAct(() => api.ledgerReset(), 'Ledger reset — all entries cleared') }}>Reset</button>
          </>
        )}
        {!isAdmin && <span className="muted text-xs self-center">Seed/reset is admin-only.</span>}
      </div>
      <div className="card p-4 overflow-auto" style={{ maxHeight: 440 }}>
        {e.isError && !e.data ? <QueryError message={(e.error as Error)?.message} onRetry={() => e.refetch()} />
        : eLoading ? <TableSkeleton rows={8} cols={5} /> : (
        <table className="tbl row-enter text-sm w-full">
          <thead><tr className="muted text-left"><th>ID</th><th>Module</th><th>Action</th><th>Saved</th><th>CO₂ kg</th><th>Peak kW</th><th>Conf</th></tr></thead>
          <tbody>
            {(e.data?.entries || []).map((r: any) => (
              <tr key={r.id} className="border-t hairline"><td className="num">{r.id}</td><td>{r.module}</td><td>{r.action}</td><td className="num">{r.saved_money} {r.currency}</td><td className="num">{r.co2_avoided_kg}</td><td className="num">{r.peak_shaved_kw}</td><td className="num">{Math.round((r.confidence || 0) * 100)}%</td></tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}
