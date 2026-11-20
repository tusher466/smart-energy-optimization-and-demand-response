import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { TriangleAlert, RotateCcw, Home } from 'lucide-react'

export function RouteError() {
  const err = useRouteError()
  const msg = isRouteErrorResponse(err)
    ? `${err.status} — ${err.statusText}`
    : err instanceof Error ? err.message : 'Something went wrong rendering this page.'
  const stack = err instanceof Error ? err.stack : null
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card p-8 max-w-md text-center fade-up">
        <TriangleAlert size={26} className="mx-auto" style={{ color: '#C98A2B' }} />
        <h1 className="font-serif-d text-2xl mt-3">This page hit a snag</h1>
        <p className="muted text-sm mt-2">The rest of the app is fine. Try reloading — this usually clears a stale update.</p>
        <p className="num text-xs mt-2 px-2 py-1 rounded overflow-auto" style={{ background: 'var(--surface-2)' }}>{msg}</p>
        {stack && (
          <details className="text-left mt-2">
            <summary className="muted text-xs cursor-pointer hover:underline">Technical details (for the bug report)</summary>
            <pre className="num text-[10px] mt-1 p-2 rounded overflow-auto max-h-40 text-left" style={{ background: 'var(--surface-2)' }}>{stack.slice(0, 1500)}</pre>
          </details>
        )}
        <div className="flex gap-2 justify-center mt-4">
          <button className="btn-primary text-sm" onClick={() => window.location.reload()}>
            <RotateCcw size={14} /> Reload page
          </button>
          <Link className="btn-ghost text-sm" to="/"><Home size={14} /> Overview</Link>
        </div>
      </div>
    </div>
  )
}
