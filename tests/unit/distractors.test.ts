import { describe, it, expect } from 'vitest'
import {
  longVowelTraps,
  sokuonTraps,
  dakutenTraps,
  youonTraps,
  alignReading,
  altReadingTraps,
  buildKanjiDict,
  generateReadingDistractors,
  generateSurfaceDistractors,
  generateMeaningDistractors,
  displaySurface,
  primaryReading,
  isNearReading,
  makeRng,
} from '../../src/lib/distractors'
import { normalizeReading } from '../../src/lib/kana'
import { demoDrafts } from '../../src/db/demo'
import type { Word } from '../../src/types'

let n = 0
function w(kanji: string, reading: string, pos = '名詞', meaning = '意思' + ++n): Word {
  return { id: 'w' + ++n, kanji, reading, pos, meaning, example: '', exampleTranslation: '', tags: [], favorite: false, updated_at: '', deleted: false }
}

const pool: Word[] = demoDrafts().map((d) => w(d.kanji, d.reading, d.pos, d.meaning))
const dict = buildKanjiDict(pool)

describe('長音陷阱', () => {
  it('おばさん ↔ おばあさん', () => {
    expect(longVowelTraps('おばさん')).toContain('おばあさん')
    expect(longVowelTraps('おばあさん')).toContain('おばさん')
  })
  it('ここ ↔ こうこう（單邊與雙邊）', () => {
    expect(longVowelTraps('ここ')).toContain('こうこう')
    expect(longVowelTraps('ここ')).toContain('こうこ')
    expect(longVowelTraps('こうこう')).toContain('ここう')
    expect(longVowelTraps('こうこう')).toContain('こうこ')
  })
  it('え段長音用い：せんせい → せんせ', () => {
    expect(longVowelTraps('せんせい')).toContain('せんせ')
  })
  it('片假名用「ー」', () => {
    expect(longVowelTraps('コーヒー')).toContain('コヒー')
    expect(longVowelTraps('コーヒー')).toContain('コーヒ')
  })
  it('不在動詞語尾加長音', () => {
    expect(longVowelTraps('のむ')).not.toContain('のむう')
  })
  it('結果不含原字', () => {
    expect(longVowelTraps('がっこう')).not.toContain('がっこう')
  })
})

describe('促音陷阱', () => {
  it('きって ↔ きて', () => {
    expect(sokuonTraps('きって')).toContain('きて')
    expect(sokuonTraps('きて')).toContain('きって')
  })
  it('不在開頭或「ん」後面加促音', () => {
    for (const t of sokuonTraps('せんせい')) {
      expect(t.startsWith('っ')).toBe(false)
      expect(t).not.toContain('んっ')
    }
  })
  it('不會產生不合法的結尾促音', () => {
    expect(sokuonTraps('まつ').every((t) => !t.endsWith('っ'))).toBe(true)
  })
})

describe('濁音／半濁音陷阱', () => {
  it('はん → ばん、ぱん', () => {
    const t = dakutenTraps('はん')
    expect(t).toContain('ばん')
    expect(t).toContain('ぱん')
  })
  it('ばん → はん、ぱん', () => {
    expect(dakutenTraps('ばん')).toEqual(expect.arrayContaining(['はん', 'ぱん']))
  })
  it('拗音的濁音也能變：じゅう → しゅう', () => {
    expect(dakutenTraps('じゅう')).toContain('しゅう')
  })
})

describe('拗音大小寫陷阱', () => {
  it('びょういん ↔ びよういん', () => {
    expect(youonTraps('びょういん')).toContain('びよういん')
    expect(youonTraps('びよういん')).toContain('びょういん')
  })
  it('沒有拗音的字不產生', () => {
    expect(youonTraps('かさ')).toEqual([])
  })
})

describe('漢字讀法對齊與音訓混淆', () => {
  it('先生 對齊成 せん＋せい', () => {
    const segs = alignReading('先生', 'せんせい', dict)!
    expect(segs.map((s) => s.reading)).toEqual(['せん', 'せい'])
  })
  it('学校 處理促音化 がっ＋こう', () => {
    const segs = alignReading('学校', 'がっこう', dict)!
    expect(segs.map((s) => s.reading)).toEqual(['がっ', 'こう'])
  })
  it('送假名也能對齊：新しい', () => {
    const segs = alignReading('新しい', 'あたらしい', dict)!
    expect(segs[0].reading).toBe('あたら')
  })
  it('先生 的其他讀法包含 せんしょう', () => {
    expect(altReadingTraps('先生', 'せんせい', dict)).toContain('せんしょう')
  })
  it('学校 的其他讀法包含 がくこう', () => {
    expect(altReadingTraps('学校', 'がっこう', dict)).toContain('がくこう')
  })
  it('有送假名的字不產生音訓混淆', () => {
    expect(altReadingTraps('新しい', 'あたらしい', dict)).toEqual([])
  })
  it('從單字庫學到新讀法', () => {
    const d = buildKanjiDict([w('鍋', 'なべ')])
    expect(d['鍋']).toContain('なべ')
  })
})

