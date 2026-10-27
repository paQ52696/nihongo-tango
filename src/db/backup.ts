// 全部資料備份／還原（單一 JSON 檔）
import { db, setMeta } from './schema'
import { SYNC_TABLES, type SyncTable } from '../types'
import { notifyChange } from './repo'

export interface BackupFile {
  app: 'nihongo-tango'
  version: 1
  exportedAt: string
  tables: Record<SyncTable, any[]>
}

const strip = ({ _dirty, ...rest }: any) => rest

export async function exportAll(): Promise<BackupFile> {
  const tables = {} as Record<SyncTable, any[]>
  for (const t of SYNC_TABLES) tables[t] = (await db.syncTable(t).toArray()).map(strip).sort((a, b) => (a.id < b.id ? -1 : 1))
  return { app: 'nihongo-tango', version: 1, exportedAt: new Date().toISOString(), tables }
}

export function validateBackup(data: any): asserts data is BackupFile {
  if (!data || data.app !== 'nihongo-tango' || !data.tables) throw new Error('這不是本 App 的備份檔')
  for (const t of SYNC_TABLES) if (!Array.isArray(data.tables[t] ?? [])) throw new Error(`備份檔的 ${t} 格式錯誤`)
}

/** 清空本機後完整還原。還原的資料標為待上傳，登入後會同步到雲端。 */
export async function restoreAll(data: unknown) {
  validateBackup(data)
  await db.transaction('rw', SYNC_TABLES.map((t) => db.syncTable(t)), async () => {
    for (const t of SYNC_TABLES) {
      await db.syncTable(t).clear()
      await db.syncTable(t).bulkPut((data.tables[t] ?? []).map((r: any) => ({ ...r, _dirty: 1 })))
    }
  })
  // 重新從頭拉一次雲端，確保還原後和其他裝置一致
  await db.meta.filter((m) => m.key.startsWith('cursor:')).delete()
  await setMeta('demoSeeded', true)
  notifyChange()
}

/** 清除全部資料（設定頁的「清空資料」） */
export async function wipeAll() {
  await db.transaction('rw', [...SYNC_TABLES.map((t) => db.syncTable(t)), db.meta], async () => {
    for (const t of SYNC_TABLES) await db.syncTable(t).clear()
    await db.meta.clear()
  })
  await setMeta('demoSeeded', true)
  notifyChange()
}
