import { describe, it, expect, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'
import { AppDB, setDb, db } from '../../src/db/schema'
import { createDeck, importDrafts, recordAnswer, deleteDeck, batchTags, copyWordsToDeck, removeFromDeck, updateSettings, getSettings, cardIdFor, loadAll } from '../../src/db/repo'
import { exportAll, restoreAll, wipeAll } from '../../src/db/backup'
import { seedDemoIfEmpty, removeLegacyDemoOnce, DEMO_DECK_ID } from '../../src/db/demo'
import { parseCsv, parseXlsx, parseJson, parseFile, guessMapping, rowsToDrafts, checkDuplicates, decodeText, deckToCsv, deckToJson } from '../../src/lib/importer'
import { computeMistakes } from '../../src/lib/stats'

let dbn = 0
beforeEach(async () => {
  setDb(new AppDB('test-' + ++dbn))
  await db.open()
})

const CSV = `漢字,讀音,中文,頁碼,課次,標籤
学校,がっこう,學校,12,第1課,"名詞,易錯"
先生,せんせい,老師,12,第1課,
,コーヒー,咖啡,13,第2課,
病院,,醫院,p.14,,
`

describe('匯入解析', () => {
  it('CSV：自動對應欄位', () => {
    const t = parseCsv(CSV)
    expect(t.headers).toEqual(['漢字', '讀音', '中文', '頁碼', '課次', '標籤'])
    const m = guessMapping(t.headers)
    expect(m.kanji).toBe(0)
    expect(m.reading).toBe(1)
    expect(m.meaning).toBe(2)
    expect(m.page).toBe(3)
    expect(m.lesson).toBe(4)
    expect(m.tags).toBe(5)
    expect(m.example).toBe(-1)
    const d = rowsToDrafts(t, m)
    expect(d).toHaveLength(4)
    expect(d[0]).toMatchObject({ kanji: '学校', reading: 'がっこう', page: 12, lesson: '第1課', tags: ['名詞', '易錯'] })
    expect(d[3].page).toBe(14) // 「p.14」也能讀
    expect(d[3].problems).toContain('缺少讀音')
  })
  it('英文欄位名稱也能對應', () => {
    const m = guessMapping(['Word', 'Reading', 'Meaning', 'Example', 'Example Translation', 'Page', 'Lesson'])
    expect(m).toMatchObject({ kanji: 0, reading: 1, meaning: 2, example: 3, exampleTranslation: 4, page: 5, lesson: 6 })
  })
  it('Excel (.xlsx)', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['單字', '假名', '意思', '頁'],
      ['会う', 'あう', '見面', 1],
      ['青い', 'あおい', '藍色的', 1],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'N5')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const t = parseFile('n5.xlsx', buf)
    const d = rowsToDrafts(t, guessMapping(t.headers))
    expect(d.map((x) => [x.kanji, x.reading, x.meaning, x.page])).toEqual([
      ['会う', 'あう', '見面', 1],
      ['青い', 'あおい', '藍色的', 1],
    ])
    expect(parseXlsx(new Uint8Array(buf)).rows).toHaveLength(2)
  })
  it('JSON：PDF 腳本輸出格式', () => {
    const t = parseJson(JSON.stringify({ words: [{ kanji: '会う', reading: 'あう', pos: '動詞', meaning: '見面', example: '会いましょう。', page: 1, tags: ['N5'] }] }))
    const d = rowsToDrafts(t, guessMapping(t.headers))
    expect(d[0]).toMatchObject({ kanji: '会う', pos: '動詞', page: 1, tags: ['N5'], example: '会いましょう。' })
  })
  it('JSON 格式錯誤會丟出中文錯誤訊息', () => {
    expect(() => parseJson('{"a":1}')).toThrow(/找不到單字陣列/)
    expect(() => parseFile('a.docx', new ArrayBuffer(0))).toThrow(/不支援/)
  })
  it('自動判斷 Big5 編碼的 CSV（台灣版 Excel 預設）', () => {
    // 「漢字,讀音」的 Big5 編碼
    const bytes = new Uint8Array([0xba, 0x7e, 0xa6, 0x72, 0x2c, 0xc5, 0xaa, 0xad, 0xb5, 0x0a, 0x61, 0x2c, 0x62])
    expect(decodeText(bytes)).toBe('漢字,讀音\na,b')
  })
  it('UTF-8 BOM 會被移除', () => {
    const bytes = new TextEncoder().encode('﻿漢字,讀音\n')
    expect(decodeText(bytes)).toBe('漢字,讀音\n')
  })
})

