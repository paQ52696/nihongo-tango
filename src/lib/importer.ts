// App 內匯入：CSV / Excel / JSON 解析、欄位自動對應、重複偵測；以及匯出
import * as XLSX from 'xlsx'
import type { Deck, DeckEntry, Word } from '../types'
import { displaySurface, primaryReading } from './distractors'
import { hasKanji, normalizeReading } from './kana'
import { splitChunks } from './sentences'

export const ALL_FIELDS = ['kanji', 'reading', 'pos', 'meaning', 'example', 'exampleTranslation', 'page', 'lesson', 'tags', 'note', 'speaker'] as const
export type Field = (typeof ALL_FIELDS)[number]
/** 單字匯入的欄位 */
export const FIELDS: Field[] = ['kanji', 'reading', 'pos', 'meaning', 'example', 'exampleTranslation', 'page', 'lesson', 'tags', 'note']
/** 課文句子匯入的欄位 */
export const SENTENCE_FIELDS: Field[] = ['kanji', 'reading', 'meaning', 'lesson', 'speaker', 'tags']

export type ImportKind = 'word' | 'sentence'

export const SENTENCE_FIELD_LABELS: Partial<Record<Field, string>> = {
  kanji: '日文句子（用 | 分文節）',
  reading: '讀音（選填，用 | 分文節）',
  meaning: '中文翻譯',
}

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
  note: '備註',
  speaker: '說話者',
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
  note: ['備註', '备注', '附註', 'note', 'notes', 'memo', 'メモ'],
  speaker: ['說話者', '說話人', '角色', '話者', 'speaker', 'role'],
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
  return rowsToTable(aoa.map((r) => r.map(cell)))
}

function rowsToTable(rows: string[][]): ParsedTable {
  // 找第一個非空列當標題
  const hi = rows.findIndex((r) => r.some((c) => c))
  if (hi < 0) return { headers: [], rows: [] }
  const width = Math.max(...rows.map((r) => r.length))
  const headers = Array.from({ length: width }, (_, i) => rows[hi][i] || `欄 ${i + 1}`)
  return { headers, rows: rows.slice(hi + 1).filter((r) => r.some((c) => c)).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')) }
}

/**
 * CSV／TSV：自己解析，分隔符號只看標題列決定（逗號、Tab、分號）。
 * SheetJS 會看整份內容猜分隔符號，課文句子用「|」分文節時會被誤判成欄位分隔。
 */
export function parseCsv(text: string): ParsedTable {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0]
  const sep = [',', '\t', ';'].reduce((best, s) => (firstLine.split(s).length > firstLine.split(best).length ? s : best), ',')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rowsToTable(rows.map((r) => r.map(cell)).filter((r) => r.some((c) => c)))
}

export function parseXlsx(buf: ArrayBuffer | Uint8Array): ParsedTable {
  return sheetToTable(XLSX.read(buf, { type: 'array' }))
}

/** JSON：物件陣列、{ words: [...] }（本 App 匯出格式或 PDF 腳本輸出）、{ sentences: [...] }（課文）皆可 */
export function parseJson(text: string): ParsedTable {
  const data = JSON.parse(text.replace(/^﻿/, ''))
  const list: Record<string, unknown>[] = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : Array.isArray(data?.sentences) ? data.sentences : Array.isArray(data?.entries) ? data.entries : []
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

/** 看起來像課文句子：有「說話者」欄，或日文欄用 | 分了文節 */
export function guessKind(table: ParsedTable): ImportKind {
  const m = guessMapping(table.headers)
  if (m.speaker >= 0) return 'sentence'
  if (m.kanji >= 0 && table.rows.some((r) => /[|｜]/.test(r[m.kanji] ?? ''))) return 'sentence'
  return 'word'
}

export function guessMapping(headers: string[]): Mapping {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-（）()]/g, '')
  const m = Object.fromEntries(ALL_FIELDS.map((f) => [f, -1])) as Mapping
  const used = new Set<number>()
  // 先比完全相同，再比包含
  for (const pass of ['exact', 'contains'] as const) {
    for (const f of ALL_FIELDS) {
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
  note: string
  problems: string[]
  /** 單字以外的欄位（課文句子的文節、文法點 id…） */
  extra?: Partial<Word>
}

export function rowsToDrafts(table: ParsedTable, mapping: Mapping, kind: ImportKind = 'word'): WordDraft[] {
  const get = (r: string[], f: Field) => (mapping[f] >= 0 ? (r[mapping[f]] ?? '').trim() : '')
  if (kind === 'sentence') return table.rows.map((r, i) => sentenceDraft(i + 2, get(r, 'kanji'), get(r, 'reading'), get(r, 'meaning'), get(r, 'lesson'), get(r, 'speaker'), get(r, 'tags')))
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
      note: get(r, 'note'),
      problems: [],
    }
    if (!d.reading && !d.kanji) d.problems.push('缺少漢字與讀音')
    else if (!d.reading) d.problems.push('缺少讀音')
    if (!d.meaning) d.problems.push('缺少中文意思')
    if (pageRaw && page === null) d.problems.push(`頁碼「${pageRaw}」不是數字`)
    return d
  })
}

/** 課文句子：「|」分出的文節存在 chunks，讀音也分好的話存在 chunkReadings */
export function sentenceDraft(row: number, ja: string, reading: string, zh: string, lesson: string, speaker: string, tags = ''): WordDraft {
  const chunks = splitChunks(ja)
  const readings = splitChunks(reading)
  const d: WordDraft = {
    row,
    kanji: chunks.join(''),
    reading: readings.join(''),
    pos: '',
    meaning: zh,
    example: '',
    exampleTranslation: '',
    page: null,
    lesson: lesson || null,
    tags: tags.split(/[,，、;；]/).map((t) => t.trim()).filter(Boolean),
    note: '',
    problems: [],
    extra: {
      kind: 'sentence',
      ...(chunks.length > 1 ? { chunks } : {}),
      ...(chunks.length > 1 && readings.length === chunks.length ? { chunkReadings: readings } : {}),
      ...(speaker ? { speaker } : {}),
    },
  }
  if (!d.kanji) d.problems.push('缺少日文')
  if (!d.meaning) d.problems.push('缺少中文翻譯')
  if (reading && readings.length !== chunks.length) d.problems.push('讀音的文節數和日文不同（中翻日只接受漢字寫法）')
  return d
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
    // 單字一定要有讀音；課文句子、文法點只要有日文
    if (draft.extra?.kind ? !draft.kanji : !draft.reading) return { draft, status: 'invalid' as const }
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
