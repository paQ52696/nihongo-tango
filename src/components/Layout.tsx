import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BookX, Check, ChartColumn, CircleAlert, CloudOff, HardDrive, House, Lightbulb, PencilLine, RefreshCw, Settings, UserRound, type LucideIcon } from 'lucide-react'
import { useSync, getEngine } from '../sync'
import { Modal, Segmented } from './ui'
import { isStandalone } from '../lib/browser'

const NAV: { to: string; label: string; icon?: LucideIcon; end?: boolean }[] = [
  { to: '/', label: '首頁', icon: House, end: true },
  { to: '/practice', label: '練習', icon: PencilLine },
  { to: '/learn', label: '講解', icon: Lightbulb },
  { to: '/exam', label: '模擬考' },
  { to: '/mistakes', label: '錯題本', icon: BookX },
  { to: '/stats', label: '統計', icon: ChartColumn },
  { to: '/words', label: '單字' },
  { to: '/import', label: '匯入' },
  { to: '/settings', label: '設定', icon: Settings },
]
const MOBILE_NAV = ['/', '/practice', '/learn', '/mistakes', '/stats', '/settings']

export function Layout() {
  return (
    <div className="min-h-screen pb-20 md:pb-8">
      <header className="sticky top-0 z-30 border-b border-line-soft bg-[var(--header-bg)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
          <NavLink to="/" className="flex min-h-11 shrink-0 items-center gap-2.5 text-ink" aria-label="単語れんしゅう 首頁">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent font-mincho text-xl font-extrabold text-[var(--on-accent)]" aria-hidden>
              <span className="-rotate-4">単</span>
            </span>
            {/* iPad 直式（md～lg）放不下：只留印章，讓選單排成一行 */}
            <span className="jp hidden font-display text-lg font-bold sm:inline md:hidden lg:inline">単語れんしゅう</span>
          </NavLink>
          <nav className="hidden flex-1 flex-wrap items-center gap-0.5 md:flex lg:gap-1" aria-label="主選單">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-2.5 text-sm transition-colors lg:px-3.5 ${isActive ? 'bg-ink font-bold text-surface' : 'text-ink-2 hover:bg-pattern-line'}`
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
      <nav className="mobile-nav safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line-soft bg-surface md:hidden" aria-label="底部選單">
        <div className="grid grid-cols-6">
          {NAV.filter((n) => MOBILE_NAV.includes(n.to)).map((n) => {
            const Icon = n.icon!
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${isActive ? 'font-bold text-accent' : 'text-muted'}`}
              >
                <Icon size={20} strokeWidth={1.75} aria-hidden />
                {n.label}
              </NavLink>
            )
          })}
        </div>
      </nav>
      <FirstSyncDialog />
    </div>
  )
}

const STATUS: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
  'local-only': { label: '僅本機', icon: HardDrive, tone: 'border-line-soft text-muted' },
  'signed-out': { label: '未登入', icon: UserRound, tone: 'border-line-soft text-muted' },
  'needs-choice': { label: '等待選擇', icon: CircleAlert, tone: 'border-accent text-accent' },
  syncing: { label: '同步中', icon: RefreshCw, tone: 'border-line-soft text-muted' },
  synced: { label: '已同步', icon: Check, tone: 'border-ok text-ok' },
  offline: { label: '離線', icon: CloudOff, tone: 'border-line-soft text-muted' },
  error: { label: '同步錯誤', icon: CircleAlert, tone: 'border-accent text-accent' },
}

