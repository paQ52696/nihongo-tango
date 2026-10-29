// 形容詞變化：い形容詞／な形容詞的否定、過去、過去否定、て形，以及常見錯誤（干擾選項）
import type { Word } from '../types'
import { displaySurface, shuffle } from './distractors'
import { speakTextFor } from './audioKey'
import { splitSuffix } from './kana'

export type AdjType = 'i' | 'na'

export const ADJ_LABELS: Record<AdjType, string> = { i: 'い形容詞', na: 'な形容詞' }

export interface AdjInfo {
  surface: string
  reading: string // 平假名；な形容詞不含「な」
  type: AdjType
}

// 長得像い形容詞（〜い結尾）、其實是な形容詞
export const NA_LOOKS_I = new Set(['きれい', 'ゆうめい', 'きらい', 'しつれい', 'とくい', 'ていねい', 'せいけつ', 'あいまい', 'さいわい'])

/** いい（良い）的變化要用「よ」：よくない、よかった */
const isIi = (r: string) => r === 'いい' || r === 'かっこいい' || r.endsWith('がいい')

export function adjInfo(word: Word): AdjInfo | null {
  if (word.kind || !/形容|adj/i.test(word.pos)) return null
  const reading = speakTextFor(word).replace(/な$/, '')
  const surface = splitSuffix(displaySurface(word)).core.replace(/な$/, '')
  if (!reading) return null
  let type: AdjType | null = /な形容|ナ形容|形容動詞|na-adj/i.test(word.pos) ? 'na' : /い形容|イ形容|i-adj/i.test(word.pos) ? 'i' : null
  // 只寫「形容詞」時用外表猜：〜い結尾而且不是 きれい 這類例外 → い形容詞
  if (!type) type = reading.endsWith('い') && !NA_LOOKS_I.has(reading) ? 'i' : 'na'
  if (type === 'i' && !reading.endsWith('い')) return null
  return { surface, reading, type }
}

export type AdjForm = 'nai' | 'ta' | 'nakatta' | 'te' | 'nai_p' | 'ta_p'

export const ADJ_FORMS: { id: AdjForm; label: string; short: string }[] = [
  { id: 'nai', label: '否定（〜ない）', short: '否定' },
  { id: 'ta', label: '過去（〜た）', short: '過去' },
  { id: 'nakatta', label: '過去否定', short: '過去否定' },
  { id: 'te', label: 'て形（連接）', short: 'て形' },
  { id: 'nai_p', label: '否定・です體', short: '否定（です體）' },
  { id: 'ta_p', label: '過去・です體', short: '過去（です體）' },
]

/** い形容詞去掉「い」的部分（たかい→たか、いい→よ） */
function iStem(r: string): string {
  return isIi(r) ? r.slice(0, -2) + 'よ' : r.slice(0, -1)
}

export function adjForm(a: Pick<AdjInfo, 'reading' | 'type'>, form: AdjForm): string {
  const r = a.reading
  if (a.type === 'i') {
    const s = iStem(r)
    return { nai: s + 'くない', ta: s + 'かった', nakatta: s + 'くなかった', te: s + 'くて', nai_p: s + 'くないです', ta_p: s + 'かったです' }[form]
  }
  return { nai: r + 'じゃない', ta: r + 'だった', nakatta: r + 'じゃなかった', te: r + 'で', nai_p: r + 'じゃありません', ta_p: r + 'でした' }[form]
}

/** 也算對、不能當錯誤選項的說法 */
function alsoCorrect(a: Pick<AdjInfo, 'reading' | 'type'>, form: AdjForm): string[] {
  const r = a.reading
  if (a.type === 'i') {
    const s = iStem(r)
    return form === 'nai_p' ? [s + 'くありません'] : []
  }
  return (
    {
      nai: [r + 'ではない'],
      nakatta: [r + 'ではなかった'],
      nai_p: [r + 'ではありません', r + 'じゃないです', r + 'ではないです'],
      ta: [],
      te: [],
      ta_p: [],
    } as Record<AdjForm, string[]>
  )[form]
}

