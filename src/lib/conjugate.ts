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

// ---------- ない形、た形、辭書形（第 17、19 課以後；N5 必考） ----------

const U_TO_A: Record<string, string> = { う: 'わ', く: 'か', ぐ: 'が', す: 'さ', つ: 'た', ぬ: 'な', ぶ: 'ば', む: 'ま', る: 'ら' }

export function naiForm(v: Pick<VerbInfo, 'dict' | 'group'>): string {
  const head = v.dict.slice(0, -1)
  switch (v.group) {
    case 'ichidan':
      return head + 'ない'
    case 'suru':
      return v.dict.slice(0, -2) + 'しない'
    case 'kuru':
      return 'こない'
    case 'godan':
      if (v.dict === 'ある') return 'ない' // ある→ない（例外）
      return head + U_TO_A[v.dict.slice(-1)] + 'ない'
  }
}

/** た形＝て形的「て／で」換成「た／だ」 */
export function taForm(v: Pick<VerbInfo, 'dict' | 'group'>): string {
  const te = teForm(v)
  return te.slice(0, -1) + (te.endsWith('で') ? 'だ' : 'た')
}

/** ます形的漢字寫法（書く→書きます、来る→来ます），講解頁與出題顯示用 */
export function masuSurface(v: Pick<VerbInfo, 'surface' | 'dict' | 'group'>): string {
  const s = v.surface
  switch (v.group) {
    case 'godan':
      return U_TO_I[s.slice(-1)] ? s.slice(0, -1) + U_TO_I[s.slice(-1)] + 'ます' : masuForm(v)
    case 'ichidan':
      return s.slice(0, -1) + 'ます'
    case 'suru':
      return s.slice(0, -2) + 'します'
    case 'kuru':
      return s.endsWith('来る') ? s.slice(0, -2) + '来ます' : masuForm(v)
  }
}

/** ない形的干擾選項：分組判斷錯誤（みらない／かえない）、う→あない、ある→あらない、する／来る 的錯誤 */
export function naiDistractors(v: Pick<VerbInfo, 'dict' | 'group'>, rng: () => number): string[] {
  const answer = naiForm(v)
  const head = v.dict.slice(0, -1)
  const ordered: string[] = []
  switch (v.group) {
    case 'godan':
      if (v.dict === 'ある') ordered.push('あらない', 'ありない')
      if (v.dict.endsWith('う')) ordered.push(head + 'あない')
      ordered.push(masuStem(v) + 'ない', head + 'えない', v.dict + 'ない')
      break
    case 'ichidan':
      ordered.push(head + 'らない', v.dict + 'ない', head + 'わない')
      break
    case 'suru':
      ordered.push(v.dict.slice(0, -2) + 'さない', v.dict.slice(0, -2) + 'すない', v.dict.slice(0, -2) + 'しらない')
      break
    case 'kuru':
      ordered.push('きない', 'くない', 'こらない')
      break
  }
  const uniq = [...new Set(ordered)].filter((s) => s !== answer)
  return [...uniq.slice(0, 2), ...shuffle(uniq.slice(2), rng)].slice(0, 3)
}

/** た形的干擾選項：沿用て形的錯誤（かきた／かった／かいだ） */
export function taDistractors(v: Pick<VerbInfo, 'dict' | 'group'>, rng: () => number): string[] {
  const answer = taForm(v)
  const toTa = (te: string) => te.slice(0, -1) + (te.endsWith('で') ? 'だ' : 'た')
  return [...new Set(teDistractors(v, rng).map(toTa))].filter((s) => s !== answer).slice(0, 3)
}

const E_TO_U: Record<string, string> = { え: 'う', け: 'く', げ: 'ぐ', せ: 'す', ぜ: 'ず', て: 'つ', で: 'づ', ね: 'ぬ', へ: 'ふ', べ: 'ぶ', ぺ: 'ぷ', め: 'む', れ: 'る' }

