// 干擾選項產生器：模仿 N5 考題的常見陷阱。
// 優先順序：長音、促音、濁音／半濁音、拗音大小寫、同漢字其他讀法 → 不夠才用同詞性、字數相近的單字補。
import {
  toMorae,
  moraVowel,
  isLongExtension,
  LONG_EXT,
  canPrecedeSokuon,
  dakutenVariants,
  kataToHira,
  hiraToKata,
  isKatakana,
  isKanji,
  isKana,
  splitSuffix,
  readingAlternatives,
  normalizeReading,
  stripLongVowels,
  stripSokuon,
  stripDakuten,
  enlargeYouon,
} from './kana'
import { KANJI_READINGS } from './kanjiReadings'
import type { Word } from '../types'

export type TrapKind = 'long_vowel' | 'sokuon' | 'dakuten' | 'youon' | 'alt_reading' | 'similar_reading' | 'shared_kanji' | 'similar_word' | 'random'

export interface Trap {
  text: string
  kind: TrapKind
}

export interface Option {
  text: string
  kind: TrapKind | 'correct'
}

export type KanjiDict = Record<string, string[]>

// ---------- 亂數（可指定 seed，測試才能重現） ----------
export function makeRng(seed: number = Date.now()): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------- 讀音工具 ----------
/** 題目要用的主要讀音：「いい/よい」取第一個；保留「（な）」附註 */
export function primaryReading(reading: string): string {
  const first = reading.split(/[\/／]/)[0].trim()
  return first.replace(/^[～~]/, '')
}

/** 題目顯示用的表記：去掉「開く(自V)」這種詞性附註；「（お爺さん）」去括號 */
export function displaySurface(word: Pick<Word, 'kanji' | 'reading'>): string {
  let k = (word.kanji || '').trim()
  k = k.replace(/[（(](自V|他V|自他V|自|他)[）)]/g, '').trim()
  k = k.replace(/\s*[（(]な[）)]\s*$/, '').trim()
  const whole = k.match(/^[（(](.+)[）)]$/)
  if (whole) k = whole[1].trim()
  return k || primaryReading(word.reading)
}

const SMALL_START = /^[っッんンーゃゅょぁぃぅぇぉャュョァィゥェォ]/

function isPlausible(s: string): boolean {
  if (!s || [...s].length < 2 || SMALL_START.test(s)) return false
  if (/[^きぎしじちぢにひびぴみりキギシジチヂニヒビピミリ][ゃゅょャュョ]/.test(s)) return false
  if (/[っッ]$/.test(s) || /[っッ]{2}|ーー|[っッ][んンー]/.test(s)) return false
  // 平假名的促音後面只能接か、さ、た、ぱ行
  const m = s.match(/っ(.)/g)
  if (m && m.some((x) => !'かきくけこさしすせそたちつてとぱぴぷぺぽ'.includes(x[1]))) return false
  return true
}

// ---------- 各種語音陷阱 ----------
/**
 * 長音陷阱，依「像真的考題」的程度排序：
 * 1. 拿掉既有長音（おばあさん→おばさん、こうこう→ここう）
 * 2. お段／う段加「う」、え段加「い」（ここ→こうこ、せんせ→せんせい）
 * 3. あ段加「あ」、い段加「い」（おばさん→おばあさん），但不在詞尾、不在「ん」「っ」前
 * 4. 短字（3 拍以內）同時加兩個長音（ここ→こうこう）
 */
