// 練習／模擬考共用：選單字庫（可多選）與範圍
import type { AppData } from '../hooks/useData'
import { SCOPE_LABELS, inScope, type Scope } from '../lib/session'

export interface ScopeValue {
  deckIds: string[]
  scope: Scope
}

export function parseScope(params: URLSearchParams, data: AppData): ScopeValue {
  const ids = (params.get('decks') ?? '').split(',').filter((id) => data.deckById.has(id))
  const deckIds = ids.length ? ids : data.decks.map((d) => d.id)
  const list = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean)
  let scope: Scope = { kind: 'all' }
  switch (params.get('scope')) {
    case 'pages':
      scope = { kind: 'pages', from: Number(params.get('from')) || 1, to: Number(params.get('to')) || Number(params.get('from')) || 1 }
      break
    case 'lessons':
      scope = { kind: 'lessons', lessons: list('lessons') }
      break
    case 'tags':
      scope = { kind: 'tags', tags: list('tags') }
      break
    case 'pos':
      scope = { kind: 'pos', pos: list('pos') }
      break
    case 'mistakes':
      scope = { kind: 'mistakes' }
      break
    case 'due':
      scope = { kind: 'due' }
      break
  }
  return { deckIds, scope }
}

export function countInScope(v: ScopeValue, data: AppData, now = new Date()): number {
  const entryByKey = new Map(data.entries.map((e) => [e.deckId + '|' + e.wordId, e]))
  const words = new Set<string>()
  for (const c of data.cards) {
    if (!v.deckIds.includes(c.deckId)) continue
    const w = data.wordById.get(c.wordId)
    const e = entryByKey.get(c.deckId + '|' + c.wordId)
    if (w && e && inScope(c, e, w, v.scope, data.mistakes, now)) words.add(c.wordId)
  }
  return words.size
}

