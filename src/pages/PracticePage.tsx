import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppData, useSettings, type AppData } from '../hooks/useData'
import { ScopePicker, parseScope, type ScopeValue } from '../components/ScopePicker'
import { PracticeRunner, type AnswerRecord } from '../components/PracticeRunner'
import { Empty, PageTitle, Segmented, Toggle } from '../components/ui'
import { selectCards } from '../lib/session'
import { buildQuestion, canAsk, MODE_GROUPS, MODE_LABELS, type Question } from '../lib/questions'
import { buildKanjiDict, makeRng, shuffle } from '../lib/distractors'
import { ERROR_LABELS } from '../lib/errorTypes'
import { audioSupported, canSpeakJapanese, onVoicesChanged } from '../lib/browser'
import { DEFAULT_SETTINGS } from '../db/repo'
import type { Card, QuestionMode, Settings } from '../types'

const MODES: QuestionMode[] = MODE_GROUPS.flatMap((g) => g.modes)

/** 每種題型沒有可出的題目時的說明 */
const NEED: Partial<Record<QuestionMode, string>> = {
  kanji2reading: '（需要有漢字的單字）',
  reading2kanji: '（需要有漢字的單字）',
  cloze: '（需要有例句的單字）',
  conjugate: '（需要詞性是「動詞」的單字）',
  ja2zh: '（需要先匯入課文句子）',
  zh2ja: '（需要先匯入課文句子）',
  reorder: '（需要先匯入有分文節的課文句子）',
  particle: '（需要先匯入有分文節的課文句子）',
  grammar: '（到「匯入」頁加入內建文法題庫）',
}

function selectFor(data: AppData, v: ScopeValue, mode: QuestionMode, count: number, rng: () => number, onlyCards?: Set<string>) {
  const cards = data.cards.filter((c) => v.deckIds.includes(c.deckId) && (!onlyCards || onlyCards.has(c.id)))
  const newAllowance = new Map(v.deckIds.map((id) => [id, data.deckStats.get(id)?.newAvailable ?? 0]))
  return selectCards({
    cards,
    entries: data.entries,
    words: data.wordById,
    mistakes: data.mistakes,
    scope: onlyCards ? { kind: 'all' } : v.scope,
    count,
    now: new Date(),
    newAllowance,
    rng,
    eligible: (w) => canAsk(mode, w),
  })
}

/** 符合範圍、而且能出這種題型的單字數 */
export function countEligible(data: AppData, v: ScopeValue, mode: QuestionMode): number {
  return selectFor(data, v, mode, 100000, makeRng(1)).length
}

/** 出題。random=true 時完全隨機抽（模擬考），否則到期的複習卡優先 */
export function buildQuestions(data: AppData, v: ScopeValue, mode: QuestionMode, count: number, opts: { seed?: number; onlyCards?: Set<string>; random?: boolean } = {}): Question[] {
  const rng = makeRng(opts.seed ?? Date.now())
  const selected = opts.random ? shuffle(selectFor(data, v, mode, 100000, rng, opts.onlyCards), rng).slice(0, count) : selectFor(data, v, mode, count, rng, opts.onlyCards)
  // 干擾選項與讀音字典只用單字（不含課文句子、文法點）
  const vocab = data.words.filter((w) => !w.kind)
  const dict = buildKanjiDict(vocab)
  const context = sentenceContext(data, v.deckIds)
  return selected.map((c) => buildQuestion(mode, c, data.wordById.get(c.wordId)!, vocab, rng, dict, { context: context.get(c.deckId + '|' + c.wordId) }))
}

