import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { DeckPage } from './pages/DeckPage'
import { PracticePage } from './pages/PracticePage'
import { ExamPage } from './pages/ExamPage'
import { MistakesPage } from './pages/MistakesPage'
import { StatsPage } from './pages/StatsPage'
import { WordsPage } from './pages/WordsPage'
import { ImportPage } from './pages/ImportPage'
import { SettingsPage } from './pages/SettingsPage'
import { removeLegacyDemoOnce, seedDemoIfEmpty } from './db/demo'
import { startSync } from './sync'
import { applyTheme, loadAudioManifest } from './lib/browser'
import { db } from './db/schema'
import { exportAll } from './db/backup'
import { getEngine } from './sync'

// 開發／E2E 測試用的除錯掛勾
if (import.meta.env.DEV || import.meta.env.VITE_E2E) (window as any).__app = { db, exportAll, getEngine, seedDemoIfEmpty, ready: null as Promise<unknown> | null }

applyTheme()
loadAudioManifest()
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme())

if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true })

const ready = removeLegacyDemoOnce()
  .catch((e) => console.error('刪除示範單字庫失敗', e))
  .finally(() => startSync().catch((e) => console.error('同步啟動失敗', e)))
if ((window as any).__app) (window as any).__app.ready = ready

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="deck/:id" element={<DeckPage />} />
          <Route path="practice" element={<PracticePage />} />
          <Route path="exam" element={<ExamPage />} />
          <Route path="mistakes" element={<MistakesPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="words" element={<WordsPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </HashRouter>
  </StrictMode>,
)
