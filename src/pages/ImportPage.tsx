import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppData } from '../hooks/useData'
import { createDeck, importDrafts, type DupDecision, type ImportResult } from '../db/repo'
import { PageTitle, Segmented } from '../components/ui'
import {
  FIELDS,
  FIELD_LABELS,
  SENTENCE_FIELDS,
  SENTENCE_FIELD_LABELS,
  checkDuplicates,
  guessKind,
  guessMapping,
  parseFile,
  rowsToDrafts,
  type DupStatus,
  type ImportKind,
  type Mapping,
  type ParsedTable,
} from '../lib/importer'
import { GRAMMAR_SETS } from '../data/grammar'
import { addGrammarSet } from '../db/grammar'

const STATUS_LABEL: Record<DupStatus, { text: string; cls: string }> = {
  new: { text: '新增', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  existing: { text: '已存在', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  inDeck: { text: '已在此庫', cls: 'bg-lav-100 text-lav-800 dark:bg-ink-600 dark:text-lav-100' },
  dupInFile: { text: '檔案內重複', cls: 'bg-lav-100 text-lav-800 dark:bg-ink-600 dark:text-lav-100' },
  invalid: { text: '缺少讀音', cls: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
}

export function ImportPage() {
  const data = useAppData()
  const [params] = useSearchParams()
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<ParsedTable | null>(null)
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<string>(params.get('deck') ?? '__new')
  const [newName, setNewName] = useState('')
  const [decision, setDecision] = useState<DupDecision>('merge')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<(ImportResult & { deckId: string }) | null>(null)
  const [kind, setKind] = useState<ImportKind>('word')
  const [grammarMsg, setGrammarMsg] = useState<{ deckId: string; text: string } | null>(null)

  const deckId = target === '__new' ? null : target
  const checks = useMemo(() => {
    if (!table || !mapping || !data) return null
    return checkDuplicates(rowsToDrafts(table, mapping, kind), data.words, data.entries, deckId)
  }, [table, mapping, data, deckId, kind])
  const unit = kind === 'sentence' ? '句' : '個單字'
  const fields = kind === 'sentence' ? SENTENCE_FIELDS : FIELDS
  const required: string[] = kind === 'sentence' ? ['kanji', 'meaning'] : ['reading', 'meaning']
  const missingRequired = mapping ? (kind === 'sentence' ? mapping.kanji < 0 : mapping.reading < 0) : true

  if (!data) return null

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    setResult(null)
    try {
      const t = parseFile(f.name, await f.arrayBuffer())
      if (!t.rows.length) throw new Error('檔案裡沒有資料列')
      setTable(t)
      setMapping(guessMapping(t.headers))
      setKind(guessKind(t))
      setFileName(f.name)
      setNewName(f.name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setTable(null)
      setError(String((e as Error).message))
    }
  }

  const counts = checks ? checks.reduce((m, c) => ((m[c.status] = (m[c.status] ?? 0) + 1), m), {} as Record<DupStatus, number>) : null
  const problems = checks?.filter((c) => c.draft.problems.length) ?? []

  const doImport = async () => {
    if (!checks) return
    setBusy(true)
    try {
      const id = deckId ?? (await createDeck({ name: newName || '匯入的單字庫' })).id
      // 建新庫時不會有「已在此庫」，直接沿用檢查結果
      const r = await importDrafts(id, checks, decision)
      setResult({ ...r, deckId: id })
      setTable(null)
      setMapping(null)
      setTarget(id)
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageTitle>匯入單字／課文</PageTitle>

      {result && (
        <div className="card anim-in border-emerald-300 bg-emerald-50 p-4 dark:bg-emerald-950/40" data-testid="import-result" role="status">
          <p className="font-bold">匯入完成！</p>
          <p className="text-sm">
            新增 {result.added} 個・合併 {result.merged} 個・另存 {result.separate} 個・略過 {result.skipped} 個
          </p>
          <Link className="btn-primary mt-2" to={`/deck/${result.deckId}`}>
            前往單字庫
          </Link>
        </div>
      )}

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">① 選擇檔案</h2>
        <p className="text-sm text-ink-600 dark:text-lav-300">支援 CSV（UTF-8 或 Big5）、Excel（.xlsx）、JSON（本 App 匯出檔或 scripts/import_pdf.py 的輸出）。第一列要是欄位名稱。PDF、Word 請先用 scripts/ 裡的轉換腳本轉成 JSON／CSV。</p>
        <label className="btn-secondary w-fit cursor-pointer">
          📂 選擇檔案
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.ods,.json"
            className="sr-only"
            onChange={(e) => {
              onFile(e.target.files?.[0])
              e.target.value = '' // 同一個檔案再選一次也要能觸發
            }}
            data-testid="import-file"
            aria-label="選擇檔案"
          />
        </label>
        {fileName && table && (
          <p className="text-sm">
            已讀取 <strong>{fileName}</strong>：{table.rows.length} 列、{table.headers.length} 欄
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">📘 內建文法題庫</h2>
        <p className="text-sm text-ink-600 dark:text-lav-300">
          每個文法點有說明、例句，以及 N5 形式的（　）選擇題與 ★ 排序題。加入後在「練習 → 文法題」練習；重複加入只會補上新增的文法點，進度不受影響。
        </p>
        {GRAMMAR_SETS.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {s.name}（{s.points.length} 個文法點、{s.points.reduce((n, p) => n + p.questions.length, 0)} 題）
            </span>
            <button
              className="btn-secondary"
              data-testid={'add-grammar-' + s.id}
              onClick={async () => {
                const r = await addGrammarSet(s.id)
                setGrammarMsg({ deckId: r.deckId, text: r.added ? `已加入 ${r.added} 個文法點` : '已經加入過了，沒有新的文法點' })
              }}
            >
              加入
            </button>
          </div>
        ))}
        {grammarMsg && (
          <p className="text-sm" role="status" data-testid="grammar-msg">
            {grammarMsg.text}・
            <Link className="underline" to={`/practice?decks=${grammarMsg.deckId}&mode=grammar`}>
              去練文法題
            </Link>
          </p>
        )}
      </section>

      {table && mapping && checks && counts && (
        <>
          <section className="card space-y-3 p-5">
            <h2 className="font-bold">② 匯入到哪個單字庫</h2>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="目標單字庫" data-testid="import-target">
              <option value="__new">＋ 建立新的單字庫</option>
              {data.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.icon} {d.name}
                </option>
              ))}
            </select>
            {target === '__new' && <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新單字庫名稱" aria-label="新單字庫名稱" data-testid="import-new-name" />}
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="font-bold">③ 內容類型與欄位對應</h2>
            <Segmented
              label="內容類型"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'word' as ImportKind, label: '單字' },
                { value: 'sentence' as ImportKind, label: '課文句子' },
              ]}
            />
            <p className="text-sm text-ink-600 dark:text-lav-300">
              {kind === 'sentence'
                ? '課文句子可以練中翻日、日翻中、語順重組、助詞填空。日文用「|」分出文節（例：わたしは|毎朝|6時に|起きます。），才能出重組與助詞題；讀音用同樣的分法，中翻日就能接受假名作答。'
                : '已依欄位名稱自動猜測，請確認每個項目對應到哪一欄。'}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {fields.map((f) => (
                <div key={f}>
                  <label className="label" htmlFor={'map-' + f}>
                    {(kind === 'sentence' && SENTENCE_FIELD_LABELS[f]) || FIELD_LABELS[f]}
                    {required.includes(f) && <span className="text-sakura-600"> *</span>}
                  </label>
                  <select id={'map-' + f} className="input" value={mapping[f]} onChange={(e) => setMapping({ ...mapping, [f]: Number(e.target.value) })} data-testid={'map-' + f}>
                    <option value={-1}>（不使用）</option>
                    {table.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                        {table.rows[0]?.[i] ? `（例：${table.rows[0][i].slice(0, 12)}）` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="card space-y-3 p-5">
            <h2 className="font-bold">④ 預覽與重複檢查</h2>
            <div className="flex flex-wrap gap-2 text-sm" data-testid="import-summary">
              {(Object.keys(STATUS_LABEL) as DupStatus[]).map((k) =>
                counts[k] ? (
                  <span key={k} className={`rounded-full px-2.5 py-0.5 ${STATUS_LABEL[k].cls}`} data-status={k} data-count={counts[k]}>
                    {STATUS_LABEL[k].text} {counts[k]}
                  </span>
                ) : null,
              )}
            </div>
            {counts.existing > 0 && (
              <fieldset className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                <legend className="px-1 font-medium">有 {counts.existing} 個單字已經存在其他單字庫（漢字＋讀音相同），要怎麼處理？</legend>
                <label className="mt-1 flex items-start gap-2">
                  <input type="radio" name="dup" checked={decision === 'merge'} onChange={() => setDecision('merge')} data-testid="dup-merge" />
                  <span>
                    <strong>合併</strong>：共用同一筆單字資料（補上缺的欄位），兩個單字庫的進度各自獨立。（建議）
                  </span>
                </label>
                <label className="mt-1 flex items-start gap-2">
                  <input type="radio" name="dup" checked={decision === 'separate'} onChange={() => setDecision('separate')} data-testid="dup-separate" />
                  <span>
                    <strong>另存</strong>：建立一筆新的單字資料（例如意思或例句不同時）。
                  </span>
                </label>
              </fieldset>
            )}
            {problems.length > 0 && (
              <details className="rounded-xl bg-red-50 p-3 text-sm dark:bg-red-950/30">
                <summary className="cursor-pointer font-medium">
                  {problems.length} 列有欄位缺漏（缺{kind === 'sentence' ? '日文' : '讀音'}的會略過）
                </summary>
                <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5">
                  {problems.slice(0, 100).map((c) => (
                    <li key={c.draft.row}>
                      第 {c.draft.row} 列 {c.draft.kanji || c.draft.reading}：{c.draft.problems.join('、')}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead className="text-xs text-ink-600 dark:text-lav-300">
                  <tr>
                    <th className="p-1.5">狀態</th>
                    <th className="p-1.5">{kind === 'sentence' ? '日文（／＝文節）' : '漢字'}</th>
                    <th className="p-1.5">讀音</th>
                    <th className="p-1.5">{kind === 'sentence' ? '中文' : '意思'}</th>
                    <th className="p-1.5">頁／課</th>
                    <th className="p-1.5">{kind === 'sentence' ? '說話者' : '例句'}</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.slice(0, 30).map((c) => (
                    <tr key={c.draft.row} className="border-t border-sakura-100 dark:border-ink-700">
                      <td className="p-1.5">
                        <span className={`whitespace-nowrap rounded-full px-2 text-xs ${STATUS_LABEL[c.status].cls}`}>{STATUS_LABEL[c.status].text}</span>
                      </td>
                      <td className="jp p-1.5">{c.draft.extra?.chunks ? c.draft.extra.chunks.join('／') : c.draft.kanji}</td>
                      <td className="jp p-1.5">{c.draft.reading}</td>
                      <td className="p-1.5">{c.draft.meaning}</td>
                      <td className="p-1.5">{c.draft.page != null ? `p.${c.draft.page}` : c.draft.lesson}</td>
                      <td className="jp max-w-[14rem] truncate p-1.5">{kind === 'sentence' ? c.draft.extra?.speaker : c.draft.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {checks.length > 30 && <p className="mt-1 text-xs text-ink-600 dark:text-lav-300">只顯示前 30 列，共 {checks.length} 列</p>}
            </div>
            <div className="flex justify-end">
              <button className="btn-primary px-6" disabled={busy || missingRequired} onClick={doImport} data-testid="do-import">
                {busy ? '匯入中…' : `匯入 ${checks.length - (counts.invalid ?? 0) - (counts.dupInFile ?? 0)} ${unit}`}
              </button>
            </div>
            {missingRequired && <p className="text-right text-sm text-red-600">請指定「{kind === 'sentence' ? '日文句子' : '讀音'}」欄位</p>}
          </section>
        </>
      )}
    </div>
  )
}
