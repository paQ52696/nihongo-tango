// 用 data/ 裡的真實檔案跑一次完整匯入（檔案不存在就略過；data/ 不會進 git）
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { AppDB, setDb, db } from '../../src/db/schema'
import { createDeck, importDrafts, loadAll } from '../../src/db/repo'
import { checkDuplicates, guessMapping, parseFile, rowsToDrafts } from '../../src/lib/importer'
import { buildKanjiDict, generateReadingDistractors, primaryReading } from '../../src/lib/distractors'
import { buildQuestion, canAsk } from '../../src/lib/questions'
import { makeRng } from '../../src/lib/distractors'
import { normalizeReading } from '../../src/lib/kana'
import type { QuestionMode } from '../../src/types'

const N5 = 'data/out/n5.json'

describe.skipIf(!existsSync(N5))('真實資料：N5 PDF 轉出的 JSON', () => {
  it('全部匯入成功，並且每個字都能出題', async () => {
    setDb(new AppDB('real-n5'))
    await db.open()
    const buf = readFileSync(N5)
    const table = parseFile('n5.json', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const mapping = guessMapping(table.headers)
    expect(mapping.kanji).toBeGreaterThanOrEqual(0)
    expect(mapping.page).toBeGreaterThanOrEqual(0)
    const drafts = rowsToDrafts(table, mapping)
    const checks = checkDuplicates(drafts, [], [], null)
    const deck = await createDeck({ name: 'N5' })
    const res = await importDrafts(deck.id, checks)
    const all = await loadAll()
    const summary = {
      rows: drafts.length,
      added: res.added,
      skipped: res.skipped,
      problems: drafts.filter((d) => d.problems.length).length,
      dupInFile: checks.filter((c) => c.status === 'dupInFile').map((c) => c.draft.kanji + c.draft.reading),
      words: all.words.length,
      cards: all.cards.length,
    }
    console.log('N5 匯入結果', JSON.stringify(summary))
    expect(summary.rows).toBe(535)
    expect(all.cards.length).toBe(all.words.length)

    // 每個字的每種可出題型都要能產生 4 個不重複選項
    const dict = buildKanjiDict(all.words)
    const rng = makeRng(1)
    const kinds: Record<string, number> = {}
    const modes: QuestionMode[] = ['kanji2reading', 'reading2kanji', 'kanji2meaning', 'listening', 'cloze']
    let asked = 0
    for (const w of all.words) {
      for (const m of modes) {
        if (!canAsk(m, w)) continue
        const q = buildQuestion(m, { id: 'c', deckId: deck.id, wordId: w.id }, w, all.words, rng, dict)
        expect(q.options).toHaveLength(4)
        expect(new Set(q.options.map((o) => o.text)).size).toBe(4)
        expect(q.options.filter((o) => o.text === q.answer)).toHaveLength(1)
        asked++
      }
      if (canAsk('kanji2reading', w)) {
        const ds = generateReadingDistractors(w, all.words, { rng, dict })
        const correct = normalizeReading(primaryReading(w.reading))
        expect(ds.map((d) => normalizeReading(d.text))).not.toContain(correct)
        ds.forEach((d) => (kinds[d.kind] = (kinds[d.kind] ?? 0) + 1))
      }
    }
    console.log('出題檢查', asked, '題；漢字→讀音干擾選項種類', JSON.stringify(kinds))
    const traps = (kinds.long_vowel ?? 0) + (kinds.sokuon ?? 0) + (kinds.dakuten ?? 0) + (kinds.youon ?? 0) + (kinds.alt_reading ?? 0)
    const total = Object.values(kinds).reduce((a, b) => a + b, 0)
    expect(traps / total).toBeGreaterThan(0.8) // 絕大多數干擾選項來自 N5 陷阱
  }, 30_000) // 匯入 535 筆在較慢的機器上會超過預設 5 秒
})
