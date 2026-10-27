// 統計與錯題本：全部從 ReviewLog（只新增）推算，跨裝置合併後結果一致
import type { Card, DeckEntry, ErrorType, ReviewLog } from '../types'
import { addDays, dateKey, diffDays } from './dates'
import { masteryLevel, type MasteryLevel } from './srs'

export const MISTAKE_CLEAR_STREAK = 3

export interface MistakeInfo {
  cardId: string
  wordId: string
  deckId: string
  wrongCount: number
  streak: number // 最後一次答錯之後連續答對幾次
  lastWrongAt: string
  lastChosen: string | null
  wrongChoices: string[]
  errorTypes: Partial<Record<ErrorType, number>>
  inBook: boolean
}

const byTime = (a: ReviewLog, b: ReviewLog) => (a.reviewedAt < b.reviewedAt ? -1 : a.reviewedAt > b.reviewedAt ? 1 : a.id < b.id ? -1 : 1)

/** 錯題本：答錯自動收錄，之後連續答對 3 次才移出 */
export function computeMistakes(logs: ReviewLog[]): Map<string, MistakeInfo> {
  const map = new Map<string, MistakeInfo>()
  for (const l of logs.filter((x) => !x.deleted).sort(byTime)) {
    let m = map.get(l.cardId)
    if (!l.correct) {
      if (!m) {
        m = { cardId: l.cardId, wordId: l.wordId, deckId: l.deckId, wrongCount: 0, streak: 0, lastWrongAt: l.reviewedAt, lastChosen: null, wrongChoices: [], errorTypes: {}, inBook: true }
        map.set(l.cardId, m)
      }
      m.wrongCount++
      m.streak = 0
      m.lastWrongAt = l.reviewedAt
      m.lastChosen = l.chosen
      if (l.chosen && !m.wrongChoices.includes(l.chosen)) m.wrongChoices.push(l.chosen)
      if (l.errorType) m.errorTypes[l.errorType] = (m.errorTypes[l.errorType] ?? 0) + 1
      m.inBook = true
    } else if (m) {
      m.streak++
      if (m.streak >= MISTAKE_CLEAR_STREAK) m.inBook = false
    }
  }
  return map
}

export interface DayCount {
  total: number
  correct: number
}

export function dailyCounts(logs: ReviewLog[]): Map<string, DayCount> {
  const map = new Map<string, DayCount>()
  for (const l of logs) {
    if (l.deleted) continue
    const k = dateKey(l.reviewedAt)
    const c = map.get(k) ?? { total: 0, correct: 0 }
    c.total++
    if (l.correct) c.correct++
    map.set(k, c)
  }
  return map
}

/** 連續學習天數：今天還沒練也不會斷（算到昨天） */
export function computeStreak(counts: Map<string, DayCount>, today: string = dateKey()): number {
  let day = counts.get(today)?.total ? today : addDays(today, -1)
  let n = 0
  while (counts.get(day)?.total) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export function longestStreak(counts: Map<string, DayCount>): number {
  const days = [...counts.entries()].filter(([, c]) => c.total > 0).map(([k]) => k).sort()
  let best = 0
  let cur = 0
  for (let i = 0; i < days.length; i++) {
    cur = i > 0 && diffDays(days[i - 1], days[i]) === 1 ? cur + 1 : 1
    best = Math.max(best, cur)
  }
  return best
}

export interface HeatCell {
  date: string
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

/** GitHub 式熱力圖：回傳 weeks 欄，每欄 7 天（週日開始） */
export function heatmap(counts: Map<string, DayCount>, weeks = 26, today: string = dateKey(), goal = 20): HeatCell[][] {
  const t = new Date(today + 'T00:00:00')
  const start = addDays(today, -(weeks - 1) * 7 - t.getDay())
  const cols: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d)
      if (diffDays(date, today) < 0) break
      const count = counts.get(date)?.total ?? 0
      const ratio = count / Math.max(1, goal)
      const level = count === 0 ? 0 : ratio < 0.34 ? 1 : ratio < 0.67 ? 2 : ratio < 1 ? 3 : 4
      col.push({ date, count, level: level as HeatCell['level'] })
    }
    cols.push(col)
  }
  return cols
}

export function accuracyTrend(counts: Map<string, DayCount>, days = 30, today: string = dateKey()) {
  const out: { date: string; accuracy: number | null; total: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const c = counts.get(date)
    out.push({ date, total: c?.total ?? 0, accuracy: c && c.total ? c.correct / c.total : null })
  }
  return out
}

/** 過去 N 天有幾天達成每日目標 */
export function goalRate(counts: Map<string, DayCount>, goal: number, days = 30, today: string = dateKey()): number {
  let hit = 0
  for (let i = 0; i < days; i++) if ((counts.get(addDays(today, -i))?.total ?? 0) >= goal) hit++
  return hit / days
}

export function errorDistribution(logs: ReviewLog[]): Partial<Record<ErrorType, number>> {
  const out: Partial<Record<ErrorType, number>> = {}
  for (const l of logs) if (!l.deleted && !l.correct && l.errorType) out[l.errorType] = (out[l.errorType] ?? 0) + 1
  return out
}

export function accuracy(logs: ReviewLog[]): number | null {
  const valid = logs.filter((l) => !l.deleted)
  if (!valid.length) return null
  return valid.filter((l) => l.correct).length / valid.length
}

/** 今天已經開始學的新卡（第一次作答在今天） */
export function newIntroducedToday(logs: ReviewLog[], today: string = dateKey()): Set<string> {
  const first = new Map<string, string>()
  for (const l of logs) {
    if (l.deleted) continue
    const prev = first.get(l.cardId)
    if (!prev || l.reviewedAt < prev) first.set(l.cardId, l.reviewedAt)
  }
  const out = new Set<string>()
  for (const [id, t] of first) if (dateKey(t) === today) out.add(id)
  return out
}

export interface SectionMastery {
  key: string
  label: string
  sort: number
  counts: Record<MasteryLevel, number>
}

/** 依頁碼或課次分段的熟練度 */
export function masteryBySection(entries: DeckEntry[], cards: Card[]): SectionMastery[] {
  const cardByKey = new Map(cards.filter((c) => !c.deleted).map((c) => [c.deckId + '|' + c.wordId, c]))
  const map = new Map<string, SectionMastery>()
  for (const e of entries) {
    if (e.deleted) continue
    const card = cardByKey.get(e.deckId + '|' + e.wordId)
    if (!card) continue
    const key = e.page != null ? `p${e.page}` : e.lesson ? `l:${e.lesson}` : 'none'
    const label = e.page != null ? `p.${e.page}` : e.lesson ? e.lesson : '未分類'
    const sort = e.page != null ? e.page : e.lesson ? 10000 + (parseInt(e.lesson.replace(/\D/g, '')) || 0) : 99999
    const s = map.get(key) ?? { key, label, sort, counts: { new: 0, learning: 0, mastered: 0 } }
    s.counts[masteryLevel(card)]++
    map.set(key, s)
  }
  return [...map.values()].sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
}