describe('重複偵測', () => {
  it('漢字＋讀音相同視為同一字；檔案內重複；已在目標庫', async () => {
    const deck = await createDeck({ name: 'A' })
    const t = parseCsv(CSV)
    const drafts = rowsToDrafts(t, guessMapping(t.headers))
    await importDrafts(deck.id, checkDuplicates(drafts, [], [], deck.id))
    const { words, entries } = await loadAll()
    const again = checkDuplicates([...drafts, drafts[0]], words, entries, deck.id)
    expect(again.map((c) => c.status)).toEqual(['inDeck', 'inDeck', 'inDeck', 'invalid', 'dupInFile'])
    const other = await createDeck({ name: 'B' })
    expect(checkDuplicates(drafts, words, entries, other.id).map((c) => c.status)).toEqual(['existing', 'existing', 'existing', 'invalid'])
  })
  it('讀音的片假名／平假名差異也算重複', async () => {
    const words = [{ id: 'x', kanji: '', reading: 'コーヒー', pos: '', meaning: '', example: '', exampleTranslation: '', tags: [], favorite: false, updated_at: '', deleted: false }]
    const c = checkDuplicates([{ ...rowsToDrafts(parseCsv('讀音\nこーひー'), guessMapping(['讀音']))[0] }], words, [], 'd')
    expect(c[0].status).toBe('existing')
  })
})

