// 練習進行中：出題、作答、回饋動畫、自評、鍵盤操作
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bind, unbind } from 'wanakana'
import type { Question } from '../lib/questions'
import { MODE_HINTS, checkTyping } from '../lib/questions'
import { classifyError, ERROR_LABELS } from '../lib/errorTypes'
import { previewIntervals, formatInterval, RATING_LABELS } from '../lib/srs'
import { recordAnswer } from '../db/repo'
import { speak, ttsSupported } from '../lib/browser'
import type { Card, ErrorType, Rating, Settings } from '../types'
import { newId } from '../db/repo'
import { anyToHiragana } from '../lib/kana'

export interface AnswerRecord {
  question: Question
  chosen: string | null
  correct: boolean
  errorType: ErrorType | null
  rating: Rating
}

const TIME_LIMIT = 20

export function PracticeRunner({
  questions,
  cards,
  settings,
  timed,
  onFinish,
  onQuit,
}: {
  questions: Question[]
  cards: Map<string, Card>
  settings: Settings
  timed: boolean
  onFinish: (records: AnswerRecord[]) => void
  onQuit: () => void
}) {
  const sessionId = useMemo(() => newId(), [])
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<string | null | undefined>(undefined) // undefined = 還沒作答
  const [records, setRecords] = useState<AnswerRecord[]>([])
  const [left, setLeft] = useState(TIME_LIMIT)
  const started = useRef(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const q = questions[index]
  const answered = chosen !== undefined
  const correct = answered && (q.mode === 'typing' ? checkTyping(q, chosen ?? '') : chosen === q.answer)
  const errorType = answered && !correct ? classifyError(q.mode, q.answer, q.mode === 'typing' ? normalizeTyped(chosen) : chosen, { altReadings: q.altReadings }) : null
  const tts = settings.ttsEnabled && ttsSupported()

  const say = useCallback(() => {
    if (ttsSupported()) speak(q.speak, settings.ttsRate)
  }, [q, settings.ttsRate])

  // 換題：重設計時、聽音題自動播放
  useEffect(() => {
    started.current = Date.now()
    setLeft(TIME_LIMIT)
    if (q.mode === 'listening' || (settings.autoPlay && tts && q.mode !== 'kanji2reading')) say()
    if (q.mode === 'typing') setTimeout(() => inputRef.current?.focus(), 0)
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = inputRef.current
    if (q.mode !== 'typing' || !el) return
    bind(el, { IMEMode: true })
    return () => unbind(el)
  }, [index, q.mode])

  const answer = useCallback(
    (value: string | null) => {
      if (answered) return
      setChosen(value)
      if (tts && q.mode !== 'listening') speak(q.speak, settings.ttsRate)
    },
    [answered, q, settings.ttsRate, tts],
  )

  // 限時
  useEffect(() => {
    if (!timed || answered) return
    const t = setInterval(() => {
      const remain = TIME_LIMIT - Math.floor((Date.now() - started.current) / 1000)
      setLeft(remain)
      if (remain <= 0) answer(null)
    }, 250)
    return () => clearInterval(t)
  }, [timed, answered, index, answer])

  const rate = useCallback(
    async (r: Rating) => {
      if (!answered) return
      const rec: AnswerRecord = { question: q, chosen: chosen ?? null, correct, errorType, rating: r }
      await recordAnswer({
        cardId: q.cardId,
        deckId: q.deckId,
        wordId: q.wordId,
        mode: q.mode,
        prompt: q.prompt,
        answer: q.answer,
        chosen: chosen ?? null,
        options: q.options.map((o) => o.text),
        correct,
        errorType,
        rating: r,
        durationMs: Date.now() - started.current,
        source: 'practice',
        sessionId,
      })
      const next = [...records, rec]
      setRecords(next)
      if (index + 1 >= questions.length) onFinish(next)
      else {
        setIndex(index + 1)
        setChosen(undefined)
      }
    },
    [answered, q, chosen, correct, errorType, records, index, questions.length, onFinish, sessionId],
  )

  const defaultRating: Rating = correct ? 3 : 1

  // 鍵盤：1–4 選答案（作答後是自評）、Enter 下一題、Space 重播發音
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.key === ' ' && !inInput) {
        e.preventDefault()
        say()
        return
      }
      if (/^[1-4]$/.test(e.key) && !inInput) {
        const n = Number(e.key)
        if (!answered && q.options[n - 1]) answer(q.options[n - 1].text)
        else if (answered) rate(n as Rating)
        return
      }
      if (e.key === 'Enter' && answered) {
        e.preventDefault()
        rate(defaultRating)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answered, q, answer, rate, defaultRating, say])

  const card = cards.get(q.cardId)
  const previews = card ? previewIntervals(card) : null
  const w = q.word

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="practice-runner">
      <div className="flex items-center gap-3 text-sm">
        <button className="btn-ghost px-2" onClick={onQuit}>
          ✕ 結束
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-sakura-100 dark:bg-ink-700">
          <div className="h-full rounded-full bg-sakura-400 transition-all" style={{ width: `${(index / questions.length) * 100}%` }} />
        </div>
        <span className="tabular-nums" data-testid="progress">
          {index + 1} / {questions.length}
        </span>
      </div>

      <section className={`card p-6 text-center ${answered ? (correct ? 'anim-pop' : 'anim-shake') : ''}`} aria-live="polite">
        <p className="mb-3 text-xs text-ink-600 dark:text-lav-300">{MODE_HINTS[q.mode]}</p>
        {timed && !answered && (
          <div className="mx-auto mb-3 h-1.5 max-w-xs overflow-hidden rounded-full bg-lav-100 dark:bg-ink-700" aria-label={`剩下 ${left} 秒`}>
            <div className={`h-full ${left <= 5 ? 'bg-red-400' : 'bg-lav-400'}`} style={{ width: `${(Math.max(0, left) / TIME_LIMIT) * 100}%` }} />
          </div>
        )}
        {q.mode === 'listening' ? (
          <button className="btn-secondary mx-auto my-4 h-24 w-24 rounded-full text-4xl" onClick={say} aria-label="播放發音" data-testid="play-audio">
            🔊
          </button>
        ) : (
          <div className={`jp break-words font-bold ${q.mode === 'cloze' ? 'text-2xl leading-relaxed sm:text-3xl' : q.mode === 'typing' || q.mode === 'kanji2meaning' ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-6xl'}`} data-testid="prompt">
            {q.mode === 'typing' ? <span className="font-sans">{q.prompt}</span> : q.prompt}
          </div>
        )}
        {q.promptSub && <p className="mt-3 text-sm text-ink-600 dark:text-lav-300">{q.promptSub}</p>}
        {q.mode === 'listening' && !ttsSupported() && <p className="mt-2 text-sm text-red-600">這個瀏覽器不支援語音，無法播放。</p>}
      </section>

      {q.mode === 'typing' ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!answered) answer(inputRef.current?.value ?? '')
          }}
        >
          <input
            ref={inputRef}
            key={q.id}
            className="input jp text-xl"
            placeholder="輸入羅馬拼音會自動轉成假名，例如 kitte"
            aria-label="輸入答案"
            data-testid="typing-input"
            disabled={answered}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          {!answered && (
            <button className="btn-primary" type="submit">
              送出
            </button>
          )}
        </form>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="選項">
          {q.options.map((o, i) => {
            const isAnswer = o.text === q.answer
            const isChosen = o.text === chosen
            let cls = 'border-sakura-200 bg-white hover:border-lav-400 hover:bg-lav-50 dark:border-ink-600 dark:bg-ink-800 dark:hover:bg-ink-700'
            if (answered) {
              if (isAnswer) cls = 'border-emerald-400 bg-emerald-50 text-emerald-800 anim-pop dark:bg-emerald-950/60 dark:text-emerald-200'
              else if (isChosen) cls = 'border-red-400 bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-200'
              else cls = 'border-sakura-100 bg-white opacity-50 dark:border-ink-700 dark:bg-ink-800'
            }
            return (
              <button
                key={o.text}
                disabled={answered}
                onClick={() => answer(o.text)}
                data-testid="option"
                data-correct={isAnswer ? 'true' : 'false'}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-colors ${cls}`}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lav-100 text-sm font-bold text-lav-700 dark:bg-ink-600 dark:text-lav-100">{i + 1}</span>
                <span className={`${q.mode === 'kanji2meaning' ? 'text-base' : 'jp text-xl'} break-words`}>{o.text}</span>
                {answered && isAnswer && <span className="ml-auto" aria-label="正確答案">⭕</span>}
                {answered && isChosen && !isAnswer && <span className="ml-auto" aria-label="你的答案">❌</span>}
              </button>
            )
          })}
        </div>
      )}

      {answered && (
        <section className="card anim-in space-y-3 p-5" data-testid="feedback" data-correct={correct ? 'true' : 'false'}>
          <div className={`text-lg font-bold ${correct ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
            {correct ? '答對了！' : chosen === null ? '時間到！' : '答錯了'}
            {!correct && errorType && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-sm font-medium dark:bg-red-950" data-testid="error-type">
                {ERROR_LABELS[errorType]}
              </span>
            )}
          </div>
          {!correct && chosen && (
            <p className="text-sm">
              你的答案：<span className="jp font-semibold">{chosen}</span>　正確答案：<span className="jp font-semibold">{q.answer}</span>
            </p>
          )}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="jp text-2xl font-bold">{w.kanji || w.reading}</span>
            <span className="jp text-lg text-lav-700 dark:text-lav-200">{w.reading}</span>
            {w.pos && <span className="rounded bg-lav-100 px-1.5 text-xs dark:bg-ink-600">{w.pos}</span>}
            <span>{w.meaning}</span>
            {ttsSupported() && (
              <button className="btn-ghost px-2 py-0.5" onClick={say} aria-label="重播發音">
                🔊
              </button>
            )}
          </div>
          {w.example && (
            <p className="text-sm">
              <span className="jp">{w.example}</span>
              {w.exampleTranslation && <span className="block text-ink-600 dark:text-lav-300">{w.exampleTranslation}</span>}
            </p>
          )}
          <div>
            <p className="mb-2 text-xs text-ink-600 dark:text-lav-300">自評這個字記得多熟（鍵盤 1–4，Enter = {RATING_LABELS[defaultRating]}）</p>
            <div className="grid grid-cols-4 gap-2">
              {([1, 2, 3, 4] as Rating[]).map((r) => (
                <button
                  key={r}
                  onClick={() => rate(r)}
                  data-testid={`rate-${r}`}
                  className={`btn flex-col gap-0 px-1 py-2 ${r === defaultRating ? 'bg-sakura-500 text-white hover:bg-sakura-600' : 'bg-lav-100 text-lav-800 hover:bg-lav-200 dark:bg-ink-700 dark:text-lav-100'}`}
                >
                  <span>{RATING_LABELS[r]}</span>
                  {previews && <span className="text-[11px] opacity-80">{formatInterval(previews[r])}</span>}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
      <p className="hidden text-center text-xs text-ink-600 sm:block dark:text-lav-300">鍵盤：1–4 選答案・Enter 下一題・Space 重播發音</p>
    </div>
  )
}

function normalizeTyped(v: string | null | undefined): string | null {
  return v === undefined || v === null ? null : anyToHiragana(v.trim())
}
