// 瀏覽器相關工具：發音、主題、下載、安裝 PWA
import { audioKey, speakTextFor } from './audioKey'
import type { Word } from '../types'

// ---------- 發音（Web Speech API） ----------
let voices: SpeechSynthesisVoice[] = []
const voiceListeners = new Set<() => void>()

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

if (ttsSupported()) {
  const load = () => {
    voices = window.speechSynthesis.getVoices()
    voiceListeners.forEach((f) => f())
  }
  load()
  window.speechSynthesis.addEventListener?.('voiceschanged', load)
}

export function onVoicesChanged(fn: () => void) {
  voiceListeners.add(fn)
  return () => {
    voiceListeners.delete(fn)
  }
}

export function japaneseVoice(): SpeechSynthesisVoice | undefined {
  const ja = voices.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'))
  // 離線時線上語音（Google、Edge 的 Natural）唸不出來，改用裝置內建的
  const usable = typeof navigator !== 'undefined' && navigator.onLine === false && ja.some((v) => v.localService) ? ja.filter((v) => v.localService) : ja
  return usable.find((v) => /Kyoko|Otoya|Google|Nanami|Haruka|Ayumi|Ichiro|Sayaka/i.test(v.name)) ?? usable[0]
}

export function hasJapaneseVoice(): boolean {
  return !!japaneseVoice()
}

// Chrome 會在唸完前把 utterance 回收掉而中斷，留一個參照
let current: SpeechSynthesisUtterance | null = null

/** 唸出日文。Safari 第一次必須由使用者點擊觸發，之後就能自動播放。onDone：唸完或失敗時呼叫 */
export function speak(text: string, rate = 0.9, onDone?: () => void): boolean {
  if (!ttsSupported() || !text) return false
  const v = japaneseVoice()
  // 語音清單已載入卻沒有日文：不要讓系統用中文／英文語音唸（漢字會唸成中文）
  if (!v && voices.length > 0) return false
  const synth = window.speechSynthesis
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  if (v) u.voice = v
  u.rate = rate
  current = u
  u.onend = u.onerror = () => {
    if (current === u) current = null
    onDone?.()
  }
  if (synth.speaking || synth.pending) {
    // Windows Chrome：cancel() 後立刻 speak() 常常沒聲音，稍等一下再唸
    synth.cancel()
    setTimeout(() => current === u && synth.speak(u), 80)
  } else {
    synth.resume() // Chrome 偶爾卡在暫停狀態
    synth.speak(u)
  }
  return true
}

// ---------- VOICEVOX 音檔（scripts/gen-audio.ts 產生；沒有音檔的字改用上面的瀏覽器語音） ----------
let audioKeys = new Set<string>()
let audioCredit = ''
let audioEl: HTMLAudioElement | null = null
/** 設定的預設語速（與 DEFAULT_SETTINGS.ttsRate 相同） */
const DEFAULT_TTS_RATE = 0.9

/** 載入音檔清單（App 啟動時呼叫一次；離線時由 Service Worker 快取提供） */
export async function loadAudioManifest() {
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'audio/index.json')
    if (!res.ok) return
    const m: { keys?: string[]; credit?: string } = await res.json()
    audioKeys = new Set(m.keys ?? [])
    audioCredit = m.credit ?? ''
    voiceListeners.forEach((f) => f())
  } catch {
    /* 沒有音檔也能用 */
  }
}

/** 有沒有任何 VOICEVOX 音檔 */
export function hasAudioFiles() {
  return audioKeys.size > 0
}

/** 音檔的聲音標註，例如「VOICEVOX:四国めたん」（使用條款要求標示） */
export function audioCreditText() {
  return audioCredit
}

/** 能不能播放聲音（音檔或瀏覽器語音其中一種） */
export function audioSupported() {
  return hasAudioFiles() || ttsSupported()
}

/** 這台裝置能不能唸日文：有音檔，或有日文語音 */
export function canSpeakJapanese() {
  return hasAudioFiles() || hasJapaneseVoice()
}

// ---------- 正在播放哪個字（讓發音按鈕顯示播放中） ----------
let playing: { key: string; id: number } | null = null
let playSeq = 0
const playListeners = new Set<() => void>()
function setPlaying(p: typeof playing) {
  playing = p
  playListeners.forEach((f) => f())
}
/** 目前正在唸的字（audioKey），沒有在唸就是 null */
export function playingKey() {
  return playing?.key ?? null
}
export function onPlayingChange(fn: () => void) {
  playListeners.add(fn)
  return () => {
    playListeners.delete(fn)
  }
}

/** 唸一個單字：有 VOICEVOX 音檔就播音檔，否則用瀏覽器語音 */
export function playWord(word: Pick<Word, 'kanji' | 'reading'>, rate = 0.9): boolean {
  const key = audioKey(word)
  const id = ++playSeq
  setPlaying({ key, id })
  const done = () => playing?.id === id && setPlaying(null)
  // 保險：事件沒觸發也不會一直顯示播放中
  setTimeout(done, 15000)
  if (audioKeys.has(key) && typeof Audio !== 'undefined') {
    if (ttsSupported()) window.speechSynthesis.cancel()
    audioEl?.pause()
    const a = new Audio(import.meta.env.BASE_URL + `audio/${key}.mp3`)
    // 語速設定是以瀏覽器語音為準（預設 0.9 偏慢）；音檔本身就是自然語速，預設時原速播放。
    // 變速播放要靠瀏覽器即時伸縮聲音，聲音會變悶、變粗糙，所以只有使用者調整語速時才變速
    const r = rate / DEFAULT_TTS_RATE
    if (Math.abs(r - 1) > 0.01) {
      a.preservesPitch = true // 變速時維持音高，不要變低沉
      a.playbackRate = r
    }
    audioEl = a
    a.addEventListener('ended', done)
    a.addEventListener('pause', done)
    a.play().catch((e: Error) => {
      // 自動播放被擋（Safari 第一次）不改用語音；檔案壞掉或抓不到才改用瀏覽器語音
      if (e.name !== 'NotAllowedError' && audioEl === a) {
        if (!speak(speakTextFor(word), rate, done)) done()
      } else done()
    })
    return true
  }
  const ok = speak(speakTextFor(word), rate, done)
  if (!ok) done()
  return ok
}

// ---------- 主題（每台裝置各自設定，不同步） ----------
export type Theme = 'system' | 'light' | 'dark'

export function getTheme(): Theme {
  try {
    return (localStorage.getItem('theme') as Theme) || 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(t: Theme = getTheme()) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', !!dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1f1d1a' : '#F4F1EA')
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem('theme', t)
  } catch {
    /* 私密模式 */
  }
  applyTheme(t)
}

// ---------- 下載檔案 ----------
export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFilename(s: string) {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_')
}

// ---------- 安裝 PWA ----------
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const installListeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    installListeners.forEach((f) => f())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installListeners.forEach((f) => f())
  })
}

export function canPromptInstall() {
  return !!deferredPrompt
}

export function onInstallAvailable(fn: () => void) {
  installListeners.add(fn)
  return () => {
    installListeners.delete(fn)
  }
}

export async function promptInstall() {
  if (!deferredPrompt) return false
  await deferredPrompt.prompt()
  const r = await deferredPrompt.userChoice
  deferredPrompt = null
  return r.outcome === 'accepted'
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true
}

export function isSafari() {
  const ua = navigator.userAgent
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS|Android/.test(ua)
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
