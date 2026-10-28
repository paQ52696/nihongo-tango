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
  /** 單字庫存的是ます形（課本「遊びます I」的寫法）：出題時用ます形問て形 */
  masu?: { surface: string; reading: string }
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

/** 詞性欄標的分組（課本寫「動詞I／II／III」或羅馬數字Ⅰ／Ⅱ／Ⅲ） */
function groupFromPos(pos: string): 'I' | 'II' | 'III' | null {
  const m = pos.match(/(III|Ⅲ|II|Ⅱ|I|Ⅰ)\s*\*?$/)
  if (!m) return null
  return ({ III: 'III', Ⅲ: 'III', II: 'II', Ⅱ: 'II', I: 'I', Ⅰ: 'I' } as const)[m[1] as 'I']
}

const I_TO_U: Record<string, string> = Object.fromEntries(Object.entries(U_TO_I).map(([u, i]) => [i, u]))

/** ます形 → 辭書形（遊びます→遊ぶ、見せます→見せる、散歩します→散歩する、来ます→来る） */
function fromMasu(s: string, group: VerbGroup): string {
  const stem = s.slice(0, -2)
  switch (group) {
    case 'godan':
      return stem.slice(0, -1) + (I_TO_U[stem.slice(-1)] ?? stem.slice(-1))
    case 'ichidan':
      return stem + 'る'
    case 'suru':
      return stem.slice(0, -1) + 'する'
    case 'kuru':
      return stem.slice(0, -1) + (stem.endsWith('来') ? '来る' : 'くる')
  }
}

export function verbInfo(word: Word): VerbInfo | null {
  if (word.kind || !/動詞|verb/i.test(word.pos)) return null
  const reading = speakTextFor(word)
  const surface = displaySurface(word)
  if (NOT_VERBS.has(surface)) return null
  const g = groupFromPos(word.pos)
  if (reading.endsWith('ます')) {
    // ます形一定要有分組才判斷得出辭書形（見ます／遊びます 長得一樣）
    if (!g) return null
    const group: VerbGroup = g === 'I' ? 'godan' : g === 'II' ? 'ichidan' : reading === 'きます' || surface.endsWith('来ます') ? 'kuru' : 'suru'
    return { surface: fromMasu(surface, group), dict: fromMasu(reading, group), group, masu: { surface, reading } }
  }
  const guessed = verbGroup(surface, reading)
  if (!guessed) return null
  // 有標分組就以標的為準（帰る、要る 這類例外不用靠表）
  const group: VerbGroup = g === 'I' ? 'godan' : g === 'II' ? 'ichidan' : guessed
  return { surface, dict: reading, group }
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
      if (v.dict === 'いく' || v.dict === 'ゆく' || v.dict.endsWith('行く')) return head + 'って' // 行く→行って（例外）
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

/** て形用的是哪一條規則（從ます形看，和課本教法一致） */
export function teRule(v: Pick<VerbInfo, 'dict' | 'group'>): string {
  switch (v.group) {
    case 'ichidan':
      return '第 II 類：去掉「ます」加「て」'
    case 'suru':
      return '第 III 類：します → して'
    case 'kuru':
      return '第 III 類：来ます → 来て'
    case 'godan': {
      if (v.dict === 'いく' || v.dict === 'ゆく' || v.dict.endsWith('行く')) return '第 I 類例外：行きます → 行って'
      const i = U_TO_I[v.dict.slice(-1)]
      if ('いちり'.includes(i)) return '第 I 類：い・ち・り → って'
      if ('みびに'.includes(i)) return '第 I 類：み・び・に → んで'
      if (i === 'き') return '第 I 類：き → いて'
      if (i === 'ぎ') return '第 I 類：ぎ → いで'
      return '第 I 類：し → して'
    }
  }
}

// 「〜します」但其實是第 I 類（す結尾）的常見動詞；其他較長的〜します當成「名詞＋します」
const GODAN_SU = new Set([
  ...'はなします けします かします かえします だします おします おろします おもいだします わたします さがします なくします まわします なおします'.split(' '),
  ...'話します 消します 貸します 返します 出します 押します 下ろします 思い出します 渡します 探します 無くします 回します 直します'.split(' '),
])

/**
 * 講解頁的「て形轉換器」：輸入辭書形或ます形（假名），回傳變化結果。
 * ます形需要知道分組（見ます／遊びます 看不出來），沒給時用簡單規則猜：え段＋ます→II、きます→来ます、其餘→I。
 */
export function convertVerb(input: string, group?: 'I' | 'II' | 'III'): (VerbInfo & { guessed: boolean }) | null {
  const s = input.trim().replace(/\s/g, '')
  if (!s) return null
  if (s.endsWith('ます') && s.length > 2) {
    const stem = s.slice(0, -2)
    const guess: 'I' | 'II' | 'III' = E_ROW.includes(stem.slice(-1)) ? 'II' : s === 'きます' || s === '来ます' || (s.endsWith('します') && stem.length > 2 && !GODAN_SU.has(s)) ? 'III' : 'I'
    const g = group ?? guess
    const vg: VerbGroup = g === 'I' ? 'godan' : g === 'II' ? 'ichidan' : s === 'きます' || s.endsWith('来ます') ? 'kuru' : 'suru'
    if (vg === 'godan' && !I_ROW.includes(stem.slice(-1))) return null
    return { surface: fromMasu(s, vg), dict: fromMasu(s, vg), group: vg, masu: { surface: s, reading: s }, guessed: !group }
  }
  const auto = verbGroup(s, s)
  if (!auto) return null
  const vg: VerbGroup = group === 'I' ? 'godan' : group === 'II' ? 'ichidan' : group === 'III' ? (s.endsWith('くる') || s.endsWith('来る') ? 'kuru' : 'suru') : auto
  return { surface: s, dict: s, group: vg, guessed: !group }
}
