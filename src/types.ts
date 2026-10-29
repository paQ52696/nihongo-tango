// 資料模型。所有同步資料表都有 id / updated_at / deleted；_dirty 只存在本機。
export interface SyncFields {
  id: string
  updated_at: string
  deleted: boolean
  _dirty?: 0 | 1
}

export interface Word extends SyncFields {
  kanji: string // 漢字表記（沒有漢字的字可空白）
  reading: string // 讀音（平假名；片假名外來語照原樣）
  pos: string // 詞性
  meaning: string // 中文意思
  example: string
  exampleTranslation: string
  tags: string[]
  favorite: boolean
  note?: string
  /** 沒有值＝單字；sentence＝課文句子；grammar＝文法點；counter＝數字・量詞（存在 data jsonb，同步不需要改資料表） */
  kind?: WordKind
  /** 課文句子：文節切分（語順重組、助詞填空用），合起來等於 kanji */
  chunks?: string[]
  /** 課文句子：每個文節的假名讀音（中翻日接受假名作答） */
  chunkReadings?: string[]
  /** 課文句子：說話者（對話中的角色） */
  speaker?: string
  /** 文法點：對應內建題庫的 id */
  grammarId?: string
  /** 數字・量詞：對應內建題庫的 id（每次出題隨機挑一個數字） */
  counterId?: string
}

export type WordKind = 'sentence' | 'grammar' | 'counter'

export interface Deck extends SyncFields {
  name: string
  color: string
  icon: string
  examDate?: string | null // YYYY-MM-DD
  dailyNewLimit: number
  sortOrder: number
  createdAt: string
}

export interface DeckEntry extends SyncFields {
  deckId: string
  wordId: string
  page?: number | null
  lesson?: string | null // 課次／章節
  order: number
}

export type CardState = 'new' | 'learning' | 'review' | 'relearning'

export interface Card extends SyncFields {
  deckId: string
  wordId: string
  state: CardState
  due: string // ISO
  stability: number
  difficulty: number
  reps: number
  lapses: number
  lastReview: string | null
  scheduledDays: number
}

export type Rating = 1 | 2 | 3 | 4 // 重來 困難 良好 簡單

export type QuestionMode =
  // 單字
  | 'kanji2reading'
  | 'reading2kanji'
  | 'kanji2meaning'
  | 'typing'
  | 'listening'
  | 'cloze'
  | 'conjugate' // 動詞變化（ます形、て形、ない形、た形、辭書形）
  | 'adjective' // 形容詞變化（否定、過去、て形）
  // 課文句子
  | 'ja2zh' // 日翻中：看答案後自評
  | 'zh2ja' // 中翻日：打字，與課本原句比對
  | 'reorder' // 語順重組
  | 'particle' // 助詞填空
  // 文法點
  | 'grammar'
  // 數字・時間・日期・量詞
  | 'counter'

export type ErrorType =
  | 'long_vowel_missing'
  | 'long_vowel_extra'
  | 'sokuon_missing'
  | 'sokuon_extra'
  | 'dakuten'
  | 'youon'
  | 'mixed'
  | 'alt_reading'
  | 'kanji_confusion'
  | 'meaning'
  | 'conjugation'
  | 'particle'
  | 'word_order'
  | 'translation'
  | 'grammar'
  | 'timeout'
  | 'other'

export interface ReviewLog extends SyncFields {
  cardId: string
  deckId: string
  wordId: string
  mode: QuestionMode
  prompt: string
  answer: string
  chosen: string | null
  options: string[]
  correct: boolean
  errorType: ErrorType | null
  rating: Rating | null
  durationMs: number
  reviewedAt: string
  source: 'practice' | 'exam'
  sessionId: string
}

export interface Settings extends SyncFields {
  dailyGoal: number
  ttsEnabled: boolean
  ttsRate: number
  autoPlay: boolean
}

export type SyncTable = 'words' | 'decks' | 'deckEntries' | 'cards' | 'reviewLogs' | 'settings'
export const SYNC_TABLES: SyncTable[] = ['decks', 'words', 'deckEntries', 'cards', 'reviewLogs', 'settings']
