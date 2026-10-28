import { describe, it, expect } from 'vitest'
import { checkSentence, diffSentence, particleQuestion, particleSlots, reorderTiles, shuffleTiles, splitChunks, MAX_TILES } from '../../src/lib/sentences'
import { convertVerb, masuDistractors, masuForm, teDistractors, teForm, teRule, verbGroup, verbInfo } from '../../src/lib/conjugate'
import { GRAMMAR_SETS } from '../../src/data/grammar'
import { buildQuestion, canAsk } from '../../src/lib/questions'
import { makeRng } from '../../src/lib/distractors'
import { guessKind, guessMapping, parseCsv, rowsToDrafts } from '../../src/lib/importer'
import type { Word } from '../../src/types'

const sentence = (ja: string, reading = '', zh = '中文', extra: Partial<Word> = {}): Word => {
  const chunks = splitChunks(ja)
  const readings = reading ? splitChunks(reading) : undefined
  return {
    id: 's',
    updated_at: '',
    deleted: false,
    kanji: chunks.join(''),
    reading: readings ? readings.join('') : '',
    pos: '',
    meaning: zh,
    example: '',
    exampleTranslation: '',
    tags: [],
    favorite: false,
    kind: 'sentence',
    chunks,
    chunkReadings: readings,
    ...extra,
  }
}

describe('課文句子 CSV', () => {
  it('日文欄裡的「|」不會被當成欄位分隔，會自動判斷成課文句子', () => {
    const csv = '課次,說話者,日文,讀音,中文\n第16課,田中,毎朝|6時に|起きます。,まいあさ|ろくじに|おきます。,每天早上六點起床。\n'
    const t = parseCsv(csv)
    expect(t.headers).toEqual(['課次', '說話者', '日文', '讀音', '中文'])
    expect(guessKind(t)).toBe('sentence')
    const [d] = rowsToDrafts(t, guessMapping(t.headers), 'sentence')
    expect(d).toMatchObject({ kanji: '毎朝6時に起きます。', reading: 'まいあさろくじにおきます。', meaning: '每天早上六點起床。', lesson: '第16課' })
    expect(d.extra).toMatchObject({ kind: 'sentence', chunks: ['毎朝', '6時に', '起きます。'], chunkReadings: ['まいあさ', 'ろくじに', 'おきます。'], speaker: '田中' })
    expect(d.problems).toEqual([])
  })
  it('一般單字 CSV 仍判斷成單字', () => {
    expect(guessKind(parseCsv('漢字,讀音,中文\n学校,がっこう,學校\n'))).toBe('word')
  })
})

