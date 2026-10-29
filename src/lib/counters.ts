// 數字・量詞出題：依權重挑一個數字，錯誤選項用「數字念法 × 量詞念法」的組合與同一張表裡容易搞混的念法
import { COUNTERS, NUM_VARIANTS, counterItem, entryWeight, type CounterEntry, type CounterItem } from '../data/counters'
import { shuffle } from './distractors'

export { COUNTERS, counterItem }
export type { CounterEntry, CounterItem }

export function pickEntry(item: CounterItem, rng: () => number): CounterEntry {
  const total = item.entries.reduce((n, e) => n + entryWeight(item, e), 0)
  let r = rng() * total
  for (const e of item.entries) {
    r -= entryWeight(item, e)
    if (r < 0) return e
  }
  return item.entries[item.entries.length - 1]
}

// 清音／濁音／半濁音：量詞的第一個音換一下（だい→たい、ばん→はん・ぱん），讓沒有特殊念法的量詞也有像樣的錯誤選項
const VOICING = ['かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ', 'ただ', 'てで', 'とど', 'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ']

function voiced(base: string): string[] {
  const row = VOICING.find((r) => r.includes(base[0]))
  return row ? [...row].map((c) => c + base.slice(1)) : [base]
}

export function counterDistractors(item: CounterItem, e: CounterEntry, rng: () => number): string[] {
  const bad = new Set([e.reading, ...e.alts])
  const bases = [...new Set(item.bases.flatMap(voiced))]
  const combos = e.n === null ? [] : (NUM_VARIANTS[e.n] ?? []).flatMap((num) => bases.map((b) => num + b))
  const others = item.entries.filter((x) => x !== e).flatMap((x) => [x.reading, ...x.alts])
  const pool = (list: string[]) => [...new Set(list)].filter((s) => !bad.has(s))
  const traps = pool(e.traps)
  // 易錯答案優先，再來是數字念法 × 量詞念法的組合；都不夠才用同一張表的其他念法（換了數字，比較好猜）
  return [...new Set([...traps.slice(0, 2), ...shuffle(pool(combos), rng), ...traps.slice(2), ...shuffle(pool(others), rng)])].slice(0, 3)
}

/** 講解頁、作答後的說明 */
export function counterExplain(item: CounterItem, e: CounterEntry): string {
  const alt = e.alts.length ? `（也可以說 ${e.alts.join('、')}）` : ''
  return [`${e.label} ＝ ${e.reading}${alt}`, item.note].filter(Boolean).join('\n')
}

export const COUNTER_CATEGORIES = ['量詞', '時間', '日期', '數字'] as const
export const countersIn = (cat: CounterItem['category']) => COUNTERS.filter((c) => c.category === cat)
