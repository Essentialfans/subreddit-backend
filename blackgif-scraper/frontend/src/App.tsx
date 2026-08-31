import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Accounts } from './pages/Accounts'
import { Dashboard } from './pages/Dashboard'
import { DownloadPage } from './pages/Download'
import { Library } from './pages/Library'
import { SettingsPage } from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="library" element={<Library />} />
          <Route path="library/:username" element={<Library />} />
          <Route path="download" element={<DownloadPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
