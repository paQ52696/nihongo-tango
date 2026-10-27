// App 內匯入：CSV / Excel / JSON 解析、欄位自動對應、重複偵測；以及匯出
import * as XLSX from 'xlsx'
import type { Deck, DeckEntry, Word } from '../types'
import { displaySurface, primaryReading } from './distractors'
import { hasKanji, normalizeReading } from './kana'

export const FIELDS = ['kanji', 'reading', 'pos', 'meaning', 'example', 'exampleTranslation', 'page', 'lesson', 'tags'] as const
export type Field = (typeof FIELDS)[number]

export const FIELD_LABELS: Record<Field, string> = {
  kanji: '漢字表記',
  reading: '讀音（假名）',
  pos: '詞性',
  meaning: '中文意思',
  example: '例句',
  exampleTranslation: '例句翻譯',
  page: '頁碼',
  lesson: '課次／章節',
  tags: '標籤',
}

const ALIASES: Record<Field, string[]> = {
  kanji: ['漢字', '漢字表記', '表記', '單字', '单词', '単語', '單語', '日文', 'word', 'kanji', 'expression', 'surface'],
  reading: ['讀音', '读音', '假名', '平假名', '讀法', '発音', 'よみ', '読み', 'ふりがな', 'reading', 'kana', 'furigana', 'yomi'],
  pos: ['詞性', '词性', '品詞', 'pos', 'part of speech', 'type'],
  meaning: ['中文', '意思', '中文意思', '意味', '解釋', '翻譯', 'meaning', 'definition', 'chinese', 'gloss'],
  example: ['例句', '例文', 'example', 'sentence'],
  exampleTranslation: ['例句翻譯', '例句中文', '例句意思', '例文訳', 'example translation', 'exampletranslation', 'sentence translation'],
  page: ['頁', '頁數', '頁碼', '页码', 'page', 'p'],
  lesson: ['課', '課次', '課別', '章節', '章', '單元', 'lesson', 'chapter', 'unit'],
  tags: ['標籤', '标签', 'tag', 'tags', 'タグ'],
}

export interface ParsedTable {
  headers: string[]
  rows: string[][]
}

/** 自動判斷編碼：先試 UTF-8，失敗再試 Big5（台灣 Excel 存 CSV 的預設）、Shift_JIS */
export function decodeText(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  for (const enc of ['utf-8', 'big5', 'shift_jis']) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(bytes).replace(/^﻿/, '')
    } catch {
      /* 換下一種 */
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}

const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())

function sheetToTable(wb: XLSX.WorkBook): ParsedTable {
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false })
  const rows = aoa.map((r) => r.map(cell))
  // 找第一個非空列當標題
  const hi = rows.findIndex((r) => r.some((c) => c))
  if (hi < 0) return { headers: [], rows: [] }
  const width = Math.max(...rows.map((r) => r.length))
  const headers = Array.from({ length: width }, (_, i) => rows[hi][i] || `欄 ${i + 1}`)
  return { headers, rows: rows.slice(hi + 1).filter((r) => r.some((c) => c)).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')) }
}

export function parseCsv(text: string): ParsedTable {
  return sheetToTable(XLSX.read(text, { type: 'string', raw: true }))
}

export function parseXlsx(buf: ArrayBuffer | Uint8Array): ParsedTable {
  return sheetToTable(XLSX.read(buf, { type: 'array' }))
}

/** JSON：物件陣列、{ words: [...] }（本 App 匯出格式或 PDF 腳本輸出）皆可 */
export function parseJson(text: string): ParsedTable {
  const data = JSON.parse(text.replace(/^﻿/, ''))
  const list: Record<string, unknown>[] = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : Array.isArray(data?.entries) ? data.entries : []
  if (!list.length) throw new Error('JSON 裡找不到單字陣列（需要是陣列，或含有 words 陣列的物件）')
  const headers: string[] = []
  for (const o of list) for (const k of Object.keys(o)) if (!headers.includes(k)) headers.push(k)
  const rows = list.map((o) => headers.map((h) => (Array.isArray(o[h]) ? (o[h] as unknown[]).join(',') : cell(o[h]))))
  return { headers, rows }
}

export function parseFile(name: string, buf: ArrayBuffer): ParsedTable {
  const ext = name.toLowerCase().split('.').pop()
  if (ext === 'json') return parseJson(decodeText(buf))
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return parseCsv(decodeText(buf))
  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') return parseXlsx(buf)
  throw new Error(`不支援的檔案格式：.${ext}（支援 CSV、Excel、JSON）`)
}

export type Mapping = Record<Field, number>

export function guessMapping(headers: string[]): Mapping {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-（）()]/g, '')
  const m = Object.fromEntries(FIELDS.map((f) => [f, -1])) as Mapping
  const used = new Set<number>()
  // 先比完全相同，再比包含
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of FIELDS) {
      if (m[f] >= 0) continue
      const idx = headers.findIndex((h, i) => {
        if (used.has(i)) return false
        const nh = norm(h)
        return ALIASES[f].some((a) => (pass === 'exact' ? nh === norm(a) : norm(a).length > 1 && nh.includes(norm(a))))
      })
      if (idx >= 0) {
        m[f] = idx
        used.add(idx)
      }
    }
  }
  return m
}

