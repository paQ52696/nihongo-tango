// 練習範圍篩選與選卡
import type { Card, DeckEntry, Word } from '../types'
import type { MistakeInfo } from './stats'
import { shuffle } from './distractors'

export type Scope =
  | { kind: 'all' }
  | { kind: 'pages'; from: number; to: number }
  | { kind: 'lessons'; lessons: string[] }
  | { kind: 'tags'; tags: string[] }
  | { kind: 'pos'; pos: string[] }
  | { kind: 'mistakes' }
  | { kind: 'due' }

export const SCOPE_LABELS: Record<Scope['kind'], string> = {
  all: '全部',
  pages: '頁數範圍',
  lessons: '課次／章節',
  tags: '標籤',
  pos: '詞性',
  mistakes: '只練錯題',
  due: '只練今天到期',
}

export interface SelectInput {
  cards: Card[]
  entries: DeckEntry[]
  words: Map<string, Word>
  mistakes: Map<string, MistakeInfo>
  scope: Scope
  count: number
  now: Date
  /** 每個單字庫今天還能學幾張新卡 */
  newAllowance: Map<string, number>
  rng: () => number
  eligible?: (w: Word) => boolean
}

export function inScope(card: Card, entry: DeckEntry | undefined, word: Word, scope: Scope, mistakes: Map<string, MistakeInfo>, now: Date): boolean {
  switch (scope.kind) {
    case 'all':
      return true
    case 'pages':
      return entry?.page != null && entry.page >= scope.from && entry.page <= scope.to
    case 'lessons':
      return !!entry?.lesson && scope.lessons.includes(entry.lesson)
    case 'tags':
      return scope.tags.some((t) => word.tags.includes(t))
    case 'pos':
      return scope.pos.includes(word.pos)
    case 'mistakes':
      return !!mistakes.get(card.id)?.inBook
    case 'due':
      return card.state === 'new' || new Date(card.due) <= now
  }
}

/** 選卡：到期的複習卡優先 → 新卡（依單字庫順序；「只練到期」時受每日上限限制）→ 其餘最快到期的；最後打亂順序 */
export function selectCards(input: SelectInput): Card[] {
  const { cards, entries, words, mistakes, scope, count, now, rng } = input
  const entryByKey = new Map(entries.filter((e) => !e.deleted).map((e) => [e.deckId + '|' + e.wordId, e]))
  const allowance = new Map(input.newAllowance)
  const seenWords = new Set<string>()
  const candidates = cards.filter((c) => {
    if (c.deleted) return false
    const w = words.get(c.wordId)
    const e = entryByKey.get(c.deckId + '|' + c.wordId)
    if (!w || w.deleted || !e) return false
    if (input.eligible && !input.eligible(w)) return false
    return inScope(c, e, w, scope, mistakes, now)
  })
  const order = (c: Card) => entryByKey.get(c.deckId + '|' + c.wordId)?.order ?? 0
  const isDue = (c: Card) => c.state !== 'new' && new Date(c.due) <= now
  const due = candidates.filter(isDue).sort((a, b) => a.due.localeCompare(b.due))
  const fresh = candidates.filter((c) => c.state === 'new').sort((a, b) => order(a) - order(b))
  const rest = candidates.filter((c) => c.state !== 'new' && !isDue(c)).sort((a, b) => a.due.localeCompare(b.due))

  const picked: Card[] = []
  const take = (c: Card) => {
    if (picked.length >= count || seenWords.has(c.wordId)) return
    seenWords.add(c.wordId)
    picked.push(c)
  }
  due.forEach(take)
  const limitNew = scope.kind === 'due'
  for (const c of fresh) {
    if (picked.length >= count) break
    if (limitNew) {
      const left = allowance.get(c.deckId) ?? 0
      if (left <= 0) continue
      allowance.set(c.deckId, left - 1)
    }
    take(c)
  }
  if (scope.kind !== 'due') rest.forEach(take)
  return shuffle(picked, rng)
}
