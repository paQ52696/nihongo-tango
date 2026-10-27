import { describe, it, expect, beforeEach } from 'vitest'
import { AppDB, setDb, db } from '../../src/db/schema'
import { createDeck, importDrafts, recordAnswer, updateDeck, deleteDeck, loadAll, cardIdFor } from '../../src/db/repo'
import { seedDemoIfEmpty } from '../../src/db/demo'
import { checkDuplicates, guessMapping, parseCsv, rowsToDrafts } from '../../src/lib/importer'
import { decide, mergeRemote } from '../../src/sync/merge'
import { MockBackend } from '../../src/sync/mock'
import { MockCloud } from '../../src/sync/mockCloud'
import { SyncEngine } from '../../src/sync/engine'
import type { Deck, ReviewLog } from '../../src/types'

const row = (id: string, updated_at: string, extra = {}) => ({ id, updated_at, deleted: false, ...extra })

describe('合併規則', () => {
  it('updated_at 較新的為準', () => {
    expect(decide('decks', row('a', '2026-01-02'), row('a', '2026-01-03'))).toBe('take-remote')
    expect(decide('decks', row('a', '2026-01-03'), row('a', '2026-01-02'))).toBe('keep-local')
    expect(decide('decks', row('a', '2026-01-03'), row('a', '2026-01-03'))).toBe('keep-local')
    expect(decide('decks', undefined, row('a', '2026-01-03'))).toBe('take-remote')
  })
  it('ReviewLog 只新增不修改', () => {
    expect(decide('reviewLogs', row('a', '1'), row('a', '9'))).toBe('keep-local')
    expect(decide('reviewLogs', undefined, row('a', '9'))).toBe('take-remote')
  })
  it('軟刪除也依時間比較', () => {
    expect(decide('cards', row('a', '2026-01-01'), row('a', '2026-01-02', { deleted: true }))).toBe('take-remote')
    expect(decide('cards', row('a', '2026-01-03'), row('a', '2026-01-02', { deleted: true }))).toBe('keep-local')
  })
  it('同一批裡同 id 出現兩次取較新的，寫入時標記已同步', () => {
    const out = mergeRemote('decks', new Map(), [row('a', '2', { name: 'old' }), row('a', '3', { name: 'new' })] as any)
    expect(out).toEqual([{ id: 'a', updated_at: '3', deleted: false, name: 'new', _dirty: 0 }])
  })
})

describe('MockCloud 伺服器規則', () => {
  it('較舊的寫入不覆蓋較新的', () => {
    const c = new MockCloud()
    c.push('u', 'decks', [row('a', '2026-01-03', { name: 'new' })])
    c.push('u', 'decks', [row('a', '2026-01-01', { name: 'old' })])
    expect(c.pull('u', 'decks', null, 10).rows[0].name).toBe('new')
  })
  it('cursor 分頁', () => {
    const c = new MockCloud()
    c.push('u', 'words', [row('a', '1'), row('b', '1'), row('c', '1')])
    const p1 = c.pull('u', 'words', null, 2)
    expect(p1.rows).toHaveLength(2)
    expect(p1.hasMore).toBe(true)
    const p2 = c.pull('u', 'words', p1.cursor, 2)
    expect(p2.rows.map((r) => r.id)).toEqual(['c'])
    expect(p2.hasMore).toBe(false)
  })
  it('不同使用者資料互相隔離', () => {
    const c = new MockCloud()
    c.push('u1', 'words', [row('a', '1')])
    expect(c.pull('u2', 'words', null, 10).rows).toHaveLength(0)
    expect(c.hasData('u2')).toBe(false)
  })
})

// 模擬兩台裝置：各自一個 IndexedDB、共用一個雲端
let n = 0
function device(cloud: MockCloud) {
  const d = new AppDB('dev-' + ++n)
  const backend = new MockBackend({ cloud, storageKey: 'user-' + n })
  const engine = new SyncEngine(backend, { debounceMs: 999999 })
  return { db: d, backend, engine, use: () => setDb(d) }
}

const CSV = `漢字,讀音,中文,頁碼
学校,がっこう,學校,1
先生,せんせい,老師,1
切手,きって,郵票,2
`

