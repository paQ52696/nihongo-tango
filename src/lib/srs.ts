// FSRS-4.5 間隔重複排程（預設參數）+ 考試日期調整
import type { Card, CardState, Rating } from '../types'

export const FSRS_W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755]
const DECAY = -0.5
const FACTOR = 19 / 81
export const MAX_INTERVAL = 36500
const DAY = 86_400_000
const MIN = 60_000

export const RATING_LABELS: Record<Rating, string> = { 1: '重來', 2: '困難', 3: '良好', 4: '簡單' }

/** 熟練門檻：穩定度 ≥ 這個天數算「已熟練」 */
export const MASTERED_STABILITY = 10

export interface SchedulerOptions {
  retention?: number // 期望記憶率
  maxInterval?: number
}

export type SrsFields = Pick<Card, 'state' | 'due' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'lastReview' | 'scheduledDays'>

export function newCardFields(now: Date = new Date()): SrsFields {
  return { state: 'new', due: now.toISOString(), stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReview: null, scheduledDays: 0 }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY)
}

export function nextInterval(stability: number, retention: number, maxInterval = MAX_INTERVAL): number {
  const r = clamp(retention, 0.7, 0.99)
  const ivl = (stability / FACTOR) * (Math.pow(r, 1 / DECAY) - 1)
  return clamp(Math.round(ivl), 1, Math.max(1, maxInterval))
}

const initStability = (g: Rating) => Math.max(FSRS_W[g - 1], 0.1)
const initDifficulty = (g: Rating) => clamp(FSRS_W[4] - (g - 3) * FSRS_W[5], 1, 10)

function nextDifficulty(d: number, g: Rating): number {
  const next = d - FSRS_W[6] * (g - 3)
  return clamp(FSRS_W[7] * initDifficulty(4) + (1 - FSRS_W[7]) * next, 1, 10)
}

function recallStability(d: number, s: number, r: number, g: Rating): number {
  const hard = g === 2 ? FSRS_W[15] : 1
  const easy = g === 4 ? FSRS_W[16] : 1
  return s * (Math.exp(FSRS_W[8]) * (11 - d) * Math.pow(s, -FSRS_W[9]) * (Math.exp(FSRS_W[10] * (1 - r)) - 1) * hard * easy + 1)
}

function forgetStability(d: number, s: number, r: number): number {
  const sf = FSRS_W[11] * Math.pow(d, -FSRS_W[12]) * (Math.pow(s + 1, FSRS_W[13]) - 1) * Math.exp(FSRS_W[14] * (1 - r))
  return Math.min(sf, s)
}

/** 依自評更新一張卡。學習中的卡用分鐘級步驟，畢業後用 FSRS 天數。 */
export function schedule(card: SrsFields, rating: Rating, now: Date = new Date(), opts: SchedulerOptions = {}): SrsFields {
  const retention = opts.retention ?? 0.9
  const maxIvl = opts.maxInterval ?? MAX_INTERVAL
  const elapsed = card.lastReview ? (now.getTime() - new Date(card.lastReview).getTime()) / DAY : 0
  let { state, stability: s, difficulty: d, lapses } = card
  let dueMs: number
  let scheduledDays = 0
  const toReview = (stab: number) => {
    scheduledDays = nextInterval(stab, retention, maxIvl)
    return now.getTime() + scheduledDays * DAY
  }

  if (state === 'new') {
    s = initStability(rating)
    d = initDifficulty(rating)
    if (rating === 1) [state, dueMs] = ['learning', now.getTime() + 1 * MIN]
    else if (rating === 2) [state, dueMs] = ['learning', now.getTime() + 5 * MIN]
    else [state, dueMs] = ['review', toReview(s)]
  } else if (state === 'learning' || state === 'relearning') {
    d = nextDifficulty(d, rating)
    if (rating === 1) {
      s = Math.max(0.1, Math.min(s, initStability(1)))
      dueMs = now.getTime() + 1 * MIN
    } else if (rating === 2) {
      dueMs = now.getTime() + 5 * MIN
    } else {
      if (rating === 4) s = Math.max(s, initStability(4) * (state === 'relearning' ? 0.5 : 1))
      state = 'review'
      dueMs = toReview(s)
    }
  } else {
    const r = retrievability(elapsed, s)
    d = nextDifficulty(d, rating)
    if (rating === 1) {
      s = forgetStability(card.difficulty, s, r)
      lapses += 1
      state = 'relearning'
      dueMs = now.getTime() + 10 * MIN
    } else {
      s = recallStability(card.difficulty, s, r, rating)
      dueMs = toReview(s)
    }
  }

  return {
    state: state as CardState,
    due: new Date(dueMs).toISOString(),
    stability: Number(s.toFixed(4)),
    difficulty: Number(d.toFixed(4)),
    reps: card.reps + 1,
    lapses,
    lastReview: now.toISOString(),
    scheduledDays,
  }
}

/** 預覽四個按鈕各自的下次間隔（顯示在按鈕上） */
export function previewIntervals(card: SrsFields, now = new Date(), opts: SchedulerOptions = {}): Record<Rating, number> {
  const out = {} as Record<Rating, number>
  for (const g of [1, 2, 3, 4] as Rating[]) out[g] = new Date(schedule(card, g, now, opts).due).getTime() - now.getTime()
  return out
}

export function formatInterval(ms: number): string {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} 分`
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))} 小時`
  const d = Math.round(ms / DAY)
  if (d < 30) return `${d} 天`
  if (d < 365) return `${Math.round(d / 30)} 個月`
  return `${(d / 365).toFixed(1)} 年`
}

// ---------- 考試日期調整 ----------
export interface ExamAdjust {
  retention: number
  maxInterval: number
  newLimit: number
}

/**
 * 離考試越近：期望記憶率提高（複習更頻繁）、間隔不超過考試日、每日新卡數提高到考前能學完。
 * daysLeft = null 表示沒有設定考試日期。
 */
export function examAdjust(daysLeft: number | null, baseNewLimit: number, remainingNew: number): ExamAdjust {
  if (daysLeft === null || daysLeft < 0) return { retention: 0.9, maxInterval: MAX_INTERVAL, newLimit: baseNewLimit }
  const retention = daysLeft <= 3 ? 0.97 : daysLeft <= 7 ? 0.95 : daysLeft <= 14 ? 0.93 : daysLeft <= 30 ? 0.92 : 0.9
  // 考前讓每張卡至少再複習一次：間隔不超過剩餘天數的一半（最少 1 天）
  const maxInterval = Math.max(1, Math.floor(daysLeft / 2))
  // 預留最後 2 天只複習不學新字
  const studyDays = Math.max(1, daysLeft - 2)
  const needed = Math.ceil(remainingNew / studyDays)
  const newLimit = Math.min(Math.max(baseNewLimit, needed), 200)
  return { retention, maxInterval, newLimit }
}

export function isMastered(c: Pick<Card, 'state' | 'stability'>): boolean {
  return c.state === 'review' && c.stability >= MASTERED_STABILITY
}

export type MasteryLevel = 'new' | 'learning' | 'mastered'
export function masteryLevel(c: Pick<Card, 'state' | 'stability'>): MasteryLevel {
  if (c.state === 'new') return 'new'
  return isMastered(c) ? 'mastered' : 'learning'
}
