// 把內建練習題庫（動詞變化、形容詞變化、數字・量詞）加成單字庫；做法和內建文法題庫相同
import { v5 as uuidv5 } from 'uuid'
import { db } from './schema'
import { createDeck, importDrafts, type ImportResult } from './repo'
import { checkDuplicates, type WordDraft } from '../lib/importer'
import { DRILL_SETS, type DrillSetId } from '../data/drills'

const NS = '8c2d4e6f-0a1b-4c3d-9e5f-7a6b5c4d3e21'

export const drillDeckId = (setId: DrillSetId) => uuidv5('drill-deck:' + setId, NS)

/** 加入（或更新）內建練習題庫；重複加入只會補上新的項目，進度不受影響 */
export async function addDrillSet(setId: DrillSetId): Promise<ImportResult & { deckId: string }> {
  const set = DRILL_SETS.find((s) => s.id === setId)
  if (!set) throw new Error('找不到這個題庫')
  const deckId = drillDeckId(setId)
  const deck = await db.decks.get(deckId)
  if (!deck || deck.deleted) await createDeck({ id: deckId, name: set.name, icon: set.icon, color: set.color })
  const drafts: WordDraft[] = set.words.map((w, i) => ({
    row: i + 1,
    kanji: w.kanji,
    reading: w.reading,
    pos: w.pos,
    meaning: w.meaning,
    example: '',
    exampleTranslation: '',
    page: null,
    lesson: null,
    tags: [set.name],
    note: w.note ?? '',
    problems: [],
    extra: w.counterId ? { kind: 'counter', counterId: w.counterId } : undefined,
  }))
  const [words, entries] = await Promise.all([db.words.toArray(), db.deckEntries.where('deckId').equals(deckId).toArray()])
  const res = await importDrafts(deckId, checkDuplicates(drafts, words, entries, deckId))
  return { ...res, deckId }
}

/** 這個單字庫是不是內建練習題庫；是的話回傳該練的題型 */
export function drillModeOf(deckId: string) {
  return DRILL_SETS.find((s) => drillDeckId(s.id) === deckId)?.mode
}

/** 從首頁、單字庫頁按「練習」時：內建練習題庫直接選好對應的題型 */
export function practiceModeParam(deckId: string): string {
  const mode = drillModeOf(deckId)
  return mode ? '&mode=' + mode : ''
}
