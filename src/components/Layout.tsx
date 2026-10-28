import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useSync, getEngine } from '../sync'
import { Modal } from './ui'

const NAV = [
  { to: '/', label: '首頁', icon: '🏠', end: true },
  { to: '/practice', label: '練習', icon: '✏️' },
  { to: '/learn', label: '講解', icon: '💡' },
  { to: '/exam', label: '模擬考', icon: '📝' },
  { to: '/mistakes', label: '錯題本', icon: '📕' },
  { to: '/stats', label: '統計', icon: '📊' },
  { to: '/words', label: '單字', icon: '📚' },
  { to: '/import', label: '匯入', icon: '📥' },
  { to: '/settings', label: '設定', icon: '⚙️' },
]
const MOBILE_NAV = ['/', '/practice', '/learn', '/mistakes', '/stats', '/settings']

export function Layout() {
  return (
    <div className="min-h-screen pb-20 md:pb-8">
      <header className="sticky top-0 z-30 border-b border-sakura-100 bg-sakura-50/85 backdrop-blur dark:border-ink-700 dark:bg-ink-900/85">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <NavLink to="/" className="flex shrink-0 items-center gap-2 font-bold text-sakura-600 dark:text-sakura-300">
            <span className="text-2xl" aria-hidden>
              🌸
            </span>
            <span className="jp hidden sm:inline">単語れんしゅう</span>
          </NavLink>
          <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex" aria-label="主選單">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors ${isActive ? 'bg-white font-semibold text-sakura-600 shadow-sm dark:bg-ink-800 dark:text-sakura-300' : 'text-ink-700 hover:bg-white/70 dark:text-lav-200 dark:hover:bg-ink-800'}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <SyncBadge />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">
        <Outlet />
      </main>
      <nav className="mobile-nav safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-sakura-100 bg-white/95 backdrop-blur md:hidden dark:border-ink-700 dark:bg-ink-800/95" aria-label="底部選單">
        <div className="grid grid-cols-6">
          {NAV.filter((n) => MOBILE_NAV.includes(n.to)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-semibold text-sakura-600 dark:text-sakura-300' : 'text-ink-600 dark:text-lav-300'}`}
            >
              <span className="text-lg" aria-hidden>
                {n.icon}
              </span>
              {n.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <FirstSyncDialog />
    </div>
  )
}

const STATUS: Record<string, { label: string; dot: string }> = {
  'local-only': { label: '僅本機', dot: 'bg-lav-300' },
  'signed-out': { label: '未登入', dot: 'bg-lav-300' },
  'needs-choice': { label: '等待選擇', dot: 'bg-amber-400' },
  syncing: { label: '同步中', dot: 'bg-sky-400 animate-pulse' },
  synced: { label: '已同步', dot: 'bg-emerald-400' },
  offline: { label: '離線', dot: 'bg-amber-400' },
  error: { label: '同步錯誤', dot: 'bg-red-500' },
}

export function SyncBadge() {
  const s = useSync()
  const [open, setOpen] = useState(false)
  const st = STATUS[s.status]
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="sync-badge"
        data-status={s.status}
        className="flex items-center gap-2 rounded-full border border-sakura-200 bg-white px-3 py-1 text-xs text-ink-700 shadow-sm hover:bg-sakura-100 dark:border-ink-600 dark:bg-ink-800 dark:text-lav-100"
        aria-label={`同步狀態：${st.label}${s.pending && s.user ? `，${s.pending} 筆待上傳` : ''}`}
      >
        <span className={`h-2 w-2 rounded-full ${st.dot}`} aria-hidden />
        <span>{st.label}</span>
        {s.pending > 0 && s.user && <span className="rounded-full bg-sakura-100 px-1.5 text-sakura-700 dark:bg-ink-600 dark:text-sakura-200">{s.pending} 待上傳</span>}
      </button>
      <AccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function AccountPanel() {
  const s = useSync()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const backend = getEngine().getBackend()

  if (s.status === 'local-only')
    return (
      <div className="space-y-2 text-sm">
        <p>目前是<strong>僅本機模式</strong>：所有功能都能用，資料存在這台裝置的瀏覽器裡。</p>
        <p className="text-ink-600 dark:text-lav-300">要跨裝置同步，請依照 README 建立 Supabase 專案並設定金鑰。在那之前可以用「設定 → 資料備份」把資料搬到其他裝置。</p>
      </div>
    )

  if (s.user)
    return (
      <div className="space-y-3 text-sm">
        <p>
          已登入：<strong data-testid="user-email">{s.user.email}</strong>
          {s.backendKind === 'mock' && <span className="ml-2 rounded bg-amber-100 px-1.5 text-amber-800">模擬雲端</span>}
        </p>
        <p>
          狀態：{STATUS[s.status].label}
          {s.pending > 0 && `（${s.pending} 筆待上傳）`}
          {s.lastSyncedAt && <span className="block text-ink-600 dark:text-lav-300">上次同步：{new Date(s.lastSyncedAt).toLocaleString('zh-TW')}</span>}
        </p>
        {s.error && <p className="text-red-600">{s.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" data-testid="sync-now" onClick={() => getEngine().syncNow()}>
            立即同步
          </button>
          <button className="btn-secondary" onClick={() => getEngine().signOut()}>
            登出
          </button>
        </div>
      </div>
    )

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!backend || !email.trim()) return
        setBusy(true)
        setErr(null)
        try {
          const r = await backend.signInWithEmail(email.trim())
          setMsg(r.message)
        } catch (x) {
          setErr(String((x as Error).message))
        } finally {
          setBusy(false)
        }
      }}
    >
      <p>登入後，學習進度會在 Windows、Mac、手機之間同步。沒登入也能照常離線使用。</p>
      <label className="label" htmlFor="login-email">
        Email
      </label>
      <input id="login-email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} type="submit">
          寄送登入連結
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => backend?.signInWithGoogle().catch((x) => setErr(String(x.message)))}>
          使用 Google 登入
        </button>
      </div>
      {msg && <p className="text-emerald-700 dark:text-emerald-300">{msg}</p>}
      {err && <p className="text-red-600">{err}</p>}
    </form>
  )
}

function AccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="帳號與同步">
      <AccountPanel />
    </Modal>
  )
}

function FirstSyncDialog() {
  const s = useSync()
  const [busy, setBusy] = useState(false)
  if (s.status !== 'needs-choice') return null
  const choose = async (c: 'merge' | 'remote') => {
    setBusy(true)
    await getEngine().resolveFirstSync(c)
    setBusy(false)
  }
  return (
    <Modal open onClose={() => {}} title="第一次同步">
      <p className="mb-4 text-sm">這台裝置和雲端都已經有資料了。要怎麼處理？</p>
      <div className="grid gap-3">
        <button className="btn-primary justify-start py-3 text-left" disabled={busy} onClick={() => choose('merge')} data-testid="first-sync-merge">
          <span>
            <strong className="block">合併（建議）</strong>
            <span className="text-xs opacity-90">兩邊的單字庫、進度、作答紀錄都保留；同一筆資料以較新的為準。</span>
          </span>
        </button>
        <button className="btn-secondary justify-start py-3 text-left" disabled={busy} onClick={() => choose('remote')} data-testid="first-sync-remote">
          <span>
            <strong className="block">以雲端為準</strong>
            <span className="text-xs opacity-90">清除這台裝置上的資料，改用雲端的資料。</span>
          </span>
        </button>
      </div>
    </Modal>
  )
}
