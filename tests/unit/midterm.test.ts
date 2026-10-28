// 期中考資料（data/midterm/，不進 git）：檔案存在時檢查轉錄格式、出題與動詞變化
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { guessKind, guessMapping, parseCsv, parseJson, rowsToDrafts } from '../../src/lib/importer'
import { canAsk, buildQuestion } from '../../src/lib/questions'
import { teForm, verbInfo } from '../../src/lib/conjugate'
import { chunksOf, particleSlots } from '../../src/lib/sentences'
import { makeRng } from '../../src/lib/distractors'
import type { Word } from '../../src/types'

const SENT = 'data/midterm/sentences13-16.csv'
const VOCAB = 'data/midterm/vocab13-16.json'

const asWord = (d: ReturnType<typeof rowsToDrafts>[number], i: number): Word =>
  ({ id: 'w' + i, updated_at: '', deleted: false, favorite: false, kanji: d.kanji, reading: d.reading, pos: d.pos, meaning: d.meaning, example: d.example, exampleTranslation: d.exampleTranslation, tags: d.tags, ...d.extra }) as Word

describe.skipIf(!existsSync(SENT))('期中考課文句子', () => {
  // describe.skipIf 跳過時這段仍會執行（收集測試），所以檔案不存在時給空表（GitHub 上沒有 data/）
  const t = existsSync(SENT) ? parseCsv(readFileSync(SENT, 'utf8')) : { headers: [], rows: [] }
  const drafts = rowsToDrafts(t, guessMapping(t.headers), guessKind(t))
  const words = drafts.map(asWord)

  it('自動判斷成課文句子，每一句都有日文、中文、課次，讀音文節數一致', () => {
    expect(guessKind(t)).toBe('sentence')
    for (const d of drafts) {
      expect(d.problems, `第 ${d.row} 列 ${d.kanji}`).toEqual([])
      expect(d.lesson).toMatch(/^第1[3-6]課$/)
    }
    expect(drafts.length).toBeGreaterThan(80)
  })

  it('每句都能出中翻日；大部分能出重組與助詞題', () => {
    expect(words.every((w) => canAsk('zh2ja', w) && canAsk('ja2zh', w))).toBe(true)
    expect(words.filter((w) => canAsk('reorder', w)).length).toBeGreaterThan(60)
    expect(words.filter((w) => canAsk('particle', w)).length).toBeGreaterThan(60)
  })

  it('助詞題不會挖到固定說法（それから、あとで、次に、すみませんが）', () => {
    for (const w of words)
      for (const s of particleSlots(w)) expect(['それから', 'あとで', '次に', 'すみませんが'], w.kanji).not.toContain(chunksOf(w)[s.index].replace(/[、。]$/, ''))
  })
})

describe.skipIf(!existsSync(VOCAB))('期中考單字', () => {
  const t = existsSync(VOCAB) ? parseJson(readFileSync(VOCAB, 'utf8')) : { headers: [], rows: [] }
  const drafts = rowsToDrafts(t, guessMapping(t.headers), 'word')
  const words = drafts.map(asWord)

  it('欄位齊全', () => {
    for (const d of drafts) expect(d.problems, d.reading).toEqual([])
    expect(drafts.length).toBeGreaterThan(130)
  })

  it('ます形動詞依標的分組變成て形', () => {
    // 同漢字不同讀音（降ります：ふります／おります）用「漢字・讀音」當 key
    const te = Object.fromEntries(words.filter((w) => verbInfo(w)).map((w) => [w.kanji === '降ります' ? w.reading : w.kanji || w.reading, teForm(verbInfo(w)!)]))
    expect(te).toMatchObject({
      遊びます: 'あそんで',
      泳ぎます: 'およいで',
      迎えます: 'むかえて',
      散歩します: 'さんぽして',
      つけます: 'つけて',
      消します: 'けして',
      待ちます: 'まって',
      手伝います: 'てつだって',
      入ります: 'はいって',
      出ます: 'でて',
      ふります: 'ふって', // 第14課 降ります（下雨）
      おります: 'おりて', // 第16課 降ります（下車）
      知ります: 'しって',
      いらっしゃいます: 'いらっしゃって',
      浴びます: 'あびて',
      見学します: 'けんがくして',
      コピーします: 'こぴーして',
    })
    expect(Object.keys(te).length).toBe(49) // 第13–16課的動詞（含會話）
  })

  it('動詞變化題用ます形出題', () => {
    const w = words.find((x) => x.kanji === '遊びます')!
    const q = buildQuestion('conjugate', { id: 'c', deckId: 'd', wordId: w.id }, w, [], makeRng(1), {})
    expect(q.prompt).toBe('遊びます（あそびます）')
    expect(q.answer).toBe('あそんで')
    expect(q.explain).toContain('第 I 類')
  })
})
