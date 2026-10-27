// 同步引擎：本機先寫 → 背景上傳 dirty → 下載 cursor 之後的變更 → LWW 合併；斷線自動重試
import { db, getMeta, setMeta } from '../db/schema'
import { onLocalChange, notifyChange } from '../db/repo'
import { DEMO_DECK_ID } from '../db/demo'
import { SYNC_TABLES, type SyncFields, type SyncTable } from '../types'
import { mergeRemote } from './merge'
import { NetworkError, type SyncBackend, type SyncUser } from './types'

export type SyncStatus = 'local-only' | 'signed-out' | 'needs-choice' | 'syncing' | 'synced' | 'offline' | 'error'

export interface SyncState {
  status: SyncStatus
  pending: number
  user: SyncUser | null
  lastSyncedAt: string | null
  error: string | null
  backendKind: SyncBackend['kind'] | null
}

const PAGE = 500

export class SyncEngine {
  state: SyncState
  private listeners = new Set<(s: SyncState) => void>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private retryMs = 2000
  private running: Promise<void> | null = null
  private again = false
  private disposers: (() => void)[] = []
  private userTask: Promise<void> = Promise.resolve()
  private linked = false

  constructor(
    private backend: SyncBackend | null,
    private opts: { debounceMs?: number; autoStart?: boolean } = {},
  ) {
    this.state = { status: backend ? 'signed-out' : 'local-only', pending: 0, user: null, lastSyncedAt: null, error: null, backendKind: backend?.kind ?? null }
  }

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn)
    fn(this.state)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn(this.state))
  }

  get hasBackend() {
    return !!this.backend
  }

  getBackend() {
    return this.backend
  }

  async start() {
    await this.refreshPending()
    this.disposers.push(
      onLocalChange(() => {
        this.refreshPending()
        this.schedule()
      }),
    )
    if (typeof window !== 'undefined') {
      const online = () => {
        this.retryMs = 2000
        this.schedule(0)
      }
      const offline = () => this.state.user && this.set({ status: 'offline' })
      window.addEventListener('online', online)
      window.addEventListener('offline', offline)
      this.disposers.push(() => window.removeEventListener('online', online), () => window.removeEventListener('offline', offline))
      const iv = setInterval(() => this.schedule(0), 60_000)
      this.disposers.push(() => clearInterval(iv))
    }
    if (!this.backend) return
    this.disposers.push(this.backend.onAuthChange((u) => this.setUser(u)))
    this.setUser(await this.backend.getUser())
    await this.userTask
  }

  private setUser(u: SyncUser | null) {
    this.userTask = this.userTask.then(() => this.handleUser(u)).catch((e) => this.fail(e))
  }

  /** 等登入後的初始化（第一次登入的資料判斷）完成 */
  ready() {
    return this.userTask
  }

  stop() {
    this.disposers.forEach((d) => d())
    this.disposers = []
    if (this.timer) clearTimeout(this.timer)
  }

  async refreshPending() {
    let n = 0
    for (const t of SYNC_TABLES) n += await db.syncTable(t).where('_dirty').equals(1).count()
    this.set({ pending: n })
    return n
  }

  private async handleUser(user: SyncUser | null) {
    if (!user) {
      this.linked = false
      this.set({ user: null, status: 'signed-out' })
      return
    }
    if (this.state.user?.id === user.id && this.linked) return
    this.linked = false
    this.set({ user, error: null })
    const linked = await getMeta<string | null>('syncUser', null)
    if (linked === user.id) {
      this.linked = true
      this.schedule(0)
      return
    }
    // 第一次在這台裝置登入這個帳號
    try {
      const [localHas, remoteHas] = await Promise.all([this.localHasData(), this.backend!.hasRemoteData()])
      if (localHas && remoteHas) {
        this.set({ status: 'needs-choice' })
        return
      }
      // 雲端是空的 → 把本機上傳；只有雲端有 → 以雲端為準
      await this.resolveFirstSync(remoteHas ? 'remote' : 'merge')
    } catch (e) {
      this.fail(e)
    }
  }

  /** 本機有沒有「使用者自己的」資料（只有沒動過的示範單字庫不算） */
  async localHasData(): Promise<boolean> {
    if ((await db.reviewLogs.count()) > 0) return true
    const decks = await db.decks.toArray()
    return decks.some((d) => d.id !== DEMO_DECK_ID)
  }

  /** 第一次登入的選擇：merge = 本機與雲端合併；remote = 以雲端為準（清掉本機） */
  async resolveFirstSync(choice: 'merge' | 'remote') {
    const user = this.state.user
    if (!user) return
    await db.transaction('rw', [...SYNC_TABLES.map((t) => db.syncTable(t)), db.meta], async () => {
      if (choice === 'remote') {
        for (const t of SYNC_TABLES) await db.syncTable(t).clear()
      } else {
        for (const t of SYNC_TABLES) await db.syncTable(t).toCollection().modify({ _dirty: 1 })
      }
      await db.meta.filter((m) => m.key.startsWith('cursor:')).delete()
      await db.meta.put({ key: 'syncUser', value: user.id })
    })
    this.linked = true
    notifyChange()
    await this.refreshPending()
    this.set({ status: 'syncing' })
    await this.doSync()
  }

  schedule(delay = this.opts.debounceMs ?? 1500) {
    if (!this.backend || !this.state.user || !this.linked) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.syncNow().catch(() => {})
    }, delay)
  }

  /** 立即同步一次；同步中再被呼叫會在結束後再跑一次 */
  async syncNow(): Promise<void> {
    await this.userTask
    return this.doSync()
  }

  private async doSync(): Promise<void> {
    if (!this.backend || !this.state.user || !this.linked) return
    if (this.running) {
      this.again = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.again = false
        await this.runOnce()
      } while (this.again)
    })().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async runOnce() {
    const user = this.state.user!
    this.set({ status: 'syncing', error: null })
    try {
      for (const t of SYNC_TABLES) await this.pushTable(t)
      let changed = false
      for (const t of SYNC_TABLES) changed = (await this.pullTable(user.id, t)) || changed
      if (changed) notifyChange()
      await this.refreshPending()
      this.retryMs = 2000
      this.set({ status: 'synced', lastSyncedAt: new Date().toISOString() })
    } catch (e) {
      this.fail(e)
    }
  }

  private fail(e: unknown) {
    const offline = e instanceof NetworkError || (typeof navigator !== 'undefined' && navigator.onLine === false)
    this.set({ status: offline ? 'offline' : 'error', error: offline ? null : String((e as Error)?.message ?? e) })
    // 退避重試：2s → 4s → … → 60s
    const wait = this.retryMs
    this.retryMs = Math.min(this.retryMs * 2, 60_000)
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.syncNow().catch(() => {})
    }, wait)
  }

  private async pushTable(t: SyncTable) {
    const table = db.syncTable(t)
    const dirty: SyncFields[] = await table.where('_dirty').equals(1).toArray()
    for (let i = 0; i < dirty.length; i += PAGE) {
      const chunk = dirty.slice(i, i + PAGE)
      await this.backend!.push(
        t,
        chunk.map(({ _dirty, ...rest }) => rest as SyncFields),
      )
      // 上傳期間若本機又改了，就保留 dirty 讓下一輪再傳
      await db.transaction('rw', table, async () => {
        for (const r of chunk) {
          const cur = await table.get(r.id)
          if (cur && cur.updated_at === r.updated_at) await table.update(r.id, { _dirty: 0 })
        }
      })
    }
  }

  private async pullTable(userId: string, t: SyncTable): Promise<boolean> {
    const key = `cursor:${userId}:${t}`
    let cursor = await getMeta<string | null>(key, null)
    let first = true
    let changed = false
    for (;;) {
      const req = first && cursor && this.backend!.kind === 'supabase' ? 'overlap:' + cursor : cursor
      first = false
      const res = await this.backend!.pull(t, req, PAGE)
      if (res.rows.length) {
        const table = db.syncTable(t)
        await db.transaction('rw', table, async () => {
          const locals = new Map<string, SyncFields>((await table.bulkGet(res.rows.map((r) => r.id))).filter(Boolean).map((r: SyncFields) => [r.id, r]))
          const toPut = mergeRemote(t, locals, res.rows)
          if (toPut.length) {
            await table.bulkPut(toPut)
            changed = true
          }
        })
      }
      cursor = res.cursor
      await setMeta(key, cursor)
      if (!res.hasMore) break
    }
    return changed
  }

  async signOut() {
    await this.backend?.signOut()
  }
}