export function SyncBadge() {
  const s = useSync()
  const [open, setOpen] = useState(false)
  const st = STATUS[s.status]
  const Icon = st.icon
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid="sync-badge"
        data-status={s.status}
        className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] bg-surface px-3.5 text-xs font-medium transition-colors hover:bg-pattern-line ${st.tone}`}
        aria-label={`同步狀態：${st.label}${s.pending && s.user ? `，${s.pending} 筆待上傳` : ''}`}
      >
        <Icon size={15} strokeWidth={2.25} className={s.status === 'syncing' ? 'animate-spin' : ''} aria-hidden />
        <span>{st.label}</span>
        {s.pending > 0 && s.user && <span className="rounded-full border border-line-soft px-1.5 text-ink-2">{s.pending} 待上傳</span>}
      </button>
      <AccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Google 登入要先在 Supabase 設定 Google 供應商，設好後在 .env／GitHub Secrets 加 VITE_GOOGLE_LOGIN=1 才顯示 */
const GOOGLE_LOGIN = import.meta.env.VITE_GOOGLE_LOGIN === '1'

export function AccountPanel() {
  const s = useSync()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 寄出登入信後：輸入信中的驗證碼（安裝成 App 時信中的連結會開到瀏覽器，只能用驗證碼）
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  // 安裝成 App 時信中連結會開到瀏覽器，所以預設用密碼登入
  const [method, setMethod] = useState<'password' | 'email'>(isStandalone() ? 'password' : 'email')
  const [password, setPassword] = useState('')
  const backend = getEngine().getBackend()
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (x) {
      setErr(String((x as Error).message))
    } finally {
      setBusy(false)
    }
  }

  if (s.status === 'local-only')
    return (
      <div className="space-y-2 text-sm">
        <p>目前是<strong>僅本機模式</strong>：所有功能都能用，資料存在這台裝置的瀏覽器裡。</p>
        <p className="text-muted">要跨裝置同步，請依照 README 建立 Supabase 專案並設定金鑰。在那之前可以用「設定 → 資料備份」把資料搬到其他裝置。</p>
      </div>
    )

  if (s.user)
    return (
      <div className="space-y-3 text-sm">
        <p>
          已登入：<strong data-testid="user-email">{s.user.email}</strong>
          {s.backendKind === 'mock' && <span className="ml-2 rounded bg-accent-soft px-1.5 text-accent">模擬雲端</span>}
        </p>
        <p>
          狀態：{STATUS[s.status].label}
          {s.pending > 0 && `（${s.pending} 筆待上傳）`}
          {s.lastSyncedAt && <span className="block text-muted">上次同步：{new Date(s.lastSyncedAt).toLocaleString('zh-TW')}</span>}
        </p>
        {s.error && <p className="text-accent">{s.error}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" data-testid="sync-now" onClick={() => getEngine().syncNow()}>
            立即同步
          </button>
          <button className="btn-secondary" onClick={() => getEngine().signOut()}>
            登出
          </button>
        </div>
        <PasswordSetter />
      </div>
    )

  return (
    <form
      className="space-y-3 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        if (!backend || !email.trim()) return
        if (method === 'password')
          run(async () => {
            await backend.signInWithPassword(email.trim(), password)
          })
        else if (codeSent)
          run(async () => {
            await backend.verifyEmailCode(email.trim(), code.replace(/\s/g, ''))
          })
        else
          run(async () => {
            const r = await backend.signInWithEmail(email.trim())
            setMsg(r.message)
            if (r.needsCode) setCodeSent(true)
          })
      }}
    >
      <p>登入後，學習進度會在 Windows、Mac、iPad、手機之間同步。沒登入也能照常離線使用。</p>
      <Segmented
        label="登入方式"
        value={method}
        onChange={(m) => {
          setMethod(m)
          setErr(null)
        }}
        options={[
          { value: 'email', label: '寄登入信' },
          { value: 'password', label: '密碼登入' },
        ]}
      />
      <label className="label" htmlFor="login-email">
        Email
      </label>
      <input id="login-email" className="input" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required readOnly={codeSent} />
      {method === 'password' ? (
        <>
          <label className="label" htmlFor="login-password">
            密碼
          </label>
          <input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <button className="btn-primary" disabled={busy} type="submit">
            登入
          </button>
          <p className="text-xs text-muted">還沒設定過密碼？先在瀏覽器（Safari、Chrome…）用「寄登入信」登入，再到這個視窗設定密碼。之後安裝成 App 的裝置就能用密碼登入。</p>
        </>
      ) : codeSent ? (
        <>
          {msg && <p className="text-ok">{msg}</p>}
          <label className="label" htmlFor="login-code">
            驗證碼
          </label>
          <input
            id="login-code"
            className="input max-w-[12rem] text-center font-display text-xl tracking-[0.3em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,10}"
            maxLength={12}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            data-testid="login-code"
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy || code.replace(/\s/g, '').length < 6} type="submit">
              登入
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => {
                setCodeSent(false)
                setCode('')
                setMsg(null)
                setErr(null)
              }}
            >
              重新寄送／換一個 Email
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} type="submit">
            寄送登入信
          </button>
          {GOOGLE_LOGIN && (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => backend!.signInWithGoogle())}>
              使用 Google 登入
            </button>
          )}
        </div>
      )}
      {method === 'email' && !codeSent && msg && <p className="text-ok">{msg}</p>}
      {err && <p className="text-accent">{err}</p>}
    </form>
  )
}

/** 已登入時設定密碼：讓安裝成 App 的裝置（連結會開到瀏覽器）也能登入 */
function PasswordSetter() {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const backend = getEngine().getBackend()
  return (
    <form
      className="space-y-2 border-t border-dashed border-dash pt-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!backend) return
        setBusy(true)
        setErr(null)
        setMsg(null)
        try {
          await backend.setPassword(pw)
          setPw('')
          setMsg('密碼已設定。在 iPad／手機的 App 裡選「密碼登入」就能登入。')
        } catch (x) {
          setErr(String((x as Error).message))
        } finally {
          setBusy(false)
        }
      }}
    >
      <label className="label" htmlFor="set-password">
        設定密碼（給安裝成 App 的裝置登入用）
      </label>
      <div className="flex flex-wrap gap-2">
        <input id="set-password" className="input max-w-xs flex-1" type="password" autoComplete="new-password" minLength={6} placeholder="至少 6 個字元" value={pw} onChange={(e) => setPw(e.target.value)} required />
        <button className="btn-secondary" disabled={busy} type="submit">
          設定密碼
        </button>
      </div>
      {msg && <p className="text-ok" role="status">{msg}</p>}
      {err && <p className="text-accent">{err}</p>}
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
        <button className="btn-primary justify-start rounded-2xl py-3 text-left" disabled={busy} onClick={() => choose('merge')} data-testid="first-sync-merge">
          <span>
            <strong className="block">合併（建議）</strong>
            <span className="text-xs opacity-90">兩邊的單字庫、進度、作答紀錄都保留；同一筆資料以較新的為準。</span>
          </span>
        </button>
        <button className="btn-secondary justify-start rounded-2xl py-3 text-left" disabled={busy} onClick={() => choose('remote')} data-testid="first-sync-remote">
          <span>
            <strong className="block">以雲端為準</strong>
            <span className="text-xs opacity-90">清除這台裝置上的資料，改用雲端的資料。</span>
          </span>
        </button>
      </div>
    </Modal>
  )
}
