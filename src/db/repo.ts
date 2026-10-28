// 所有寫入都經過這裡：自動補 updated_at、標記 _dirty=1（待上傳），並通知同步引擎
import Dexie from 'dexie'
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import { db } from './schema'
import type { Card, Deck, DeckEntry, ErrorType, QuestionMode, Rating, ReviewLog, Settings, SyncFields, Word } from '../types'
import { newCardFields, schedule, examAdjust } from '../lib/srs'
import { daysUntil } from '../lib/dates'
import { wordKey, type DraftCheck } from '../lib/importer'

const NS = '6f1c2a4e-8b7d-4c3a-9e5f-1a2b3c4d5e6f'

export const newId = () => uuidv4()
export const wordIdFor = (w: { kanji: string; reading: string }) => uuidv5('word:' + wordKey(w), NS)
export const entryIdFor = (deckId: string, wordId: string) => uuidv5('entry:' + deckId + '|' + wordId, NS)
export const cardIdFor = (deckId: string, wordId: string) => uuidv5('card:' + deckId + '|' + wordId, NS)

// ---------- 時間戳記（同一毫秒內多次寫入也保證遞增） ----------
let lastStamp = 0
export function nowIso(): string {
  let t = Date.now()
  if (t <= lastStamp) t = lastStamp + 1
  lastStamp = t
  return new Date(t).toISOString()
}

type Listener = () => void
const listeners = new Set<Listener>()
export function onLocalChange(fn: Listener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function notifyChange() {
  // 在交易裡被呼叫時（例如示範資料一次寫入），等交易提交後再通知：
  // 否則監聽者的讀取會跑進這個交易，碰到交易沒包含的資料表就會丟 NotFoundError
  const fire = () => Dexie.ignoreTransaction(() => listeners.forEach((fn) => fn()))
  const tx = Dexie.currentTransaction
  if (tx) tx.on('complete', fire)
  else fire()
}

export function stamp<T extends SyncFields>(row: Omit<T, 'updated_at' | '_dirty'> & Partial<SyncFields>): T {
  return { ...row, updated_at: nowIso(), _dirty: 1, deleted: row.deleted ?? false } as T
}

export const DEFAULT_SETTINGS: Omit<Settings, 'updated_at'> = {
  id: 'settings',
  deleted: false,
  dailyGoal: 20,
  ttsEnabled: true,
  ttsRate: 0.9,
  autoPlay: false,
}

// ---------- 設定 ----------
export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return { ...DEFAULT_SETTINGS, updated_at: '', ...(s ?? {}) }
}

export async function updateSettings(patch: Partial<Settings>) {
  const cur = await getSettings()
  await db.settings.put(stamp<Settings>({ ...cur, ...patch, id: 'settings' }))
  notifyChange()
}

// ---------- 單字庫 ----------
export const DECK_COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#fb923c', '#f87171', '#2dd4bf']
export const DECK_ICONS = ['🌸', '📘', '📝', '🎌', '🍡', '🗻', '⛩️', '🍵', '🐱', '⭐', '🎯', '📚']

export async function createDeck(input: Partial<Deck> & { name: string }): Promise<Deck> {
  const count = await db.decks.count()
  const deck = stamp<Deck>({
    id: input.id ?? newId(),
    name: input.name.trim() || '未命名單字庫',
    color: input.color ?? DECK_COLORS[count % DECK_COLORS.length],
    icon: input.icon ?? DECK_ICONS[count % DECK_ICONS.length],
    examDate: input.examDate ?? null,
    dailyNewLimit: input.dailyNewLimit ?? 20,
    sortOrder: input.sortOrder ?? count,
    createdAt: input.createdAt ?? new Date().toISOString(),
    deleted: false,
  })
  await db.decks.put(deck)
  notifyChange()
  return deck
}

export async function updateDeck(id: string, patch: Partial<Deck>) {
  const cur = await db.decks.get(id)
  if (!cur) return
  await db.decks.put(stamp<Deck>({ ...cur, ...patch, id }))
  notifyChange()
}

/** 軟刪除單字庫：連同它的 DeckEntry、Card 一起標記刪除（作答紀錄保留） */
export async function deleteDeck(id: string) {
  await db.transaction('rw', db.decks, db.deckEntries, db.cards, async () => {
    const cur = await db.decks.get(id)
    if (cur) await db.decks.put(stamp<Deck>({ ...cur, deleted: true }))
    const entries = await db.deckEntries.where('deckId').equals(id).toArray()
    await db.deckEntries.bulkPut(entries.map((e) => stamp<DeckEntry>({ ...e, deleted: true })))
    const cards = await db.cards.where('deckId').equals(id).toArray()
    await db.cards.bulkPut(cards.map((c) => stamp<Card>({ ...c, deleted: true })))
  })
  notifyChange()
}

