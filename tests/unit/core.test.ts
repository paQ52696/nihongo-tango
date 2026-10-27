import { describe, it, expect } from 'vitest'
import {
  kataToHira,
  hiraToKata,
  toMorae,
  stripLongVowels,
  normalizeReading,
  readingAlternatives,
  splitSuffix,
  romajiToKana,
  anyToHiragana,
} from '../../src/lib/kana'
import { classifyError, classifyReadingError, ERROR_LABELS } from '../../src/lib/errorTypes'
import { schedule, newCardFields, nextInterval, retrievability, examAdjust, masteryLevel, formatInterval, MAX_INTERVAL } from '../../src/lib/srs'
import { computeMistakes, computeStreak, dailyCounts, heatmap, accuracyTrend, goalRate, masteryBySection, longestStreak, newIntroducedToday } from '../../src/lib/stats'
import { addDays, dateKey, daysUntil, diffDays } from '../../src/lib/dates'
import { buildQuestion, canAsk, checkTyping, clozeSentence, BLANK } from '../../src/lib/questions'
import { selectCards } from '../../src/lib/session'
import { buildKanjiDict, makeRng } from '../../src/lib/distractors'
import type { Card, DeckEntry, ReviewLog, Word } from '../../src/types'

describe('假名轉換', () => {
  it('片假名 ↔ 平假名', () => {
    expect(kataToHira('コーヒー')).toBe('こーひー')
    expect(hiraToKata('すし')).toBe('スシ')
  })
  it('羅馬拼音即時轉平假名', () => {
    expect(romajiToKana('kitte')).toBe('きって')
    expect(romajiToKana('byouinn')).toBe('びょういん')
    expect(romajiToKana('byouin')).toBe('びょういn') // 輸入中：n 還在等下一個字母
    expect(romajiToKana('obaasann')).toBe('おばあさん')
    expect(romajiToKana('gakkou')).toBe('がっこう')
    expect(anyToHiragana('konnichiha')).toBe('こんにちは')
  })
  it('anyToHiragana 支援羅馬拼音與片假名', () => {
    expect(anyToHiragana('sushi')).toBe('すし')
    expect(anyToHiragana('スシ')).toBe('すし')
  })
  it('拆音拍：拗音算一拍', () => {
    expect(toMorae('びょういん')).toEqual(['びょ', 'う', 'い', 'ん'])
    expect(toMorae('きって')).toEqual(['き', 'っ', 'て'])
  })
  it('去長音', () => {
    expect(stripLongVowels('おばあさん')).toBe('おばさん')
    expect(stripLongVowels('こうこう')).toBe('ここ')
    expect(stripLongVowels('せんせい')).toBe('せんせ')
    expect(stripLongVowels('コーヒー')).toBe('コヒ')
  })
  it('讀音附註與多讀音', () => {
    expect(splitSuffix('いや（な）')).toEqual({ core: 'いや', suffix: '（な）' })
    expect(readingAlternatives('いい/よい')).toEqual(['いい', 'よい'])
    expect(normalizeReading('～えん')).toBe('えん')
    expect(normalizeReading('アパート')).toBe('あぱーと')
  })
})

