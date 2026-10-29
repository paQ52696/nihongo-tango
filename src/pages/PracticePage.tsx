import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAppData, useSettings, type AppData } from '../hooks/useData'
import { ScopePicker, parseScope, type ScopeValue } from '../components/ScopePicker'
import { PracticeRunner, type AnswerRecord } from '../components/PracticeRunner'
import { Empty, PageTitle, Segmented, Toggle } from '../components/ui'
import { selectCards } from '../lib/session'
import { buildQuestion, canAsk, MODE_GROUPS, MODE_LABELS, type FormChoice, type Question } from '../lib/questions'
import { VERB_FORMS, type VerbForm } from '../lib/conjugate'
import { ADJ_FORMS, type AdjForm } from '../lib/adjective'
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
  conjugate: '（需要詞性是「動詞」的單字，或到「匯入」頁加入內建的動詞變化題庫）',
  adjective: '（需要詞性是「い形容詞」「な形容詞」的單字，或到「匯入」頁加入內建的形容詞變化題庫）',
  counter: '（到「匯入」頁加入內建的數字・時間・量詞題庫）',
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
export function buildQuestions(data: AppData, v: ScopeValue, mode: QuestionMode, count: number, opts: { seed?: number; onlyCards?: Set<string>; random?: boolean; forms?: FormChoice } = {}): Question[] {
  const rng = makeRng(opts.seed ?? Date.now())
  const selected = opts.random ? shuffle(selectFor(data, v, mode, 100000, rng, opts.onlyCards), rng).slice(0, count) : selectFor(data, v, mode, count, rng, opts.onlyCards)
  // 干擾選項與讀音字典只用單字（不含課文句子、文法點）
  const vocab = data.words.filter((w) => !w.kind)
  const dict = buildKanjiDict(vocab)
  const context = sentenceContext(data, v.deckIds)
  return selected.map((c) => buildQuestion(mode, c, data.wordById.get(c.wordId)!, vocab, rng, dict, { context: context.get(c.deckId + '|' + c.wordId), ...opts.forms }))
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

const FORMS_KEY = 'practice-forms'
const ALL_FORMS: Required<FormChoice> = { verbForms: VERB_FORMS.map((f) => f.id), adjForms: ADJ_FORMS.map((f) => f.id) }

/** 上次勾選的變化形（只存在這台裝置） */
function loadForms(): Required<FormChoice> {
  try {
    const v = JSON.parse(localStorage.getItem(FORMS_KEY) ?? 'null')
    const pick = <T extends string>(saved: unknown, all: T[]): T[] => {
      const list = Array.isArray(saved) ? all.filter((f) => saved.includes(f)) : []
      return list.length ? list : all
    }
    return { verbForms: pick(v?.verbForms, ALL_FORMS.verbForms), adjForms: pick(v?.adjForms, ALL_FORMS.adjForms) }
  } catch {
    return ALL_FORMS
  }
}

/** 要練哪些變化形：至少留一個 */
function FormPicker<T extends string>({ title, all, value, onChange }: { title: string; all: { id: T; label: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="mt-3" role="group" aria-label={title}>
      <p className="mb-1 text-xs font-semibold text-muted">{title}（可複選）</p>
      <div className="flex flex-wrap gap-2">
        {all.map((f) => {
          const on = value.includes(f.id)
          return (
            <button
              key={f.id}
              aria-pressed={on}
              data-testid={'form-' + f.id}
              onClick={() => (on ? value.length > 1 && onChange(value.filter((x) => x !== f.id)) : onChange(all.map((x) => x.id).filter((x) => x === f.id || value.includes(x))))}
              className={`jp min-h-11 rounded-full border-[1.5px] px-3.5 text-sm transition-colors ${on ? 'border-ink bg-ink font-bold text-surface' : 'border-line-soft bg-surface hover:border-ink'}`}
            >
              {f.label}
            </button>
          )
        })}
      </div>
    </div>
  )
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
  const [forms, setFormsState] = useState(loadForms)
  // 使用者自己點過題型後，就不再自動換題型
  const [modePicked, setModePicked] = useState(!!params.get('mode'))
  const setForms = (next: Required<FormChoice>) => {
    setFormsState(next)
    try {
      localStorage.setItem(FORMS_KEY, JSON.stringify(next))
    } catch {
      // 無痕模式等存不了就算了
    }
  }

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

  // 選的單字庫出不了目前的題型（例如只選了動詞變化題庫）：自動換成第一個有題目的題型
  useEffect(() => {
    if (!counts || modePicked || (counts.get(mode) ?? 0) > 0) return
    const next = MODES.find((m) => (counts.get(m) ?? 0) > 0)
    if (next) setMode(next)
  }, [counts]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !scope) return null
  const s: Settings = settings ?? ({ ...DEFAULT_SETTINGS, updated_at: '' } as Settings)

  function start(onlyCards?: Set<string>) {
    if (!data || !scope) return
    const qs = buildQuestions(data, scope, mode, onlyCards ? onlyCards.size : count, { onlyCards, forms })
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
          <span className="jp inline-block -rotate-3 rounded-lg border-2 border-accent px-3 py-1 font-mincho text-xl font-extrabold text-accent">
            {right === result.length ? '満点' : right / result.length >= 0.7 ? 'よくできました' : 'がんばろう'}
          </span>
          <h1 className="mt-4 text-2xl font-bold">練習完成</h1>
          <p className="mt-1 text-lg" data-testid="result-score">
            答對 {right} / {result.length} 題
          </p>
        </section>
        {wrong.length > 0 && (
          <section className="card p-5">
            <h2 className="mb-3 font-bold">答錯的題目（已加入錯題本）</h2>
            <ul className="divide-y divide-line-soft">
              {wrong.map((r, i) => (
                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <span className="jp text-lg font-bold">{r.question.word.kanji || r.question.word.reading}</span>
                  <span className="jp text-ok">{r.question.answer}</span>
                  {r.chosen && <span className="jp text-accent line-through">{r.chosen}</span>}
                  {r.errorType && <span className="rounded-full border border-accent px-2 text-xs text-accent">{ERROR_LABELS[r.errorType]}</span>}
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
                <p className="mb-1 text-xs font-semibold text-muted">{g.title}</p>
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
                        onClick={() => (setMode(m), setModePicked(true))}
                        data-testid={'mode-' + m}
                        className={`min-h-11 rounded-xl border-[1.5px] px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 ${mode === m ? 'border-ink bg-ink font-bold text-surface' : 'border-line-soft bg-surface hover:border-ink'} ${n === 0 && mode !== m ? 'opacity-50' : ''}`}
                      >
                        {MODE_LABELS[m]}
                        {m === 'kanji2reading' && <span className="ml-1 rounded border border-current px-1 text-[10px] font-medium">考試題型</span>}
                        <span className="ml-1 text-xs font-normal opacity-70">{n}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {mode === 'conjugate' && <FormPicker title="要練的動詞變化" all={VERB_FORMS} value={forms.verbForms} onChange={(v: VerbForm[]) => setForms({ ...forms, verbForms: v })} />}
          {mode === 'adjective' && <FormPicker title="要練的形容詞變化" all={ADJ_FORMS} value={forms.adjForms} onChange={(v: AdjForm[]) => setForms({ ...forms, adjForms: v })} />}
          {audioSupported() && !voiceOk && (
            <p className="mt-2 text-xs text-accent" data-testid="no-ja-voice">
              這台裝置沒有日文語音，所以不會發音（避免用中文語音唸錯）{mode === 'listening' && '，「聽音選字」也無法使用'}。安裝方式見「設定 → 發音」。
            </p>
          )}
          {mode === 'listening' && !audioSupported() && <p className="mt-2 text-xs text-accent">這個瀏覽器不支援語音合成，請改用其他題型。</p>}
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <p className="text-sm text-muted" data-testid="eligible-count">
            可出題：{eligibleCount} 題{eligibleCount < count && eligibleCount > 0 && `（不足 ${count} 題，會全部出）`}
          </p>
          <button className="btn-primary px-6 py-2.5 text-base" disabled={!scope.deckIds.length || eligibleCount === 0} onClick={() => start()} data-testid="start-practice">
            開始練習
            <ArrowRight size={18} aria-hidden />
          </button>
        </div>
        {eligibleCount === 0 && scope.deckIds.length > 0 && (
          <p className="text-sm text-accent">
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