describe('課文句子', () => {
  const s = sentence('わたしは|毎朝|6時に|起きて、|ご飯を|食べます。', 'わたしは|まいあさ|ろくじに|おきて、|ごはんを|たべます。')

  it('文節切分：| 與全形 ｜ 都可以', () => {
    expect(splitChunks('あした｜京都へ|行きます。')).toEqual(['あした', '京都へ', '行きます。'])
  })

  it('助詞填空：找出文節結尾的助詞，固定說法不算', () => {
    expect(particleSlots(s).map((x) => x.particle)).toEqual(['は', 'に', 'を'])
    expect(particleSlots(sentence('こんにちは。|いっしょに|行きませんか。'))).toEqual([])
    const q = particleQuestion(s, makeRng(3))!
    expect(q.sentence).toContain('（　）')
    expect(q.distractors).toHaveLength(3)
    expect(q.distractors).not.toContain(q.answer)
  })

  it('語順重組：去掉句尾標點，打亂後不會剛好是正解', () => {
    const tiles = reorderTiles(s)
    expect(tiles.join('')).toBe('わたしは毎朝6時に起きて、ご飯を食べます')
    for (let seed = 1; seed < 20; seed++) expect(shuffleTiles(tiles, makeRng(seed)).join('')).not.toBe(tiles.join(''))
  })

  it('語順重組：太長的句子合併成最多 8 張', () => {
    const long = sentence('a|b|c|d|e|f|g|h|i|j|k。')
    const tiles = reorderTiles(long)
    expect(tiles.length).toBe(MAX_TILES)
    expect(tiles.join('')).toBe('abcdefghijk')
  })

  it('中翻日：漢字、假名、混寫、標點與空白差異都算對', () => {
    expect(checkSentence(s, 'わたしは毎朝6時に起きて、ご飯を食べます。')).toBe(true)
    expect(checkSentence(s, 'わたしは まいあさ ろくじに おきて ごはんを たべます')).toBe(true)
    expect(checkSentence(s, 'わたしは毎朝ろくじに起きて、ごはんを食べます')).toBe(true)
    expect(checkSentence(s, 'わたしが毎朝6時に起きて、ご飯を食べます')).toBe(false) // 助詞錯
    expect(checkSentence(s, '')).toBe(false)
  })

  it('中翻日：逐字比對標出少寫與寫錯', () => {
    const d = diffSentence('ご飯を食べます。', 'ご飯が食べます')
    expect(d).toEqual([
      { kind: 'same', text: 'ご飯' },
      { kind: 'missing', text: 'を' },
      { kind: 'extra', text: 'が' },
      { kind: 'same', text: '食べます' },
    ])
  })

  it('句子只出句子題型，單字題型不會出現句子', () => {
    expect(canAsk('zh2ja', s)).toBe(true)
    expect(canAsk('reorder', s)).toBe(true)
    expect(canAsk('particle', s)).toBe(true)
    expect(canAsk('kanji2reading', s)).toBe(false)
    expect(canAsk('kanji2meaning', s)).toBe(false)
  })
})

