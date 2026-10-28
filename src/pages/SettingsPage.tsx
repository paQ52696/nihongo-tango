import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useData'
import { updateSettings } from '../db/repo'
import { exportAll, restoreAll, wipeAll } from '../db/backup'
import { seedDemoIfEmpty } from '../db/demo'
import { setMeta } from '../db/schema'
import { ConfirmButton, PageTitle, Segmented, Toggle } from '../components/ui'
import { AccountPanel } from '../components/Layout'
import { canPromptInstall, downloadText, getTheme, hasJapaneseVoice, isIOS, isSafari, isStandalone, onInstallAvailable, onVoicesChanged, promptInstall, setTheme, speak, ttsSupported, type Theme } from '../lib/browser'
import { dateKey } from '../lib/dates'

export function SettingsPage() {
  const s = useSettings()
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const [pendingRestore, setPendingRestore] = useState<{ name: string; data: unknown; counts: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [installable, setInstallable] = useState(canPromptInstall())
  const [voiceOk, setVoiceOk] = useState(hasJapaneseVoice())
  useEffect(() => onInstallAvailable(() => setInstallable(canPromptInstall())), [])
  useEffect(() => onVoicesChanged(() => setVoiceOk(hasJapaneseVoice())), [])
  if (!s) return null

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle>設定</PageTitle>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">學習</h2>
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="goal">每日目標（題數）</label>
          <input id="goal" type="number" min={1} max={500} className="input w-24" value={s.dailyGoal} onChange={(e) => updateSettings({ dailyGoal: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} data-testid="daily-goal" />
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">發音</h2>
        {!ttsSupported() ? (
          <p className="text-sm text-red-600">這個瀏覽器不支援語音合成（Web Speech API），「聽音選字」無法使用。</p>
        ) : (
          <>
            <Toggle checked={s.ttsEnabled} onChange={(v) => updateSettings({ ttsEnabled: v })} label="作答後自動唸出讀音" />
            <Toggle checked={s.autoPlay} onChange={(v) => updateSettings({ autoPlay: v })} label="出題時自動唸（漢字→讀音題除外，避免洩題）" />
            <div className="flex items-center gap-3">
              <label htmlFor="rate" className="shrink-0">
                語速 {s.ttsRate.toFixed(1)}
              </label>
              <input id="rate" type="range" min={0.5} max={1.5} step={0.1} value={s.ttsRate} onChange={(e) => updateSettings({ ttsRate: Number(e.target.value) })} className="flex-1 accent-sakura-500" />
              <button className="btn-secondary" onClick={() => speak('こんにちは。にほんごの べんきょうを がんばりましょう。', s.ttsRate)}>
                🔊 試聽
              </button>
            </div>
            {!voiceOk && <p className="text-xs text-amber-700 dark:text-amber-300">找不到日文語音，目前不會發音。Windows：設定 → 時間與語言 → 語音 → 管理語音「新增語音」→ 選「日本語」，裝好後把瀏覽器完全關掉再打開；Mac：系統設定 → 輔助使用 → 朗讀內容 → 系統聲音 → 管理聲音 → 日文；iPhone：設定 → 輔助使用 → 朗讀內容 → 聲音 → 日文。</p>}
            {isSafari() && <p className="text-xs text-ink-600 dark:text-lav-300">Safari 第一次播放需要你先點一下播放按鈕，之後才會自動唸。</p>}
          </>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">外觀</h2>
        <Segmented
          label="主題"
          value={theme}
          onChange={(t) => {
            setTheme(t)
            setThemeState(t)
          }}
          options={[
            { value: 'system', label: '跟隨系統' },
            { value: 'light', label: '淺色' },
            { value: 'dark', label: '深色' },
          ]}
        />
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">帳號與同步</h2>
        <AccountPanel />
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">安裝成 App</h2>
        {isStandalone() ? (
          <p className="text-sm">已經以 App 模式開啟 ✅（離線也能使用）</p>
        ) : installable ? (
          <button className="btn-primary" onClick={() => promptInstall().then(() => setInstallable(false))}>
            安裝到這台裝置
          </button>
        ) : isIOS() ? (
          <p className="text-sm">iPhone／iPad：用 Safari 開啟本網站 → 點下方「分享」按鈕 → 「加入主畫面」。</p>
        ) : isSafari() ? (
          <p className="text-sm">Mac Safari：選單列「檔案」→「加入 Dock」（macOS Sonoma 以上）。</p>
        ) : (
          <p className="text-sm">Chrome／Edge：網址列右側的「安裝」圖示，或選單 →「投放、儲存與分享」→「安裝網頁應用程式」。第一次開啟後就會快取，之後斷網也能用。</p>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">資料備份與還原</h2>
        <p className="text-sm text-ink-600 dark:text-lav-300">把所有單字庫、單字、進度、作答紀錄、設定匯出成一個 JSON 檔；還原時會清空目前資料並完整復原。</p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            data-testid="backup-export"
            onClick={async () => {
              const b = await exportAll()
              downloadText(`nihongo-backup-${dateKey()}.json`, JSON.stringify(b), 'application/json')
              setMsg('已下載備份檔')
            }}
          >
            ⬇ 匯出備份
          </button>
          <label className="btn-secondary cursor-pointer">
            ⬆ 從備份還原
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              data-testid="backup-file"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                setErr(null)
                try {
                  const data = JSON.parse(await f.text())
                  if (data?.app !== 'nihongo-tango') throw new Error('這不是本 App 的備份檔')
                  const t = data.tables ?? {}
                  setPendingRestore({ name: f.name, data, counts: `${t.decks?.length ?? 0} 個單字庫、${t.words?.length ?? 0} 個單字、${t.reviewLogs?.length ?? 0} 筆作答紀錄` })
                } catch (x) {
                  setErr('無法讀取備份檔：' + (x as Error).message)
                }
              }}
            />
          </label>
        </div>
        {pendingRestore && (
          <div className="anim-in rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/40" role="alert">
            <p>
              要用「{pendingRestore.name}」還原嗎？內含 {pendingRestore.counts}。<strong>目前這台裝置上的資料會被清空。</strong>
            </p>
            <div className="mt-2 flex gap-2">
              <button
                className="btn-danger"
                data-testid="confirm-restore"
                onClick={async () => {
                  try {
                    await restoreAll(pendingRestore.data)
                    setMsg('還原完成')
                  } catch (x) {
                    setErr((x as Error).message)
                  }
                  setPendingRestore(null)
                }}
              >
                確定還原
              </button>
              <button className="btn-ghost" onClick={() => setPendingRestore(null)}>
                取消
              </button>
            </div>
          </div>
        )}
        {msg && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300" role="status" data-testid="settings-msg">
            {msg}
          </p>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold text-red-600 dark:text-red-400">危險區域</h2>
        <div className="flex flex-wrap gap-2">
          <ConfirmButton
            confirmText="清空這台裝置上的所有資料？（建議先匯出備份）"
            confirmLabel="清空"
            onConfirm={async () => {
              await wipeAll()
              setMsg('已清空所有資料')
            }}
          >
            清空所有資料
          </ConfirmButton>
          <button
            className="btn-ghost"
            onClick={async () => {
              await setMeta('demoSeeded', false)
              const ok = await seedDemoIfEmpty()
              setMsg(ok ? '已重新建立示範單字庫' : '已有單字庫，未建立示範資料')
            }}
          >
            重新建立示範單字庫
          </button>
        </div>
      </section>

      <p className="text-center text-xs text-ink-600 dark:text-lav-300">日文單字練習 v{__APP_VERSION__}・資料只存在你的裝置與你自己的 Supabase 帳號</p>
    </div>
  )
}