async function answer(deckId: string, wordId: string, correct: boolean, at: Date) {
  return recordAnswer({ cardId: cardIdFor(deckId, wordId), deckId, wordId, mode: 'kanji2reading', prompt: '', answer: 'a', chosen: correct ? 'a' : 'b', options: [], correct, errorType: correct ? null : 'other', rating: correct ? 3 : 1, durationMs: 100, source: 'practice', sessionId: 's', now: at })
}

describe('兩台裝置同步（MockBackend）', () => {
  let cloud: MockCloud
  beforeEach(() => {
    cloud = new MockCloud()
  })

  it('A 作答後 B 同步就看到；兩邊離線各自作答，連線後正確合併', async () => {
    const A = device(cloud)
    const B = device(cloud)

    // A：建立單字庫並匯入，登入（雲端是空的 → 直接上傳）
    A.use()
    await seedDemoIfEmpty()
    const deck = await createDeck({ name: '期中考' })
    const t = parseCsv(CSV)
    await importDrafts(deck.id, checkDuplicates(rowsToDrafts(t, guessMapping(t.headers)), (await loadAll()).words, [], deck.id))
    await A.engine.start()
    await A.backend.signInWithEmail('me@example.com')
    await A.engine.ready()
    await A.engine.syncNow()
    expect(A.engine.state.status).toBe('synced')
    expect(A.engine.state.pending).toBe(0)

    // B：只有示範資料，登入同帳號 → 以雲端為準
    B.use()
    await seedDemoIfEmpty()
    await B.engine.start()
    await B.backend.signInWithEmail('me@example.com')
    await B.engine.ready()
    await B.engine.syncNow()
    let all = await loadAll()
    expect(all.decks.map((d) => d.name).sort()).toEqual(['示範單字庫', '期中考'].sort())

    // A 作答 → 同步 → B 同步後看到
    A.use()
    const words = (await loadAll()).words
    const gakko = words.find((w) => w.kanji === '学校')!
    await answer(deck.id, gakko.id, true, new Date('2026-03-01T10:00:00Z'))
    await A.engine.syncNow()
    B.use()
    await B.engine.syncNow()
    all = await loadAll()
    expect(all.logs).toHaveLength(1)
    expect(all.cards.find((c) => c.id === cardIdFor(deck.id, gakko.id))!.state).toBe('review')

    // 兩邊離線各自作答
    A.backend.offline = true
    B.backend.offline = true
    const kitte = words.find((w) => w.kanji === '切手')!
    const sensei = words.find((w) => w.kanji === '先生')!
    A.use()
    await answer(deck.id, kitte.id, false, new Date('2026-03-02T10:00:00Z'))
    await updateDeck(deck.id, { name: '期中考（A 改）' })
    await A.engine.syncNow()
    expect(A.engine.state.status).toBe('offline')
    expect(A.engine.state.pending).toBeGreaterThan(0)
    B.use()
    await answer(deck.id, sensei.id, true, new Date('2026-03-02T11:00:00Z'))
    await answer(deck.id, kitte.id, true, new Date('2026-03-02T12:00:00Z'))
    await new Promise((r) => setTimeout(r, 5))
    await updateDeck(deck.id, { name: '期中考（B 後改）' })
    await B.engine.syncNow()
    expect(B.engine.state.status).toBe('offline')

    // 恢復連線
    A.backend.offline = false
    B.backend.offline = false
    A.use()
    await A.engine.syncNow()
    B.use()
    await B.engine.syncNow()
    A.use()
    await A.engine.syncNow()

    const finalA = await snapshot()
    B.use()
    const finalB = await snapshot()
    expect(finalA).toEqual(finalB)
    expect(finalA.logs).toBe(4) // 作答紀錄全部聯集
    expect(finalA.deckName).toBe('期中考（B 後改）') // 較新的改名勝出
    expect(A.engine.state.pending).toBe(0)
    expect(B.engine.state.pending).toBe(0)
    A.engine.stop()
    B.engine.stop()

    async function snapshot() {
      const s = await loadAll()
      return {
        logs: s.logs.length,
        deckName: s.decks.find((d) => d.id === deck.id)!.name,
        cards: s.cards.map((c) => [c.id, c.state, c.reps, c.updated_at]).sort(),
        words: s.words.length,
      }
    }
  })

  it('第一次登入：本機與雲端都有資料 → 要求選擇；以雲端為準會清掉本機', async () => {
    const A = device(cloud)
    A.use()
    await createDeck({ name: 'A 的庫' })
    await A.engine.start()
    await A.backend.signInWithEmail('x@example.com')
    await A.engine.ready()
    await A.engine.syncNow()

    const B = device(cloud)
    B.use()
    await createDeck({ name: 'B 的庫' })
    await B.engine.start()
    await B.backend.signInWithEmail('x@example.com')
    await B.engine.ready()
    expect(B.engine.state.status).toBe('needs-choice')
    await B.engine.resolveFirstSync('remote')
    expect((await loadAll()).decks.map((d) => d.name)).toEqual(['A 的庫'])
    A.engine.stop()
    B.engine.stop()
  })

  it('第一次登入選「合併」：兩邊資料都保留', async () => {
    const A = device(cloud)
    A.use()
    await createDeck({ name: 'A 的庫' })
    await A.engine.start()
    await A.backend.signInWithEmail('y@example.com')
    await A.engine.ready()
    await A.engine.syncNow()

    const B = device(cloud)
    B.use()
    await createDeck({ name: 'B 的庫' })
    await B.engine.start()
    await B.backend.signInWithEmail('y@example.com')
    await B.engine.ready()
    await B.engine.resolveFirstSync('merge')
    expect((await loadAll()).decks.map((d) => d.name).sort()).toEqual(['A 的庫', 'B 的庫'])
    A.use()
    await A.engine.syncNow()
    expect((await loadAll()).decks.map((d) => d.name).sort()).toEqual(['A 的庫', 'B 的庫'])
    A.engine.stop()
    B.engine.stop()
  })

  it('刪除會同步到其他裝置', async () => {
    const A = device(cloud)
    const B = device(cloud)
    A.use()
    const deck = await createDeck({ name: '要刪的' })
    await A.engine.start()
    await A.backend.signInWithEmail('z@example.com')
    await A.engine.ready()
    await A.engine.syncNow()
    B.use()
    await B.engine.start()
    await B.backend.signInWithEmail('z@example.com')
    await B.engine.ready()
    await B.engine.syncNow()
    expect((await loadAll()).decks).toHaveLength(1)
    A.use()
    await deleteDeck(deck.id)
    await A.engine.syncNow()
    B.use()
    await B.engine.syncNow()
    expect((await loadAll()).decks).toHaveLength(0)
    expect(((await db.decks.get(deck.id)) as Deck).deleted).toBe(true)
    A.engine.stop()
    B.engine.stop()
  })

  it('沒有後端時是僅本機模式', async () => {
    setDb(new AppDB('local-only'))
    const e = new SyncEngine(null)
    await e.start()
    expect(e.state.status).toBe('local-only')
    await e.syncNow() // 不會丟錯
    e.stop()
  })

  it('上傳期間本機又改，不會誤標為已同步', async () => {
    const A = device(cloud)
    A.use()
    await A.engine.start()
    await A.backend.signInWithEmail('w@example.com')
    await A.engine.ready()
    const deck = await createDeck({ name: 'v1' })
    const origPush = A.backend.push.bind(A.backend)
    let once = true
    A.backend.push = async (t, rows) => {
      await origPush(t, rows)
      if (t === 'decks' && once) {
        once = false
        await updateDeck(deck.id, { name: 'v2' })
      }
    }
    await A.engine.syncNow()
    expect((await db.decks.get(deck.id))!._dirty).toBe(1)
    await A.engine.syncNow()
    expect((await db.decks.get(deck.id))!._dirty).toBe(0)
    expect(cloud.pull('mock-' + '', 'decks', null, 10).rows).toHaveLength(0) // 沒有寫到別人的帳號
    A.engine.stop()
    void ({} as ReviewLog)
  })
})
