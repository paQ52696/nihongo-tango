import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData } from '../hooks/useData'
import { batchTags, copyWordsToDeck, removeFromDeck, toggleFavorite, updateWord, addWordToDeck, notifyChange } from '../db/repo'
import { ConfirmButton, DeckTag, Empty, Modal, PageTitle } from '../components/ui'
import { anyToHiragana, normalizeReading } from '../lib/kana'
import { masteryLevel } from '../lib/srs'
import { MASTERY_COLORS, MASTERY_LABELS } from '../components/ui'
import { speak, ttsSupported } from '../lib/browser'
import type { Word } from '../types'

const PAGE = 100

export function WordsPage() {
  const data = useAppData()
  const [params] = useSearchParams()
  const [deck, setDeck] = useState(params.get('deck') ?? 'all')
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<Word | null>(null)
  const [bulk, setBulk] = useState<'tag' | 'copy' | 'move' | null>(null)

  const list = useMemo(() => {
    if (!data) return []
    const inDeck = deck === 'all' ? null : new Set(data.entries.filter((e) => e.deckId === deck).map((e) => e.wordId))
    const order = new Map(data.entries.filter((e) => deck === 'all' || e.deckId === deck).map((e) => [e.wordId, e.order]))
    const query = q.trim()
    const kana = query ? normalizeReading(anyToHiragana(query)) : ''
    return data.words
      .filter((w) => (!inDeck || inDeck.has(w.id)) && (!tag || w.tags.includes(tag)) && (!favOnly || w.favorite))
      .filter((w) => !query || w.kanji.includes(query) || w.meaning.includes(query) || normalizeReading(w.reading).includes(kana) || w.reading.includes(query))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  }, [data, deck, tag, q, favOnly])

  if (!data) return null
  const decksOf = (wid: string) => data.entries.filter((e) => e.wordId === wid).map((e) => ({ entry: e, deck: data.deckById.get(e.deckId) })).filter((x) => x.deck)
  const cardOf = (wid: string) => data.cards.find((c) => c.wordId === wid && (deck === 'all' || c.deckId === deck))
  const sel = [...selected]
  const toggle = (id: string) => {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }

  return (
    <div className="space-y-4">
      <PageTitle>單字列表</PageTitle>
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input className="input max-w-xs flex-1" placeholder="搜尋漢字、讀音、羅馬拼音、中文" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜尋" data-testid="word-search" />
        <select className="input w-auto" value={deck} onChange={(e) => { setDeck(e.target.value); setSelected(new Set()) }} aria-label="單字庫" data-testid="word-deck-filter">
          <option value="all">全部單字庫</option>
          {data.decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.icon} {d.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="標籤">
          <option value="">全部標籤</option>
          {data.tags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
        <button className={`chip ${favOnly ? 'border-amber-400 bg-amber-50 dark:bg-ink-700' : 'border-sakura-200 dark:border-ink-600'}`} aria-pressed={favOnly} onClick={() => setFavOnly(!favOnly)}>
          ⭐ 只看收藏
        </button>
        <span className="ml-auto text-sm text-ink-600 dark:text-lav-300" data-testid="word-count">
          {list.length} 個單字
        </span>
      </div>

      {selected.size > 0 && (
        <div className="card anim-in sticky top-16 z-20 flex flex-wrap items-center gap-2 p-3" data-testid="bulk-bar">
          <span className="text-sm font-medium">已選 {selected.size} 個</span>
          <button className="btn-secondary" onClick={() => setBulk('tag')}>
            🏷 標籤
          </button>
          <button className="btn-secondary" onClick={() => setBulk('copy')}>
            複製到…
          </button>
          {deck !== 'all' && (
            <>
              <button className="btn-secondary" onClick={() => setBulk('move')}>
                移動到…
              </button>
              <ConfirmButton
                confirmText={`從「${data.deckById.get(deck)?.name}」移除 ${selected.size} 個單字？`}
                confirmLabel="移除"
                onConfirm={async () => {
                  await removeFromDeck(deck, sel)
                  setSelected(new Set())
                }}
              >
                從此庫移除
              </ConfirmButton>
            </>
          )}
          <button className="btn-ghost ml-auto" onClick={() => setSelected(new Set())}>
            取消選取
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <Empty>沒有符合條件的單字。</Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-sakura-100 px-4 py-2 text-xs text-ink-600 dark:border-ink-700 dark:text-lav-300">
            <input
              type="checkbox"
              aria-label="全選"
              checked={selected.size > 0 && selected.size === list.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(list.map((w) => w.id)) : new Set())}
            />
            全選
          </div>
          <ul className="divide-y divide-sakura-100 dark:divide-ink-700">
            {list.slice(0, limit).map((w) => {
              const card = cardOf(w.id)
              const lvl = card ? masteryLevel(card) : 'new'
              return (
                <li key={w.id} className="flex items-center gap-3 px-4 py-2.5" data-testid="word-row">
                  <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} aria-label={`選取 ${w.kanji || w.reading}`} />
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: MASTERY_COLORS[lvl] }} title={MASTERY_LABELS[lvl]} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="jp text-lg font-bold">{w.kanji || w.reading}</span>
                      {w.kanji && <span className="jp text-lav-700 dark:text-lav-200">{w.reading}</span>}
                      {w.pos && <span className="rounded bg-lav-100 px-1.5 text-xs dark:bg-ink-600">{w.pos}</span>}
                      <span className="text-sm">{w.meaning}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {decksOf(w.id).map(({ deck: d, entry }) => (
                        <span key={entry.id} className="inline-flex items-center gap-1">
                          <DeckTag deck={d!} small />
                          {entry.page != null && <span className="text-xs text-ink-600 dark:text-lav-300">p.{entry.page}</span>}
                          {entry.lesson && <span className="text-xs text-ink-600 dark:text-lav-300">{entry.lesson}</span>}
                        </span>
                      ))}
                      {w.tags.map((t) => (
                        <span key={t} className="rounded-full bg-sakura-100 px-2 text-xs text-sakura-700 dark:bg-ink-700 dark:text-sakura-200">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                  {ttsSupported() && (
                    <button className="btn-ghost px-2" onClick={() => speak(w.reading)} aria-label="發音">
                      🔊
                    </button>
                  )}
                  <button className="btn-ghost px-2" onClick={() => toggleFavorite(w.id)} aria-label={w.favorite ? '取消收藏' : '收藏'} aria-pressed={w.favorite}>
                    {w.favorite ? '⭐' : '☆'}
                  </button>
                  <button className="btn-ghost px-2" onClick={() => setEditing(w)} aria-label="編輯">
                    ✎
                  </button>
                </li>
              )
            })}
          </ul>
          {list.length > limit && (
            <div className="p-3 text-center">
              <button className="btn-secondary" onClick={() => setLimit(limit + PAGE)}>
                顯示更多（還有 {list.length - limit} 個）
              </button>
            </div>
          )}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="編輯單字" wide>
        {editing && <WordEditor word={editing} deckId={deck === 'all' ? null : deck} data={data} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal open={bulk === 'tag'} onClose={() => setBulk(null)} title={`批次標籤（${selected.size} 個）`}>
        <BulkTags tags={data.tags} onApply={async (add, remove) => { await batchTags(sel, add, remove); setBulk(null) }} />
      </Modal>
      <Modal open={bulk === 'copy' || bulk === 'move'} onClose={() => setBulk(null)} title={bulk === 'move' ? '移動到其他單字庫' : '複製到其他單字庫'}>
        <p className="mb-3 text-sm text-ink-600 dark:text-lav-300">{bulk === 'move' ? '移動後，原單字庫的進度會移除，新單字庫從頭開始。' : '複製後兩個單字庫的進度各自獨立。'}</p>
        <div className="grid gap-2">
          {data.decks
            .filter((d) => d.id !== deck)
            .map((d) => (
              <button
                key={d.id}
                className="btn-secondary justify-start"
                onClick={async () => {
                  if (deck === 'all') {
                    for (const wid of sel) await addWordToDeck(d.id, wid)
                    notifyChange()
                  } else await copyWordsToDeck(deck, d.id, sel, bulk === 'move')
                  setBulk(null)
                  setSelected(new Set())
                }}
              >
                {d.icon} {d.name}
              </button>
            ))}
        </div>
      </Modal>
    </div>
  )
}

function BulkTags({ tags, onApply }: { tags: string[]; onApply: (add: string[], remove: string[]) => void }) {
  const [add, setAdd] = useState('')
  const [remove, setRemove] = useState<string[]>([])
  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="bulk-add">
          加上標籤（用逗號分隔）
        </label>
        <input id="bulk-add" className="input" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="例如：第3課, 易錯" />
      </div>
      {tags.length > 0 && (
        <div>
          <span className="label">移除標籤</span>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button key={t} className={`chip ${remove.includes(t) ? 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200' : 'border-sakura-200 dark:border-ink-600'}`} aria-pressed={remove.includes(t)} onClick={() => setRemove(remove.includes(t) ? remove.filter((x) => x !== t) : [...remove, t])}>
                #{t}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => onApply(add.split(/[,，、]/).map((t) => t.trim()).filter(Boolean), remove)}>
          套用
        </button>
      </div>
    </div>
  )
}

function WordEditor({ word, deckId, data, onDone }: { word: Word; deckId: string | null; data: NonNullable<ReturnType<typeof useAppData>>; onDone: () => void }) {
  const entry = deckId ? data.entries.find((e) => e.deckId === deckId && e.wordId === word.id) : undefined
  const [w, setW] = useState({ ...word, tagsText: word.tags.join(', ') })
  const [page, setPage] = useState(entry?.page?.toString() ?? '')
  const [lesson, setLesson] = useState(entry?.lesson ?? '')
  const field = (k: keyof Word, label: string, jp = false) => (
    <div>
      <label className="label" htmlFor={'edit-' + k}>
        {label}
      </label>
      <input id={'edit-' + k} className={`input ${jp ? 'jp' : ''}`} value={String(w[k] ?? '')} onChange={(e) => setW({ ...w, [k]: e.target.value })} />
    </div>
  )
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const { tagsText, ...rest } = w
        await updateWord(word.id, { ...rest, tags: tagsText.split(/[,，、]/).map((t) => t.trim()).filter(Boolean) })
        if (deckId && entry) {
          await addWordToDeck(deckId, word.id, { page: page ? Number(page) : null, lesson: lesson || null })
          notifyChange()
        }
        onDone()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field('kanji', '漢字表記', true)}
        {field('reading', '讀音', true)}
        {field('pos', '詞性')}
        {field('meaning', '中文意思')}
      </div>
      {field('example', '例句', true)}
      {field('exampleTranslation', '例句翻譯')}
      <div>
        <label className="label" htmlFor="edit-tags">
          標籤（逗號分隔）
        </label>
        <input id="edit-tags" className="input" value={w.tagsText} onChange={(e) => setW({ ...w, tagsText: e.target.value })} />
      </div>
      {entry && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="edit-page">
              頁碼（{data.deckById.get(deckId!)?.name}）
            </label>
            <input id="edit-page" type="number" className="input" value={page} onChange={(e) => setPage(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="edit-lesson">
              課次／章節
            </label>
            <input id="edit-lesson" className="input" value={lesson} onChange={(e) => setLesson(e.target.value)} />
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>
          取消
        </button>
        <button type="submit" className="btn-primary">
          儲存
        </button>
      </div>
    </form>
  )
}
