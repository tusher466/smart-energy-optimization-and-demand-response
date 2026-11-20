import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, ScanSearch } from 'lucide-react'
import { api } from '../lib/api'
import { usePrefs, useRole, can } from '../state/store'
import { Explain, Skeleton, EmptyState, Spinner, QueryError, useMinDelay } from '../components/ui'
import { money, num } from '../lib/format'

const SEV = {
  critical: { bg: 'rgba(194,80,58,.15)', fg: '#C2503A' },
  major: { bg: 'rgba(201,138,43,.15)', fg: '#C98A2B' },
  minor: { bg: 'rgba(95,143,107,.15)', fg: '#5F8F6B' },
} as Record<string, { bg: string; fg: string }>

export function Panels() {
  const { region } = usePrefs()
  const role = useRole()
  const mayCompute = can(role, 'manager')
  const [sample, setSample] = useState('roof-a')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [ranKey, setRanKey] = useState('')
  const [uploaded, setUploaded] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['panels', sample, region],
    queryFn: () => api.panelsInspect(sample, region),
    enabled: false,
  })
  const d = q.data
  const busy = useMinDelay(q.isFetching || uploading)

  const inspect = async () => {
    setErr('')
    if (file) {
      setUploading(true)
      try {
        const out = await api.panelsUpload(file, region)
        setUploaded(out)
      } catch (e: any) {
        setErr(e.message || 'Upload failed')
      } finally { setUploading(false) }
      return
    }
    setUploaded(null)
    setRanKey(`${sample}|${region}`)
    qc.removeQueries({ queryKey: ['panels', sample, region] })
    q.refetch()
  }

  const shown = file ? uploaded : (ranKey === `${sample}|${region}` ? d : undefined)

  return (
    <div className="space-y-4">
      <div className="fade-up">
        <h1 className="font-serif-d text-3xl tracking-tight">Panel health inspector</h1>
        <p className="muted text-sm mt-1">Drone thermography: threshold → connected components → classify by shape and ΔT. Use a bundled sample or upload your own thermal image.</p>
      </div>
      <div className="card p-4 flex gap-3 items-end flex-wrap">
        <label className="text-sm">Sample<br />
          <select value={sample} onChange={(e) => { setSample(e.target.value); setFile(null); setUploaded(null) }} disabled={!!file}>
            <option value="roof-a">roof-a</option>
            <option value="roof-b">roof-b</option>
            <option value="plant-c">plant-c</option>
          </select>
        </label>
        <label className="text-sm">…or upload thermal image<br />
          <input ref={fileRef} type="file" accept="image/*" className="max-w-[220px]"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setUploaded(null); setErr('') }} aria-label="Upload thermal image" />
        </label>
        {file && <span className="text-xs muted">Using upload: <b>{file.name}</b> <button className="underline" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}>clear</button></span>}
        <button className="btn-primary" onClick={inspect} disabled={q.isFetching || uploading || !mayCompute}
          title={mayCompute ? 'Run inspection' : `Requires manager role or above (you are ${role})`}>
          {q.isFetching || uploading ? <Spinner label="Inspecting panels" /> : file ? <Upload size={15} /> : <ScanSearch size={15} />}
          {uploading ? 'Analyzing upload…' : q.isFetching ? 'Inspecting…' : file ? 'Inspect upload' : 'Inspect'}
        </button>
        {shown && <span className="text-sm fade-up"><b className="num">{shown.defect_count}</b> defects · <b className="num">{shown.efficiency_loss_pct}%</b> loss · <b>{money(shown.yearly_money_lost, shown.currency_symbol)}/yr</b> · ~{num(shown.yearly_kwh_lost, 0)} kWh/yr</span>}
      </div>
      {err && <p className="text-sm" style={{ color: '#C2503A' }}>{err}</p>}
      {busy && <Skeleton h={300} />}
      {q.isError && !uploading && <QueryError message={(q.error as Error)?.message || err} onRetry={inspect} />}
      {!shown && !q.isFetching && !uploading && (
        <EmptyState title="No inspection yet" hint="Pick a synthetic sample or upload a drone thermal image, then press Inspect." />
      )}
      {shown && (
        <div className="grid md:grid-cols-2 gap-3 fade-up">
          <div className="card card-lift p-4">
            <h3 className="font-serif-d text-lg">Annotated overlay</h3>
            <img src={`data:image/png;base64,${shown.overlay_png_b64}`} alt="Annotated thermal overlay" className="w-full rounded border hairline mt-2" />
            <p className="muted text-xs mt-1">Median <span className="num">{shown.median_temp_c}°C</span> · max <span className="num">{shown.max_temp_c}°C</span> · {shown.model_version} · {file ? 'uploaded image' : `sample ${sample}`}</p>
          </div>
          <div>
            <div className="card p-4 overflow-auto">
              <h3 className="font-serif-d text-lg mb-2">Defects by severity</h3>
              <table className="tbl row-enter text-sm w-full">
                <thead><tr className="muted text-left"><th>ID</th><th>Type</th><th>ΔT</th><th>Severity</th></tr></thead>
                <tbody>
                  {shown.defects.map((x: any) => (
                    <tr key={x.id} className="border-t hairline">
                      <td className="num">{x.id}</td><td>{x.label}</td><td className="num">{x.delta_t}°C</td>
                      <td><span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: SEV[x.severity]?.bg, color: SEV[x.severity]?.fg }}>{x.severity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Explain title="This inspection" body={shown.explanation} counter="Without repair the same hotspots persist and string faults propagate to neighbouring modules." confidence={0.86} />
          </div>
        </div>
      )}
    </div>
  )
}
