import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppData } from '../hooks/useData'
import { DeckTag, Empty, PageTitle, Segmented } from '../components/ui'
import { BarList } from '../components/charts'
import { ERROR_LABELS } from '../lib/errorTypes'
import { MISTAKE_CLEAR_STREAK } from '../lib/stats'
import type { ErrorType } from '../types'
import { audioSupported, playWord } from '../lib/browser'

export function MistakesPage() {
  const data = useAppData()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [deck, setDeck] = useState(params.get('deck') ?? 'all')
  const [sort, setSort] = useState<'count' | 'recent'>('count')
  if (!data) return null

  const items = [...data.mistakes.values()]
    .filter((m) => m.inBook && (deck === 'all' || m.deckId === deck) && data.wordById.has(m.wordId) && data.deckById.has(m.deckId))
    .sort((a, b) => (sort === 'count' ? b.wrongCount - a.wrongCount || b.lastWrongAt.localeCompare(a.lastWrongAt) : b.lastWrongAt.localeCompare(a.lastWrongAt)))

  const dist: Partial<Record<ErrorType, number>> = {}
  for (const m of items) for (const [k, v] of Object.entries(m.errorTypes)) dist[k as ErrorType] = (dist[k as ErrorType] ?? 0) + v!
  const top = Object.entries(dist).sort((a, b) => b[1]! - a[1]!)[0]

  const practice = () => {
    const decks = deck === 'all' ? [...new Set(items.map((m) => m.deckId))] : [deck]
    nav(`/practice?decks=${decks.join(',')}&scope=mistakes&count=50&autostart=1`)
  }

  return (
    <div className="space-y-4">
      <PageTitle
        actions={
          <button className="btn-primary" disabled={!items.length} onClick={practice} data-testid="practice-mistakes">
            ✏️ 針對錯題練習
          </button>
        }
      >
        錯題本
      </PageTitle>
      <div className="flex flex-wrap items-center gap-3">
        <select className="input w-auto" value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="篩選單字庫">
          <option value="all">全部單字庫</option>
          {data.decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.icon} {d.name}
            </option>
          ))}
        </select>
        <Segmented
          label="排序"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'count', label: '依錯誤次數' },
            { value: 'recent', label: '依最近答錯' },
          ]}
        />
        <span className="text-sm text-ink-600 dark:text-lav-300" data-testid="mistake-count">
          共 {items.length} 題
        </span>
      </div>

      {items.length === 0 ? (
        <Empty>錯題本是空的！答錯的題目會自動收錄，連續答對 {MISTAKE_CLEAR_STREAK} 次就會移出。</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <ul className="space-y-2" data-testid="mistake-list">
            {items.map((m) => {
              const w = data.wordById.get(m.wordId)!
              const d = data.deckById.get(m.deckId)!
              return (
                <li key={m.cardId} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4" data-testid="mistake-item">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="jp text-2xl font-bold">{w.kanji || w.reading}</span>
                      <span className="jp text-lg text-emerald-700 dark:text-emerald-300">{w.reading}</span>
                      <span className="text-sm">{w.meaning}</span>
                      {audioSupported() && (
                        <button className="btn-ghost px-1.5 py-0" aria-label="發音" onClick={() => playWord(w)}>
                          🔊
                        </button>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <DeckTag deck={d} small />
                      {m.wrongChoices.length > 0 && (
                        <span>
                          我選過：
                          {m.wrongChoices.map((c) => (
                            <span key={c} className="jp mr-1 rounded bg-red-50 px-1.5 text-red-700 line-through dark:bg-red-950 dark:text-red-300">
                              {c}
                            </span>
                          ))}
                        </span>
                      )}
                      {Object.entries(m.errorTypes).map(([k, v]) => (
                        <span key={k} className="rounded-full bg-lav-100 px-2 text-xs dark:bg-ink-600">
                          {ERROR_LABELS[k as ErrorType]} ×{v}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="font-bold text-red-600 dark:text-red-300">錯 {m.wrongCount} 次</div>
                    <div className="text-xs text-ink-600 dark:text-lav-300" aria-label={`連續答對 ${m.streak} 次`}>
                      連續答對 {'●'.repeat(m.streak)}
                      {'○'.repeat(MISTAKE_CLEAR_STREAK - m.streak)}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          <aside className="card h-fit space-y-3 p-5">
            <h2 className="font-bold">我最常犯的錯</h2>
            {top && (
              <p className="rounded-xl bg-sakura-100 p-3 text-sm dark:bg-ink-700">
                最常見：<strong>{ERROR_LABELS[top[0] as ErrorType]}</strong>（{top[1]} 次）
              </p>
            )}
            <BarList items={Object.entries(dist).map(([k, v]) => ({ label: ERROR_LABELS[k as ErrorType], value: v! })).sort((a, b) => b.value - a.value)} />
          </aside>
        </div>
      )}
    </div>
  )
}