export function longVowelTraps(reading: string): string[] {
  const m = toMorae(reading)
  const kata = m.some((x) => isKatakana(x[0]))
  const removals: string[] = []
  for (let i = 1; i < m.length; i++) {
    if (m[i].length === 1 && isLongExtension(m[i - 1], m[i])) removals.push([...m.slice(0, i), ...m.slice(i + 1)].join(''))
  }
  const strong: number[] = [] // お段、え段、拗音（こ→こう、せ→せい、しょ→しょう）
  const medium: number[] = [] // う段（ゆ→ゆう）
  const weak: number[] = [] // あ段、い段（ば→ばあ、じ→じい）
  const VERB_END = 'うくぐすつぬぶむるウクグスツヌブムル'
  for (let i = 0; i < m.length; i++) {
    const v = moraVowel(m[i])
    if (!v) continue
    if (i > 0 && m[i].length === 1 && isLongExtension(m[i - 1], m[i])) continue // 自己就是長音
    const next = m[i + 1]
    if (next && isLongExtension(m[i], next)) continue // 已經是長音
    const last = next === undefined
    if (last && 'いうくぐすつぬぶむるんイウクグスツヌブムルン'.includes(m[i])) continue // 動詞、形容詞語尾
    if (i === m.length - 2 && VERB_END.includes(m[m.length - 1])) continue // いれる→いれいる 不自然
    if ('あいうえおアイウエオ'.includes(m[i])) continue // ああう、いいれる 不自然
    if (next && 'あいうえおアイウエオんっンッ'.includes(next) && v !== 'o' && v !== 'e') continue
    const youon = m[i].length === 2
    if (v === 'o' || v === 'e' || youon) strong.push(i)
    else if (v === 'u') medium.push(i)
    else if (!last) weak.push(i)
  }
  const ext = (i: number) => (kata ? 'ー' : LONG_EXT[moraVowel(m[i])!])
  const insertAt = (idx: number[]) => {
    const r: string[] = []
    m.forEach((x, i) => {
      r.push(x)
      if (idx.includes(i)) r.push(ext(i))
    })
    return r.join('')
  }
  const doubles: string[] = []
  if (m.length === 2 && strong.length === 2) doubles.push(insertAt(strong)) // ここ→こうこう
  const out = new Set([...removals, ...strong.map((p) => insertAt([p])), ...doubles, ...medium.map((p) => insertAt([p])), ...weak.map((p) => insertAt([p]))])
  out.delete(reading)
  return [...out].filter(isPlausible)
}

export function sokuonTraps(reading: string): string[] {
  const m = toMorae(reading)
  const kata = m.some((x) => isKatakana(x[0]))
  const out = new Set<string>()
  m.forEach((x, i) => {
    if (x === 'っ' || x === 'ッ') out.add([...m.slice(0, i), ...m.slice(i + 1)].join(''))
  })
  for (let i = 1; i < m.length; i++) {
    const prev = m[i - 1]
    if ('っッんンー'.includes(prev) || !moraVowel(prev)) continue
    if (i > 1 && prev.length === 1 && isLongExtension(m[i - 2], prev)) continue // れいぞうっこ 不自然
    if (!canPrecedeSokuon(m[i])) continue
    out.add([...m.slice(0, i), kata ? 'ッ' : 'っ', ...m.slice(i)].join(''))
  }
  out.delete(reading)
  return [...out].filter(isPlausible)
}

export function dakutenTraps(reading: string): string[] {
  const m = toMorae(reading)
  const out = new Set<string>()
  m.forEach((x, i) => {
    const kata = isKatakana(x[0])
    for (const v of dakutenVariants(x[0])) {
      const ch = kata ? hiraToKata(v) : v
      out.add([...m.slice(0, i), ch + x.slice(1), ...m.slice(i + 1)].join(''))
    }
  })
  out.delete(reading)
  return [...out].filter(isPlausible)
}

