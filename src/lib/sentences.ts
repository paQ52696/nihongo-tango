// 課文句子：文節切分、助詞填空、語順重組、中翻日比對
import type { Word } from '../types'
import { kataToHira } from './kana'
import { shuffle } from './distractors'

/** 匯入時用「|」或全形「｜」標出文節：わたしは|毎朝|6時に|起きます。 */
export function splitChunks(text: string): string[] {
  return text
    .split(/[|｜]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 句子的文節（沒有標的話整句當一個文節） */
export function chunksOf(w: Pick<Word, 'kanji' | 'chunks'>): string[] {
  return w.chunks?.length ? w.chunks : [w.kanji]
}

const PUNCT = /[\s、。，．,.！!？?「」『』（）()…・～〜]/g

/** 比對用：去掉空白與標點、全形英數轉半形、片假名轉平假名 */
export function normalizeSentence(s: string): string {
  return kataToHira(s.normalize('NFKC').replace(PUNCT, ''))
}

// ---------- 助詞填空 ----------
const PARTICLES = ['から', 'まで', 'より', 'は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も', 'の', 'や']

/** 容易混淆的助詞（干擾選項依序取用） */
const PARTICLE_TRAPS: Record<string, string[]> = {
  は: ['が', 'を', 'も', 'に'],
  が: ['は', 'を', 'に', 'で'],
  を: ['が', 'に', 'は', 'で'],
  に: ['で', 'を', 'と', 'が'], // 不放「へ」：表示目的地時に／へ都對
  で: ['に', 'を', 'が', 'と'],
  へ: ['で', 'を', 'と', 'が'],
  と: ['や', 'に', 'で', 'も'],
  も: ['は', 'が', 'と', 'を'],
  の: ['が', 'を', 'に', 'と'],
  や: ['と', 'も', 'の', 'か'],
  から: ['まで', 'に', 'で', 'より'],
  まで: ['から', 'に', 'へ', 'で'],
  より: ['から', 'まで', 'で', 'に'],
}

/** 結尾是助詞但不是助詞的固定說法 */
const NOT_PARTICLE = new Set(['こんにちは', 'こんばんは', 'では', 'それでは', 'じゃあ', 'なに', '何', 'いっしょに', '一緒に', 'ほんとうに', '本当に', 'すぐに', 'とくに', '特に', 'まだ', 'もう', 'どうも', 'いつも', 'でも', 'ても', 'から'])

/** 找出文節結尾的助詞：回傳 [文節位置, 助詞] */
export function particleSlots(w: Pick<Word, 'kanji' | 'chunks'>): { index: number; particle: string }[] {
  const out: { index: number; particle: string }[] = []
  chunksOf(w).forEach((raw, index) => {
    const c = raw.replace(/[、。！？!?]+$/, '')
    if (NOT_PARTICLE.has(c)) return
    const p = PARTICLES.find((p) => c.endsWith(p) && c.length > p.length)
    if (!p) return
    // 動詞・形容詞的語尾（〜ます、〜です、〜て）不會以這些助詞結尾，但「〜ても」「〜でも」要排除
    if (/(て|で)も$/.test(c) || /(ます|です|ました|でした)(から|が)$/.test(c)) return
    out.push({ index, particle: p })
  })
  return out
}

export function particleQuestion(w: Pick<Word, 'kanji' | 'chunks'>, rng: () => number): { sentence: string; answer: string; distractors: string[] } | null {
  const slots = particleSlots(w)
  if (!slots.length) return null
  const slot = slots[Math.floor(rng() * slots.length)]
  const chunks = chunksOf(w)
  const raw = chunks[slot.index]
  const m = raw.match(/[、。！？!?]+$/)
  const body = m ? raw.slice(0, -m[0].length) : raw
  const blanked = body.slice(0, -slot.particle.length) + '（　）' + (m ? m[0] : '')
  const sentence = chunks.map((c, i) => (i === slot.index ? blanked : c)).join('')
  return { sentence, answer: slot.particle, distractors: (PARTICLE_TRAPS[slot.particle] ?? ['は', 'が', 'を', 'に']).filter((p) => p !== slot.particle).slice(0, 3) }
}

// ---------- 語順重組 ----------
export const MAX_TILES = 8

/** 重組用的字卡：去掉句尾標點；超過 MAX_TILES 個就把相鄰的合併 */
export function reorderTiles(w: Pick<Word, 'kanji' | 'chunks'>): string[] {
  const tiles = chunksOf(w).map((c) => c.replace(/[。！？!?]+$/, '')).filter(Boolean)
  // 太多張時，每次把「合起來最短」的相鄰兩張併成一張
  while (tiles.length > MAX_TILES) {
    let best = 0
    for (let i = 1; i < tiles.length - 1; i++) if (tiles[i].length + tiles[i + 1].length < tiles[best].length + tiles[best + 1].length) best = i
    tiles.splice(best, 2, tiles[best] + tiles[best + 1])
  }
  return tiles
}

export function canReorder(w: Pick<Word, 'kanji' | 'chunks'>): boolean {
  return reorderTiles(w).length >= 3
}

/** 打亂字卡；保證不會剛好是正確順序 */
export function shuffleTiles(tiles: string[], rng: () => number): string[] {
  const target = tiles.join('')
  for (let i = 0; i < 10; i++) {
    const s = shuffle(tiles, rng)
    if (s.join('') !== target) return s
  }
  return [...tiles.slice(1), tiles[0]]
}

// ---------- 中翻日 ----------
/**
 * 判斷中翻日的答案：每個文節可以寫成課本的寫法或假名讀音（例如「毎朝」或「まいあさ」），
 * 標點、空白、片假名／平假名不計。
 */
export function checkSentence(w: Pick<Word, 'kanji' | 'reading' | 'chunks' | 'chunkReadings'>, input: string): boolean {
  const s = normalizeSentence(input)
  if (!s) return false
  if (s === normalizeSentence(w.kanji) || (w.reading && s === normalizeSentence(w.reading))) return true
  const chunks = chunksOf(w)
  const readings = w.chunkReadings && w.chunkReadings.length === chunks.length ? w.chunkReadings : null
  const variants = chunks.map((c, i) => [...new Set([normalizeSentence(c), readings ? normalizeSentence(readings[i]) : ''].filter(Boolean))])
  // reach[i] = 輸入的前 i 個字可以由前幾個文節組成
  let positions = new Set([0])
  for (const vs of variants) {
    const next = new Set<number>()
    for (const p of positions) for (const v of vs) if (s.startsWith(v, p)) next.add(p + v.length)
    if (!next.size) return false
    positions = next
  }
  return positions.has(s.length)
}

export type DiffPart = { kind: 'same' | 'missing' | 'extra'; text: string }

/** 逐字比對（最長共同子序列）：missing＝課本有你沒寫，extra＝你多寫或寫錯 */
export function diffSentence(target: string, input: string): DiffPart[] {
  const a = [...normalizeSentence(target)]
  const b = [...normalizeSentence(input)]
  const n = a.length
  const m = b.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
  const out: DiffPart[] = []
  const push = (kind: DiffPart['kind'], ch: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += ch
    else out.push({ kind, text: ch })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (L[i + 1][j] >= L[i][j + 1]) push('missing', a[i++])
    else push('extra', b[j++])
  }
  while (i < n) push('missing', a[i++])
  while (j < m) push('extra', b[j++])
  return out
}
