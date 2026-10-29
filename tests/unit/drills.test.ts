// 內建練習題庫：動詞（ない形・た形・辭書形）、形容詞變化、數字・時間・量詞
import { describe, it, expect, beforeEach } from 'vitest'
import { AppDB, setDb, db } from '../../src/db/schema'
import { addDrillSet, drillDeckId, practiceModeParam } from '../../src/db/drills'
import { DRILL_SETS } from '../../src/data/drills'
import { COUNTERS } from '../../src/data/counters'
import { counterDistractors, pickEntry } from '../../src/lib/counters'
import { VERB_FORMS, dictDistractors, masuSurface, naiForm, taForm, verbDistractors, verbForm, verbInfo } from '../../src/lib/conjugate'
import { ADJ_FORMS, adjDistractors, adjForm, adjInfo, adjRule, convertAdj } from '../../src/lib/adjective'
import { buildQuestion, canAsk } from '../../src/lib/questions'
import { classifyError } from '../../src/lib/errorTypes'
import { makeRng } from '../../src/lib/distractors'
import type { Word } from '../../src/types'

const word = (kanji: string, reading: string, pos: string, extra: Partial<Word> = {}) =>
  ({ id: kanji, kanji, reading, pos, meaning: '意思', tags: [], example: '', exampleTranslation: '', favorite: false, deleted: false, updated_at: '', ...extra }) as Word
const card = { id: 'c', deckId: 'd', wordId: 'w' }

describe('動詞：ない形・た形・辭書形', () => {
  const v = (dict: string, pos: string) => verbInfo(word(dict, dict, pos))!

  it('ない形：あ段＋ない（う→わ）、ある→ない、来る→こない', () => {
    expect(naiForm(v('かく', '動詞I'))).toBe('かかない')
    expect(naiForm(v('かう', '動詞I'))).toBe('かわない')
    expect(naiForm(v('まつ', '動詞I'))).toBe('またない')
    expect(naiForm(v('かえる', '動詞I'))).toBe('かえらない')
    expect(naiForm(v('ある', '動詞I'))).toBe('ない')
    expect(naiForm(v('みる', '動詞II'))).toBe('みない')
    expect(naiForm(v('べんきょうする', '動詞III'))).toBe('べんきょうしない')
    expect(naiForm(v('くる', '動詞III'))).toBe('こない')
  })

  it('た形跟著て形變，行く是例外', () => {
    expect(taForm(v('のむ', '動詞I'))).toBe('のんだ')
    expect(taForm(v('およぐ', '動詞I'))).toBe('およいだ')
    expect(taForm(v('いく', '動詞I'))).toBe('いった')
    expect(taForm(v('はなす', '動詞I'))).toBe('はなした')
    expect(taForm(v('たべる', '動詞II'))).toBe('たべた')
    expect(taForm(v('くる', '動詞III'))).toBe('きた')
  })

  it('ます形的漢字寫法', () => {
    expect(masuSurface(verbInfo(word('書く', 'かく', '動詞I'))!)).toBe('書きます')
    expect(masuSurface(verbInfo(word('食べる', 'たべる', '動詞II'))!)).toBe('食べます')
    expect(masuSurface(verbInfo(word('勉強する', 'べんきょうする', '動詞III'))!)).toBe('勉強します')
    expect(masuSurface(verbInfo(word('来る', 'くる', '動詞III'))!)).toBe('来ます')
  })

  it('辭書形的錯誤選項：I／II 類搞混', () => {
    const d = dictDistractors(verbInfo(word('帰ります', 'かえります', '動詞I'))!, makeRng(1))
    expect(d).toContain('かえりる')
    expect(d).not.toContain('かえる')
  })

  it('內建動詞題庫：每個動詞的每種變化都有 3 個不重複、不等於正解的錯誤選項', () => {
    const verbs = DRILL_SETS.find((s) => s.id === 'verbs')!.words
    for (const w of verbs) {
      const info = verbInfo(word(w.kanji, w.reading, w.pos))
      expect(info, w.kanji).not.toBeNull()
      for (const f of VERB_FORMS) {
        const answer = verbForm(info!, f.id)
        const ds = verbDistractors(info!, f.id, makeRng(7))
        expect(ds.length, `${w.kanji} ${f.id}`).toBe(3)
        expect(new Set(ds).size).toBe(3)
        expect(ds).not.toContain(answer)
      }
    }
  })

  it('出題：辭書形單字問ない形時題目給辭書形；問辭書形時改給ます形', () => {
    const w = word('帰る', 'かえる', '動詞I')
    const nai = buildQuestion('conjugate', card, w, [], makeRng(1), {}, { verbForms: ['nai'] })
    expect(nai.prompt).toBe('帰る（かえる）')
    expect(nai.promptSub).toBe('→ ない形')
    expect(nai.answer).toBe('かえらない')
    expect(nai.explain).toContain('い段 → あ段')
    const dict = buildQuestion('conjugate', card, w, [], makeRng(1), {}, { verbForms: ['dict'] })
    expect(dict.prompt).toBe('帰ります（かえります）')
    expect(dict.answer).toBe('かえる')
    // 課本的ます形單字只勾ます形時，題目改給辭書形
    const masu = buildQuestion('conjugate', card, word('遊びます', 'あそびます', '動詞I'), [], makeRng(1), {}, { verbForms: ['masu'] })
    expect(masu.prompt).toBe('遊ぶ（あそぶ）')
    expect(masu.answer).toBe('あそびます')
  })
})

