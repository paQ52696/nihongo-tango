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
import { canReorder, particleQuestion, particleSlots, reorderTiles, shuffleTiles } from './sentences'
import { GROUP_LABELS, masuDistractors, masuForm, teDistractors, teForm, verbInfo } from './conjugate'
import { grammarPoint } from '../data/grammar'

export const MODE_LABELS: Record<QuestionMode, string> = {
  kanji2reading: '漢字 → 讀音',
  reading2kanji: '讀音 → 漢字',
  kanji2meaning: '漢字 → 中文意思',
  typing: '中文 → 日文（打字）',
  listening: '聽音選字',
  cloze: '例句填空',
  conjugate: '動詞變化（て形・ます形）',
  ja2zh: '日翻中',
  zh2ja: '中翻日（打字）',
  reorder: '語順重組',
  particle: '助詞填空',
  grammar: '文法題',
}

/** 練習頁的題型分組 */
export const MODE_GROUPS: { title: string; modes: QuestionMode[] }[] = [
  { title: '單字', modes: ['kanji2reading', 'reading2kanji', 'kanji2meaning', 'typing', 'listening', 'cloze', 'conjugate'] },
  { title: '課文句子', modes: ['zh2ja', 'ja2zh', 'reorder', 'particle'] },
  { title: '文法', modes: ['grammar'] },
]

/** 作答方式：選擇題以外的題型要不同的畫面 */
export type Interaction = 'choice' | 'typing' | 'reveal' | 'reorder' | 'sentence'

export const INTERACTION: Record<QuestionMode, Interaction> = {
  kanji2reading: 'choice',
  reading2kanji: 'choice',
  kanji2meaning: 'choice',
  typing: 'typing',
  listening: 'choice',
  cloze: 'choice',
  conjugate: 'choice',
  ja2zh: 'reveal',
  zh2ja: 'sentence',
  reorder: 'reorder',
  particle: 'choice',
  grammar: 'choice',
}

export const MODE_HINTS: Record<QuestionMode, string> = {
  kanji2reading: '選出正確的平假名讀音（N5 考試題型）',
  reading2kanji: '選出這個讀音的漢字寫法',
  kanji2meaning: '選出正確的中文意思',
  typing: '用羅馬拼音或假名輸入日文',
  listening: '聽發音，選出正確的讀音',
  cloze: '選出填入空格的單字（原形）',
  conjugate: '選出正確的變化形',
  ja2zh: '先在心裡（或紙上）翻成中文，再看答案自評',
  zh2ja: '打出課本的日文原句（羅馬拼音會轉成假名，漢字用輸入法）',
  reorder: '依序點選字卡，排出正確的日文句子',
  particle: '選出填入（　）的助詞',
  grammar: '選出最適合的答案',
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
  /** 語順重組：打亂後的字卡 */
  tiles?: string[]
  /** 課文句子：對話的上一句（給中翻日、日翻中當提示） */
  context?: string
  /** 作答後顯示的解說（文法題、動詞變化） */
  explain?: string
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
  if (word.kind === 'sentence') {
    switch (mode) {
      case 'ja2zh':
      case 'zh2ja':
        return !!word.meaning
      case 'reorder':
        return !!word.meaning && canReorder(word)
      case 'particle':
        return particleSlots(word).length > 0
      default:
        return false
    }
  }
  if (word.kind === 'grammar') return mode === 'grammar' && !!grammarPoint(word.grammarId)?.questions.length
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
    case 'conjugate':
      return verbInfo(word) !== null
    default:
      return false
  }
}

let qid = 0

export function buildQuestion(mode: QuestionMode, card: Pick<Card, 'id' | 'deckId' | 'wordId'>, word: Word, pool: Word[], rng: () => number, dict: KanjiDict, ctx: { context?: string } = {}): Question {
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
    altReadings: word.kanji && !word.kind ? altReadingTraps(surface, core, dict) : [],
    word,
  }
  const plain = (texts: string[]) => texts.map((text) => ({ text, kind: 'random' as const }))
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
    case 'conjugate': {
      const v = verbInfo(word)!
      const te = rng() < 0.7
      const answer = te ? teForm(v) : masuForm(v)
      return {
        ...base,
        prompt: v.surface === v.dict ? v.dict : `${v.surface}（${v.dict}）`,
        promptSub: te ? '→ て形' : '→ ます形',
        answer,
        options: withAnswer(answer, plain(te ? teDistractors(v, rng) : masuDistractors(v, rng))),
        explain: `${GROUP_LABELS[v.group]}：${v.dict} → ${masuForm(v)}・${teForm(v)}`,
      }
    }
    case 'ja2zh':
      return { ...base, prompt: word.kanji, promptSub: word.speaker ? `（${word.speaker}）` : undefined, answer: word.meaning, options: [], context: ctx.context }
    case 'zh2ja':
      return { ...base, prompt: word.meaning, promptSub: word.speaker ? `（${word.speaker}）` : undefined, answer: word.kanji, options: [], context: ctx.context }
    case 'reorder': {
      const tiles = reorderTiles(word)
      return { ...base, prompt: word.meaning, answer: tiles.join(''), options: [], tiles: shuffleTiles(tiles, rng) }
    }
    case 'particle': {
      const p = particleQuestion(word, rng)!
      return { ...base, prompt: p.sentence, promptSub: word.meaning, answer: p.answer, options: withAnswer(p.answer, plain(p.distractors)) }
    }
    case 'grammar': {
      const gp = grammarPoint(word.grammarId)!
      const gq = gp.questions[Math.floor(rng() * gp.questions.length)]
      return {
        ...base,
        speak: '',
        prompt: gq.stem,
        answer: gq.answer,
        options: withAnswer(gq.answer, plain(gq.options.filter((o) => o !== gq.answer))),
        explain: [`【${gp.pattern}】${gp.meaning}`, gq.explain, gp.explanation].filter(Boolean).join('\n'),
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