describe('單字庫與進度', () => {
  it('同一個字匯入兩個單字庫：Word 一筆、Card 兩筆、進度各自獨立', async () => {
    const a = await createDeck({ name: 'N5' })
    const b = await createDeck({ name: '期中考' })
    const drafts = rowsToDrafts(parseCsv(CSV), guessMapping(parseCsv(CSV).headers))
    await importDrafts(a.id, checkDuplicates(drafts, [], [], a.id))
    let all = await loadAll()
    const res = await importDrafts(b.id, checkDuplicates(drafts.slice(0, 1), all.words, all.entries, b.id), 'merge')
    expect(res.merged).toBe(1)
    all = await loadAll()
    const gakko = all.words.filter((w) => w.kanji === '学校')
    expect(gakko).toHaveLength(1)
    const cards = all.cards.filter((c) => c.wordId === gakko[0].id)
    expect(cards).toHaveLength(2)
    await recordAnswer({ cardId: cardIdFor(a.id, gakko[0].id), deckId: a.id, wordId: gakko[0].id, mode: 'kanji2reading', prompt: '学校', answer: 'がっこう', chosen: 'がっこう', options: [], correct: true, errorType: null, rating: 3, durationMs: 1000, source: 'practice', sessionId: 's' })
    const ca = await db.cards.get(cardIdFor(a.id, gakko[0].id))
    const cb = await db.cards.get(cardIdFor(b.id, gakko[0].id))
    expect(ca!.state).toBe('review')
    expect(cb!.state).toBe('new')
  })
  it('選「另存」會建立第二筆 Word', async () => {
    const a = await createDeck({ name: 'A' })
    const b = await createDeck({ name: 'B' })
    const drafts = rowsToDrafts(parseCsv(CSV), guessMapping(parseCsv(CSV).headers)).slice(0, 1)
    await importDrafts(a.id, checkDuplicates(drafts, [], [], a.id))
    const all = await loadAll()
    const res = await importDrafts(b.id, checkDuplicates(drafts, all.words, all.entries, b.id), 'separate')
    expect(res.separate).toBe(1)
    expect((await loadAll()).words.filter((w) => w.kanji === '学校')).toHaveLength(2)
  })
  it('批次標籤、複製／移動、從庫移除', async () => {
    const a = await createDeck({ name: 'A' })
    const b = await createDeck({ name: 'B' })
    const drafts = rowsToDrafts(parseCsv(CSV), guessMapping(parseCsv(CSV).headers))
    await importDrafts(a.id, checkDuplicates(drafts, [], [], a.id))
    let all = await loadAll()
    const ids = all.words.map((w) => w.id)
    await batchTags(ids, ['第3課'], ['易錯'])
    all = await loadAll()
    expect(all.words.every((w) => w.tags.includes('第3課') && !w.tags.includes('易錯'))).toBe(true)
    await copyWordsToDeck(a.id, b.id, ids.slice(0, 1), true)
    all = await loadAll()
    expect(all.entries.filter((e) => e.deckId === b.id)).toHaveLength(1)
    expect(all.entries.filter((e) => e.deckId === a.id)).toHaveLength(2)
    await removeFromDeck(a.id, ids.slice(1, 2))
    expect((await loadAll()).entries.filter((e) => e.deckId === a.id)).toHaveLength(1)
  })
  it('刪除單字庫：軟刪除庫、條目、卡片', async () => {
    const a = await createDeck({ name: 'A' })
    await importDrafts(a.id, checkDuplicates(rowsToDrafts(parseCsv(CSV), guessMapping(parseCsv(CSV).headers)), [], [], a.id))
    await deleteDeck(a.id)
    const all = await loadAll()
    expect(all.decks).toHaveLength(0)
    expect(all.cards).toHaveLength(0)
    expect((await db.decks.get(a.id))!.deleted).toBe(true)
    expect((await db.decks.get(a.id))!._dirty).toBe(1)
  })
  it('示範單字庫只建立一次', async () => {
    expect(await seedDemoIfEmpty()).toBe(true)
    expect(await seedDemoIfEmpty()).toBe(false)
    const all = await loadAll()
    expect(all.decks.map((d) => d.id)).toEqual([DEMO_DECK_ID])
    expect(all.words.length).toBeGreaterThanOrEqual(30)
    expect(all.cards.length).toBe(all.words.length)
  })
  it('舊版的示範單字庫在新版開啟時刪掉一次；其他單字庫也有的字保留', async () => {
    await seedDemoIfEmpty()
    const mine = await createDeck({ name: 'N5' })
    const t = parseCsv('漢字,讀音,中文\n学校,がっこう,學校\n勉強,べんきょう,讀書\n')
    await importDrafts(mine.id, checkDuplicates(rowsToDrafts(t, guessMapping(t.headers)), (await loadAll()).words, [], mine.id))
    expect(await removeLegacyDemoOnce()).toBe(true)
    const all = await loadAll()
    expect(all.decks.map((d) => d.name)).toEqual(['N5'])
    expect(all.words.map((w) => w.kanji).sort()).toEqual(['勉強', '学校'].sort()) // 只屬於示範庫的字一起刪
    expect((await db.decks.get(DEMO_DECK_ID))!._dirty).toBe(1) // 刪除會同步到其他裝置
    // 只做一次：之後就算又出現示範庫（例如從還沒更新的裝置同步過來）也不會在這台重刪
    expect(await removeLegacyDemoOnce()).toBe(false)
  })
  it('匯出單字庫 CSV／JSON 可以再匯入', async () => {
    await seedDemoIfEmpty()
    const all = await loadAll()
    const deck = all.decks[0]
    const csv = deckToCsv(deck.id, all.words, all.entries)
    const t = parseCsv(csv.replace(/^﻿/, ''))
    const d = rowsToDrafts(t, guessMapping(t.headers))
    expect(d).toHaveLength(all.words.length)
    expect(d.find((x) => x.reading === 'しずか（な）')).toMatchObject({ kanji: '静か', page: 2 })
    const json = JSON.parse(deckToJson(deck, all.words, all.entries))
    expect(json.words).toHaveLength(all.words.length)
    expect(rowsToDrafts(parseJson(JSON.stringify(json)), guessMapping(parseJson(JSON.stringify(json)).headers))[0].tags).toContain('示範')
  })
})

describe('備份與還原', () => {
  it('備份 → 清空 → 還原，資料與進度完全一致', async () => {
    await seedDemoIfEmpty()
    await updateSettings({ dailyGoal: 35 })
    const all = await loadAll()
    for (const c of all.cards.slice(0, 5)) {
      await recordAnswer({ cardId: c.id, deckId: c.deckId, wordId: c.wordId, mode: 'kanji2reading', prompt: '', answer: 'a', chosen: 'b', options: ['a', 'b'], correct: false, errorType: 'dakuten', rating: 1, durationMs: 500, source: 'practice', sessionId: 's' })
    }
    const before = await exportAll()
    await wipeAll()
    expect((await loadAll()).words).toHaveLength(0)
    await restoreAll(JSON.parse(JSON.stringify(before)))
    const after = await exportAll()
    expect(after.tables).toEqual(before.tables)
    expect((await getSettings()).dailyGoal).toBe(35)
    expect(computeMistakes((await loadAll()).logs).size).toBe(5)
  })
  it('拒絕不是本 App 的檔案', async () => {
    await expect(restoreAll({ foo: 1 })).rejects.toThrow(/不是本 App/)
  })
})
