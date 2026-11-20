import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe, Leaf, Sun, Moon, Database, Cpu, RefreshCw, BookOpen, Trash2, ExternalLink, Check } from 'lucide-react'
import { api, docsUrl } from '../lib/api'
import { usePrefs, useRole, can } from '../state/store'
import { Toast, TableSkeleton, Spinner, useMinDelay } from '../components/ui'

const FALLBACK_REGS = [
  { id: 'bd-dhaka', name: 'Dhaka, Bangladesh', country: 'Bangladesh', currency: 'BDT', currency_symbol: '৳', carbon_marginal: 740, feeder_limit_kw: 420, peak_hours: [18, 19, 20, 21, 22], notes: 'Evening peak, gas-dominated grid.' },
  { id: 'de-berlin', name: 'Berlin, Germany (EU)', country: 'Germany', currency: 'EUR', currency_symbol: '€', carbon_marginal: 480, feeder_limit_kw: 520, peak_hours: [8, 9, 17, 18, 19], notes: 'Day-ahead price, high renewables midday.' },
  { id: 'us-pjm', name: 'PJM (US East)', country: 'United States', currency: 'USD', currency_symbol: '$', carbon_marginal: 580, feeder_limit_kw: 600, peak_hours: [14, 15, 16, 17, 18], notes: 'LMP afternoon peak.' },
]

