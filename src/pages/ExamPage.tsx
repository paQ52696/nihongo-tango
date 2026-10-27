import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAppData } from '../hooks/useData'
import { ScopePicker, parseScope, type ScopeValue } from '../components/ScopePicker'
import { ConfirmButton, Empty, PageTitle } from '../components/ui'
import { BarList } from '../components/charts'
import { buildQuestions, countEligible } from './PracticePage'
import type { Question } from '../lib/questions'
import { classifyError, ERROR_LABELS } from '../lib/errorTypes'
import { newId, recordAnswer } from '../db/repo'
import type { ErrorType } from '../types'

export const EXAM_SIZE = 25
export const EXAM_MINUTES = 20

interface ExamResult {
  q: Question
  chosen: string | null
  correct: boolean
  errorType: ErrorType | null
}

export function ExamPage() {
  const data = useAppData()
  const [params] = useSearchParams()
  const [scope, setScope] = useState<ScopeValue | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [current, setCurrent] = useState(0)
  const [deadline, setDeadline] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [results, setResults] = useState<ExamResult[] | null>(null)

  useEffect(() => {
    if (data && !scope) setScope(parseScope(params, data))
  }, [data, scope, params])

  const eligible = useMemo(() => (data && scope ? countEligible(data, scope, 'kanji2reading') : 0), [data, scope])

  const submit = async () => {
    if (!questions) return
    const sessionId = newId()
    const res: ExamResult[] = []
    for (const q of questions) {
      const chosen = answers[q.id] ?? null
      const correct = chosen === q.answer
      const errorType = correct ? null : classifyError(q.mode, q.answer, chosen, { altReadings: q.altReadings })
      res.push({ q, chosen, correct, errorType })
      // 模擬考：答錯的卡會被排進複習（重來），答對不改變排程
      await recordAnswer({
        cardId: q.cardId,
        deckId: q.deckId,
        wordId: q.wordId,
        mode: q.mode,
        prompt: q.prompt,
        answer: q.answer,
        chosen,
        options: q.options.map((o) => o.text),
        correct,
        errorType,
        rating: correct ? null : 1,
        durationMs: 0,
        source: 'exam',
        sessionId,
      })
    }
    setResults(res)
    setQuestions(null)
  }

  // 計時
  useEffect(() => {
    if (!questions) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [questions])
  useEffect(() => {
    if (questions && deadline && now >= deadline) submit()
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps

  // 鍵盤 1–4 作答
  useEffect(() => {
    if (!questions) return
    const onKey = (e: KeyboardEvent) => {
      const q = questions[current]
      if (/^[1-4]$/.test(e.key) && q.options[Number(e.key) - 1]) setAnswers((a) => ({ ...a, [q.id]: q.options[Number(e.key) - 1].text }))
      if (e.key === 'ArrowRight' || e.key === 'Enter') setCurrent((c) => Math.min(questions.length - 1, c + 1))
      if (e.key === 'ArrowLeft') setCurrent((c) => Math.max(0, c - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [questions, current])

  if (!data || !scope) return null

  if (results) {
    const score = results.filter((r) => r.correct).length
    const dist: Partial<Record<ErrorType, number>> = {}
    results.forEach((r) => r.errorType && (dist[r.errorType] = (dist[r.errorType] ?? 0) + 1))
    return (
      <div className="mx-auto max-w-3xl space-y-4" data-testid="exam-result">
        <section className="card p-6 text-center">
          <h1 className="text-2xl font-bold">模擬考成績</h1>
          <p className="mt-2 text-5xl font-bold text-sakura-600 dark:text-sakura-300" data-testid="exam-score">
            {score} / {results.length}
          </p>
          <p className="mt-1 text-ink-600 dark:text-lav-300">{Math.round((score / results.length) * 100)} 分</p>
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-bold">錯誤類型統計</h2>
          <BarList items={Object.entries(dist).map(([k, v]) => ({ label: ERROR_LABELS[k as ErrorType], value: v! })).sort((a, b) => b.value - a.value)} />
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-bold">每題解析</h2>
          <ol className="space-y-3">
            {results.map((r, i) => (
              <li key={r.q.id} className={`rounded-xl border-l-4 p-3 ${r.correct ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30' : 'border-red-400 bg-red-50/50 dark:bg-red-950/30'}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-sm text-ink-600 dark:text-lav-300">{i + 1}.</span>
                  <span className="jp text-xl font-bold">{r.q.prompt}</span>
                  <span className="text-sm">
                    正解 <span className="jp font-semibold text-emerald-700 dark:text-emerald-300">{r.q.answer}</span>
                  </span>
                  <span className="text-sm">
                    我的答案{' '}
                    <span className={`jp font-semibold ${r.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>{r.chosen ?? '（未作答）'}</span>
                  </span>
                  {r.errorType && <span className="rounded-full bg-red-100 px-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-200">{ERROR_LABELS[r.errorType]}</span>}
                </div>
                <p className="mt-1 text-sm">{r.q.word.meaning}</p>
                {r.q.word.example && (
                  <p className="mt-1 text-sm text-ink-600 dark:text-lav-300">
                    <span className="jp">{r.q.word.example}</span>
                    {r.q.word.exampleTranslation && <span className="ml-2">{r.q.word.exampleTranslation}</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
        <div className="flex justify-center gap-2">
          <button className="btn-primary" onClick={() => setResults(null)}>
            再考一次
          </button>
          <Link className="btn-secondary" to="/mistakes">
            看錯題本
          </Link>
        </div>
      </div>
    )
  }

  if (questions) {
    const q = questions[current]
    const remain = Math.max(0, Math.ceil((deadline - now) / 1000))
    const answeredCount = Object.keys(answers).length
    return (
      <div className="mx-auto max-w-3xl space-y-4" data-testid="exam-runner">
        <div className="card flex flex-wrap items-center gap-3 p-3">
          <span className={`font-mono text-lg font-bold tabular-nums ${remain < 60 ? 'text-red-600' : ''}`} aria-label="剩餘時間" data-testid="exam-timer">
            ⏱ {String(Math.floor(remain / 60)).padStart(2, '0')}:{String(remain % 60).padStart(2, '0')}
          </span>
          <span className="text-sm text-ink-600 dark:text-lav-300">
            已作答 {answeredCount} / {questions.length}
          </span>
          <div className="ml-auto">
            {answeredCount < questions.length ? (
              <ConfirmButton className="btn-primary" confirmText={`還有 ${questions.length - answeredCount} 題沒作答，確定交卷？`} confirmLabel="交卷" onConfirm={submit}>
                交卷
              </ConfirmButton>
            ) : (
              <button className="btn-primary" onClick={submit} data-testid="exam-submit">
                交卷
              </button>
            )}
          </div>
        </div>
        <section className="card p-6 text-center">
          <p className="mb-2 text-sm text-ink-600 dark:text-lav-300">
            第 {current + 1} 題：＿＿＿の ことばは ひらがなで どう かきますか。
          </p>
          <div className="jp text-5xl font-bold sm:text-6xl" data-testid="prompt">
            {q.prompt}
          </div>
        </section>
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options.map((o, i) => {
            const sel = answers[q.id] === o.text
            return (
              <button
                key={o.text}
                data-testid="option"
                aria-pressed={sel}
                onClick={() => {
                  setAnswers({ ...answers, [q.id]: o.text })
                  if (current < questions.length - 1) setTimeout(() => setCurrent(current + 1), 150)
                }}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left ${sel ? 'border-lav-500 bg-lav-50 dark:bg-ink-700' : 'border-sakura-200 bg-white hover:border-lav-300 dark:border-ink-600 dark:bg-ink-800'}`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-lav-100 text-sm font-bold text-lav-700 dark:bg-ink-600 dark:text-lav-100">{i + 1}</span>
                <span className="jp text-xl">{o.text}</span>
              </button>
            )
          })}
        </div>
        <div className="flex justify-between">
          <button className="btn-ghost" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
            ← 上一題
          </button>
          <button className="btn-ghost" disabled={current === questions.length - 1} onClick={() => setCurrent(current + 1)}>
            下一題 →
          </button>
        </div>
        <nav className="card flex flex-wrap gap-1.5 p-3" aria-label="題目導覽">
          {questions.map((x, i) => (
            <button
              key={x.id}
              onClick={() => setCurrent(i)}
              aria-label={`第 ${i + 1} 題${answers[x.id] ? '（已作答）' : ''}`}
              className={`h-8 w-8 rounded-lg text-sm ${i === current ? 'ring-2 ring-sakura-400' : ''} ${answers[x.id] ? 'bg-lav-400 text-white' : 'bg-sakura-100 dark:bg-ink-700'}`}
            >
              {i + 1}
            </button>
          ))}
        </nav>
      </div>
    )
  }

  if (!data.decks.length) return <Empty action={<Link className="btn-primary" to="/import">去匯入單字</Link>}>還沒有單字庫。</Empty>

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>模擬考</PageTitle>
      <div className="card space-y-5 p-5">
        <p className="text-sm text-ink-600 dark:text-lav-300">
          模仿 N5「文字・語彙」題型：看漢字選平假名讀音。從選定範圍隨機出 {EXAM_SIZE} 題，限時 {EXAM_MINUTES} 分鐘，交卷後看分數與每題解析。
        </p>
        <ScopePicker value={scope} onChange={setScope} data={data} />
        <div className="flex items-center justify-between border-t border-sakura-100 pt-4 dark:border-ink-700">
          <span className="text-sm text-ink-600 dark:text-lav-300">可出題：{eligible} 題</span>
          <button
            className="btn-primary px-6 py-2.5 text-base"
            disabled={eligible === 0}
            data-testid="start-exam"
            onClick={() => {
              // 隨機抽題（不依到期順序）
              setQuestions(buildQuestions(data, scope, 'kanji2reading', EXAM_SIZE, { random: true }))
              setAnswers({})
              setCurrent(0)
              setDeadline(Date.now() + EXAM_MINUTES * 60_000)
              setNow(Date.now())
            }}
          >
            開始考試
          </button>
        </div>
      </div>
    </div>
  )
}