export interface WordDraft {
  row: number
  kanji: string
  reading: string
  pos: string
  meaning: string
  example: string
  exampleTranslation: string
  page: number | null
  lesson: string | null
  tags: string[]
  problems: string[]
}

export function rowsToDrafts(table: ParsedTable, mapping: Mapping): WordDraft[] {
  const get = (r: string[], f: Field) => (mapping[f] >= 0 ? (r[mapping[f]] ?? '').trim() : '')
  return table.rows.map((r, i) => {
    const pageRaw = get(r, 'page').replace(/^p\.?\s*/i, '')
    const page = pageRaw && /^\d+$/.test(pageRaw) ? parseInt(pageRaw, 10) : null
    const d: WordDraft = {
      row: i + 2,
      kanji: get(r, 'kanji'),
      reading: get(r, 'reading'),
      pos: get(r, 'pos'),
      meaning: get(r, 'meaning'),
      example: get(r, 'example'),
      exampleTranslation: get(r, 'exampleTranslation'),
      page,
      lesson: get(r, 'lesson') || null,
      tags: get(r, 'tags').split(/[,，、;；]/).map((t) => t.trim()).filter(Boolean),
      problems: [],
    }
    if (!d.reading && !d.kanji) d.problems.push('缺少漢字與讀音')
    else if (!d.reading) d.problems.push('缺少讀音')
    if (!d.meaning) d.problems.push('缺少中文意思')
    if (pageRaw && page === null) d.problems.push(`頁碼「${pageRaw}」不是數字`)
    return d
  })
}

/** 重複比對用的 key：表記＋讀音 */
export function wordKey(w: { kanji: string; reading: string }): string {
  const surface = displaySurface(w)
  return (hasKanji(surface) ? surface : normalizeReading(surface)) + '|' + normalizeReading(primaryReading(w.reading))
}

export type DupStatus = 'new' | 'existing' | 'inDeck' | 'dupInFile' | 'invalid'

export interface DraftCheck {
  draft: WordDraft
  status: DupStatus
  existing?: Word
}

/** 偵測重複：已存在的單字（可合併或另存）、已在目標單字庫、檔案內重複 */
export function checkDuplicates(drafts: WordDraft[], words: Word[], deckEntries: DeckEntry[], deckId: string | null): DraftCheck[] {
  const byKey = new Map<string, Word>()
  for (const w of words) if (!w.deleted) byKey.set(wordKey(w), w)
  const inDeck = new Set(deckEntries.filter((e) => !e.deleted && e.deckId === deckId).map((e) => e.wordId))
  const seen = new Set<string>()
  return drafts.map((draft) => {
    if (!draft.reading) return { draft, status: 'invalid' as const }
    const key = wordKey(draft)
    if (seen.has(key)) return { draft, status: 'dupInFile' as const }
    seen.add(key)
    const existing = byKey.get(key)
    if (!existing) return { draft, status: 'new' as const }
    if (inDeck.has(existing.id)) return { draft, status: 'inDeck' as const, existing }
    return { draft, status: 'existing' as const, existing }
  })
}

// ---------- 匯出 ----------
const EXPORT_HEADERS = ['漢字', '讀音', '詞性', '意思', '例句', '例句翻譯', '頁碼', '課次', '標籤']

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v
}

export function exportRows(deckId: string, words: Word[], entries: DeckEntry[]) {
  const byId = new Map(words.map((w) => [w.id, w]))
  return entries
    .filter((e) => e.deckId === deckId && !e.deleted && byId.get(e.wordId) && !byId.get(e.wordId)!.deleted)
    .sort((a, b) => a.order - b.order)
    .map((e) => ({ entry: e, word: byId.get(e.wordId)! }))
}

export function deckToCsv(deckId: string, words: Word[], entries: DeckEntry[]): string {
  const lines = [EXPORT_HEADERS.join(',')]
  for (const { word: w, entry: e } of exportRows(deckId, words, entries)) {
    lines.push(
      [w.kanji, w.reading, w.pos, w.meaning, w.example, w.exampleTranslation, e.page != null ? String(e.page) : '', e.lesson ?? '', w.tags.join(',')]
        .map((v) => csvEscape(v ?? ''))
        .join(','),
    )
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export function deckToJson(deck: Deck, words: Word[], entries: DeckEntry[]): string {
  return JSON.stringify(
    {
      format: 'nihongo-tango-deck',
      version: 1,
      deck: { name: deck.name, color: deck.color, icon: deck.icon, examDate: deck.examDate ?? null },
      words: exportRows(deck.id, words, entries).map(({ word: w, entry: e }) => ({
        kanji: w.kanji,
        reading: w.reading,
        pos: w.pos,
        meaning: w.meaning,
        example: w.example,
        exampleTranslation: w.exampleTranslation,
        page: e.page ?? null,
        lesson: e.lesson ?? null,
        tags: w.tags,
      })),
    },
    null,
    2,
  )
}