describe('generateReadingDistractors（漢字→讀音）', () => {
  const words = [...pool, w('病院', 'びょういん'), w('切手', 'きって'), w('晩', 'ばん'), w('来て', 'きて', '動詞')]

  function check(word: Word, seed = 1) {
    const opts = generateReadingDistractors(word, words, { seed, dict })
    const correct = normalizeReading(primaryReading(word.reading))
    const texts = opts.map((o) => normalizeReading(o.text))
    expect(opts).toHaveLength(3)
    expect(texts).not.toContain(correct) // 不能和正解重複
    expect(new Set(texts).size).toBe(3) // 互相不重複
    return opts
  }

  it('每個示範單字、多個 seed 都產生 3 個合法選項', () => {
    for (const word of words) for (const seed of [1, 2, 3, 42]) check(word, seed)
  })
  it('病院 會出現拗音陷阱 びよういん', () => {
    const word = words.find((x) => x.kanji === '病院' && x.reading === 'びょういん')!
    const all = new Set<string>()
    for (let s = 0; s < 20; s++) generateReadingDistractors(word, words, { seed: s, dict }).forEach((o) => all.add(o.text))
    expect(all.has('びよういん')).toBe(true)
  })
  it('優先使用陷阱，類別盡量分散', () => {
    const word = words.find((x) => x.kanji === '学校')!
    const kinds = new Set(check(word).map((o) => o.kind))
    expect(kinds.size).toBeGreaterThanOrEqual(2)
    expect([...kinds].every((k) => k !== 'similar_word' && k !== 'random')).toBe(true)
  })
  it('同形異音詞不能當干擾選項（一日：いちにち／ついたち）', () => {
    const word = pool.find((x) => x.kanji === '一日' && x.reading === 'いちにち')!
    for (let s = 0; s < 30; s++) {
      const texts = generateReadingDistractors(word, pool, { seed: s, dict }).map((o) => o.text)
      expect(texts).not.toContain('ついたち')
    }
  })
  it('多個可接受讀音（いい/よい）都不會出現在干擾選項', () => {
    const word = w('良い', 'いい/よい', 'い形容詞')
    for (let s = 0; s < 20; s++) {
      const texts = generateReadingDistractors(word, [...pool, word], { seed: s, dict }).map((o) => o.text)
      expect(texts).not.toContain('いい')
      expect(texts).not.toContain('よい')
    }
  })
  it('な形容詞的「（な）」附註會加在所有選項上', () => {
    const word = pool.find((x) => x.kanji === '静か')!
    const opts = generateReadingDistractors(word, pool, { seed: 3, dict })
    expect(opts.every((o) => o.text.endsWith('（な）'))).toBe(true)
  })
  it('陷阱不夠時用同詞性、字數相近的單字補', () => {
    const word = w('絵', 'え')
    const opts = generateReadingDistractors(word, [word, w('木', 'き'), w('目', 'め'), w('手', 'て'), w('歯', 'は')], { seed: 1 })
    expect(opts).toHaveLength(3)
    expect(opts.some((o) => o.kind === 'similar_word' || o.kind === 'dakuten' || o.kind === 'long_vowel')).toBe(true)
  })
  it('題庫只有一個字也能湊滿 3 個選項', () => {
    const word = w('木', 'き')
    const opts = generateReadingDistractors(word, [word], { seed: 9 })
    expect(opts).toHaveLength(3)
    expect(new Set(opts.map((o) => o.text)).size).toBe(3)
  })
  it('相同 seed 結果相同（可重現）', () => {
    const word = words.find((x) => x.kanji === '先生')!
    expect(generateReadingDistractors(word, words, { seed: 7, dict })).toEqual(generateReadingDistractors(word, words, { seed: 7, dict }))
  })
})

describe('generateSurfaceDistractors（讀音→漢字）', () => {
  it('同音字不能當干擾選項（あつい：暑い／熱い）', () => {
    const a = w('暑い', 'あつい', 'い形容詞')
    const b = w('熱い', 'あつい', 'い形容詞')
    const c = w('厚い', 'あつい', 'い形容詞')
    const list = [a, b, c, ...pool]
    for (let s = 0; s < 20; s++) {
      const texts = generateSurfaceDistractors(a, list, { seed: s }).map((o) => o.text)
      expect(texts).not.toContain('熱い')
      expect(texts).not.toContain('厚い')
      expect(texts).not.toContain('暑い')
      expect(new Set(texts).size).toBe(texts.length)
    }
  })
  it('讀音相近的單字優先（おばさん → お婆さん）', () => {
    const word = pool.find((x) => x.reading === 'おばさん')!
    const opts = generateSurfaceDistractors(word, pool, { seed: 1 })
    expect(opts[0]).toEqual({ text: 'お婆さん', kind: 'similar_reading' })
  })
})

describe('generateMeaningDistractors（漢字→意思）', () => {
  it('意思不重複、不含正解', () => {
    const word = pool[0]
    const opts = generateMeaningDistractors(word, pool, { seed: 1 })
    expect(opts).toHaveLength(3)
    expect(opts.map((o) => o.text)).not.toContain(word.meaning)
    expect(new Set(opts.map((o) => o.text)).size).toBe(3)
  })
})

describe('工具函式', () => {
  it('displaySurface 去掉詞性附註與括號', () => {
    expect(displaySurface({ kanji: '開く(自V)', reading: 'あく' })).toBe('開く')
    expect(displaySurface({ kanji: '（お爺さん）', reading: 'おじいさん' })).toBe('お爺さん')
    expect(displaySurface({ kanji: '', reading: 'アパート' })).toBe('アパート')
  })
  it('isNearReading', () => {
    expect(isNearReading('おばさん', 'おばあさん')).toBe(true)
    expect(isNearReading('きって', 'きて')).toBe(true)
    expect(isNearReading('いぬ', 'ねこ')).toBe(false)
  })
  it('makeRng 可重現', () => {
    const a = makeRng(5)
    const b = makeRng(5)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})
