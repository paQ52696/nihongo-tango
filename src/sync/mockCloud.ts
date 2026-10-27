// 模擬雲端資料庫的伺服器端邏輯（MockBackend 的記憶體模式與 scripts/mock-cloud.mjs 共用）
// 注意：這個檔案會被 Node 直接載入（type stripping），只能用可被移除的 TS 語法、不能 import 其他模組。

export interface CloudRow {
  id: string
  updated_at: string
  deleted: boolean
  [k: string]: unknown
}

interface Stored {
  row: CloudRow
  seq: number
}

export class MockCloud {
  private data = new Map<string, Map<string, Stored>>() // key: user|table
  private seq = 0

  private bucket(user: string, table: string): Map<string, Stored> {
    const k = user + '|' + table
    let b = this.data.get(k)
    if (!b) {
      b = new Map()
      this.data.set(k, b)
    }
    return b
  }

  /** 與 Supabase trigger 相同的規則：較舊的 updated_at 不會覆蓋較新的 */
  push(user: string, table: string, rows: CloudRow[]): void {
    const b = this.bucket(user, table)
    for (const r of rows) {
      const cur = b.get(r.id)
      if (cur && r.updated_at < cur.row.updated_at) continue
      if (cur && table === 'reviewLogs') continue // 作答紀錄只新增不修改
      b.set(r.id, { row: { ...r }, seq: ++this.seq })
    }
  }

  pull(user: string, table: string, cursor: string | null, limit: number): { rows: CloudRow[]; cursor: string | null; hasMore: boolean } {
    const after = cursor ? Number(cursor) : 0
    const all = [...this.bucket(user, table).values()].filter((s) => s.seq > after).sort((a, b) => a.seq - b.seq)
    const page = all.slice(0, limit)
    return {
      rows: page.map((s) => ({ ...s.row })),
      cursor: page.length ? String(page[page.length - 1].seq) : cursor,
      hasMore: all.length > limit,
    }
  }

  hasData(user: string): boolean {
    for (const [k, b] of this.data) if (k.startsWith(user + '|') && b.size > 0) return true
    return false
  }

  reset(): void {
    this.data.clear()
    this.seq = 0
  }
}