const I_ROW = 'きぎしじちにひびぴみり'
export function youonTraps(reading: string): string[] {
  const m = toMorae(reading)
  const out = new Set<string>()
  m.forEach((x, i) => {
    // びょういん → びよういん
    if (x.length === 2 && 'ゃゅょャュョ'.includes(x[1])) {
      const big = { ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ' }[x[1]]!
      out.add([...m.slice(0, i), x[0] + big, ...m.slice(i + 1)].join(''))
    }
    // びよういん → びょういん
    if (i > 0 && 'やゆよヤユヨ'.includes(x) && m[i - 1].length === 1 && I_ROW.includes(kataToHira(m[i - 1]))) {
      const small = { や: 'ゃ', ゆ: 'ゅ', よ: 'ょ', ヤ: 'ャ', ユ: 'ュ', ヨ: 'ョ' }[x]!
      out.add([...m.slice(0, i - 1), m[i - 1] + small, ...m.slice(i + 1)].join(''))
    }
  })
  out.delete(reading)
  return [...out].filter(isPlausible)
}

// ---------- 漢字讀法對齊與替換 ----------
export function buildKanjiDict(words: Pick<Word, 'kanji' | 'reading'>[] = []): KanjiDict {
  const dict: KanjiDict = {}
  for (const [k, v] of Object.entries(KANJI_READINGS)) if ([...k].length === 1) dict[k] = [...v]
  for (const w of words) {
    const surface = displaySurface(w)
    const reading = normalizeReading(primaryReading(w.reading))
    const chars = [...surface]
    if (!chars.length || !isKanji(chars[0])) continue
    const kanjiPart = chars.filter(isKanji)
    if (kanjiPart.length !== 1) continue
    const tail = kataToHira(chars.slice(1).join(''))
    if (chars.slice(1).some((c) => !isKana(c))) continue
    if (tail && !reading.endsWith(tail)) continue
    const stem = tail ? reading.slice(0, -tail.length) : reading
    if (!stem) continue
    const list = (dict[chars[0]] ??= [])
    if (!list.includes(stem)) list.push(stem)
  }
  return dict
}

const RENDAKU: Record<string, string[]> = {}
'かきくけこさしすせそたちつてと'.split('').forEach((c, i) => (RENDAKU[c] = ['がぎぐげござじずぜぞだぢづでど'[i]]))
'はひふへほ'.split('').forEach((c, i) => (RENDAKU[c] = ['ばびぶべぼ'[i], 'ぱぴぷぺぽ'[i]]))

/** 一個漢字讀音的音便變化（連濁、促音化），用來對齊 */
function readingForms(r: string): string[] {
  const forms = new Set([r])
  const first = r[0]
  for (const d of RENDAKU[first] ?? []) forms.add(d + r.slice(1))
  if (r.length >= 2 && 'くつちき'.includes(r[r.length - 1])) forms.add(r.slice(0, -1) + 'っ')
  return [...forms]
}

export interface Segment {
  text: string
  reading: string
  kanji: boolean
  known: boolean
}

/** 把漢字表記和讀音對齊：先生／せんせい → [先:せん][生:せい] */
export function alignReading(surface: string, reading: string, dict: KanjiDict): Segment[] | null {
  const chars = [...surface]
  const r = kataToHira(reading)
  const go = (si: number, ri: number, prev: string | null): Segment[] | null => {
    if (si === chars.length) return ri === r.length ? [] : null
    const c = chars[si]
    if (!isKanji(c)) {
      if (kataToHira(c) !== r[ri]) return null
      const rest = go(si + 1, ri + 1, null)
      return rest ? [{ text: c, reading: c, kanji: false, known: true }, ...rest] : null
    }
    const key = c === '々' && prev ? prev : c
    const cands = new Set<string>()
    for (const base of dict[key] ?? []) readingForms(base).forEach((f) => cands.add(f))
    const sorted = [...cands].sort((a, b) => b.length - a.length)
    for (const cand of sorted) {
      if (r.startsWith(cand, ri)) {
        const rest = go(si + 1, ri + cand.length, key)
        if (rest) return [{ text: c, reading: cand, kanji: true, known: true }, ...rest]
      }
    }
    // 字典沒有的字：猜 1–4 個假名
    for (let len = 1; len <= Math.min(4, r.length - ri); len++) {
      const rest = go(si + 1, ri + len, key)
      if (rest) return [{ text: c, reading: r.slice(ri, ri + len), kanji: true, known: false }, ...rest]
    }
    return null
  }
  return go(0, 0, null)
}

/** 音讀的樣子：一拍（可含拗音）＋可選的ん／う／い／く／つ／ち／き */
const ON_LIKE = /^[^ゃゅょっん][ゃゅょ]?[んういくつちき]?$/

/** 同一漢字的其他讀法（音讀／訓讀混淆）：先生 → せんしょう、さきせい */
export function altReadingTraps(surface: string, reading: string, dict: KanjiDict): string[] {
  const chars = [...surface]
  const allKanji = chars.every(isKanji)
  if (!allKanji) return [] // 有送假名的動詞／形容詞換音讀很不自然，只處理純漢字詞
  const segs = alignReading(surface, reading, dict)
  if (!segs || segs.some((x) => x.kanji && !x.known)) return [] // 熟字訓（今日、大人）對不齊就不產生
  const out = new Set<string>()
  segs.forEach((seg, i) => {
    if (!seg.kanji) return
    const key = seg.text === '々' && i > 0 ? segs[i - 1].text : seg.text
    for (const alt of dict[key] ?? []) {
      // 連濁算同一個讀法；但「沒有促音化」（がくこう）是常見陷阱，保留
      if (alt === seg.reading || (RENDAKU[alt[0]] ?? []).some((d) => d + alt.slice(1) === seg.reading)) continue
      if (alt.length < 2 && seg.reading.length >= 2) continue
      if (!ON_LIKE.test(alt)) continue // 「時計→とはか」「時間→じあいだ」這種訓讀太假，不用
      const cand = segs.map((s, j) => (j === i ? alt : s.reading)).join('')
      out.add(cand)
    }
  })
  out.delete(kataToHira(reading))
  return [...out].filter(isPlausible)
}

/** 全部語音陷阱（不含漢字讀法），附上種類 */
export function phoneticTraps(reading: string): Trap[] {
  return [
    ...longVowelTraps(reading).map((text) => ({ text, kind: 'long_vowel' as const })),
    ...sokuonTraps(reading).map((text) => ({ text, kind: 'sokuon' as const })),
    ...dakutenTraps(reading).map((text) => ({ text, kind: 'dakuten' as const })),
    ...youonTraps(reading).map((text) => ({ text, kind: 'youon' as const })),
  ]
}

/** 兩個讀音是否只差一個 N5 陷阱（用於「讀音→漢字」找讀音相近的單字） */
export function isNearReading(a: string, b: string): boolean {
  const x = normalizeReading(a)
  const y = normalizeReading(b)
  if (x === y) return false
  return (
    stripLongVowels(x) === stripLongVowels(y) ||
    stripSokuon(x) === stripSokuon(y) ||
    stripDakuten(x) === stripDakuten(y) ||
    enlargeYouon(x) === enlargeYouon(y)
  )
}

// ---------- 挑選 ----------
function pickDiverse(groups: Map<string, string[]>, count: number, rng: () => number, taken: Set<string>): Option[] {
  const out: Option[] = []
  const kinds = shuffle([...groups.keys()], rng)
  // 每一類已依自然程度排序：只把前三名打亂，避免永遠出同一個，也不會抽到太牽強的
  const queues = new Map(kinds.map((k) => {
    const list = groups.get(k)!
    return [k, [...shuffle(list.slice(0, 3), rng), ...list.slice(3)]]
  }))
  let progress = true
  while (out.length < count && progress) {
    progress = false
    for (const k of kinds) {
      if (out.length >= count) break
      const q = queues.get(k)!
      while (q.length) {
        const t = q.shift()!
        const key = normalizeReading(t)
        if (taken.has(key)) continue
        taken.add(key)
        out.push({ text: t, kind: k as TrapKind })
        progress = true
        break
      }
    }
  }
  return out
}

export interface GenOptions {
  count?: number
  seed?: number
  rng?: () => number
  dict?: KanjiDict
}

function sameSurface(a: Pick<Word, 'kanji' | 'reading'>, b: Pick<Word, 'kanji' | 'reading'>) {
  return displaySurface(a) === displaySurface(b)
}

/** 這個單字所有「算對」的讀音（含同形異音詞，例如 一日：いちにち／ついたち） */
export function acceptedReadings(word: Word, pool: Word[]): Set<string> {
  const set = new Set(readingAlternatives(word.reading).map(normalizeReading))
  if (word.kanji)
    for (const w of pool) if (w.id !== word.id && w.kanji && sameSurface(w, word)) readingAlternatives(w.reading).forEach((r) => set.add(normalizeReading(r)))
  return set
}

const moraLen = (s: string) => toMorae(normalizeReading(s)).length

/** 漢字 → 讀音（也用於聽音選字）的干擾選項 */
export function generateReadingDistractors(word: Word, pool: Word[], opts: GenOptions = {}): Option[] {
  const count = opts.count ?? 3
  const rng = opts.rng ?? makeRng(opts.seed)
  const dict = opts.dict ?? buildKanjiDict(pool)
  const { core, suffix } = splitSuffix(primaryReading(word.reading))
  const accepted = acceptedReadings(word, pool)
  const taken = new Set(accepted)

  const groups = new Map<string, string[]>()
  const add = (kind: TrapKind, text: string) => {
    if (accepted.has(normalizeReading(text))) return
    if (!groups.has(kind)) groups.set(kind, [])
    groups.get(kind)!.push(text)
  }
  phoneticTraps(core).forEach((t) => add(t.kind, t.text))
  const surface = displaySurface(word)
  if (word.kanji) altReadingTraps(surface, core, dict).forEach((t) => add('alt_reading', t))

  const result = pickDiverse(groups, count, rng, taken)

  // 陷阱不夠 → 同詞性、字數相近的單字
  if (result.length < count) {
    const len = moraLen(core)
    const others = pool.filter((w) => w.id !== word.id && !sameSurface(w, word))
    const tiers = [
      others.filter((w) => w.pos === word.pos && Math.abs(moraLen(primaryReading(w.reading)) - len) <= 1),
      others.filter((w) => Math.abs(moraLen(primaryReading(w.reading)) - len) <= 1),
      others,
    ]
    for (const tier of tiers) {
      for (const w of shuffle(tier, rng)) {
        if (result.length >= count) break
        const t = splitSuffix(primaryReading(w.reading)).core
        const key = normalizeReading(t)
        if (taken.has(key)) continue
        taken.add(key)
        result.push({ text: t, kind: 'similar_word' })
      }
    }
  }
  // 題庫太小時的最後手段：隨機換一個假名
  let guard = 0
  while (result.length < count && guard++ < 200) {
    const m = toMorae(core)
    const kana = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもらりるれろ'
    const pickKana = () => kana[Math.floor(rng() * kana.length)]
    if (m.length < 2) m.push(pickKana()) // 一拍的字（き、め）補成兩拍
    else m[Math.floor(rng() * m.length)] = pickKana()
    const t = m.join('')
    const key = normalizeReading(t)
    if (taken.has(key) || !isPlausible(t)) continue
    taken.add(key)
    result.push({ text: t, kind: 'random' })
  }
  return result.map((o) => ({ ...o, text: o.text + suffix }))
}

/** 讀音 → 漢字、例句填空 的干擾選項（選項是單字表記） */
export function generateSurfaceDistractors(word: Word, pool: Word[], opts: GenOptions = {}): Option[] {
  const count = opts.count ?? 3
  const rng = opts.rng ?? makeRng(opts.seed)
  const surface = displaySurface(word)
  const myReadings = new Set(readingAlternatives(word.reading).map(normalizeReading))
  const chars = new Set([...surface].filter(isKanji))
  // 同音字（あつい：暑い／熱い／厚い）不能當干擾選項，否則題目有兩個正解
  const others = pool.filter(
    (w) => w.id !== word.id && displaySurface(w) !== surface && !readingAlternatives(w.reading).some((r) => myReadings.has(normalizeReading(r))),
  )
  const groups = new Map<string, string[]>()
  const add = (kind: TrapKind, w: Word) => {
    if (!groups.has(kind)) groups.set(kind, [])
    groups.get(kind)!.push(displaySurface(w))
  }
  for (const w of others) {
    if (isNearReading(primaryReading(w.reading), primaryReading(word.reading))) add('similar_reading', w)
    else if ([...displaySurface(w)].some((c) => chars.has(c))) add('shared_kanji', w)
  }
  const taken = new Set<string>([surface])
  const result: Option[] = []
  const takeFrom = (kind: TrapKind, list: string[]) => {
    for (const t of shuffle(list, rng)) {
      if (result.length >= count) return
      if (taken.has(t)) continue
      taken.add(t)
      result.push({ text: t, kind })
    }
  }
  takeFrom('similar_reading', (groups.get('similar_reading') ?? []).slice())
  takeFrom('shared_kanji', groups.get('shared_kanji') ?? [])
  const len = [...surface].length
  takeFrom('similar_word', others.filter((w) => w.pos === word.pos && Math.abs([...displaySurface(w)].length - len) <= 1).map(displaySurface))
  takeFrom('similar_word', others.filter((w) => w.pos === word.pos).map(displaySurface))
  takeFrom('random', others.map(displaySurface))
  return result
}

/** 漢字 → 中文意思 的干擾選項 */
export function generateMeaningDistractors(word: Word, pool: Word[], opts: GenOptions = {}): Option[] {
  const count = opts.count ?? 3
  const rng = opts.rng ?? makeRng(opts.seed)
  const norm = (s: string) => s.replace(/\s+/g, '').trim()
  const taken = new Set([norm(word.meaning)])
  const result: Option[] = []
  const others = pool.filter((w) => w.id !== word.id && w.meaning && !sameSurface(w, word))
  for (const tier of [others.filter((w) => w.pos === word.pos), others]) {
    for (const w of shuffle(tier, rng)) {
      if (result.length >= count) break
      const k = norm(w.meaning)
      if (taken.has(k)) continue
      taken.add(k)
      result.push({ text: w.meaning, kind: w.pos === word.pos ? 'similar_word' : 'random' })
    }
  }
  return result
}