export function ScopePicker({ value, onChange, data }: { value: ScopeValue; onChange: (v: ScopeValue) => void; data: AppData }) {
  const entries = data.entries.filter((e) => value.deckIds.includes(e.deckId))
  const pages = entries.map((e) => e.page).filter((p): p is number => p != null)
  const minPage = pages.length ? Math.min(...pages) : 1
  const maxPage = pages.length ? Math.max(...pages) : 1
  const lessons = [...new Set(entries.map((e) => e.lesson).filter((l): l is string => !!l))].sort((a, b) => a.localeCompare(b, 'zh-TW', { numeric: true }))
  const deckWordIds = new Set(entries.map((e) => e.wordId))
  const tags = [...new Set(data.words.filter((w) => deckWordIds.has(w.id)).flatMap((w) => w.tags))].sort()
  const posList = [...new Set(data.words.filter((w) => deckWordIds.has(w.id)).map((w) => w.pos).filter(Boolean))].sort()
  const mistakes = [...data.mistakes.values()].filter((m) => m.inBook && value.deckIds.includes(m.deckId)).length
  const due = value.deckIds.reduce((s, id) => s + (data.deckStats.get(id)?.dueToday ?? 0), 0)

  const setScope = (scope: Scope) => onChange({ ...value, scope })
  const toggleDeck = (id: string) => {
    const has = value.deckIds.includes(id)
    const next = has ? value.deckIds.filter((x) => x !== id) : [...value.deckIds, id]
    onChange({ ...value, deckIds: next })
  }
  const toggleIn = (arr: string[], x: string) => (arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x])
  const chip = (active: boolean) =>
    `chip ${active ? 'border-sakura-400 bg-sakura-100 font-semibold text-sakura-700 dark:border-sakura-400 dark:bg-ink-600 dark:text-sakura-200' : 'border-sakura-200 bg-white hover:bg-sakura-50 dark:border-ink-600 dark:bg-ink-800 dark:hover:bg-ink-700'}`

  const kinds: { kind: Scope['kind']; hint?: string; disabled?: boolean }[] = [
    { kind: 'all' },
    { kind: 'pages', hint: pages.length ? `p.${minPage}–${maxPage}` : '沒有頁碼', disabled: !pages.length },
    { kind: 'lessons', hint: lessons.length ? `${lessons.length} 個` : '沒有課次', disabled: !lessons.length },
    { kind: 'tags', hint: tags.length ? `${tags.length} 個` : '沒有標籤', disabled: !tags.length },
    { kind: 'pos', hint: posList.length ? `${posList.length} 種` : '沒有詞性', disabled: !posList.length },
    { kind: 'mistakes', hint: `${mistakes} 題` },
    { kind: 'due', hint: `${due} 張` },
  ]

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="label">① 單字庫（可多選）</legend>
        <div className="flex flex-wrap gap-2">
          {data.decks.map((d) => {
            const active = value.deckIds.includes(d.id)
            return (
              <button key={d.id} type="button" aria-pressed={active} onClick={() => toggleDeck(d.id)} className={chip(active)} style={active ? { borderColor: d.color } : undefined} data-testid="deck-chip">
                <span aria-hidden>{d.icon}</span>
                {d.name}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label">② 範圍</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="範圍">
          {kinds.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={value.scope.kind === k.kind}
              disabled={k.disabled}
              className={chip(value.scope.kind === k.kind) + ' disabled:opacity-40'}
              onClick={() => {
                if (k.kind === 'pages') setScope({ kind: 'pages', from: minPage, to: Math.min(maxPage, minPage + 3) })
                else if (k.kind === 'lessons') setScope({ kind: 'lessons', lessons: lessons.slice(0, 1) })
                else if (k.kind === 'tags') setScope({ kind: 'tags', tags: tags.slice(0, 1) })
                else if (k.kind === 'pos') setScope({ kind: 'pos', pos: posList.slice(0, 1) })
                else setScope({ kind: k.kind } as Scope)
              }}
            >
              {SCOPE_LABELS[k.kind]}
              {k.hint && <span className="text-xs opacity-70">（{k.hint}）</span>}
            </button>
          ))}
        </div>

        {value.scope.kind === 'pages' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>p.</span>
            <input aria-label="起始頁" data-testid="page-from" type="number" className="input w-24" min={minPage} max={maxPage} value={value.scope.from} onChange={(e) => setScope({ ...(value.scope as any), from: Number(e.target.value) })} />
            <span>到 p.</span>
            <input aria-label="結束頁" data-testid="page-to" type="number" className="input w-24" min={minPage} max={maxPage} value={value.scope.to} onChange={(e) => setScope({ ...(value.scope as any), to: Number(e.target.value) })} />
          </div>
        )}
        {value.scope.kind === 'lessons' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {lessons.map((l) => {
              const sc = value.scope as Extract<Scope, { kind: 'lessons' }>
              return (
                <button key={l} type="button" aria-pressed={sc.lessons.includes(l)} className={chip(sc.lessons.includes(l))} onClick={() => setScope({ kind: 'lessons', lessons: toggleIn(sc.lessons, l) })}>
                  {l}
                </button>
              )
            })}
          </div>
        )}
        {value.scope.kind === 'tags' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((t) => {
              const sc = value.scope as Extract<Scope, { kind: 'tags' }>
              return (
                <button key={t} type="button" aria-pressed={sc.tags.includes(t)} className={chip(sc.tags.includes(t))} onClick={() => setScope({ kind: 'tags', tags: toggleIn(sc.tags, t) })}>
                  #{t}
                </button>
              )
            })}
          </div>
        )}
        {value.scope.kind === 'pos' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {posList.map((p) => {
              const sc = value.scope as Extract<Scope, { kind: 'pos' }>
              return (
                <button key={p} type="button" aria-pressed={sc.pos.includes(p)} className={chip(sc.pos.includes(p))} onClick={() => setScope({ kind: 'pos', pos: toggleIn(sc.pos, p) })}>
                  {p}
                </button>
              )
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-ink-600 dark:text-lav-300" data-testid="scope-count">
          符合範圍的單字：{countInScope(value, data)} 個
        </p>
      </fieldset>
    </div>
  )
}
