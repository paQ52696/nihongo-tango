// 依環境變數選擇同步後端：有 Supabase 金鑰 → SupabaseBackend；有模擬雲端網址 → MockBackend；都沒有 → 僅本機模式
import { useSyncExternalStore } from 'react'
import { SyncEngine, type SyncState } from './engine'
import { MockBackend } from './mock'
import type { SyncBackend } from './types'

function mockUrl(): string | null {
  const env = import.meta.env.VITE_MOCK_SYNC_URL as string | undefined
  if (env) return env
  try {
    // 開發用：網址加 ?mockSync=http://localhost:8787 會記住
    const p = new URLSearchParams(window.location.search).get('mockSync')
    if (p) localStorage.setItem('mockSyncUrl', p)
    return localStorage.getItem('mockSyncUrl')
  } catch {
    return null
  }
}

async function createBackend(): Promise<SyncBackend | null> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url && key && !url.includes('xxxxxxxx')) {
    const { SupabaseBackend } = await import('./supabase')
    return new SupabaseBackend(url, key)
  }
  const m = mockUrl()
  if (m) return new MockBackend({ url: m })
  return null
}

let engine: SyncEngine = new SyncEngine(null)
let state: SyncState = engine.state
const subs = new Set<() => void>()
let unsub: (() => void) | null = null

function attach(e: SyncEngine) {
  unsub?.()
  engine = e
  unsub = e.subscribe((s) => {
    state = s
    subs.forEach((f) => f())
  })
}
attach(engine)

export async function startSync() {
  const backend = await createBackend()
  const e = new SyncEngine(backend)
  attach(e)
  await e.start()
  return e
}

export function getEngine() {
  return engine
}

export function useSync(): SyncState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => state,
  )
}

export type { SyncState }