describe('形容詞變化', () => {
  it('判斷類型：詞性、（な）標記、きれい 例外', () => {
    expect(adjInfo(word('高い', 'たかい', 'い形容詞'))).toMatchObject({ reading: 'たかい', type: 'i' })
    expect(adjInfo(word('静か', 'しずか（な）', 'な形容詞'))).toMatchObject({ surface: '静か', reading: 'しずか', type: 'na' })
    expect(adjInfo(word('きれい', 'きれい', '形容詞'))?.type).toBe('na')
    expect(adjInfo(word('赤い', 'あかい', '形容詞'))?.type).toBe('i')
    expect(adjInfo(word('学校', 'がっこう', '名詞'))).toBeNull()
    expect(canAsk('adjective', word('高い', 'たかい', 'い形容詞'))).toBe(true)
  })

  it('變化形：い→く／かった、いい→よ、な形容詞＋じゃ／だった／で', () => {
    const i = { reading: 'たかい', type: 'i' as const }
    expect(ADJ_FORMS.map((f) => adjForm(i, f.id))).toEqual(['たかくない', 'たかかった', 'たかくなかった', 'たかくて', 'たかくないです', 'たかかったです'])
    expect(adjForm({ reading: 'いい', type: 'i' }, 'ta')).toBe('よかった')
    expect(adjForm({ reading: 'かっこいい', type: 'i' }, 'nai')).toBe('かっこよくない')
    expect(adjForm({ reading: 'かわいい', type: 'i' }, 'nai')).toBe('かわいくない')
    const na = { reading: 'しずか', type: 'na' as const }
    expect(ADJ_FORMS.map((f) => adjForm(na, f.id))).toEqual(['しずかじゃない', 'しずかだった', 'しずかじゃなかった', 'しずかで', 'しずかじゃありません', 'しずかでした'])
  })

  it('錯誤選項：最像的錯誤排前面，也算對的說法不會當錯誤選項', () => {
    expect(adjDistractors({ reading: 'いい', type: 'i' }, 'nai', makeRng(1))).toContain('いくない')
    expect(adjDistractors({ reading: 'きれい', type: 'na' }, 'nai', makeRng(1))).toContain('きれくない')
    expect(adjDistractors({ reading: 'たかい', type: 'i' }, 'nai', makeRng(1))).toContain('たかいじゃない')
    for (let seed = 1; seed < 30; seed++) {
      expect(adjDistractors({ reading: 'しずか', type: 'na' }, 'nai_p', makeRng(seed))).not.toContain('しずかではありません')
      expect(adjDistractors({ reading: 'たかい', type: 'i' }, 'nai_p', makeRng(seed))).not.toContain('たかくありません')
    }
  })

  it('內建形容詞題庫：每種變化都有 3 個不重複的錯誤選項', () => {
    for (const w of DRILL_SETS.find((s) => s.id === 'adjectives')!.words) {
      const a = adjInfo(word(w.kanji, w.reading, w.pos))
      expect(a, w.kanji).not.toBeNull()
      for (const f of ADJ_FORMS) {
        const ds = adjDistractors(a!, f.id, makeRng(3))
        expect(ds.length, `${w.kanji} ${f.id}`).toBe(3)
        expect(new Set(ds).size).toBe(3)
        expect(ds).not.toContain(adjForm(a!, f.id))
      }
    }
  })

  it('規則說明與轉換器', () => {
    expect(adjRule({ reading: 'いい', type: 'i' }, 'nai')).toContain('よくない')
    expect(adjRule({ reading: 'きれい', type: 'na' }, 'nai')).toContain('な形容詞')
    expect(convertAdj('しずかな')).toMatchObject({ reading: 'しずか', type: 'na', guessed: false })
    expect(convertAdj('たかい')).toMatchObject({ type: 'i', guessed: true })
    expect(convertAdj('しずか', 'i')).toBeNull()
  })

  it('出題與錯誤歸類', () => {
    const q = buildQuestion('adjective', card, word('静か', 'しずか（な）', 'な形容詞'), [], makeRng(1), {}, { adjForms: ['te'] })
    expect(q.prompt).toBe('静か（しずか）')
    expect(q.answer).toBe('しずかで')
    expect(q.options).toHaveLength(4)
    expect(classifyError('adjective', 'しずかで', 'しずかくて')).toBe('conjugation')
  })
})