function Section({ icon: Icon, title, hint, children }: any) {
  return (
    <div className="card p-5">
      <h2 className="font-serif-d text-lg flex items-center gap-2"><Icon size={17} style={{ color: '#E0A73A' }} /> {title}</h2>
      {hint && <p className="muted text-xs mt-1">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

export function Settings() {
  const { region, theme, carbonMethod, set } = usePrefs()
  const role = useRole()
  const mayRefresh = can(role, 'operator')
  const isAdmin = can(role, 'admin')
  const [toast, setToast] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const integ = useQuery({ queryKey: ['integ'], queryFn: api.integrations })
  const models = useQuery({ queryKey: ['models'], queryFn: api.models })
  const integLoading = useMinDelay(integ.isLoading)
  const modelsLoading = useMinDelay(models.isLoading)
  const regs = useQuery({ queryKey: ['regs'], queryFn: api.regions })
  const list: any[] = regs.data?.regions?.length ? regs.data.regions : FALLBACK_REGS
  const liveCount = (integ.data?.integrations || []).filter((i: any) => i.source === 'live').length

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">Settings and integrations</h1>
        <p className="muted text-sm mt-1">Region, carbon accounting, appearance — plus every data source with honest provenance.</p>
      </div>

      {/* Region cards */}
      <Section icon={Globe} title="Operating region" hint="Switching updates tariffs, currency, carbon factors and peak hours everywhere instantly.">
        <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Region">
          {list.map((r: any) => {
            const active = region === r.id
            return (
              <button key={r.id} role="radio" aria-checked={active} onClick={() => { set({ region: r.id }); setToast(`Region: ${r.name}`) }}
                className="text-left rounded-xl p-3 border transition-all hover:-translate-y-0.5"
                style={{
                  borderColor: active ? '#E0A73A' : 'var(--line)',
                  background: active ? 'rgba(224,167,58,.08)' : 'var(--surface-2)',
                  boxShadow: active ? '0 2px 12px rgba(224,167,58,.25)' : 'none',
                }}>
                <div className="flex items-center gap-2">
                  <span className="font-serif-d text-xl">{r.currency_symbol}</span>
                  <span className="font-semibold text-sm flex-1">{r.currency}</span>
                  {active && <Check size={15} style={{ color: '#E0A73A' }} />}
                </div>
                <div className="text-sm font-medium mt-1">{r.name}</div>
                <div className="muted text-xs mt-1 space-y-0.5">
                  <div>Carbon <span className="num">{r.carbon_marginal} g/kWh</span> marginal</div>
                  <div>Feeder <span className="num">{r.feeder_limit_kw} kW</span> · peak <span className="num">{(r.peak_hours || []).slice(0, 3).join(', ')}h…</span></div>
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      {/* Carbon + theme */}
      <div className="grid sm:grid-cols-2 gap-3">
        <Section icon={Leaf} title="Carbon accounting">
          <div className="space-y-2" role="radiogroup" aria-label="Carbon methodology">
            {[
              { v: 'marginal', t: 'Marginal factor', d: 'CO₂ of the next kWh — the plant your dispatch actually displaces. Recommended.' },
              { v: 'average', t: 'Average factor', d: 'CO₂ of the current grid mix. Smoother, less actionable.' },
            ].map((o) => {
              const active = carbonMethod === o.v
              return (
                <button key={o.v} role="radio" aria-checked={active} onClick={() => set({ carbonMethod: o.v as any })}
                  className="w-full text-left rounded-xl p-3 border transition-all"
                  style={{ borderColor: active ? '#5F8F6B' : 'var(--line)', background: active ? 'rgba(95,143,107,.1)' : 'transparent' }}>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="w-3.5 h-3.5 rounded-full border-2 inline-block" style={{ borderColor: active ? '#5F8F6B' : 'var(--line)', background: active ? '#5F8F6B' : 'transparent' }} />
                    {o.t}
                  </div>
                  <p className="muted text-xs mt-1 pl-5">{o.d}</p>
                </button>
              )
            })}
          </div>
        </Section>
        <Section icon={Sun} title="Appearance">
          <div className="rounded-xl p-1 grid grid-cols-2 gap-1" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} role="group" aria-label="Theme">
            {[{ v: 'dark', t: 'Control room', icon: Moon }, { v: 'light', t: 'Bone light', icon: Sun }].map((o) => {
              const active = theme === o.v
              return (
                <button key={o.v} onClick={() => set({ theme: o.v as any })}
                  className="rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-all"
                  style={active ? { background: '#E0A73A', color: '#141A17' } : { color: 'var(--fg)' }}>
                  <o.icon size={15} />{o.t}
                </button>
              )
            })}
          </div>
          <p className="muted text-xs mt-2">Dark is tuned for the control room; light uses warm paper tones. Amber stays the single accent in both.</p>
        <div className="flex gap-2 mt-3 flex-wrap">
          {isAdmin && (
            <>
              <button className="btn-primary text-sm" onClick={() => api.ledgerSeed().then(() => setToast('Demo dataset loaded'))}> Demo data</button>
              <button className="btn-ghost text-sm" onClick={() => api.ledgerReset().then(() => setToast('Ledger reset — all entries cleared'))}>Reset</button>
            </>
          )}
          <a className="btn-ghost text-sm" href={docsUrl()} target="_blank" rel="noreferrer"><ExternalLink size={14} /> API docs</a>
        </div>
        </Section>
      </div>

      {/* Integrations */}
      <Section icon={Database} title={`Data sources — ${liveCount} live, ${(integ.data?.integrations || []).length - liveCount} synthetic`}
        hint="Free providers need no key — probing fetches them now. Key-gated ones activate when you set a key in .env. Full guide: docs/DATA_SOURCES.txt.">
        <div className="flex justify-end -mt-1 mb-1 no-print">
          <button className="btn-ghost text-xs" disabled={refreshing || !mayRefresh}
            title={mayRefresh ? 'Probe live providers now' : `Requires operator role (you are ${role})`}
            onClick={async () => {
              setRefreshing(true)
              try {
                const r = await api.refreshIntegrations()
                const live = Object.entries(r.results || {}).filter(([, v]: any) => String(v.source).startsWith('live')).length
                setToast(`Refresh done: ${live} of ${Object.keys(r.results || {}).length} probes live; rest on synthetic fallback.`)
                integ.refetch()
              } catch { setToast('Refresh failed — is the backend running?') }
              finally { setRefreshing(false) }
            }}>
            {refreshing ? <Spinner label="Probing live sources" /> : <RefreshCw size={13} />}{refreshing ? 'Probing live sources…' : 'Refresh live data'}
          </button>
        </div>
        {integLoading ? <TableSkeleton rows={6} cols={2} /> : (
        <div className="rounded-xl overflow-hidden border rise-list" style={{ borderColor: 'var(--line)' }}>
          {(integ.data?.integrations || []).map((i: any, idx: number) => (
            <div key={i.name} className="px-3 py-2.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              style={{ background: idx % 2 ? 'transparent' : 'rgba(127,127,127,.05)', borderTop: idx ? '1px solid var(--line)' : 'none' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm">{i.name}</span>
                <span className="flex items-center gap-1.5">
                  {i.configured === false && <span className="muted text-[11px]">needs key</span>}
                  <span className="num text-xs font-semibold px-1.5 py-0.5 rounded"
                    style={i.source === 'live'
                      ? { background: 'rgba(95,143,107,.15)', color: '#5F8F6B' }
                      : { background: 'rgba(201,138,43,.15)', color: '#C98A2B' }}>{i.source}</span>
                </span>
              </div>
              {i.detail && <p className="muted text-xs mt-0.5">{i.detail}</p>}
              {i.updated_at && <p className="muted text-[11px]">cache updated <span className="num">{i.updated_at}</span></p>}
            </div>
          ))}
        </div>
        )}
        <a className="underline text-xs mt-2 inline-block" href={docsUrl().replace('/docs', '/api/v1/regions/' + region + '/live')} target="_blank" rel="noreferrer">
          View this region's live bundle (JSON)
        </a>
      </Section>

      {/* Models */}
      <Section icon={Cpu} title="Model status" hint="Warmed at startup on synthetic data; versions pinned on every response.">
        {modelsLoading ? <TableSkeleton rows={3} cols={2} /> : (
        <div className="grid sm:grid-cols-2 gap-2 rise-list">
          {(models.data?.models || []).map((m: any) => (
            <div key={m.name} className="rounded-xl px-3 py-2.5 border flex items-center gap-2.5" style={{ borderColor: 'var(--line)', background: 'rgba(127,127,127,.05)' }}>
              <span className="dot-live shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium capitalize">{m.name}</div>
                <div className="muted text-[11px] num truncate">{m.version} · {m.status}</div>
              </div>
            </div>
          ))}
        </div>
        )}
      </Section>
      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}
