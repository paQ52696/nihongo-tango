// 把內建文法題庫加成一個單字庫：每個文法點一張卡，複習排程、錯題本都沿用
import { v5 as uuidv5 } from 'uuid'
import { db } from './schema'
import { createDeck, importDrafts, type ImportResult } from './repo'
import { checkDuplicates, type WordDraft } from '../lib/importer'
import { GRAMMAR_SETS } from '../data/grammar'

const NS = '3b8f6a52-1c7e-4d2a-9f0b-6e5d4c3b2a19'

export const grammarDeckId = (setId: string) => uuidv5('grammar-deck:' + setId, NS)

/** 加入（或更新）內建文法題庫；重複加入只會補上新的文法點，進度不受影響 */
export async function addGrammarSet(setId: string): Promise<ImportResult & { deckId: string }> {
  const set = GRAMMAR_SETS.find((s) => s.id === setId)
  if (!set) throw new Error('找不到這個文法題庫')
  const deckId = grammarDeckId(setId)
  const deck = await db.decks.get(deckId)
  if (!deck || deck.deleted) await createDeck({ id: deckId, name: set.name, icon: '📘', color: '#818cf8' })
  const drafts: WordDraft[] = set.points.map((p, i) => ({
    row: i + 1,
    kanji: p.pattern,
    reading: '',
    pos: '文法',
    meaning: p.meaning,
    example: p.examples[0]?.ja ?? '',
    exampleTranslation: p.examples[0]?.zh ?? '',
    page: null,
    lesson: p.lesson,
    tags: ['文法'],
    note: p.explanation,
    problems: [],
    extra: { kind: 'grammar', grammarId: p.id },
  }))
  const [words, entries] = await Promise.all([db.words.toArray(), db.deckEntries.where('deckId').equals(deckId).toArray()])
  const res = await importDrafts(deckId, checkDuplicates(drafts, words, entries, deckId))
  return { ...res, deckId }
}
