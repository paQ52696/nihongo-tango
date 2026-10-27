// 錯誤類型歸類：比較正解與我選的答案，判斷是漏長音、漏促音、清濁音混淆……
import { normalizeReading, stripLongVowels, stripSokuon, stripDakuten, enlargeYouon, isKanji, toMorae } from './kana'
import type { ErrorType, QuestionMode } from '../types'

export const ERROR_LABELS: Record<ErrorType, string> = {
  long_vowel_missing: '漏長音',
  long_vowel_extra: '多加長音',
  sokuon_missing: '漏促音',
  sokuon_extra: '多加促音',
  dakuten: '清濁音混淆',
  youon: '拗音大小寫',
  mixed: '多種發音混淆',
  alt_reading: '音讀／訓讀混淆',
  kanji_confusion: '漢字混淆',
  meaning: '意思混淆',
  timeout: '未作答／超時',
  other: '其他',
}

const countLong = (s: string) => toMorae(s).length - toMorae(stripLongVowels(s)).length

/** 讀音類題目的錯誤歸類 */
export function classifyReadingError(correct: string, chosen: string, altReadings: string[] = []): ErrorType | null {
  const a = normalizeReading(correct)
  const b = normalizeReading(chosen)
  if (a === b) return null
  if (stripLongVowels(a) === stripLongVowels(b)) return countLong(a) > countLong(b) ? 'long_vowel_missing' : 'long_vowel_extra'
  if (stripSokuon(a) === stripSokuon(b)) return a.length > b.length ? 'sokuon_missing' : 'sokuon_extra'
  if (stripDakuten(a) === stripDakuten(b)) return 'dakuten'
  if (enlargeYouon(a) === enlargeYouon(b)) return 'youon'
  const all = (s: string) => enlargeYouon(stripDakuten(stripSokuon(stripLongVowels(s))))
  if (all(a) === all(b)) return 'mixed'
  if (altReadings.map(normalizeReading).includes(b)) return 'alt_reading'
  return 'other'
}

/** 任何題型的錯誤歸類 */
export function classifyError(
  mode: QuestionMode,
  correct: string,
  chosen: string | null,
  ctx: { altReadings?: string[] } = {},
): ErrorType | null {
  if (chosen === null || chosen === '') return 'timeout'
  if (correct === chosen) return null
  switch (mode) {
    case 'kanji2reading':
    case 'listening':
    case 'typing': {
      // 打字題若打的是漢字，只能判斷對錯
      if ([...chosen].some(isKanji)) return 'other'
      return classifyReadingError(correct, chosen, ctx.altReadings)
    }
    case 'reading2kanji':
    case 'cloze': {
      const shared = [...correct].filter(isKanji).some((c) => chosen.includes(c))
      return shared ? 'kanji_confusion' : 'meaning'
    }
    case 'kanji2meaning':
      return 'meaning'
  }
}
