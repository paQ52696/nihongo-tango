// 衝突合併規則（純函式）
// - 一般資料：updated_at 較新者為準（Last-Write-Wins）；相同時保留本機
// - ReviewLog：只新增不修改，依 id 聯集
// - 刪除：軟刪除（deleted=true）也是一次更新，一樣比 updated_at
import type { SyncFields, SyncTable } from '../types'

export type MergeDecision = 'take-remote' | 'keep-local'

export function decide(table: SyncTable, local: SyncFields | undefined, remote: SyncFields): MergeDecision {
  if (!local) return 'take-remote'
  if (table === 'reviewLogs') return 'keep-local'
  return remote.updated_at > local.updated_at ? 'take-remote' : 'keep-local'
}

/** 回傳要寫進本機的資料（已標記為已同步） */
export function mergeRemote<T extends SyncFields>(table: SyncTable, locals: Map<string, T>, remotes: T[]): T[] {
  const out = new Map<string, T>()
  for (const r of remotes) {
    const cur = out.get(r.id) ?? locals.get(r.id)
    if (decide(table, cur, r) === 'take-remote') out.set(r.id, { ...r, _dirty: 0 })
  }
  return [...out.values()]
}
