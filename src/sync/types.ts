import type { SyncFields, SyncTable } from '../types'

export interface SyncUser {
  id: string
  email: string
}

export interface PullResult {
  rows: SyncFields[]
  cursor: string | null
  hasMore: boolean
}

/** 同步後端介面：SupabaseBackend（正式）、MockBackend（測試／尚未設定金鑰時開發用） */
export interface SyncBackend {
  readonly kind: 'supabase' | 'mock'
  getUser(): Promise<SyncUser | null>
  onAuthChange(cb: (user: SyncUser | null) => void): () => void
  /** 寄登入信。needsCode：要在 App 裡輸入信中的驗證碼（安裝成 App 時連結會開到瀏覽器，只能用驗證碼） */
  signInWithEmail(email: string): Promise<{ message: string; needsCode?: boolean }>
  /** 用信中的驗證碼登入 */
  verifyEmailCode(email: string, code: string): Promise<void>
  /** Email＋密碼登入（不用收信；安裝成 App 的裝置用這個最方便） */
  signInWithPassword(email: string, password: string): Promise<void>
  /** 已登入時設定／更改密碼 */
  setPassword(password: string): Promise<void>
  signInWithGoogle(): Promise<void>
  signOut(): Promise<void>
  /** 上傳；伺服器端以 updated_at 較新者為準 */
  push(table: SyncTable, rows: SyncFields[]): Promise<void>
  /** 下載 cursor 之後變動的資料（cursor 由伺服器產生，與裝置時鐘無關） */
  pull(table: SyncTable, cursor: string | null, limit: number): Promise<PullResult>
  hasRemoteData(): Promise<boolean>
}

export class NetworkError extends Error {
  constructor(message = '無法連線到同步伺服器') {
    super(message)
    this.name = 'NetworkError'
  }
}
