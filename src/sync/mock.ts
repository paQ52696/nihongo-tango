// MockBackend：模擬雲端。兩種模式：
// - 記憶體（傳入 MockCloud）：單元測試用
// - HTTP（傳入 url）：連到 scripts/mock-cloud.mjs，讓兩個瀏覽器共用同一個「雲端」，E2E 與開發用
import type { SyncFields, SyncTable } from '../types'
import { MockCloud, type CloudRow } from './mockCloud'
import { NetworkError, type PullResult, type SyncBackend, type SyncUser } from './types'

export interface MockOptions {
  cloud?: MockCloud
  url?: string
  storageKey?: string
}

function userIdFromEmail(email: string): string {
  let h = 0
  for (const ch of email.trim().toLowerCase()) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0
  return 'mock-' + h.toString(16)
}

const memoryStore = new Map<string, string>()
const store = {
  get(k: string) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(k) : (memoryStore.get(k) ?? null)
    } catch {
      return memoryStore.get(k) ?? null
    }
  },
  set(k: string, v: string | null) {
    try {
      if (typeof localStorage !== 'undefined') {
        if (v === null) localStorage.removeItem(k)
        else localStorage.setItem(k, v)
        return
      }
    } catch {
      /* 改用記憶體 */
    }
    if (v === null) memoryStore.delete(k)
    else memoryStore.set(k, v)
  },
}

export class MockBackend implements SyncBackend {
  readonly kind = 'mock' as const
  /** 記憶體模式下模擬斷線 */
  offline = false
  private cloud?: MockCloud
  private url?: string
  private key: string
  private listeners = new Set<(u: SyncUser | null) => void>()

  constructor(opts: MockOptions = {}) {
    this.cloud = opts.cloud
    this.url = opts.url?.replace(/\/$/, '')
    this.key = opts.storageKey ?? 'mockSyncUser'
    if (!this.cloud && !this.url) this.cloud = new MockCloud()
  }

  async getUser(): Promise<SyncUser | null> {
    const raw = store.get(this.key)
    return raw ? (JSON.parse(raw) as SyncUser) : null
  }

  onAuthChange(cb: (u: SyncUser | null) => void) {
    this.listeners.add(cb)
    return () => {
      this.listeners.delete(cb)
    }
  }

  private emit(u: SyncUser | null) {
    this.listeners.forEach((cb) => cb(u))
  }

  async signInWithEmail(email: string) {
    const user = { id: userIdFromEmail(email), email: email.trim() }
    store.set(this.key, JSON.stringify(user))
    this.emit(user)
    return { message: '（模擬雲端）已直接登入，不會寄出信件。' }
  }

  async signInWithGoogle() {
    await this.signInWithEmail('google-user@example.com')
  }

  async signOut() {
    store.set(this.key, null)
    this.emit(null)
  }

  private async requireUser(): Promise<SyncUser> {
    const u = await this.getUser()
    if (!u) throw new Error('尚未登入')
    return u
  }

  private async http<T>(path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(this.url + path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      throw new NetworkError()
    }
    if (!res.ok) throw new Error(`模擬雲端錯誤 ${res.status}`)
    return res.json() as Promise<T>
  }

  async push(table: SyncTable, rows: SyncFields[]) {
    const u = await this.requireUser()
    if (this.cloud) {
      if (this.offline) throw new NetworkError()
      this.cloud.push(u.id, table, rows as unknown as CloudRow[])
      return
    }
    await this.http('/push', { user: u.id, table, rows })
  }

  async pull(table: SyncTable, cursor: string | null, limit: number): Promise<PullResult> {
    const u = await this.requireUser()
    if (this.cloud) {
      if (this.offline) throw new NetworkError()
      return this.cloud.pull(u.id, table, cursor, limit) as unknown as PullResult
    }
    return this.http<PullResult>('/pull', { user: u.id, table, cursor, limit })
  }

  async hasRemoteData() {
    const u = await this.requireUser()
    if (this.cloud) {
      if (this.offline) throw new NetworkError()
      return this.cloud.hasData(u.id)
    }
    const r = await this.http<{ hasData: boolean }>('/has', { user: u.id })
    return r.hasData
  }
}