// ---------- 單字 ----------
export async function updateWord(id: string, patch: Partial<Word>) {
  const cur = await db.words.get(id)
  if (!cur) return
  await db.words.put(stamp<Word>({ ...cur, ...patch, id }))
  notifyChange()
}

export async function toggleFavorite(id: string) {
  const cur = await db.words.get(id)
  if (cur) await updateWord(id, { favorite: !cur.favorite })
}

export async function batchTags(wordIds: string[], add: string[], remove: string[]) {
  const words = await db.words.bulkGet(wordIds)
  const next = words
    .filter((w): w is Word => !!w)
    .map((w) => {
      const tags = new Set(w.tags)
      add.forEach((t) => t.trim() && tags.add(t.trim()))
      remove.forEach((t) => tags.delete(t))
      return stamp<Word>({ ...w, tags: [...tags] })
    })
  await db.words.bulkPut(next)
  notifyChange()
}

/** 把單字加進單字庫：建立 DeckEntry 與該庫專屬的 Card（已存在就只更新位置資訊） */
export async function addWordToDeck(deckId: string, wordId: string, pos: { page?: number | null; lesson?: string | null; order?: number } = {}) {
  const eid = entryIdFor(deckId, wordId)
  const cid = cardIdFor(deckId, wordId)
  const [entry, card] = await Promise.all([db.deckEntries.get(eid), db.cards.get(cid)])
  const order = pos.order ?? entry?.order ?? (await db.deckEntries.where('deckId').equals(deckId).count())
  await db.deckEntries.put(
    stamp<DeckEntry>({
      id: eid,
      deckId,
      wordId,
      page: pos.page !== undefined && pos.page !== null ? pos.page : (entry?.page ?? null),
      lesson: pos.lesson ? pos.lesson : (entry?.lesson ?? null),
      order,
      deleted: false,
    }),
  )
  if (!card) await db.cards.put(stamp<Card>({ id: cid, deckId, wordId, ...newCardFields(), deleted: false }))
  else if (card.deleted) await db.cards.put(stamp<Card>({ ...card, deleted: false }))
}

export async function removeFromDeck(deckId: string, wordIds: string[]) {
  await db.transaction('rw', db.deckEntries, db.cards, async () => {
    for (const wid of wordIds) {
      const e = await db.deckEntries.get(entryIdFor(deckId, wid))
      if (e) await db.deckEntries.put(stamp<DeckEntry>({ ...e, deleted: true }))
      const c = await db.cards.get(cardIdFor(deckId, wid))
      if (c) await db.cards.put(stamp<Card>({ ...c, deleted: true }))
    }
  })
  notifyChange()
}

/** 複製到其他單字庫（新庫的進度從頭開始）；move=true 時同時從原庫移除 */
export async function copyWordsToDeck(fromDeck: string, toDeck: string, wordIds: string[], move = false) {
  await db.transaction('rw', db.deckEntries, db.cards, async () => {
    for (const wid of wordIds) {
      const e = await db.deckEntries.get(entryIdFor(fromDeck, wid))
      await addWordToDeck(toDeck, wid, { page: e?.page ?? null, lesson: e?.lesson ?? null })
    }
  })
  if (move && fromDeck !== toDeck) await removeFromDeck(fromDeck, wordIds)
  notifyChange()
}

// ---------- 匯入 ----------
export type DupDecision = 'merge' | 'separate'

export interface ImportResult {
  added: number
  merged: number
  separate: number
  skipped: number
}

