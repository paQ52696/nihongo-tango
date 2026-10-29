// SupabaseBackend：正式使用的雲端同步。資料表結構見 supabase/schema.sql
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SyncFields, SyncTable } from '../types'
import { NetworkError, type PullResult, type SyncBackend, type SyncUser } from './types'

const TABLE_NAMES: Record<SyncTable, string> = {
  words: 'words',
  decks: 'decks',
  deckEntries: 'deck_entries',
  cards: 'cards',
  reviewLogs: 'review_logs',
  settings: 'settings',
}

/** 每次同步開始時往回多抓一段時間，避免交易提交順序造成漏抓（合併是冪等的，重抓無害） */
const OVERLAP_MS = 30_000

function isNetworkError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e)
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network|Failed to fetch|Load failed/i.test(msg)
}

export const WRONG_PASSWORD = 'Email 或密碼錯誤。還沒設定過密碼的話：先在瀏覽器用「寄送登入信」登入，再到「帳號與同步」設定密碼。'

export class SupabaseBackend implements SyncBackend {
  readonly kind = 'supabase' as const
  private client: SupabaseClient

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }

  private redirectUrl() {
    // HashRouter：導回不含 # 的網址，PKCE 的 ?code= 會放在 query string
    return window.location.origin + window.location.pathname
  }

  async getUser(): Promise<SyncUser | null> {
    const { data } = await this.client.auth.getSession()
    const u = data.session?.user
    return u ? { id: u.id, email: u.email ?? '' } : null
  }

  onAuthChange(cb: (u: SyncUser | null) => void) {
    const { data } = this.client.auth.onAuthStateChange((_e, session) => {
      const u = session?.user
      cb(u ? { id: u.id, email: u.email ?? '' } : null)
    })
    return () => data.subscription.unsubscribe()
  }

  async signInWithEmail(email: string) {
    const { error } = await this.client.auth.signInWithOtp({ email, options: { emailRedirectTo: this.redirectUrl() } })
    if (error) throw new Error(error.message)
    return { message: `登入信已寄到 ${email}。請在這個瀏覽器打開信中的連結；信裡如果有驗證碼，也可以輸入在下面。`, needsCode: true }
  }

  async verifyEmailCode(email: string, code: string) {
    const { error } = await this.client.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw new Error(/expired|invalid/i.test(error.message) ? '驗證碼錯誤或已過期，請重新寄一次' : error.message)
  }

  async signInWithPassword(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({ email, password })
    if (error) throw new Error(/invalid login credentials/i.test(error.message) ? WRONG_PASSWORD : error.message)
  }

  async setPassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password })
    if (!error) return
    if (/at least|characters/i.test(error.message)) throw new Error('密碼太短，至少要 6 個字元')
    if (/different/i.test(error.message)) throw new Error('新密碼和舊的一樣')
    if (/reauthenticat|recent/i.test(error.message)) throw new Error('為了安全，請先登出、重新用登入信登入，再馬上設定密碼')
    throw new Error(error.message)
  }

  async signInWithGoogle() {
    const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: this.redirectUrl() } })
    if (error) throw new Error(error.message)
  }

  async signOut() {
    await this.client.auth.signOut()
  }

  async push(table: SyncTable, rows: SyncFields[]) {
    const user = await this.getUser()
    if (!user) throw new Error('尚未登入')
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ id: r.id, user_id: user.id, data: r, updated_at: r.updated_at, deleted: r.deleted }))
      try {
        const { error } = await this.client.from(TABLE_NAMES[table]).upsert(chunk, { onConflict: 'user_id,id' })
        if (error) throw error
      } catch (e) {
        if (isNetworkError(e)) throw new NetworkError()
        throw e
      }
    }
  }

  async pull(table: SyncTable, cursor: string | null, limit: number): Promise<PullResult> {
    try {
      let q = this.client.from(TABLE_NAMES[table]).select('data, synced_at').order('synced_at', { ascending: true }).limit(limit)
      if (cursor) {
        // cursor 格式：「ISO 時間」或「overlap:ISO 時間」（第一頁往回多抓）
        const overlap = cursor.startsWith('overlap:')
        const iso = overlap ? cursor.slice(8) : cursor
        // Postgres 回傳微秒（.123456），Safari 的 Date 解析不了，先截成毫秒
        const ms = new Date(iso.replace(/(\.\d{3})\d+/, '$1')).getTime()
        const since = overlap && Number.isFinite(ms) ? new Date(ms - OVERLAP_MS).toISOString() : iso
        q = q.gt('synced_at', since)
      }
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []).map((d: any) => d.data as SyncFields)
      const last = data && data.length ? (data[data.length - 1] as any).synced_at : cursor?.replace(/^overlap:/, '') ?? null
      return { rows, cursor: last, hasMore: (data?.length ?? 0) === limit }
    } catch (e) {
      if (isNetworkError(e)) throw new NetworkError()
      throw e
    }
  }

  async hasRemoteData() {
    for (const t of ['decks', 'words', 'reviewLogs'] as SyncTable[]) {
      const { count, error } = await this.client.from(TABLE_NAMES[t]).select('id', { count: 'exact', head: true })
      if (error) {
        if (isNetworkError(error)) throw new NetworkError()
        throw error
      }
      if ((count ?? 0) > 0) return true
    }
    return false
  }
}
