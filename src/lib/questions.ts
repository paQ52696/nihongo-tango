// 出題：把一張卡變成某種題型的題目
import type { Card, QuestionMode, Word } from '../types'
import {
  displaySurface,
  primaryReading,
  generateReadingDistractors,
  generateSurfaceDistractors,
  generateMeaningDistractors,
  altReadingTraps,
  shuffle,
  type KanjiDict,
  type Option,
} from './distractors'
import { hasKanji, normalizeReading, readingAlternatives, splitSuffix, kataToHira, anyToHiragana } from './kana'

export const MODE_LABELS: Record<QuestionMode, string> = {
  kanji2reading: '漢字 → 讀音',
  reading2kanji: '讀音 → 漢字',
  kanji2meaning: '漢字 → 中文意思',
  typing: '中文 → 日文（打字）',
  listening: '聽音選字',
  cloze: '例句填空',
}

export const MODE_HINTS: Record<QuestionMode, string> = {
  kanji2reading: '選出正確的平假名讀音（N5 考試題型）',
  reading2kanji: '選出這個讀音的漢字寫法',
  kanji2meaning: '選出正確的中文意思',
  typing: '用羅馬拼音或假名輸入日文',
  listening: '聽發音，選出正確的讀音',
  cloze: '選出填入空格的單字（原形）',
}

export interface Question {
  id: string
  cardId: string
  wordId: string
  deckId: string
  mode: QuestionMode
  prompt: string
  promptSub?: string
  speak: string
  answer: string
  options: Option[]
  accepted: string[]
  altReadings: string[]
  word: Word
}

export const BLANK = '＿＿＿'

/** 把例句裡的目標單字挖空。找不到就回傳 null（這個字不能出例句題） */
export function clozeSentence(word: Word): { sentence: string; matched: string } | null {
  const ex = (word.example || '').split('\n')[0]
  if (!ex) return null
  const surface = displaySurface(word)
  const reading = splitSuffix(primaryReading(word.reading)).core
  const stem = (s: string) => s.replace(/[ぁ-ゟ]+$/, '')
  // 依序嘗試：完整表記 → 讀音 → 漢字詞幹（會う→会）→ 讀音去語尾（活用形）
  const s = stem(surface)
  const cands = [surface, splitSuffix(surface).core, reading, hasKanji(s) ? s : '', reading.length >= 3 ? reading.slice(0, -1) : '']
  for (const c of cands) {
    if (!c) continue
    const i = ex.indexOf(c)
    if (i >= 0) return { sentence: ex.slice(0, i) + BLANK + ex.slice(i + c.length), matched: c }
  }
  return null
}

export function canAsk(mode: QuestionMode, word: Word): boolean {
  const hasK = !!word.kanji && hasKanji(displaySurface(word))
  switch (mode) {
    case 'kanji2reading':
    case 'reading2kanji':
      return hasK
    case 'kanji2meaning':
    case 'typing':
      return !!word.meaning
    case 'listening':
      return !!word.reading
    case 'cloze':
      return clozeSentence(word) !== null
  }
}

let qid = 0

export function buildQuestion(mode: QuestionMode, card: Pick<Card, 'id' | 'deckId' | 'wordId'>, word: Word, pool: Word[], rng: () => number, dict: KanjiDict): Question {
  const surface = displaySurface(word)
  const reading = primaryReading(word.reading)
  const core = splitSuffix(reading).core
  const base = {
    id: `q${++qid}`,
    cardId: card.id,
    wordId: word.id,
    deckId: card.deckId,
    mode,
    speak: kataToHira(core),
    accepted: [] as string[],
    altReadings: word.kanji ? altReadingTraps(surface, core, dict) : [],
    word,
  }
  const withAnswer = (answer: string, distractors: Option[]) => shuffle([{ text: answer, kind: 'correct' as const }, ...distractors], rng)
  switch (mode) {
    case 'kanji2reading':
      return { ...base, prompt: surface, answer: reading, options: withAnswer(reading, generateReadingDistractors(word, pool, { rng, dict })) }
    case 'listening':
      return { ...base, prompt: '🔊', answer: reading, options: withAnswer(reading, generateReadingDistractors(word, pool, { rng, dict })) }
    case 'reading2kanji':
      return { ...base, prompt: reading, answer: surface, options: withAnswer(surface, generateSurfaceDistractors(word, pool, { rng })) }
    case 'kanji2meaning':
      return { ...base, prompt: surface, answer: word.meaning, options: withAnswer(word.meaning, generateMeaningDistractors(word, pool, { rng })) }
    case 'typing': {
      const accepted = [...readingAlternatives(word.reading).map(normalizeReading), ...(word.kanji ? [surface] : [])]
      return { ...base, prompt: word.meaning, promptSub: word.pos || undefined, answer: reading, options: [], accepted }
    }
    case 'cloze': {
      const c = clozeSentence(word)!
      return {
        ...base,
        prompt: c.sentence,
        promptSub: word.exampleTranslation || word.meaning,
        answer: surface,
        options: withAnswer(surface, generateSurfaceDistractors(word, pool, { rng })),
      }
    }
  }
}

/** 打字題判斷：羅馬拼音、平假名、片假名、漢字皆可 */
export function checkTyping(q: Pick<Question, 'accepted'>, input: string): boolean {
  const v = input.trim()
  if (!v) return false
  if (q.accepted.includes(v)) return true
  return q.accepted.includes(normalizeReading(anyToHiragana(v)))
}