export async function importDrafts(deckId: string, checks: DraftCheck[], decision: DupDecision | ((c: DraftCheck) => DupDecision) = 'merge'): Promise<ImportResult> {
  const res: ImportResult = { added: 0, merged: 0, separate: 0, skipped: 0 }
  // 先整批讀出、在記憶體算好，最後一次 bulkPut（Safari 的 IndexedDB 逐筆寫入很慢）
  await db.transaction('rw', db.words, db.deckEntries, db.cards, async () => {
    const entries = new Map((await db.deckEntries.where('deckId').equals(deckId).toArray()).map((e) => [e.id, e]))
    const cards = new Map((await db.cards.where('deckId').equals(deckId).toArray()).map((c) => [c.id, c]))
    const detIds = checks.map((c) => wordIdFor(c.draft))
    // 用一次 getAll 讀全部 id（比逐筆 bulkGet 少很多次 IndexedDB 請求）
    const wanted = new Set(detIds)
    const takenIds = new Set((await db.words.toCollection().primaryKeys()).filter((id) => wanted.has(id)))
    let order = [...entries.values()].filter((e) => !e.deleted).length
    const wordsOut = new Map<string, Word>()
    const entriesOut: DeckEntry[] = []
    const cardsOut: Card[] = []
    const now = newCardFields()

    const link = (wordId: string, page: number | null, lesson: string | null) => {
      const eid = entryIdFor(deckId, wordId)
      const cid = cardIdFor(deckId, wordId)
      const prev = entries.get(eid)
      entriesOut.push(
        stamp<DeckEntry>({
          id: eid,
          deckId,
          wordId,
          page: page ?? prev?.page ?? null,
          lesson: lesson ?? prev?.lesson ?? null,
          order: prev && !prev.deleted ? prev.order : order++,
          deleted: false,
        }),
      )
      const card = cards.get(cid)
      if (!card) cardsOut.push(stamp<Card>({ id: cid, deckId, wordId, ...now, deleted: false }))
      else if (card.deleted) cardsOut.push(stamp<Card>({ ...card, deleted: false }))
    }

    checks.forEach((c, i) => {
      const d = c.draft
      if (c.status === 'invalid' || c.status === 'dupInFile') {
        res.skipped++
        return
      }
      if (c.status === 'inDeck' && c.existing) {
        // 已在這個單字庫：只補上缺的位置資訊
        link(c.existing.id, d.page, d.lesson)
        res.skipped++
        return
      }
      const fields = {
        kanji: d.kanji,
        reading: d.reading,
        pos: d.pos,
        meaning: d.meaning,
        example: d.example,
        exampleTranslation: d.exampleTranslation,
        note: d.note ?? '',
        ...d.extra,
      }
      let wordId: string
      const choice = typeof decision === 'function' ? decision(c) : decision
      if (c.status === 'existing' && c.existing && choice === 'merge') {
        const w = wordsOut.get(c.existing.id) ?? c.existing
        const merged: Word = { ...w }
        for (const [k, v] of Object.entries(fields)) if (!(merged as any)[k] && v) (merged as any)[k] = v
        merged.tags = [...new Set([...w.tags, ...d.tags])]
        wordsOut.set(w.id, stamp<Word>(merged))
        wordId = w.id
        res.merged++
      } else {
        const detId = detIds[i]
        const taken = c.status === 'existing' || takenIds.has(detId) || wordsOut.has(detId)
        wordId = taken ? newId() : detId
        wordsOut.set(wordId, stamp<Word>({ id: wordId, ...fields, tags: d.tags, favorite: false, deleted: false }))
        if (c.status === 'existing') res.separate++
        else res.added++
      }
      link(wordId, d.page, d.lesson)
    })
    await db.words.bulkPut([...wordsOut.values()])
    await db.deckEntries.bulkPut(entriesOut)
    await db.cards.bulkPut(cardsOut)
  })
  notifyChange()
  return res
}

// ---------- 作答 ----------
export interface AnswerInput {
  cardId: string
  deckId: string
  wordId: string
  mode: QuestionMode
  prompt: string
  answer: string
  chosen: string | null
  options: string[]
  correct: boolean
  errorType: ErrorType | null
  rating: Rating | null
  durationMs: number
  source: 'practice' | 'exam'
  sessionId: string
  now?: Date
}

/** 記錄一次作答（先寫本機），有自評就更新該卡的 SRS 排程 */
export async function recordAnswer(a: AnswerInput): Promise<ReviewLog> {
  const now = a.now ?? new Date()
  const log = stamp<ReviewLog>({
    id: newId(),
    cardId: a.cardId,
    deckId: a.deckId,
    wordId: a.wordId,
    mode: a.mode,
    prompt: a.prompt,
    answer: a.answer,
    chosen: a.chosen,
    options: a.options,
    correct: a.correct,
    errorType: a.errorType,
    rating: a.rating,
    durationMs: Math.round(a.durationMs),
    reviewedAt: now.toISOString(),
    source: a.source,
    sessionId: a.sessionId,
    deleted: false,
  })
  await db.transaction('rw', db.reviewLogs, db.cards, db.decks, async () => {
    await db.reviewLogs.add(log)
    if (a.rating) {
      const card = await db.cards.get(a.cardId)
      const deck = await db.decks.get(a.deckId)
      if (card) {
        const adj = examAdjust(daysUntil(deck?.examDate, now), deck?.dailyNewLimit ?? 20, 0)
        const next = schedule(card, a.rating, now, { retention: adj.retention, maxInterval: adj.maxInterval })
        await db.cards.put(stamp<Card>({ ...card, ...next }))
      }
    }
  })
  notifyChange()
  return log
}

/** 讀取所有未刪除資料（資料量小，整包載入記憶體計算） */
export async function loadAll() {
  const [words, decks, entries, cards, logs] = await Promise.all([
    db.words.toArray(),
    db.decks.toArray(),
    db.deckEntries.toArray(),
    db.cards.toArray(),
    db.reviewLogs.toArray(),
  ])
  return {
    words: words.filter((w) => !w.deleted),
    decks: decks.filter((d) => !d.deleted).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    entries: entries.filter((e) => !e.deleted),
    cards: cards.filter((c) => !c.deleted),
    logs: logs.filter((l) => !l.deleted),
  }
}