describe('動詞變化', () => {
  const cases: [string, string, string, string][] = [
    // 表記, 辭書形, ます形, て形
    ['書く', 'かく', 'かきます', 'かいて'],
    ['泳ぐ', 'およぐ', 'およぎます', 'およいで'],
    ['飲む', 'のむ', 'のみます', 'のんで'],
    ['遊ぶ', 'あそぶ', 'あそびます', 'あそんで'],
    ['死ぬ', 'しぬ', 'しにます', 'しんで'],
    ['会う', 'あう', 'あいます', 'あって'],
    ['待つ', 'まつ', 'まちます', 'まって'],
    ['帰る', 'かえる', 'かえります', 'かえって'],
    ['入る', 'はいる', 'はいります', 'はいって'],
    ['話す', 'はなす', 'はなします', 'はなして'],
    ['行く', 'いく', 'いきます', 'いって'],
    ['食べる', 'たべる', 'たべます', 'たべて'],
    ['見る', 'みる', 'みます', 'みて'],
    ['起きる', 'おきる', 'おきます', 'おきて'],
    ['来る', 'くる', 'きます', 'きて'],
    ['勉強する', 'べんきょうする', 'べんきょうします', 'べんきょうして'],
  ]
  it.each(cases)('%s → %s／%s', (surface, dict, masu, te) => {
    const group = verbGroup(surface, dict)!
    expect(masuForm({ dict, group })).toBe(masu)
    expect(teForm({ dict, group })).toBe(te)
  })

  it('干擾選項：3 個、不含正解、包含常見錯誤', () => {
    const v = { dict: 'かく', group: 'godan' as const }
    const d = teDistractors(v, makeRng(1))
    expect(d).toHaveLength(3)
    expect(d).not.toContain('かいて')
    expect(d).toContain('かきて') // 用ます形語幹接て
    const m = masuDistractors({ dict: 'みる', group: 'ichidan' }, makeRng(1))
    expect(m).toHaveLength(3)
    expect(m).not.toContain('みます')
  })

  it('出題：題幹有表記與讀音，選項含正解，解說寫出分組', () => {
    const w = { id: 'v', kanji: '帰る', reading: 'かえる', pos: '動詞', meaning: '回去', tags: [], example: '' } as unknown as Word
    expect(canAsk('conjugate', w)).toBe(true)
    for (let seed = 1; seed <= 10; seed++) {
      const q = buildQuestion('conjugate', { id: 'c', deckId: 'd', wordId: 'v' }, w, [], makeRng(seed), {})
      expect(q.prompt).toBe('帰る（かえる）')
      expect(['かえって', 'かえります']).toContain(q.answer)
      expect(q.options.map((o) => o.text)).toContain(q.answer)
      expect(new Set(q.options.map((o) => o.text)).size).toBe(4)
      expect(q.explain).toContain('第 I 類')
    }
  })

  it('講解頁的て形轉換器：ます形、辭書形、漢字、手動分組', () => {
    const r = (s: string, g?: 'I' | 'II' | 'III') => {
      const v = convertVerb(s, g)
      return v && [teForm(v), teRule(v)]
    }
    expect(r('かきます')).toEqual(['かいて', '第 I 類：き → いて'])
    expect(r('書きます')).toEqual(['書いて', '第 I 類：き → いて'])
    expect(r('行きます')).toEqual(['行って', '第 I 類例外：行きます → 行って'])
    expect(r('いきます')).toEqual(['いって', '第 I 類例外：行きます → 行って'])
    expect(r('たべます')).toEqual(['たべて', '第 II 類：去掉「ます」加「て」'])
    expect(r('みます', 'II')).toEqual(['みて', '第 II 類：去掉「ます」加「て」'])
    expect(r('はなします')).toEqual(['はなして', '第 I 類：し → して']) // 自動判斷成 I（假名短的します）
    expect(r('べんきょうします')).toEqual(['べんきょうして', '第 III 類：します → して'])
    expect(r('きます')).toEqual(['きて', '第 III 類：来ます → 来て'])
    expect(r('のむ')).toEqual(['のんで', '第 I 類：み・び・に → んで'])
    expect(r('かえる', 'I')).toEqual(['かえって', '第 I 類：い・ち・り → って'])
    expect(convertVerb('すし')).toBeNull() // 不是〜ます、也不是う段結尾
  })

  it('只有詞性是動詞的單字才出變化題', () => {
    const w = (kanji: string, reading: string, pos: string) => ({ kanji, reading, pos, kind: undefined }) as unknown as Word
    expect(verbInfo(w('書く', 'かく', '動詞'))?.group).toBe('godan')
    expect(verbInfo(w('学校', 'がっこう', '名詞'))).toBeNull()
    expect(verbInfo(w('開く(自V)', 'あく', '動詞'))?.surface).toBe('開く')
  })
})

describe('文法題庫', () => {
  const points = GRAMMAR_SETS.flatMap((s) => s.points)
  it('每個文法點都有說明、例句與題目；正解在選項裡、選項不重複', () => {
    expect(points.length).toBeGreaterThanOrEqual(15)
    expect(new Set(points.map((p) => p.id)).size).toBe(points.length)
    for (const p of points) {
      expect(p.explanation && p.examples.length && p.questions.length, p.id).toBeTruthy()
      for (const q of p.questions) {
        expect(q.options, q.stem).toContain(q.answer)
        expect(new Set(q.options).size, q.stem).toBe(q.options.length)
        expect(q.options.length, q.stem).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('出題：選項含正解，作答後有解說', () => {
    const p = points[0]
    const w = { id: 'g', kanji: p.pattern, reading: '', meaning: p.meaning, kind: 'grammar', grammarId: p.id, tags: [], example: '', pos: '' } as unknown as Word
    expect(canAsk('grammar', w)).toBe(true)
    expect(canAsk('kanji2reading', w)).toBe(false)
    const q = buildQuestion('grammar', { id: 'c', deckId: 'd', wordId: 'g' }, w, [], makeRng(2), {})
    expect(q.options.map((o) => o.text)).toContain(q.answer)
    expect(q.explain).toContain(p.pattern)
  })
})
