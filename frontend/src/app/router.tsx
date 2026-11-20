import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { RouteError } from '../components/RouteError'
import { RequireAuth, RequireRole } from '../components/RequireAuth'
import { PAGE_MIN } from '../lib/permissions'
import { Overview } from '../pages/Overview'
import { Solar } from '../pages/Solar'
import { Demand } from '../pages/Demand'
import { Vpp } from '../pages/Vpp'
import { Grid } from '../pages/Grid'
import { Panels } from '../pages/Panels'
import { Ledger } from '../pages/Ledger'
import { Sdgs } from '../pages/Sdgs'
import { Trust } from '../pages/Trust'
import { Settings } from '../pages/Settings'
import { Login } from '../pages/Login'
import { Users } from '../pages/Users'

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/', element: <RequireAuth><Layout /></RequireAuth>, errorElement: <RouteError />, children: [
      { index: true, element: <Overview /> },
      { path: 'solar', element: <RequireRole role={PAGE_MIN.solar}><Solar /></RequireRole> },
      { path: 'demand', element: <RequireRole role={PAGE_MIN.demand}><Demand /></RequireRole> },
      { path: 'vpp', element: <RequireRole role={PAGE_MIN.dispatch}><Vpp /></RequireRole> },
      { path: 'grid', element: <RequireRole role={PAGE_MIN.grid}><Grid /></RequireRole> },
      { path: 'panels', element: <RequireRole role={PAGE_MIN.panels}><Panels /></RequireRole> },
      { path: 'ledger', element: <Ledger /> },
      { path: 'sdgs', element: <Sdgs /> },
      { path: 'trust', element: <Trust /> },
      { path: 'settings', element: <Settings /> },
      { path: 'users', element: <RequireRole role={PAGE_MIN.users}><Users /></RequireRole> },
      { path: '*', element: <div className="card p-8"><h1 className="font-serif-d text-2xl">Route not found</h1><p className="muted mt-2">The page you requested does not exist. Use navigation above.</p></div> },
    ]
  }
])