describe('錯誤類型歸類', () => {
  it('漏長音／多加長音', () => {
    expect(classifyReadingError('おばあさん', 'おばさん')).toBe('long_vowel_missing')
    expect(classifyReadingError('ここ', 'こうこう')).toBe('long_vowel_extra')
    expect(classifyReadingError('こうこう', 'ここう')).toBe('long_vowel_missing')
  })
  it('漏促音／多加促音', () => {
    expect(classifyReadingError('きって', 'きて')).toBe('sokuon_missing')
    expect(classifyReadingError('きて', 'きって')).toBe('sokuon_extra')
  })
  it('清濁音混淆', () => {
    expect(classifyReadingError('はん', 'ばん')).toBe('dakuten')
    expect(classifyReadingError('ばん', 'ぱん')).toBe('dakuten')
  })
  it('拗音大小寫', () => {
    expect(classifyReadingError('びょういん', 'びよういん')).toBe('youon')
  })
  it('多種混淆', () => {
    expect(classifyReadingError('がっこう', 'かこう')).toBe('mixed')
  })
  it('音訓混淆（由出題時算出的其他讀法判斷）', () => {
    expect(classifyReadingError('せんせい', 'せんしょう', ['せんしょう'])).toBe('alt_reading')
  })
  it('完全不同 → 其他；正確 → null', () => {
    expect(classifyReadingError('いぬ', 'ねこ')).toBe('other')
    expect(classifyReadingError('いぬ', 'いぬ')).toBe(null)
  })
  it('片假名與平假名視為相同', () => {
    expect(classifyReadingError('コーヒー', 'こーひー')).toBe(null)
  })
  it('各題型', () => {
    expect(classifyError('kanji2reading', 'きって', null)).toBe('timeout')
    expect(classifyError('reading2kanji', '学校', '学生')).toBe('kanji_confusion')
    expect(classifyError('reading2kanji', '学校', '電車')).toBe('meaning')
    expect(classifyError('kanji2meaning', '學校', '老師')).toBe('meaning')
    expect(classifyError('typing', 'きって', 'きて')).toBe('sokuon_missing')
  })
  it('每種類型都有中文標籤', () => {
    for (const v of Object.values(ERROR_LABELS)) expect(v).toMatch(/[一-鿿]/)
  })
})

describe('FSRS 排程', () => {
  const t0 = new Date('2026-01-01T09:00:00Z')
  const day = 86_400_000

  it('新卡：重來 1 分鐘、困難 5 分鐘、良好／簡單直接畢業', () => {
    const c = newCardFields(t0)
    expect(new Date(schedule(c, 1, t0).due).getTime() - t0.getTime()).toBe(60_000)
    expect(new Date(schedule(c, 2, t0).due).getTime() - t0.getTime()).toBe(300_000)
    const good = schedule(c, 3, t0)
    const easy = schedule(c, 4, t0)
    expect(good.state).toBe('review')
    expect(good.scheduledDays).toBeGreaterThanOrEqual(1)
    expect(easy.scheduledDays).toBeGreaterThan(good.scheduledDays)
  })
  it('複習卡：簡單 ≥ 良好 ≥ 困難 的間隔', () => {
    let c = schedule(newCardFields(t0), 3, t0)
    const t1 = new Date(t0.getTime() + c.scheduledDays * day)
    const hard = schedule(c, 2, t1).scheduledDays
    const good = schedule(c, 3, t1).scheduledDays
    const easy = schedule(c, 4, t1).scheduledDays
    expect(hard).toBeLessThanOrEqual(good)
    expect(good).toBeLessThan(easy)
    c = schedule(c, 3, t1)
    expect(c.reps).toBe(2)
  })
  it('複習卡答錯：進入重新學習、lapses +1、穩定度下降', () => {
    const c = schedule(newCardFields(t0), 3, t0)
    const t1 = new Date(t0.getTime() + c.scheduledDays * day)
    const f = schedule(c, 1, t1)
    expect(f.state).toBe('relearning')
    expect(f.lapses).toBe(1)
    expect(f.stability).toBeLessThan(c.stability)
    expect(new Date(f.due).getTime() - t1.getTime()).toBe(10 * 60_000)
  })
  it('學習中答良好 → 畢業', () => {
    const l = schedule(newCardFields(t0), 1, t0)
    expect(l.state).toBe('learning')
    const g = schedule(l, 3, new Date(t0.getTime() + 60_000))
    expect(g.state).toBe('review')
  })
  it('難度維持在 1–10', () => {
    let c = newCardFields(t0)
    let t = t0
    for (let i = 0; i < 30; i++) {
      c = schedule(c, 1, t)
      t = new Date(t.getTime() + 60_000)
      expect(c.difficulty).toBeGreaterThanOrEqual(1)
      expect(c.difficulty).toBeLessThanOrEqual(10)
    }
    c = newCardFields(t0)
    for (let i = 0; i < 30; i++) {
      c = schedule(c, 4, t)
      t = new Date(new Date(c.due).getTime())
      expect(c.difficulty).toBeGreaterThanOrEqual(1)
    }
  })
  it('間隔不超過上限（含考試日期的上限）', () => {
    expect(nextInterval(1e9, 0.9)).toBe(MAX_INTERVAL)
    expect(nextInterval(1e9, 0.9, 5)).toBe(5)
    expect(nextInterval(0.0001, 0.9)).toBe(1)
  })
  it('同一天重複複習（經過 0 天）不會壞掉', () => {
    const c = schedule(newCardFields(t0), 3, t0)
    const again = schedule(c, 3, t0)
    expect(Number.isFinite(again.stability)).toBe(true)
    expect(again.stability).toBeGreaterThanOrEqual(c.stability)
  })
  it('記憶率：剛複習 = 1，越久越低', () => {
    expect(retrievability(0, 5)).toBe(1)
    expect(retrievability(10, 5)).toBeLessThan(retrievability(1, 5))
    expect(retrievability(5, 0)).toBe(0)
  })
  it('考試日期調整：越近記憶率越高、間隔越短、新卡數提高', () => {
    expect(examAdjust(null, 20, 100)).toEqual({ retention: 0.9, maxInterval: MAX_INTERVAL, newLimit: 20 })
    const far = examAdjust(60, 20, 100)
    const near = examAdjust(5, 20, 100)
    expect(near.retention).toBeGreaterThan(far.retention)
    expect(near.maxInterval).toBeLessThan(far.maxInterval)
    expect(near.newLimit).toBe(34) // 100 張 / (5-2) 天
    expect(examAdjust(0, 20, 500).newLimit).toBe(200) // 上限
    expect(examAdjust(1, 20, 0).maxInterval).toBe(1)
    expect(examAdjust(-3, 20, 100).newLimit).toBe(20) // 考完了
  })
  it('熟練度分級', () => {
    expect(masteryLevel({ state: 'new', stability: 0 })).toBe('new')
    expect(masteryLevel({ state: 'review', stability: 3 })).toBe('learning')
    expect(masteryLevel({ state: 'review', stability: 30 })).toBe('mastered')
  })
  it('間隔顯示', () => {
    expect(formatInterval(60_000)).toBe('1 分')
    expect(formatInterval(3 * day)).toBe('3 天')
  })
})

