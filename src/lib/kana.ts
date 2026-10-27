// 假名工具：正規化、拆音拍（mora）、各種 N5 陷阱轉換的基本操作
import { toKana } from 'wanakana'

export const SMALL_Y = 'ゃゅょ'
export const SMALL_VOWELS = 'ぁぃぅぇぉ'
const SMALL_ALL = SMALL_Y + SMALL_VOWELS + 'ゎ'

/** 片假名 → 平假名（保留長音符號「ー」） */
export function kataToHira(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    out += c >= 0x30a1 && c <= 0x30f6 ? String.fromCharCode(c - 0x60) : ch
  }
  return out
}

export function hiraToKata(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    out += c >= 0x3041 && c <= 0x3096 ? String.fromCharCode(c + 0x60) : ch
  }
  return out
}

export const isHiragana = (ch: string) => /^[ぁ-ゟ]$/.test(ch)
export const isKatakana = (ch: string) => /^[゠-ヿ]$/.test(ch)
export const isKana = (ch: string) => isHiragana(ch) || isKatakana(ch)
export const isKanji = (ch: string) => /^[㐀-鿿豈-﫿々〆]$/.test(ch)
export const hasKanji = (s: string) => [...s].some(isKanji)
export const isAllKatakana = (s: string) => s.length > 0 && [...s].every((c) => isKatakana(c) || c === 'ー')

/** 去掉讀音中的括號附註，例如「いや（な）」→ core「いや」、suffix「（な）」 */
export function splitSuffix(reading: string): { core: string; suffix: string } {
  const m = reading.match(/^(.*?)([（(][^）)]*[）)])\s*$/)
  if (m && m[1]) return { core: m[1].trim(), suffix: m[2] }
  return { core: reading.trim(), suffix: '' }
}

/** 讀音欄位可能寫成「いい/よい」，回傳所有可接受讀音（去括號、去～） */
export function readingAlternatives(reading: string): string[] {
  return reading
    .split(/[\/／・,、]/)
    .map((r) => splitSuffix(r.trim()).core.replace(/^[～~]/, '').trim())
    .filter(Boolean)
}

/** 比對用：片假名轉平假名、去空白、去括號附註與～ */
export function normalizeReading(s: string): string {
  return kataToHira(splitSuffix(s.trim()).core.replace(/^[～~]/, '').replace(/\s+/g, ''))
}

/** 羅馬拼音 → 平假名（打字作答用；大寫字母會轉成片假名） */
export function romajiToKana(input: string): string {
  return toKana(input, { IMEMode: true })
}

/** 打字作答的最終轉換：殘留的羅馬拼音（例如最後的 n）轉成假名，再統一成平假名 */
export function anyToHiragana(input: string): string {
  const s = /[a-z]/i.test(input) ? toKana(input.toLowerCase()) : input
  return kataToHira(s)
}

/** 拆成音拍：拗音（きゃ）算一拍 */
export function toMorae(s: string): string[] {
  const out: string[] = []
  for (const ch of s) {
    if (out.length && SMALL_ALL.includes(kataToHira(ch)) && !'っ'.includes(ch)) out[out.length - 1] += ch
    else out.push(ch)
  }
  return out
}

const VOWEL_ROWS: Record<string, string> = {
  a: 'あかがさざただなはばぱまやらわぁゃゎ',
  i: 'いきぎしじちぢにひびぴみりぃ',
  u: 'うくぐすずつづぬふぶぷむゆるぅゅゔ',
  e: 'えけげせぜてでねへべぺめれぇ',
  o: 'おこごそぞとどのほぼぽもよろをぉょ',
}

/** 一個音拍的母音（ん、っ 回傳 null） */
export function moraVowel(mora: string): string | null {
  const last = kataToHira(mora[mora.length - 1])
  for (const [v, row] of Object.entries(VOWEL_ROWS)) if (row.includes(last)) return v
  return null
}

/** 拉長某母音時要加的假名 */
export const LONG_EXT: Record<string, string> = { a: 'あ', i: 'い', u: 'う', e: 'い', o: 'う' }

/** ch 是否是前一個音拍的長音延伸（おかあさん 的 あ、こうこう 的 う） */
export function isLongExtension(prevMora: string | undefined, ch: string): boolean {
  if (!prevMora) return false
  if (ch === 'ー') return true
  const v = moraVowel(prevMora)
  const h = kataToHira(ch)
  if (!v) return false
  return (
    (v === 'a' && h === 'あ') ||
    (v === 'i' && h === 'い') ||
    (v === 'u' && h === 'う') ||
    (v === 'e' && (h === 'い' || h === 'え')) ||
    (v === 'o' && (h === 'う' || h === 'お'))
  )
}

/** 去掉所有長音（比對用） */
export function stripLongVowels(s: string): string {
  const m = toMorae(s)
  const out: string[] = []
  for (let i = 0; i < m.length; i++) {
    if (i > 0 && m[i].length === 1 && isLongExtension(out[out.length - 1], m[i])) continue
    out.push(m[i])
  }
  return out.join('')
}

export const stripSokuon = (s: string) => s.replace(/[っッ]/g, '')

const DAKUTEN_MAP: Record<string, string> = {}
const seion = 'かきくけこさしすせそたちつてとはひふへほ'
const dakuon = 'がぎぐげござじずぜぞだぢづでどばびぶべぼ'
for (let i = 0; i < seion.length; i++) DAKUTEN_MAP[dakuon[i]] = seion[i]
'ぱぴぷぺぽ'.split('').forEach((c, i) => (DAKUTEN_MAP[c] = 'はひふへほ'[i]))

/** 去掉濁點、半濁點（比對用） */
export function stripDakuten(s: string): string {
  return [...kataToHira(s)].map((c) => DAKUTEN_MAP[c] ?? c).join('')
}

/** 清音 ↔ 濁音 ↔ 半濁音 的其他形式（不含 ぢ づ 這類罕見組合） */
export function dakutenVariants(ch: string): string[] {
  const h = kataToHira(ch)
  const base = DAKUTEN_MAP[h] ?? h
  const i = 'かきくけこさしすせそたてとはひふへほ'.indexOf(base)
  if (i < 0) return []
  const all = [base]
  const di = seion.indexOf(base)
  all.push(dakuon[di])
  const hi = 'はひふへほ'.indexOf(base)
  if (hi >= 0) all.push('ぱぴぷぺぽ'[hi])
  return all.filter((c) => c !== h)
}

/** 拗音小字 → 大字（比對用） */
export function enlargeYouon(s: string): string {
  return s.replace(/ゃ/g, 'や').replace(/ゅ/g, 'ゆ').replace(/ょ/g, 'よ')
}

/** 促音可以出現在這些子音前（か行、さ行、た行、ぱ行） */
export function canPrecedeSokuon(mora: string): boolean {
  return 'かきくけこさしすせそたちつてとぱぴぷぺぽ'.includes(kataToHira(mora[0]))
}
