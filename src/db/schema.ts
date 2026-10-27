import Dexie, { type Table } from 'dexie'
import type { Card, Deck, DeckEntry, ReviewLog, Settings, SyncTable, Word } from '../types'

export interface MetaRow {
  key: string
  value: unknown
}

export class AppDB extends Dexie {
  words!: Table<Word, string>
  decks!: Table<Deck, string>
  deckEntries!: Table<DeckEntry, string>
  cards!: Table<Card, string>
  reviewLogs!: Table<ReviewLog, string>
  settings!: Table<Settings, string>
  meta!: Table<MetaRow, string>

  constructor(name = 'nihongo-tango') {
    super(name)
    this.version(1).stores({
      words: 'id, updated_at, _dirty, kanji, reading',
      decks: 'id, updated_at, _dirty',
      deckEntries: 'id, deckId, wordId, [deckId+wordId], updated_at, _dirty',
      cards: 'id, deckId, wordId, [deckId+wordId], due, updated_at, _dirty',
      reviewLogs: 'id, cardId, deckId, wordId, reviewedAt, updated_at, _dirty',
      settings: 'id, _dirty',
      meta: 'key',
    })
  }

  syncTable(name: SyncTable): Table<any, string> {
    return this.table(name)
  }
}

export let db = new AppDB()

/** 測試用：換一個新的資料庫實例 */
export function setDb(next: AppDB) {
  db = next
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row ? (row.value as T) : fallback
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}