function log(cardId: string, correct: boolean, at: string, extra: Partial<ReviewLog> = {}): ReviewLog {
  return {
    id: cardId + at,
    cardId,
    deckId: 'd',
    wordId: 'w' + cardId,
    mode: 'kanji2reading',
    prompt: '',
    answer: 'a',
    chosen: correct ? 'a' : 'b',
    options: [],
    correct,
    errorType: correct ? null : 'long_vowel_missing',
    rating: correct ? 3 : 1,
    durationMs: 1000,
    reviewedAt: at,
    source: 'practice',
    sessionId: 's',
    updated_at: at,
    deleted: false,
    ...extra,
  }
}

describe('錯題本', () => {
  it('答錯收錄，連續答對 3 次才移出', () => {
    const logs = [log('c1', false, '2026-01-01T01:00:00Z'), log('c1', true, '2026-01-01T02:00:00Z'), log('c1', true, '2026-01-01T03:00:00Z')]
    expect(computeMistakes(logs).get('c1')!.inBook).toBe(true)
    logs.push(log('c1', true, '2026-01-01T04:00:00Z'))
    expect(computeMistakes(logs).get('c1')!.inBook).toBe(false)
  })
  it('中途又錯，重新計算', () => {
    const logs = [
      log('c1', false, '2026-01-01T01:00:00Z'),
      log('c1', true, '2026-01-01T02:00:00Z'),
      log('c1', true, '2026-01-01T03:00:00Z'),
      log('c1', false, '2026-01-01T04:00:00Z', { chosen: 'x' }),
      log('c1', true, '2026-01-01T05:00:00Z'),
    ]
    const m = computeMistakes(logs).get('c1')!
    expect(m.inBook).toBe(true)
    expect(m.wrongCount).toBe(2)
    expect(m.streak).toBe(1)
    expect(m.lastChosen).toBe('x')
    expect(m.wrongChoices).toEqual(['b', 'x'])
    expect(m.errorTypes.long_vowel_missing).toBe(2)
  })
  it('不受紀錄順序影響（同步合併後順序可能不同）', () => {
    const logs = [log('c1', true, '2026-01-01T04:00:00Z'), log('c1', false, '2026-01-01T01:00:00Z'), log('c1', true, '2026-01-01T03:00:00Z'), log('c1', true, '2026-01-01T02:00:00Z')]
    expect(computeMistakes(logs).get('c1')!.inBook).toBe(false)
  })
  it('從沒錯過的卡不在錯題本', () => {
    expect(computeMistakes([log('c2', true, '2026-01-01T01:00:00Z')]).has('c2')).toBe(false)
  })
})

