import { useState } from 'react'
import { Flame } from 'lucide-react'
import { useAppData, useSettings } from '../hooks/useData'
import { deckGlyph, tapeColor } from '../lib/deckStyle'
import { PageTitle, StatTile, pct } from '../components/ui'
import { Heatmap, LineChart, BarList, SectionMasteryList } from '../components/charts'
import { accuracy, accuracyTrend, computeStreak, dailyCounts, errorDistribution, goalRate, heatmap, longestStreak, masteryBySection } from '../lib/stats'
import { ERROR_LABELS } from '../lib/errorTypes'
import { dateKey } from '../lib/dates'
import type { ErrorType } from '../types'

export function StatsPage() {
  const data = useAppData()
  const settings = useSettings()
  const [deck, setDeck] = useState('all')
  if (!data) return null
  const goal = settings?.dailyGoal ?? 20
  const logs = deck === 'all' ? data.logs : data.logs.filter((l) => l.deckId === deck)
  const counts = dailyCounts(logs)
  const today = counts.get(dateKey())?.total ?? 0
  const trend = accuracyTrend(counts, 30)
  const dist = errorDistribution(logs)
  const decks = deck === 'all' ? data.decks : data.decks.filter((d) => d.id === deck)

  return (
    <div className="space-y-5">
      <PageTitle
        actions={
          <select className="input w-auto" value={deck} onChange={(e) => setDeck(e.target.value)} aria-label="統計範圍" data-testid="stats-deck">
            <option value="all">全部單字庫</option>
            {data.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {deckGlyph(d)}　{d.name}
              </option>
            ))}
          </select>
        }
      >
        學習統計
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="連續學習天數" value={<span data-testid="streak" className="inline-flex items-center gap-1"><Flame size={22} className="text-accent" aria-hidden />{computeStreak(counts)}</span>} sub={`最長 ${longestStreak(counts)} 天`} />
        <StatTile label="今日目標" value={<span data-testid="stats-today">{today} / {goal}</span>} sub={today >= goal ? '已達成' : `還差 ${goal - today} 題`} />
        <StatTile label="近 30 天達成率" value={pct(goalRate(counts, goal, 30))} sub="每日目標達成的天數比例" />
        <StatTile label="總作答 / 正確率" value={<span data-testid="stats-total">{logs.length}</span>} sub={`正確率 ${pct(accuracy(logs))}`} />
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-bold">學習熱力圖（近半年）</h2>
        <Heatmap cols={heatmap(counts, 26, dateKey(), goal)} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-bold">正確率趨勢（近 30 天）</h2>
          <LineChart points={trend.map((t) => ({ label: t.date.slice(5).replace('-', '/'), value: t.accuracy }))} />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-bold">錯誤類型分布</h2>
          <div data-testid="error-dist">
            <BarList items={Object.entries(dist).map(([k, v]) => ({ label: ERROR_LABELS[k as ErrorType], value: v! })).sort((a, b) => b.value - a.value)} />
          </div>
        </section>
      </div>

      {decks.map((d) => (
        <section key={d.id} className="card p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-lg border-[1.5px] border-ink font-mincho text-sm font-extrabold" style={{ background: tapeColor(d) }} aria-hidden>
              {deckGlyph(d)}
            </span>
            {d.name}：各段熟練度
          </h2>
          <SectionMasteryList
            deckId={d.id}
            sections={masteryBySection(
              data.entries.filter((e) => e.deckId === d.id),
              data.cards.filter((c) => c.deckId === d.id),
            )}
          />
        </section>
      ))}
    </div>
  )
}
