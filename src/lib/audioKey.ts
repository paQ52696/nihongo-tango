// 發音音檔的對應：App 與 scripts/gen-audio.ts 共用，兩邊算出來的檔名必須一致
import { displaySurface, primaryReading } from './distractors'
import { kataToHira, splitSuffix } from './kana'
import type { Word } from '../types'

/** 要唸的假名（與練習題的 speak 相同：取第一個讀音、去掉括號附註） */
export function speakTextFor(word: Pick<Word, 'reading'>): string {
  return kataToHira(splitSuffix(primaryReading(word.reading)).core)
}

/** 音檔檔名（不含副檔名）：同一個讀音、不同漢字（橋／箸）的重音可能不同，所以兩者都算進去 */
export function audioKey(word: Pick<Word, 'kanji' | 'reading'>): string {
  return cyrb53(displaySurface(word) + '\t' + speakTextFor(word))
}

// 53-bit 雜湊（cyrb53），轉成 14 位十六進位
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
