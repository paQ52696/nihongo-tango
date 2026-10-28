// 動詞變化：判斷動詞分組（第 14 課）、ます形、て形，以及て形的常見錯誤（干擾選項）
import type { Word } from '../types'
import { displaySurface, shuffle } from './distractors'
import { speakTextFor } from './audioKey'

export type VerbGroup = 'godan' | 'ichidan' | 'suru' | 'kuru'

export const GROUP_LABELS: Record<VerbGroup, string> = {
  godan: '第 I 類（五段動詞）',
  ichidan: '第 II 類（一段動詞）',
  suru: '第 III 類（する動詞）',
  kuru: '第 III 類（来る）',
}

export interface VerbInfo {
  surface: string
  dict: string // 辭書形（平假名）
  group: VerbGroup
}

// 長得像一段（〜iる／〜eる）但其實是五段的動詞
const GODAN_RU = new Set(['帰る', '入る', '走る', '知る', '切る', '要る', '減る', '喋る', '滑る', '蹴る', '限る', '握る', '参る', '焦る', '散る', '照る', '練る', '混じる', '湿る', '茂る', '遮る', '覆る', 'しゃべる', 'すべる'])

const I_ROW = 'いきぎしじちぢにひびぴみり'
const E_ROW = 'えけげせぜてでねへべぺめれ'
const U_TO_I: Record<string, string> = { う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り' }

export function verbGroup(surface: string, dict: string): VerbGroup | null {
  if (dict.endsWith('する')) return 'suru'
  if (dict === 'くる' || surface === '来る') return 'kuru'
  const last = dict.slice(-1)
  if (!(last in U_TO_I)) return null
  if (last === 'る' && dict.length >= 2 && (I_ROW + E_ROW).includes(dict.slice(-2, -1)) && !GODAN_RU.has(surface)) return 'ichidan'
  return 'godan'
}

// 結尾像動詞、但其實是名詞／副詞（PDF 匯入時詞性是用規則推測的，會誤判）
const NOT_VERBS = new Set(['近く', '遠く', '多く', '全く', '早く', '真っ直ぐ', 'まっすぐ', '向こう', '一緒', '少し'])

export function verbInfo(word: Word): VerbInfo | null {
  if (word.kind || !/動詞|verb/i.test(word.pos)) return null
  const dict = speakTextFor(word)
  const surface = displaySurface(word)
  if (NOT_VERBS.has(surface)) return null
  const group = verbGroup(surface, dict)
  return group ? { surface, dict, group } : null
}

/** ます形的語幹（書く→かき、見る→み、勉強する→べんきょうし、来る→き） */
export function masuStem(v: Pick<VerbInfo, 'dict' | 'group'>): string {
  const head = v.dict.slice(0, -1)
  switch (v.group) {
    case 'godan':
      return head + U_TO_I[v.dict.slice(-1)]
    case 'ichidan':
      return head
    case 'suru':
      return v.dict.slice(0, -2) + 'し'
    case 'kuru':
      return 'き'
  }
}

export function masuForm(v: Pick<VerbInfo, 'dict' | 'group'>): string {
  return masuStem(v) + 'ます'
}

export function teForm(v: Pick<VerbInfo, 'dict' | 'group'>): string {
  const head = v.dict.slice(0, -1)
  switch (v.group) {
    case 'ichidan':
      return head + 'て'
    case 'suru':
      return v.dict.slice(0, -2) + 'して'
    case 'kuru':
      return 'きて'
    case 'godan': {
      if (v.dict === 'いく' || v.dict === 'ゆく') return head + 'って' // 行く→行って（例外）
      switch (v.dict.slice(-1)) {
        case 'う':
        case 'つ':
        case 'る':
          return head + 'って'
        case 'む':
        case 'ぶ':
        case 'ぬ':
          return head + 'んで'
        case 'く':
          return head + 'いて'
        case 'ぐ':
          return head + 'いで'
        default:
          return head + 'して' // す
      }
    }
  }
}

/** て形的干擾選項：套錯分組或錯的音便規則（かいて／かって／かきて／かいで） */
export function teDistractors(v: Pick<VerbInfo, 'dict' | 'group'>, rng: () => number): string[] {
  const answer = teForm(v)
  const head = v.dict.slice(0, -1)
  const stem = masuStem(v)
  const swapVoice = answer.endsWith('て') ? answer.slice(0, -1) + 'で' : answer.slice(0, -1) + 'て'
  // 越前面越像真的錯誤
  const ordered = [
    stem + 'て', // 用ます形語幹接て（かきて、のみて）
    v.group === 'ichidan' ? head + 'って' : head + 'て', // 分組判斷錯誤（みって／かえて）
    swapVoice, // て／で 搞混
    head + 'って',
    head + 'んで',
    head + 'いて',
    head + 'いで',
    v.dict + 'て',
  ]
  const uniq = [...new Set(ordered)].filter((s) => s !== answer && s.length > 1)
  // 前兩個固定保留，最後一個從其餘隨機挑，避免每次都一樣
  const picked = uniq.slice(0, 2)
  const rest = shuffle(uniq.slice(2), rng)
  return [...picked, ...rest].slice(0, 3)
}

/** ます形的干擾選項：一段／五段搞混（かえます／かえります、みります） */
export function masuDistractors(v: Pick<VerbInfo, 'dict' | 'group'>, rng: () => number): string[] {
  const answer = masuForm(v)
  const head = v.dict.slice(0, -1)
  const ordered = [
    v.group === 'ichidan' ? head + 'ります' : head + 'ます',
    v.dict + 'ます',
    head + 'えます',
    head + 'います',
  ]
  return shuffle([...new Set(ordered)].filter((s) => s !== answer), rng).slice(0, 3)
}
