import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './ui/Layout'
import { Home } from './ui/home/Home'
import { StationDashboard } from './ui/pages/station/StationDashboard'
import { CheckIn } from './ui/pages/station/CheckIn'
import { SystemDetail } from './ui/pages/station/SystemDetail'
import { Report } from './ui/pages/station/Report'
import { NasaData } from './ui/pages/NasaData'
import { Science } from './ui/pages/Science'
import { MissionLink } from './ui/pages/MissionLink'
import { Ground } from './ui/pages/Ground'
import { JudgeLab } from './ui/pages/JudgeLab'
import { Verify } from './ui/pages/Verify'
import { DataSources } from './ui/pages/DataSources'
import { About } from './ui/pages/About'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="station" element={<StationDashboard />} />
          <Route path="station/checkin" element={<CheckIn />} />
          <Route path="station/system/:id" element={<SystemDetail />} />
          <Route path="station/report" element={<Report />} />
          <Route path="link" element={<MissionLink />} />
          <Route path="ground" element={<Ground />} />
          <Route path="lab" element={<JudgeLab />} />
          <Route path="data" element={<DataSources />} />
          <Route path="science" element={<Science />} />
          <Route path="nasa" element={<NasaData />} />
          <Route path="verify" element={<Verify />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<p className="text-dust">Page not found.</p>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