describe('統計', () => {
  const today = dateKey(new Date())
  const at = (k: string) => new Date(k + 'T12:00:00').toISOString()
  it('連續天數：今天沒練不算斷', () => {
    const logs = [log('a', true, at(addDays(today, -1))), log('b', true, at(addDays(today, -2))), log('c', true, at(addDays(today, -4)))]
    expect(computeStreak(dailyCounts(logs), today)).toBe(2)
    logs.push(log('d', true, at(today)))
    expect(computeStreak(dailyCounts(logs), today)).toBe(3)
    expect(longestStreak(dailyCounts(logs))).toBe(3)
  })
  it('熱力圖最後一格是今天', () => {
    const cols = heatmap(dailyCounts([log('a', true, at(today))]), 10, today, 1)
    const last = cols[cols.length - 1]
    expect(last[last.length - 1]).toEqual({ date: today, count: 1, level: 4 })
    expect(cols).toHaveLength(10)
  })
  it('正確率趨勢與達成率', () => {
    const logs = [log('a', true, at(today)), log('b', false, at(today))]
    const tr = accuracyTrend(dailyCounts(logs), 7, today)
    expect(tr).toHaveLength(7)
    expect(tr[6].accuracy).toBe(0.5)
    expect(goalRate(dailyCounts(logs), 2, 10, today)).toBeCloseTo(0.1)
  })
  it('今天新學的卡', () => {
    const logs = [log('a', true, at(today)), log('b', true, at(addDays(today, -3))), log('b', true, at(today))]
    expect([...newIntroducedToday(logs, today)]).toEqual(['a'])
  })
  it('依頁碼分段熟練度', () => {
    const entries: DeckEntry[] = [
      { id: 'e1', deckId: 'd', wordId: 'w1', page: 2, order: 0, updated_at: '', deleted: false },
      { id: 'e2', deckId: 'd', wordId: 'w2', page: 1, order: 1, updated_at: '', deleted: false },
    ]
    const cards = [card('c1', 'w1', { state: 'review', stability: 50 }), card('c2', 'w2')]
    const s = masteryBySection(entries, cards)
    expect(s.map((x) => x.label)).toEqual(['p.1', 'p.2'])
    expect(s[1].counts.mastered).toBe(1)
    expect(s[0].counts.new).toBe(1)
  })
  it('日期工具', () => {
    expect(diffDays('2026-01-30', '2026-02-02')).toBe(3)
    expect(daysUntil(addDays(today, 10))).toBe(10)
    expect(daysUntil(null)).toBe(null)
  })
})

function card(id: string, wordId: string, extra: Partial<Card> = {}): Card {
  return { id, deckId: 'd', wordId, ...newCardFields(new Date('2026-01-01')), updated_at: '', deleted: false, ...extra }
}

function word(id: string, kanji: string, reading: string, extra: Partial<Word> = {}): Word {
  return { id, kanji, reading, pos: '名詞', meaning: kanji + '的意思', example: '', exampleTranslation: '', tags: [], favorite: false, updated_at: '', deleted: false, ...extra }
}