describe('數字・時間・量詞', () => {
  it('特殊念法', () => {
    const r = (id: string, label: string) => COUNTERS.find((c) => c.id === id)!.entries.find((e) => e.label === label)!
    expect(r('hon', '6本').reading).toBe('ろっぽん')
    expect(r('hon', '3本').reading).toBe('さんぼん')
    expect(r('hon', '8本').alts).toEqual(['はちほん'])
    expect(r('nichi', '1日').reading).toBe('ついたち')
    expect(r('nichi', '20日').reading).toBe('はつか')
    expect(r('ji', '9時').reading).toBe('くじ')
    expect(r('gatsu', '4月').reading).toBe('しがつ')
    expect(r('hyaku', '300').reading).toBe('さんびゃく')
    expect(r('sen', '8000').reading).toBe('はっせん')
  })

  it('每個念法都有 3 個不重複、不是正解也不是「也算對」的錯誤選項', () => {
    for (const c of COUNTERS) {
      expect(c.entries.length, c.id).toBeGreaterThan(0)
      const labels = c.entries.map((e) => e.label)
      expect(new Set(labels).size, c.id).toBe(labels.length)
      for (const e of c.entries) {
        expect(e.reading, e.label).toMatch(/^[ぁ-ゖー]+$/)
        for (let seed = 1; seed <= 5; seed++) {
          const ds = counterDistractors(c, e, makeRng(seed))
          expect(ds.length, e.label).toBe(3)
          expect(new Set(ds).size).toBe(3)
          for (const d of ds) expect([e.reading, ...e.alts], e.label).not.toContain(d)
        }
      }
    }
  })

  it('易錯答案優先當錯誤選項；不規則的念法比較常出', () => {
    const nichi = COUNTERS.find((c) => c.id === 'nichi')!
    const four = nichi.entries.find((e) => e.label === '4日')!
    expect(counterDistractors(nichi, four, makeRng(1))).toContain('ようか')
    const mai = COUNTERS.find((c) => c.id === 'hon')!
    const rng = makeRng(5)
    const picks = Array.from({ length: 2000 }, () => pickEntry(mai, rng).label)
    expect(picks.filter((l) => l === '6本').length).toBeGreaterThan(picks.filter((l) => l === '5本').length)
  })

  it('出題：題目是隨機數字，作答後顯示這一題的念法', () => {
    const w = word('〜本', 'ほん', '量詞', { kind: 'counter', counterId: 'hon' })
    expect(canAsk('counter', w)).toBe(true)
    expect(canAsk('kanji2reading', w)).toBe(false)
    expect(canAsk('counter', word('本', 'ほん', '名詞'))).toBe(false)
    const q = buildQuestion('counter', card, w, [], makeRng(2), {})
    expect(q.prompt).toMatch(/本$/)
    expect(q.word.kanji).toBe(q.prompt)
    expect(q.word.reading).toBe(q.answer)
    expect(q.options.map((o) => o.text)).toContain(q.answer)
    expect(classifyError('counter', 'さんぼん', 'さんほん')).toBe('dakuten')
    expect(classifyError('counter', 'いっぽん', 'いぽん')).toBe('sokuon_missing')
  })
})

describe('加入內建練習題庫', () => {
  let n = 0
  beforeEach(async () => {
    setDb(new AppDB('drills-' + ++n))
    await db.open()
  })

  it('三個題庫各自建立單字庫，重複加入不會重複', async () => {
    for (const s of DRILL_SETS) {
      const r = await addDrillSet(s.id)
      expect(r.deckId).toBe(drillDeckId(s.id))
      expect(r.added).toBe(s.words.length)
      expect((await db.decks.get(r.deckId))?.name).toBe(s.name)
      expect(practiceModeParam(r.deckId)).toBe('&mode=' + s.mode)
      const again = await addDrillSet(s.id)
      expect(again.added).toBe(0)
    }
    const counters = await db.words.filter((w) => w.kind === 'counter').toArray()
    expect(counters).toHaveLength(COUNTERS.length)
    expect(counters.every((w) => canAsk('counter', w))).toBe(true)
    expect(await db.cards.where('deckId').equals(drillDeckId('verbs')).count()).toBe(DRILL_SETS[0].words.length)
    expect(practiceModeParam('other')).toBe('')
  })
})
