import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, Download, Plus, Volume2 } from 'lucide-react'
import { useAppData, useSettings, type DeckStats } from '../hooks/useData'
import { createDeck, updateDeck } from '../db/repo'
import { DeckForm } from '../components/DeckForm'
import { Modal, pct } from '../components/ui'
import { computeStreak, dailyCounts } from '../lib/stats'
import { dateKey } from '../lib/dates'
import { displaySurface, primaryReading } from '../lib/distractors'
import { audioSupported, playWord } from '../lib/browser'
import type { Deck, Word } from '../types'

export function countdownText(days: number | null) {
  if (days === null) return null
  if (days < 0) return '考試已結束'
  if (days === 0) return '今天考試！'
  return `距離考試 ${days} 天`
}

/** 紙膠帶的顏色與角度，依單字庫順序輪流 */
const TAPE_COLORS = ['#E8A48A', '#9DB8C9', '#A9C2A0', '#E6C67E']
const TAPE_ANGLES = [-3, 2, -1, 3]

/** 單字庫的漢字方塊：依名稱挑一個字 */
export function deckGlyph(name: string): string {
  if (/文法/.test(name)) return '文'
  if (/課文|句/.test(name)) return '課'
  if (/單字|単語|単字|單語|詞/.test(name)) return '単'
  return name.match(/[一-鿿]/)?.[0] ?? '語'
}

/** 今日の一語：每天從單字庫固定挑一個（同一天同一個字） */
export function wordOfTheDay(words: Word[], day = dateKey()): Word | null {
  const pool = words.filter((w) => !w.deleted && !w.kind && (w.kanji || w.reading) && w.meaning)
  if (!pool.length) return null
  let h = 2166136261
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return [...pool].sort((a, b) => (a.id < b.id ? -1 : 1))[(h >>> 0) % pool.length]
}

