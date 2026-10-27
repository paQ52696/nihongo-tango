// 從 IndexedDB 即時讀取資料，並計算各單字庫的進度
import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { loadAll, getSettings } from '../db/repo'
import { db } from '../db/schema'
import type { Card, Deck, DeckEntry, ReviewLog, Settings, Word } from '../types'
import { computeMistakes, newIntroducedToday, accuracy, type MistakeInfo } from '../lib/stats'
import { examAdjust, masteryLevel, type MasteryLevel } from '../lib/srs'
import { daysUntil, dateKey } from '../lib/dates'

export interface DeckStats {
  total: number
  mastery: Record<MasteryLevel, number>
  masteryPct: number
  dueReviews: number
  newAvailable: number
  dueToday: number
  accuracy: number | null
  daysLeft: number | null
  newLimit: number
  reviewsToday: number
}

export interface AppData {
  words: Word[]
  decks: Deck[]
  entries: DeckEntry[]
  cards: Card[]
  logs: ReviewLog[]
  wordById: Map<string, Word>
  deckById: Map<string, Deck>
  mistakes: Map<string, MistakeInfo>
  deckStats: Map<string, DeckStats>
  tags: string[]
  posList: string[]
}

export function computeDeckStats(deck: Deck, cards: Card[], logs: ReviewLog[], now = new Date()): DeckStats {
  const mine = cards.filter((c) => c.deckId === deck.id)
  const mastery = { new: 0, learning: 0, mastered: 0 }
  mine.forEach((c) => mastery[masteryLevel(c)]++)
  const dueReviews = mine.filter((c) => c.state !== 'new' && new Date(c.due) <= now).length
  const deckLogs = logs.filter((l) => l.deckId === deck.id)
  const daysLeft = daysUntil(deck.examDate, now)
  const adj = examAdjust(daysLeft, deck.dailyNewLimit, mastery.new)
  const introduced = [...newIntroducedToday(deckLogs, dateKey(now))].length
  const newAvailable = Math.max(0, Math.min(mastery.new, adj.newLimit - introduced))
  const today = dateKey(now)
  return {
    total: mine.length,
    mastery,
    masteryPct: mine.length ? mastery.mastered / mine.length : 0,
    dueReviews,
    newAvailable,
    dueToday: dueReviews + newAvailable,
    accuracy: accuracy(deckLogs),
    daysLeft,
    newLimit: adj.newLimit,
    reviewsToday: deckLogs.filter((l) => dateKey(l.reviewedAt) === today).length,
  }
}

export function useAppData(): AppData | undefined {
  const raw = useLiveQuery(loadAll, [])
  return useMemo(() => {
    if (!raw) return undefined
    const wordById = new Map(raw.words.map((w) => [w.id, w]))
    const deckById = new Map(raw.decks.map((d) => [d.id, d]))
    const now = new Date()
    const deckStats = new Map(raw.decks.map((d) => [d.id, computeDeckStats(d, raw.cards, raw.logs, now)]))
    const tags = [...new Set(raw.words.flatMap((w) => w.tags))].sort()
    const posList = [...new Set(raw.words.map((w) => w.pos).filter(Boolean))].sort()
    return { ...raw, wordById, deckById, mistakes: computeMistakes(raw.logs), deckStats, tags, posList }
  }, [raw])
}

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => getSettings(), [], undefined) ?? undefined
}

export function useMeta<T>(key: string, fallback: T): T {
  return (useLiveQuery(async () => ((await db.meta.get(key))?.value as T) ?? fallback, [key]) ?? fallback) as T
}