/** 辭書形的干擾選項（從ます形變回來）：い段→う段 弄錯、II 類多加／少加 る */
export function dictDistractors(v: Pick<VerbInfo, 'dict' | 'group'>, rng: () => number): string[] {
  const answer = v.dict
  const stem = masuStem(v)
  const last = stem.slice(-1)
  const base = v.dict.slice(0, -2)
  const ordered: string[] =
    v.group === 'godan'
      ? [stem + 'る', stem.slice(0, -1) + 'う', stem + 'う', stem] // かえりる、かえう（當成 II 類或變錯段）
      : v.group === 'ichidan'
        ? [stem.slice(0, -1) + (I_TO_U[last] ?? E_TO_U[last] ?? ''), stem + 'りる', stem + 'う', stem.slice(0, -1) + 'る', stem.slice(0, -1) + (I_TO_U[last] ?? E_TO_U[last] ?? '') + 'る'] // たぶ、おく（當成 I 類）
        : v.group === 'suru'
          ? [base + 'しる', base + 'す', base + 'さる', base + 'しう']
          : ['きる', 'こる', 'きくる']
  const uniq = [...new Set(ordered)].filter((s) => s !== answer && s.length > 1)
  return [...uniq.slice(0, 1), ...shuffle(uniq.slice(1), rng)].slice(0, 3)
}

export type VerbForm = 'masu' | 'te' | 'nai' | 'ta' | 'dict'

export const VERB_FORMS: { id: VerbForm; label: string }[] = [
  { id: 'masu', label: 'ます形' },
  { id: 'te', label: 'て形' },
  { id: 'nai', label: 'ない形' },
  { id: 'ta', label: 'た形' },
  { id: 'dict', label: '辭書形' },
]

export function verbForm(v: Pick<VerbInfo, 'dict' | 'group'>, form: VerbForm): string {
  switch (form) {
    case 'masu':
      return masuForm(v)
    case 'te':
      return teForm(v)
    case 'nai':
      return naiForm(v)
    case 'ta':
      return taForm(v)
    case 'dict':
      return v.dict
  }
}

export function verbDistractors(v: Pick<VerbInfo, 'dict' | 'group'>, form: VerbForm, rng: () => number): string[] {
  switch (form) {
    case 'masu':
      return masuDistractors(v, rng)
    case 'te':
      return teDistractors(v, rng)
    case 'nai':
      return naiDistractors(v, rng)
    case 'ta':
      return taDistractors(v, rng)
    case 'dict':
      return dictDistractors(v, rng)
  }
}

const TE_TO_TA: Record<string, string> = { って: 'った', んで: 'んだ', いて: 'いた', いで: 'いだ', して: 'した', 来て: '来た', '「て」': '「た」' }

/** 每種變化用的規則（從ます形看，和課本教法一致） */
export function formRule(v: Pick<VerbInfo, 'dict' | 'group'>, form: VerbForm): string {
  const g = v.group
  switch (form) {
    case 'te':
      return teRule(v)
    case 'ta':
      return teRule(v).replace(/(って|んで|いて|いで|して|来て|「て」)$/, (m) => TE_TO_TA[m])
    case 'masu':
      return g === 'godan' ? '第 I 類：う段 → い段＋ます' : g === 'ichidan' ? '第 II 類：去掉「る」加「ます」' : g === 'suru' ? '第 III 類：する → します' : '第 III 類：来る → 来ます'
    case 'nai':
      if (v.dict === 'ある') return '例外：ある → ない'
      return g === 'godan' ? '第 I 類：い段 → あ段＋ない（い → わ）' : g === 'ichidan' ? '第 II 類：去掉「ます」加「ない」' : g === 'suru' ? '第 III 類：します → しない' : '第 III 類：来ます → 来ない（こない）'
    case 'dict':
      return g === 'godan' ? '第 I 類：い段 → う段' : g === 'ichidan' ? '第 II 類：去掉「ます」加「る」' : g === 'suru' ? '第 III 類：します → する' : '第 III 類：来ます → 来る（くる）'
  }
}
