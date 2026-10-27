// 瀏覽器相關工具：發音、主題、下載、安裝 PWA

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
  return voices.find((v) => v.lang === 'ja-JP' && /Kyoko|Otoya|Google|Nanami|Haruka/i.test(v.name)) ?? voices.find((v) => v.lang.replace('_', '-').startsWith('ja'))
}

export function hasJapaneseVoice(): boolean {
  return !!japaneseVoice()
}

/** 唸出日文。Safari 第一次必須由使用者點擊觸發，之後就能自動播放。 */
export function speak(text: string, rate = 0.9): boolean {
  if (!ttsSupported() || !text) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  const v = japaneseVoice()
  if (v) u.voice = v
  u.rate = rate
  synth.speak(u)
  return true
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1d1530' : '#f9a8c9')
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
