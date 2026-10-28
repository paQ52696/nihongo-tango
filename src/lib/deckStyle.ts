// 單字庫的外觀：紙膠帶顏色與漢字方塊（舊資料的 emoji 圖示與鮮豔顏色在這裡換成和風樣式）
import type { Deck } from '../types'

/** 紙膠帶的柔和色（也是建立單字庫時可選的顏色） */
export const TAPE_COLORS = ['#E8A48A', '#9DB8C9', '#A9C2A0', '#E6C67E', '#C7AFC4', '#B9B09F']

/** 單字庫的漢字方塊可選的字 */
export const DECK_GLYPHS = ['単', '語', '課', '文', '漢', '読', '聴', '試']

const CJK = /^[㐀-鿿豈-﫿]$/

function hash(s: string) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

/** 單字庫的漢字：自己選的字優先，否則依名稱挑一個 */
export function deckGlyph(deck: Pick<Deck, 'name' | 'icon'>): string {
  if (CJK.test(deck.icon ?? '')) return deck.icon
  const name = deck.name
  if (/文法/.test(name)) return '文'
  if (/課文|句/.test(name)) return '課'
  if (/單字|単語|単字|單語|詞/.test(name)) return '単'
  return name.match(/[一-鿿]/)?.[0] ?? '語'
}

/** 紙膠帶顏色：選的是柔和色就用它，舊的鮮豔顏色依名稱固定對到一個柔和色 */
export function tapeColor(deck: Pick<Deck, 'name' | 'color'>): string {
  const c = TAPE_COLORS.find((t) => t.toLowerCase() === (deck.color ?? '').toLowerCase())
  return c ?? TAPE_COLORS[hash(deck.name) % 4]
}