export function HomePage() {
  const data = useAppData()
  const settings = useSettings()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Deck | null>(null)
  if (!data) return <div className="p-8 text-center text-muted">載入中…</div>

  const counts = dailyCounts(data.logs)
  const today = counts.get(dateKey())?.total ?? 0
  const goal = settings?.dailyGoal ?? 20
  const streak = computeStreak(counts)
  const totalDue = [...data.deckStats.values()].reduce((s, x) => s + x.dueToday, 0)
  const word = wordOfTheDay(data.words)

  return (
    <div className="space-y-10">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Welcome totalDue={totalDue} today={today} goal={goal} streak={streak} />
        <WordOfTheDay word={word} rate={settings?.ttsRate} />
      </div>

      <section>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-bold">我的單字庫</h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/import" className="btn-text">
              <Download size={16} aria-hidden />
              匯入
            </Link>
            <button className="btn-outline" onClick={() => setCreating(true)} data-testid="new-deck">
              <Plus size={16} aria-hidden />
              新增單字庫
            </button>
          </div>
        </div>
        {data.decks.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border-[1.5px] border-dashed border-dash bg-surface p-8 text-center text-muted">
            <p>還沒有單字庫。建立一個，或到「匯入」頁匯入單字表。</p>
            <button className="btn-outline" onClick={() => setCreating(true)}>
              建立第一個單字庫
            </button>
          </div>
        ) : (
          <div className="grid gap-x-[22px] gap-y-7 pt-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
            {data.decks.map((d, i) => (
              <DeckCard key={d.id} deck={d} stats={data.deckStats.get(d.id)!} index={i} onPractice={() => nav(`/practice?decks=${d.id}&scope=due`)} onEditExam={() => setEditing(d)} />
            ))}
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
      <Modal open={!!editing} onClose={() => setEditing(null)} title="編輯單字庫">
        {editing && (
          <DeckForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSubmit={async (v) => {
              await updateDeck(editing.id, { ...v, examDate: v.examDate || null })
              setEditing(null)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function Welcome({ totalDue, today, goal, streak }: { totalDue: number; today: number; goal: number; streak: number }) {
  const progress = Math.min(1, today / goal)
  return (
    <section className="genko relative overflow-hidden rounded-[20px] border-[1.5px] border-ink p-6 sm:p-8">
      <span className="pointer-events-none absolute -top-10 -right-4 select-none font-mincho text-[240px] leading-none font-extrabold text-[var(--watermark)]" aria-hidden>
        学
      </span>
      <div className="relative flex flex-wrap items-center gap-x-8 gap-y-6">
        <div className="min-w-[240px] flex-1">
          <p className="jp text-sm text-muted">おかえりなさい</p>
          <h1 className="mt-1 font-display text-2xl leading-snug font-bold sm:text-[28px]">
            今天還有 <span className="mx-0.5 align-[-0.08em] text-[1.6em] text-accent">{totalDue}</span> 張卡等你複習
          </h1>
          <div className="mt-5 max-w-md">
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-ink-2">每日目標</span>
              <span className="flex items-center gap-2">
                {today >= goal && (
                  <span className="jp inline-block -rotate-3 rounded-md border-[1.5px] border-accent px-1.5 py-px font-mincho text-xs font-semibold text-accent" data-testid="goal-stamp">
                    よくできました
                  </span>
                )}
                <span className="font-medium tabular-nums" data-testid="today-count">
                  {today} / {goal}
                </span>
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full border-[1.5px] border-ink bg-surface" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="每日目標進度">
              <div className="stripe-fill h-full" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="btn-seal" to="/practice?scope=due">
              開始今日複習
            </Link>
            <Link className="btn-outline" to="/exam">
              模擬考
            </Link>
          </div>
        </div>
        <StreakSeal days={streak} />
      </div>
    </section>
  )
}

function StreakSeal({ days }: { days: number }) {
  return (
    <div
      className="mx-auto grid h-28 w-28 shrink-0 -rotate-10 place-items-center rounded-full border-[3px] border-accent bg-surface font-mincho text-accent outline-[1.5px] outline-offset-4 outline-accent outline-solid sm:mx-0 sm:mr-4"
      role="img"
      aria-label={`連續學習 ${days} 天`}
    >
      <div className="jp flex flex-col items-center leading-none">
        <span className="text-xs font-semibold tracking-[0.2em]">連続</span>
        <span className="my-1 text-[34px] font-extrabold tabular-nums">{days}</span>
        <span className="text-xs font-semibold tracking-[0.2em]">日目</span>
      </div>
    </div>
  )
}

function WordOfTheDay({ word, rate }: { word: Word | null; rate?: number }) {
  const surface = word ? displaySurface(word) : ''
  const reading = word ? primaryReading(word.reading) : ''
  return (
    <section className="relative flex flex-col rounded-[20px] border-[1.5px] border-ink bg-ink p-6 text-surface" aria-labelledby="wotd-title">
      <h2 id="wotd-title" className="jp font-display text-sm font-bold tracking-widest opacity-80">
        今日の一語
      </h2>
      {word ? (
        <>
          {audioSupported() && (
            <button
              className="absolute top-4 right-4 grid h-11 w-11 place-items-center rounded-full border-[1.5px] border-surface/60 transition-colors hover:bg-surface hover:text-ink"
              onClick={() => playWord(word, rate)}
              aria-label={`播放「${surface}」的發音`}
            >
              <Volume2 size={20} aria-hidden />
            </button>
          )}
          <div className="mt-4">
            {reading && reading !== surface && <p className="jp text-sm opacity-75">{reading}</p>}
            <p className={`jp mt-1 font-mincho leading-tight font-extrabold break-words ${surface.length > 5 ? 'text-[40px]' : 'text-[56px]'}`} data-testid="wotd-word">
              {surface}
            </p>
            <p className="mt-2 text-base">{word.meaning}</p>
          </div>
          {word.example ? (
            <div className="mt-5 border-t border-dashed border-surface/35 pt-4 text-sm">
              <p className="jp leading-relaxed">{word.example}</p>
              {word.exampleTranslation && <p className="mt-1 opacity-70">{word.exampleTranslation}</p>}
            </div>
          ) : (
            word.pos && (
              <div className="mt-5 border-t border-dashed border-surface/35 pt-4 text-sm opacity-70">{word.pos}</div>
            )
          )}
        </>
      ) : (
        <p className="mt-4 text-sm opacity-80">
          單字庫還是空的。到
          <Link to="/import" className="mx-1 underline underline-offset-4">
            匯入
          </Link>
          頁加入單字後，這裡每天會出現一個字。
        </p>
      )}
    </section>
  )
}

function DeckCard({ deck: d, stats: s, index, onPractice, onEditExam }: { deck: Deck; stats: DeckStats; index: number; onPractice: () => void; onEditExam: () => void }) {
  const cd = countdownText(s.daysLeft)
  const urgent = s.daysLeft !== null && s.daysLeft >= 0 && s.daysLeft <= 7
  const total = s.total || 1
  return (
    <article className="relative flex flex-col rounded-2xl border-[1.5px] border-ink bg-surface p-5 pt-6 shadow-[4px_4px_0_var(--line-soft)]" data-testid="deck-card" data-deck-name={d.name}>
      <span
        className="washi-tape absolute -top-[11px] left-1/2 h-[22px] w-[86px]"
        style={{ ['--tape' as string]: TAPE_COLORS[index % TAPE_COLORS.length], transform: `translateX(-50%) rotate(${TAPE_ANGLES[index % TAPE_ANGLES.length]}deg)` }}
        aria-hidden
      />
      <Link to={`/deck/${d.id}`} className="group flex items-start gap-3">
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl border-[1.5px] border-ink bg-washi font-mincho text-[28px] font-extrabold" aria-hidden>
          {deckGlyph(d.name)}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="font-display leading-snug font-bold break-words group-hover:underline">{d.name}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {s.total} 個單字・正確率 {pct(s.accuracy)}
          </p>
        </div>
      </Link>
      <div className="mt-4 flex items-end gap-4">
        <div className="shrink-0">
          <div className="font-display text-[28px] leading-none font-bold tabular-nums" data-testid="due-count">
            {s.dueToday}
          </div>
          <div className="mt-1 text-[11px] text-muted">今日待複習</div>
        </div>
        <div className="min-w-0 flex-1 pb-0.5">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>熟練度</span>
            <span data-testid="mastery-pct">{pct(s.masteryPct)}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-line-soft" role="img" aria-label={`已熟練 ${s.mastery.mastered}、學習中 ${s.mastery.learning}、未學 ${s.mastery.new}`}>
            <div className="bg-ink" style={{ width: `${(s.mastery.mastered / total) * 100}%` }} />
            <div className="bg-dash" style={{ width: `${(s.mastery.learning / total) * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-dashed border-dash pt-3">
        <button className={`btn-text -ml-2 ${urgent ? 'font-bold text-accent' : ''}`} onClick={onEditExam}>
          <CalendarDays size={16} aria-hidden />
          {cd ?? '設定考試日期'}
        </button>
        <button className="btn-outline" onClick={onPractice} aria-label={`練習 ${d.name}`}>
          練習
          <ArrowRight size={16} aria-hidden />
        </button>
      </div>
    </article>
  )
}
