import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppData, useSettings } from '../hooks/useData'
import { createDeck } from '../db/repo'
import { DeckForm } from '../components/DeckForm'
import { Modal, ProgressBar, Empty, MASTERY_COLORS, pct } from '../components/ui'
import { computeStreak, dailyCounts } from '../lib/stats'
import { dateKey } from '../lib/dates'

export function countdownText(days: number | null) {
  if (days === null) return null
  if (days < 0) return '考試已結束'
  if (days === 0) return '今天考試！'
  return `距離考試 ${days} 天`
}

export function HomePage() {
  const data = useAppData()
  const settings = useSettings()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  if (!data) return <div className="p-8 text-center text-ink-600">載入中…</div>

  const counts = dailyCounts(data.logs)
  const today = counts.get(dateKey())?.total ?? 0
  const goal = settings?.dailyGoal ?? 20
  const streak = computeStreak(counts)
  const totalDue = [...data.deckStats.values()].reduce((s, x) => s + x.dueToday, 0)

  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-4 bg-gradient-to-r from-sakura-100 to-lav-100 p-5 dark:from-ink-800 dark:to-ink-700">
        <div className="flex-1">
          <p className="jp text-sm text-sakura-700 dark:text-sakura-200">おかえりなさい！</p>
          <h1 className="text-xl font-bold">
            今天還有 <span className="text-sakura-600 dark:text-sakura-300">{totalDue}</span> 張卡要複習
          </h1>
          <div className="mt-3 max-w-sm">
            <div className="mb-1 flex justify-between text-xs">
              <span>每日目標</span>
              <span data-testid="today-count">
                {today} / {goal}
              </span>
            </div>
            <ProgressBar value={Math.min(1, today / goal)} label="每日目標進度" />
          </div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-sakura-600 dark:text-sakura-300">🔥 {streak}</div>
          <div className="text-xs">連續學習天數</div>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link className="btn-primary" to="/practice?scope=due">
            開始今日複習
          </Link>
          <Link className="btn-secondary" to="/exam">
            模擬考
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">我的單字庫</h2>
          <div className="flex gap-2">
            <Link to="/import" className="btn-ghost">
              📥 匯入
            </Link>
            <button className="btn-secondary" onClick={() => setCreating(true)} data-testid="new-deck">
              ＋ 新增單字庫
            </button>
          </div>
        </div>
        {data.decks.length === 0 ? (
          <Empty action={<button className="btn-primary" onClick={() => setCreating(true)}>建立第一個單字庫</button>}>還沒有單字庫。建立一個，或到「匯入」頁匯入單字表。</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.decks.map((d) => {
              const s = data.deckStats.get(d.id)!
              const cd = countdownText(s.daysLeft)
              return (
                <article key={d.id} className="card group relative overflow-hidden p-4" data-testid="deck-card" data-deck-name={d.name}>
                  <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: d.color }} />
                  <Link to={`/deck/${d.id}`} className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: d.color + '22' }} aria-hidden>
                      {d.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-bold group-hover:underline">{d.name}</h3>
                      <p className="text-xs text-ink-600 dark:text-lav-300">
                        {s.total} 個單字・正確率 {pct(s.accuracy)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold" style={{ color: d.color }} data-testid="due-count">
                        {s.dueToday}
                      </div>
                      <div className="text-[11px] text-ink-600 dark:text-lav-300">今日待複習</div>
                    </div>
                  </Link>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-ink-600 dark:text-lav-300">
                      <span>熟練度</span>
                      <span data-testid="mastery-pct">{pct(s.masteryPct)}</span>
                    </div>
                    <ProgressBar
                      segments={[
                        { value: s.mastery.mastered, color: d.color, label: '已熟練' },
                        { value: s.mastery.learning, color: MASTERY_COLORS.learning, label: '學習中' },
                        { value: s.mastery.new, color: 'transparent', label: '未學' },
                      ]}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className={`text-xs ${s.daysLeft !== null && s.daysLeft <= 7 && s.daysLeft >= 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'text-ink-600 dark:text-lav-300'}`}>{cd ?? '未設定考試日期'}</span>
                    <button className="btn-primary px-3 py-1.5" onClick={() => nav(`/practice?decks=${d.id}&scope=due`)} aria-label={`練習 ${d.name}`}>
                      開始練習
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <Modal open={creating} onClose={() => setCreating(false)} title="新增單字庫">
        <DeckForm
          submitLabel="建立"
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            const d = await createDeck({ ...v, examDate: v.examDate || null })
            setCreating(false)
            nav(`/deck/${d.id}`)
          }}
        />
      </Modal>
    </div>
  )
}
