import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './ui/Layout'
import { StationDashboard } from './ui/pages/station/StationDashboard'
import { CheckIn } from './ui/pages/station/CheckIn'
import { SystemDetail } from './ui/pages/station/SystemDetail'
import { Report } from './ui/pages/station/Report'
import { Placeholder } from './ui/pages/Placeholder'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/station" replace />} />
          <Route path="station" element={<StationDashboard />} />
          <Route path="station/checkin" element={<CheckIn />} />
          <Route path="station/system/:id" element={<SystemDetail />} />
          <Route path="station/report" element={<Report />} />
          <Route path="ground" element={<Placeholder title="Ground console" />} />
          <Route path="lab" element={<Placeholder title="Judge Lab" />} />
          <Route path="verify" element={<Placeholder title="Verify" />} />
          <Route path="about" element={<Placeholder title="About" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