describe('出題', () => {
  const pool = [
    word('w1', '会う', 'あう', { pos: '動詞', example: '6時に駅で会いましょう。' }),
    word('w2', '椅子', 'いす', { example: 'いすの下にねこがいます。' }),
    word('w3', '', 'アパート', { example: 'このアパートは駅から近いです。' }),
    word('w4', '学校', 'がっこう'),
    word('w5', '先生', 'せんせい'),
  ]
  const dict = buildKanjiDict(pool)
  it('例句挖空：活用形用漢字詞幹、沒漢字時用讀音', () => {
    expect(clozeSentence(pool[0])!.sentence).toBe(`6時に駅で${BLANK}いましょう。`)
    expect(clozeSentence(pool[1])!.sentence).toBe(`${BLANK}の下にねこがいます。`)
    expect(clozeSentence(pool[2])!.sentence).toBe(`この${BLANK}は駅から近いです。`)
    expect(clozeSentence(pool[3])).toBe(null)
  })
  it('沒有漢字的字不出漢字題', () => {
    expect(canAsk('kanji2reading', pool[2])).toBe(false)
    expect(canAsk('listening', pool[2])).toBe(true)
  })
  it('四選一：4 個不重複選項、包含正解', () => {
    const q = buildQuestion('kanji2reading', { id: 'c', deckId: 'd', wordId: 'w4' }, pool[3], pool, makeRng(1), dict)
    expect(q.options).toHaveLength(4)
    expect(q.options.filter((o) => o.text === 'がっこう')).toHaveLength(1)
    expect(new Set(q.options.map((o) => o.text)).size).toBe(4)
  })
  it('打字題：假名、片假名、漢字皆可', () => {
    const q = buildQuestion('typing', { id: 'c', deckId: 'd', wordId: 'w4' }, pool[3], pool, makeRng(1), dict)
    expect(checkTyping(q, 'がっこう')).toBe(true)
    expect(checkTyping(q, 'ガッコウ')).toBe(true)
    expect(checkTyping(q, '学校')).toBe(true)
    expect(checkTyping(q, 'gakkou')).toBe(true)
    expect(checkTyping(q, 'がこう')).toBe(false)
    expect(checkTyping(q, '')).toBe(false)
  })
})

describe('選卡', () => {
  const now = new Date('2026-03-01T10:00:00Z')
  const words = new Map(['w1', 'w2', 'w3', 'w4'].map((id) => [id, word(id, '字' + id, 'じ')]))
  const entries: DeckEntry[] = ['w1', 'w2', 'w3', 'w4'].map((wid, i) => ({ id: 'e' + i, deckId: 'd', wordId: wid, page: i + 1, order: i, updated_at: '', deleted: false }))
  const cards = [
    card('c1', 'w1', { state: 'review', due: '2026-02-01T00:00:00Z' }),
    card('c2', 'w2'),
    card('c3', 'w3'),
    card('c4', 'w4', { state: 'review', due: '2026-05-01T00:00:00Z' }),
  ]
  const base = { cards, entries, words, mistakes: new Map(), now, rng: makeRng(1), newAllowance: new Map([['d', 1]]) }
  it('頁數範圍', () => {
    const r = selectCards({ ...base, scope: { kind: 'pages', from: 2, to: 3 }, count: 10 })
    expect(r.map((c) => c.id).sort()).toEqual(['c2', 'c3'])
  })
  it('只練到期：到期複習卡 + 受每日上限限制的新卡', () => {
    const r = selectCards({ ...base, scope: { kind: 'due' }, count: 10 })
    expect(r.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
  })
  it('題數上限、到期的優先', () => {
    const r = selectCards({ ...base, scope: { kind: 'all' }, count: 1 })
    expect(r.map((c) => c.id)).toEqual(['c1'])
  })
  it('只練錯題', () => {
    const mistakes = computeMistakes([log('c3', false, '2026-02-01T00:00:00Z')])
    const r = selectCards({ ...base, mistakes, scope: { kind: 'mistakes' }, count: 10 })
    expect(r.map((c) => c.id)).toEqual(['c3'])
  })
})