/** 干擾選項：い／な 搞混（たかいじゃない、しずかくない）、沒去掉い（たかいくない）、いい 沒變成 よ */
export function adjDistractors(a: Pick<AdjInfo, 'reading' | 'type'>, form: AdjForm, rng: () => number): string[] {
  const r = a.reading
  const answer = adjForm(a, form)
  const asNa = adjForm({ reading: r, type: 'na' }, form) // 把い形容詞當な形容詞變：たかいじゃない
  const ordered: string[] = []
  if (a.type === 'i') {
    if (isIi(r)) ordered.push(answer.replace(iStem(r), r.slice(0, -1))) // いい 沒變成よ：いくない、いかった
    const keepI = { nai: r + 'くない', ta: r + 'かった', nakatta: r + 'くなかった', te: r + 'くて', nai_p: r + 'くないです', ta_p: r + 'かったです' }[form]
    const extra = { nai: r + 'ない', ta: r + 'でした', nakatta: iStem(r) + 'くないかった', te: r + 'で', nai_p: r + 'じゃないです', ta_p: r + 'でした' }[form]
    const extra2 = { nai: iStem(r) + 'じゃない', ta: iStem(r) + 'くた', nakatta: r + 'じゃなかった', te: iStem(r) + 'って', nai_p: r + 'ではありません', ta_p: iStem(r) + 'かったでした' }[form]
    ordered.push(asNa, keepI, extra, extra2)
  } else {
    // な形容詞當い形容詞變：しずかくない；〜い結尾的（きれい）最容易：きれくない
    const asI = adjForm({ reading: r + 'い', type: 'i' }, form)
    if (r.endsWith('い')) ordered.push(adjForm({ reading: r, type: 'i' }, form))
    const extra = { nai: r + 'ない', ta: r + 'った', nakatta: r + 'じゃないかった', te: r + 'て', nai_p: r + 'ありません', ta_p: r + 'くでした' }[form]
    const extra2 = { nai: r + 'じゃなく', ta: r + 'だた', nakatta: r + 'なかった', te: r + 'だて', nai_p: r + 'じゃないでした', ta_p: r + 'だでした' }[form]
    ordered.push(asI, extra, extra2)
  }
  const bad = new Set([answer, ...alsoCorrect(a, form)])
  const uniq = [...new Set(ordered)].filter((s) => !bad.has(s))
  return [...uniq.slice(0, 2), ...shuffle(uniq.slice(2), rng)].slice(0, 3)
}

/** 這個變化用的規則 */
export function adjRule(a: Pick<AdjInfo, 'reading' | 'type'>, form: AdjForm): string {
  const end = adjForm({ reading: a.type === 'i' ? 'あい' : 'あ', type: a.type }, form).slice(1)
  if (a.type === 'i') {
    const rule = `い形容詞：去掉「い」加「${end}」`
    return isIi(a.reading) ? rule + '（いい → よ' + end + '，例外）' : rule
  }
  const rule = `な形容詞：直接加「${end}」`
  return NA_LOOKS_I.has(a.reading) ? rule + `（${a.reading} 雖然是「い」結尾，但是な形容詞）` : rule
}

/** 講解頁的「形容詞轉換器」：輸入辭書形（假名），回傳類型；な形容詞可以帶「な」 */
export function convertAdj(input: string, type?: AdjType): (AdjInfo & { guessed: boolean }) | null {
  const s = input.trim().replace(/\s/g, '')
  if (!s) return null
  const na = s.endsWith('な') && s.length > 1
  const r = na ? s.slice(0, -1) : s
  const guess: AdjType = na || !r.endsWith('い') || NA_LOOKS_I.has(r) ? 'na' : 'i'
  const t = type ?? guess
  if (t === 'i' && !r.endsWith('い')) return null
  return { surface: r, reading: r, type: t, guessed: !type && !na }
}
