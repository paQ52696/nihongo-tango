// 用 VOICEVOX 產生單字發音音檔（MP3），放到 public/audio/，部署後所有裝置都能播
//
// 用法（先打開 VOICEVOX，讓引擎在 http://127.0.0.1:50021 執行）：
//   npm run gen-audio -- data/out/n5.json                 ← import_pdf.py 轉出的 JSON
//   npm run gen-audio -- 備份檔.json                       ← App「設定 → 匯出備份」的檔案（含期中考等所有單字庫）
//   選項：--speaker 四国めたん --style ノーマル --force（重新產生已存在的檔案）
//
// 已經產生過的字會跳過，所以新增單字後重跑一次即可。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Mp3Encoder } from '@breezystack/lamejs'
import { audioKey, speakTextFor } from '../src/lib/audioKey'
import { displaySurface } from '../src/lib/distractors'
import { hasKanji } from '../src/lib/kana'

const ENGINE = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021'
const OUT = 'public/audio'
const MANIFEST = join(OUT, 'index.json')
const SAMPLE_RATE = 24000
const KBPS = 96 // 48 kbps 壓縮痕跡明顯；96 kbps 每個字約 6 KB

type W = { kanji: string; reading: string }

function parseArgs() {
  const args = process.argv.slice(2)
  const opt = { files: [] as string[], speaker: '四国めたん', style: 'ノーマル', force: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--speaker') opt.speaker = args[++i]
    else if (a === '--style') opt.style = args[++i]
    else if (a === '--force') opt.force = true
    else opt.files.push(a)
  }
  if (!opt.files.length) {
    console.error('請指定單字檔，例如：npm run gen-audio -- data/out/n5.json')
    process.exit(1)
  }
  return opt
}

/** 讀入 import JSON（{ words: [...] } 或陣列）或 App 的備份檔（{ tables: { words } }） */
function loadWords(file: string): W[] {
  const j = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''))
  const list: any[] = Array.isArray(j) ? j : (j.tables?.words ?? j.words ?? [])
  return list.filter((w) => w && !w.deleted && w.reading).map((w) => ({ kanji: w.kanji ?? '', reading: w.reading }))
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(ENGINE + path, init)
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status} ${await res.text()}`)
  return res
}

async function findStyleId(speaker: string, style: string): Promise<{ id: number; name: string }> {
  const speakers: { name: string; styles: { name: string; id: number }[] }[] = await (await api('/speakers')).json()
  const sp = speakers.find((s) => s.name === speaker)
  if (!sp) throw new Error(`找不到聲音「${speaker}」。可用：${speakers.map((s) => s.name).join('、')}`)
  const st = sp.styles.find((s) => s.name === style)
  if (!st) throw new Error(`「${speaker}」沒有「${style}」風格。可用：${sp.styles.map((s) => s.name).join('、')}`)
  return { id: st.id, name: `${speaker}（${style}）` }
}

async function audioQuery(text: string, speaker: number) {
  return (await api(`/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, { method: 'POST' })).json()
}

const moras = (q: any): string =>
  q.accent_phrases.flatMap((p: any) => [...p.moras, ...(p.pause_mora ? [p.pause_mora] : [])].map((m: any) => m.text)).join('')

/** 先用漢字查詢（重音比較準）；VOICEVOX 唸出來的音跟課本讀音不同時（例如熟字訓），改用假名 */
async function buildQuery(w: W, speaker: number) {
  const text = speakTextFor(w)
  const kanaQ = await audioQuery(text, speaker)
  const surface = displaySurface(w)
  let q = kanaQ
  let usedKanji = false
  if (hasKanji(surface)) {
    const kanjiQ = await audioQuery(surface, speaker)
    if (moras(kanjiQ) === moras(kanaQ)) {
      q = kanjiQ
      usedKanji = true
    }
  }
  q.outputSamplingRate = SAMPLE_RATE
  q.outputStereo = false
  q.prePhonemeLength = 0.05
  q.postPhonemeLength = 0.1
  return { q, usedKanji }
}

/** VOICEVOX 輸出 16-bit PCM WAV；找到 data 區塊轉成 MP3 */
function wavToMp3(wav: Buffer): Buffer {
  let pos = 12
  let pcm: Int16Array | null = null
  let rate = SAMPLE_RATE
  while (pos + 8 <= wav.length) {
    const id = wav.toString('ascii', pos, pos + 4)
    const size = wav.readUInt32LE(pos + 4)
    if (id === 'fmt ') rate = wav.readUInt32LE(pos + 12)
    if (id === 'data') {
      const bytes = wav.subarray(pos + 8, pos + 8 + size)
      pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length))
      break
    }
    pos += 8 + size + (size % 2)
  }
  if (!pcm) throw new Error('WAV 格式無法解析')
  const enc = new Mp3Encoder(1, rate, KBPS)
  const chunks: Uint8Array[] = []
  for (let i = 0; i < pcm.length; i += 1152) chunks.push(enc.encodeBuffer(pcm.subarray(i, i + 1152)))
  chunks.push(enc.flush())
  return Buffer.concat(chunks.map((c) => Buffer.from(c)))
}

async function main() {
  const opt = parseArgs()
  try {
    await api('/version')
  } catch {
    console.error(`連不到 VOICEVOX 引擎（${ENGINE}）。請先打開 VOICEVOX 再執行。`)
    process.exit(1)
  }
  const style = await findStyleId(opt.speaker, opt.style)
  mkdirSync(OUT, { recursive: true })

  const manifest: { voice: string; credit: string; keys: string[] } = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
    : { voice: style.name, credit: `VOICEVOX:${opt.speaker}`, keys: [] }
  if (manifest.voice !== style.name && !opt.force) {
    console.error(`現有音檔是「${manifest.voice}」，要換成「${style.name}」請加 --force 全部重新產生。`)
    process.exit(1)
  }
  manifest.voice = style.name
  manifest.credit = `VOICEVOX:${opt.speaker}`
  const keys = new Set(opt.force ? [] : manifest.keys)

  // 同一個字在多個檔案或單字庫裡出現只做一次
  const todo = new Map<string, W>()
  for (const f of opt.files) for (const w of loadWords(f)) todo.set(audioKey(w), w)

  let made = 0
  let skipped = 0
  let kanaFallback = 0
  const failed: string[] = []
  for (const [key, w] of todo) {
    const file = join(OUT, key + '.mp3')
    if (!opt.force && keys.has(key) && existsSync(file)) {
      skipped++
      continue
    }
    try {
      const { q, usedKanji } = await buildQuery(w, style.id)
      if (!usedKanji && hasKanji(displaySurface(w))) kanaFallback++
      const wav = Buffer.from(await (await api(`/synthesis?speaker=${style.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) })).arrayBuffer())
      writeFileSync(file, wavToMp3(wav))
      keys.add(key)
      made++
      if (made % 50 === 0) console.log(`  …已產生 ${made} 個`)
    } catch (e) {
      failed.push(`${displaySurface(w)}（${speakTextFor(w)}）：${(e as Error).message}`)
    }
  }

  manifest.keys = [...keys].sort()
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n')
  console.log(`完成：新產生 ${made} 個、已存在略過 ${skipped} 個、失敗 ${failed.length} 個（聲音：${style.name}）`)
  if (kanaFallback) console.log(`其中 ${kanaFallback} 個字 VOICEVOX 的漢字讀法跟課本不同，改用假名發音`)
  for (const f of failed) console.log('  ✗ ' + f)
  console.log('記得 commit 並 push public/audio/，網站才會有新的音檔。')
}

main()
