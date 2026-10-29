import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Download, FileDown, List, Pencil, Trash2 } from 'lucide-react'
import { deckGlyph, tapeColor } from '../lib/deckStyle'
import { useAppData } from '../hooks/useData'
import { deleteDeck, updateDeck } from '../db/repo'
import { practiceModeParam } from '../db/drills'
import { DeckForm } from '../components/DeckForm'
import { ConfirmButton, Empty, Modal, StatTile, pct, ProgressBar, MASTERY_COLORS } from '../components/ui'
import { SectionMasteryList } from '../components/charts'
import { masteryBySection } from '../lib/stats'
import { deckToCsv, deckToJson } from '../lib/importer'
import { downloadText, safeFilename } from '../lib/browser'
import { countdownText } from './HomePage'

export function DeckPage() {
  const { id } = useParams()
  const data = useAppData()
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  if (!data) return null
  const deck = id ? data.deckById.get(id) : undefined
  if (!deck) return <Empty action={<Link className="btn-primary" to="/">回首頁</Link>}>找不到這個單字庫（可能已被刪除）。</Empty>
  const s = data.deckStats.get(deck.id)!
  const sections = masteryBySection(
    data.entries.filter((e) => e.deckId === deck.id),
    data.cards.filter((c) => c.deckId === deck.id),
  )
  const inBook = [...data.mistakes.values()].filter((m) => m.inBook && m.deckId === deck.id).length

  return (
    <div className="space-y-5">
      <section className="card relative mt-3">
        <span className="washi-tape absolute -top-[11px] left-10 h-[22px] w-[86px] -rotate-2" style={{ ['--tape' as string]: tapeColor(deck) }} aria-hidden />
        <div className="flex flex-wrap items-center gap-4 p-5 pt-6">
          <span className="grid h-14 w-14 place-items-center rounded-xl border-[1.5px] border-ink bg-washi font-mincho text-3xl font-extrabold" aria-hidden>
            {deckGlyph(deck)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold" data-testid="deck-title">
              {deck.name}
            </h1>
            <p className="text-sm text-muted">
              {countdownText(s.daysLeft) ?? '未設定考試日期'}・每日新卡上限 {s.newLimit}
              {s.newLimit !== deck.dailyNewLimit && `（依考試日期自動提高，原設定 ${deck.dailyNewLimit}）`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => nav(`/practice?decks=${deck.id}${practiceModeParam(deck.id)}`)}>
              練習
            </button>
            <button className="btn-secondary" onClick={() => nav(`/exam?decks=${deck.id}`)}>
              模擬考
            </button>
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              <Pencil size={16} aria-hidden />
              編輯
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="今日待複習" value={<span data-testid="deck-due">{s.dueToday}</span>} sub={`複習 ${s.dueReviews}・新卡 ${s.newAvailable}`} />
        <StatTile label="熟練度" value={pct(s.masteryPct)} sub={`${s.mastery.mastered} / ${s.total} 已熟練`} />
        <StatTile label="正確率" value={<span data-testid="deck-accuracy">{pct(s.accuracy)}</span>} sub={`今天作答 ${s.reviewsToday} 題`} />
        <StatTile label="錯題本" value={inBook} sub={<Link className="underline" to={`/mistakes?deck=${deck.id}`}>查看錯題</Link>} />
      </div>

      <section className="card p-5">
        <h2 className="mb-2 font-bold">整體進度</h2>
        <ProgressBar
          segments={[
            { value: s.mastery.mastered, color: MASTERY_COLORS.mastered, label: '已熟練' },
            { value: s.mastery.learning, color: MASTERY_COLORS.learning, label: '學習中' },
            { value: s.mastery.new, color: MASTERY_COLORS.new, label: '未學' },
          ]}
        />
        <p className="mt-2 text-xs text-muted">
          未學 {s.mastery.new}・學習中 {s.mastery.learning}・已熟練 {s.mastery.mastered}
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">各段熟練度（點一段直接練習）</h2>
        <SectionMasteryList sections={sections} deckId={deck.id} />
      </section>

      <section className="card flex flex-wrap items-center gap-2 p-5">
        <h2 className="mr-auto font-bold">管理</h2>
        <Link className="btn-ghost" to={`/words?deck=${deck.id}`}>
          <List size={16} aria-hidden />
          單字列表
        </Link>
        <Link className="btn-ghost" to={`/import?deck=${deck.id}`}>
          <Download size={16} aria-hidden />
          匯入單字
        </Link>
        <button className="btn-ghost" onClick={() => downloadText(safeFilename(deck.name) + '.csv', deckToCsv(deck.id, data.words, data.entries), 'text/csv')}>
          <FileDown size={16} aria-hidden />
          匯出 CSV
        </button>
        <button className="btn-ghost" onClick={() => downloadText(safeFilename(deck.name) + '.json', deckToJson(deck, data.words, data.entries), 'application/json')}>
          <FileDown size={16} aria-hidden />
          匯出 JSON
        </button>
        <ConfirmButton
          confirmText={`刪除「${deck.name}」？單字庫和它的進度會被刪除（作答紀錄保留）。`}
          onConfirm={async () => {
            await deleteDeck(deck.id)
            nav('/')
          }}
        >
          <Trash2 size={16} aria-hidden />
          刪除單字庫
        </ConfirmButton>
      </section>

      <Modal open={editing} onClose={() => setEditing(false)} title="編輯單字庫">
        <DeckForm
          initial={deck}
          onCancel={() => setEditing(false)}
          onSubmit={async (v) => {
            await updateDeck(deck.id, { ...v, examDate: v.examDate || null })
            setEditing(false)
          }}
        />
      </Modal>
    </div>
  )
}