/** 課文句子的上一句（同一個單字庫、同一課，依匯入順序），中翻日／日翻中時當作對話提示 */
function sentenceContext(data: AppData, deckIds: string[]): Map<string, string> {
  const out = new Map<string, string>()
  const groups = new Map<string, { order: number; wordId: string; deckId: string }[]>()
  for (const e of data.entries) {
    if (e.deleted || !deckIds.includes(e.deckId) || data.wordById.get(e.wordId)?.kind !== 'sentence') continue
    const key = e.deckId + '|' + (e.lesson ?? '')
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.order - b.order)
    list.forEach((e, i) => {
      const prev = i > 0 ? data.wordById.get(list[i - 1].wordId) : undefined
      if (prev) out.set(e.deckId + '|' + e.wordId, (prev.speaker ? prev.speaker + '：' : '') + prev.kanji)
    })
  }
  return out
}

export function PracticePage() {
  const data = useAppData()
  const settings = useSettings()
  const [params] = useSearchParams()
  const [scope, setScope] = useState<ScopeValue | null>(null)
  const [mode, setMode] = useState<QuestionMode>((params.get('mode') as QuestionMode) || 'kanji2reading')
  const [count, setCount] = useState(Number(params.get('count')) || 20)
  const [timed, setTimed] = useState(false)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [result, setResult] = useState<AnswerRecord[] | null>(null)
  const [voiceOk, setVoiceOk] = useState(canSpeakJapanese())
  const [frozenCards, setFrozenCards] = useState<Map<string, Card>>(new Map())

  useEffect(() => onVoicesChanged(() => setVoiceOk(canSpeakJapanese())), [])
  useEffect(() => {
    if (data && !scope) setScope(parseScope(params, data))
  }, [data, scope, params])
  // 網址帶 autostart=1 時直接開始（例如錯題本的「一鍵練習」）
  useEffect(() => {
    if (data && scope && params.get('autostart') === '1' && !questions && !result) start()
  }, [data, scope]) // eslint-disable-line react-hooks/exhaustive-deps

  // 每種題型在目前範圍能出幾題（沒有的題型會變灰）
  const counts = useMemo(() => {
    if (!data || !scope) return null
    return new Map(MODES.map((m) => [m, countEligible(data, scope, m)]))
  }, [data, scope])
  const eligibleCount = counts?.get(mode) ?? 0

  if (!data || !scope) return null
  const s: Settings = settings ?? ({ ...DEFAULT_SETTINGS, updated_at: '' } as Settings)

  function start(onlyCards?: Set<string>) {
    if (!data || !scope) return
    const qs = buildQuestions(data, scope, mode, onlyCards ? onlyCards.size : count, { onlyCards })
    setFrozenCards(new Map(data.cards.map((c) => [c.id, c])))
    setResult(null)
    setQuestions(qs)
  }

  if (questions && questions.length && !result)
    return (
      <PracticeRunner
        questions={questions}
        cards={frozenCards}
        settings={s}
        timed={timed}
        onQuit={() => setQuestions(null)}
        onFinish={(r) => {
          setResult(r)
          setQuestions(null)
        }}
      />
    )

  if (result) {
    const right = result.filter((r) => r.correct).length
    const wrong = result.filter((r) => !r.correct)
    return (
      <div className="mx-auto max-w-2xl space-y-4" data-testid="practice-result">
        <section className="card p-6 text-center">
          <div className="text-5xl">{right === result.length ? '🎉' : right / result.length >= 0.7 ? '🌸' : '💪'}</div>
          <h1 className="mt-2 text-2xl font-bold">練習完成</h1>
          <p className="mt-1 text-lg" data-testid="result-score">
            答對 {right} / {result.length} 題
          </p>
        </section>
        {wrong.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 font-bold">答錯的題目（已加入錯題本）</h2>
            <ul className="divide-y divide-sakura-100 dark:divide-ink-700">
              {wrong.map((r, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span className="jp text-lg font-bold">{r.question.word.kanji || r.question.word.reading}</span>
                  <span className="jp text-emerald-700 dark:text-emerald-300">{r.question.answer}</span>
                  {r.chosen && <span className="jp text-red-600 line-through dark:text-red-300">{r.chosen}</span>}
                  {r.errorType && <span className="rounded-full bg-red-100 px-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">{ERROR_LABELS[r.errorType]}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {wrong.length > 0 && (
            <button className="btn-primary" onClick={() => start(new Set(wrong.map((r) => r.question.cardId)))}>
              再練一次答錯的
            </button>
          )}
          <button className="btn-secondary" onClick={() => start()}>
            再來一輪
          </button>
          <button className="btn-ghost" onClick={() => setResult(null)}>
            調整設定
          </button>
          <Link className="btn-ghost" to="/">
            回首頁
          </Link>
        </div>
      </div>
    )
  }

  if (!data.decks.length) return <Empty action={<Link className="btn-primary" to="/import">去匯入單字</Link>}>還沒有單字庫。</Empty>

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>開始練習</PageTitle>
      <div className="card space-y-6 p-5">
        <ScopePicker value={scope} onChange={setScope} data={data} />
        <fieldset>
          <legend className="label">③ 題型</legend>
          <div className="space-y-3" role="radiogroup" aria-label="題型">
            {MODE_GROUPS.map((g) => (
              <div key={g.title}>
                <p className="mb-1 text-xs font-semibold text-ink-600 dark:text-lav-300">{g.title}</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {g.modes.map((m) => {
                    const disabled = m === 'listening' && !audioSupported()
                    const n = counts?.get(m) ?? 0
                    return (
                      <button
                        key={m}
                        role="radio"
                        aria-checked={mode === m}
                        disabled={disabled}
                        onClick={() => setMode(m)}
                        data-testid={'mode-' + m}
                        className={`rounded-xl border-2 px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 ${mode === m ? 'border-sakura-400 bg-sakura-50 font-semibold dark:bg-ink-700' : 'border-sakura-100 hover:border-lav-300 dark:border-ink-600'} ${n === 0 && mode !== m ? 'opacity-50' : ''}`}
                      >
                        {MODE_LABELS[m]}
                        {m === 'kanji2reading' && <span className="ml-1 rounded bg-sakura-200 px-1 text-[10px] text-sakura-800">考試題型</span>}
                        <span className="ml-1 text-xs font-normal text-ink-600 dark:text-lav-300">{n}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {audioSupported() && !voiceOk && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300" data-testid="no-ja-voice">
              這台裝置沒有日文語音，所以不會發音（避免用中文語音唸錯）{mode === 'listening' && '，「聽音選字」也無法使用'}。安裝方式見「設定 → 發音」。
            </p>
          )}
          {mode === 'listening' && !audioSupported() && <p className="mt-2 text-xs text-red-600">這個瀏覽器不支援語音合成，請改用其他題型。</p>}
        </fieldset>
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <span className="label">題數</span>
            <Segmented
              label="題數"
              value={count}
              onChange={setCount}
              options={[10, 20, 50].map((n) => ({ value: n, label: `${n} 題` }))}
            />
          </div>
          <div className="min-w-48">
            <Toggle checked={timed} onChange={setTimed} label="限時（每題 20 秒）" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sakura-100 pt-4 dark:border-ink-700">
          <p className="text-sm text-ink-600 dark:text-lav-300" data-testid="eligible-count">
            可出題：{eligibleCount} 題{eligibleCount < count && eligibleCount > 0 && `（不足 ${count} 題，會全部出）`}
          </p>
          <button className="btn-primary px-6 py-2.5 text-base" disabled={!scope.deckIds.length || eligibleCount === 0} onClick={() => start()} data-testid="start-practice">
            開始練習 →
          </button>
        </div>
        {eligibleCount === 0 && scope.deckIds.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            這個範圍沒有可以出「{MODE_LABELS[mode]}」的題目{NEED[mode] ?? ''}。
            {scope.scope.kind === 'due' && ' 今天的複習都完成了！'}
            <button className="ml-1 underline" onClick={() => setScope({ ...scope, scope: { kind: 'all' } })}>
              改成全部
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
