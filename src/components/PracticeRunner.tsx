// 練習進行中：出題、作答、回饋動畫、自評、鍵盤操作
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bind, unbind } from 'wanakana'
import type { Question } from '../lib/questions'
import { INTERACTION, MODE_HINTS, checkTyping } from '../lib/questions'
import { checkSentence, diffSentence } from '../lib/sentences'
import { classifyError, ERROR_LABELS } from '../lib/errorTypes'
import { previewIntervals, formatInterval, RATING_LABELS } from '../lib/srs'
import { recordAnswer } from '../db/repo'
import { audioSupported, playWord } from '../lib/browser'
import type { Card, ErrorType, QuestionMode, Rating, Settings } from '../types'
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

/** 出題時可以自動唸的題型（其他題型唸出來會洩漏答案） */
const AUTO_PLAY: QuestionMode[] = ['reading2kanji', 'kanji2meaning', 'ja2zh']

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
  const [override, setOverride] = useState(false) // 中翻日：比對不符但其實是對的（例如寫法不同）
  const [picked, setPicked] = useState<number[]>([]) // 語順重組：已點選的字卡
  const started = useRef(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const q = questions[index]
  const kind = INTERACTION[q.mode]
  const answered = chosen !== undefined
  // 日翻中沒有對錯，看答案後由自評決定（重來＝答錯）
  const autoCorrect =
    answered && (kind === 'typing' ? checkTyping(q, chosen ?? '') : kind === 'sentence' ? checkSentence(q.word, chosen ?? '') : kind === 'reveal' ? true : chosen === q.answer)
  const correct = autoCorrect || (answered && override)
  const errorType = answered && !correct ? classifyError(q.mode, q.answer, q.mode === 'typing' ? normalizeTyped(chosen) : chosen, { altReadings: q.altReadings }) : null
  const tts = settings.ttsEnabled && audioSupported()

  // 進行中隱藏手機底部選單
  useEffect(() => {
    document.body.dataset.focus = '1'
    return () => {
      delete document.body.dataset.focus
    }
  }, [])
  const feedbackRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (chosen !== undefined && window.innerWidth < 768) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      feedbackRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' })
    }
  }, [chosen])

  const say = useCallback(() => {
    if (audioSupported()) playWord(q.word, settings.ttsRate)
  }, [q, settings.ttsRate])

  // 換題：重設計時、聽音題自動播放
  useEffect(() => {
    started.current = Date.now()
    setLeft(TIME_LIMIT)
    if (q.mode === 'listening' || (settings.autoPlay && tts && AUTO_PLAY.includes(q.mode))) say()
    if (kind === 'typing' || kind === 'sentence') setTimeout(() => inputRef.current?.focus(), 0)
  }, [index]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = inputRef.current
    if ((kind !== 'typing' && kind !== 'sentence') || !el) return
    bind(el, { IMEMode: true })
    return () => unbind(el)
  }, [index, kind])

  const answer = useCallback(
    (value: string | null) => {
      if (answered) return
      setChosen(value)
      if (tts && q.mode !== 'listening' && q.mode !== 'grammar') playWord(q.word, settings.ttsRate)
    },
    [answered, q, settings.ttsRate, tts],
  )

  // 限時
  useEffect(() => {
    // 限時只用在選擇題與單字打字題；翻譯、重組需要比較久
    if (!timed || answered || (kind !== 'choice' && kind !== 'typing')) return
    const t = setInterval(() => {
      const remain = TIME_LIMIT - Math.floor((Date.now() - started.current) / 1000)
      setLeft(remain)
      if (remain <= 0) answer(null)
    }, 250)
    return () => clearInterval(t)
  }, [timed, answered, index, answer, kind])

  const rate = useCallback(
    async (r: Rating) => {
      if (!answered) return
      const ok = kind === 'reveal' ? r > 1 : correct
      const err = kind === 'reveal' ? (ok ? null : 'translation') : errorType
      const rec: AnswerRecord = { question: q, chosen: chosen ?? null, correct: ok, errorType: err, rating: r }
      await recordAnswer({
        cardId: q.cardId,
        deckId: q.deckId,
        wordId: q.wordId,
        mode: q.mode,
        prompt: q.prompt,
        answer: q.answer,
        chosen: chosen ?? null,
        options: q.options.map((o) => o.text),
        correct: ok,
        errorType: err,
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
        setOverride(false)
        setPicked([])
      }
    },
    [answered, q, chosen, correct, errorType, kind, records, index, questions.length, onFinish, sessionId],
  )

  const defaultRating: Rating = kind === 'reveal' || correct ? 3 : 1

  const tiles = q.tiles ?? []
  const remaining = tiles.map((_, i) => i).filter((i) => !picked.includes(i))
  const pickTile = useCallback(
    (i: number) => {
      if (answered || picked.includes(i)) return
      const next = [...picked, i]
      setPicked(next)
      if (next.length === tiles.length) answer(next.map((j) => tiles[j]).join(''))
    },
    [answered, picked, tiles, answer],
  )

  // 鍵盤：1–4 選答案（作答後是自評）、Enter 下一題、Space 重播發音
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.key === ' ' && !inInput) {
        e.preventDefault()
        say()
        return
      }
      // 語順重組：數字鍵點第 n 張剩下的字卡，Backspace 收回最後一張
      if (!answered && kind === 'reorder' && !inInput) {
        if (/^[1-9]$/.test(e.key) && remaining[Number(e.key) - 1] !== undefined) pickTile(remaining[Number(e.key) - 1])
        if (e.key === 'Backspace') setPicked((p) => p.slice(0, -1))
        return
      }
      if (/^[1-4]$/.test(e.key) && !inInput) {
        const n = Number(e.key)
        if (!answered && kind === 'choice' && q.options[n - 1]) answer(q.options[n - 1].text)
        else if (answered) rate(n as Rating)
        return
      }
      if (e.key === 'Enter') {
        if (answered) {
          e.preventDefault()
          rate(defaultRating)
        } else if (kind === 'reveal') {
          e.preventDefault()
          answer('')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answered, q, kind, answer, rate, defaultRating, say, remaining, pickTile])

  const card = cards.get(q.cardId)
  const previews = card ? previewIntervals(card) : null
  const w = q.word
  const zhPrompt = q.mode === 'typing' || q.mode === 'zh2ja' || q.mode === 'reorder'
  const promptSize =
    q.mode === 'grammar'
      ? 'whitespace-pre-line text-xl leading-relaxed sm:text-2xl'
      : q.mode === 'cloze' || q.mode === 'particle' || q.mode === 'ja2zh' || q.mode === 'zh2ja' || q.mode === 'reorder'
        ? 'text-2xl leading-relaxed sm:text-3xl'
        : q.mode === 'typing' || q.mode === 'kanji2meaning' || q.mode === 'conjugate'
          ? 'text-4xl sm:text-5xl'
          : 'text-5xl sm:text-6xl'

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
        {q.context && (
          <p className="jp mb-3 text-sm text-ink-600 dark:text-lav-300" data-testid="context">
            上一句：{q.context}
          </p>
        )}
        {q.mode === 'listening' ? (
          <button className="btn-secondary mx-auto my-4 h-24 w-24 rounded-full text-4xl" onClick={say} aria-label="播放發音" data-testid="play-audio">
            🔊
          </button>
        ) : (
          <div className={`jp break-words font-bold ${promptSize}`} data-testid="prompt">
            {zhPrompt ? <span className="font-sans">{q.prompt}</span> : q.prompt}
          </div>
        )}
        {q.promptSub && <p className="mt-3 text-sm text-ink-600 dark:text-lav-300">{q.promptSub}</p>}
        {q.mode === 'listening' && !audioSupported() && <p className="mt-2 text-sm text-red-600">這個瀏覽器不支援語音，無法播放。</p>}
      </section>

      {kind === 'reveal' ? (
        !answered && (
          <button className="btn-primary w-full py-3 text-base" onClick={() => answer('')} data-testid="reveal">
            看參考翻譯（Enter）
          </button>
        )
      ) : kind === 'reorder' ? (
        <div className="space-y-3" data-testid="reorder">
          <div
            className={`jp flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed p-3 text-xl ${answered ? (correct ? 'border-emerald-400' : 'border-red-400') : 'border-sakura-200 dark:border-ink-600'}`}
            aria-label="你排出的句子"
            data-testid="reorder-built"
          >
            {picked.length === 0 && <span className="font-sans text-sm text-ink-600 dark:text-lav-300">依序點選下面的字卡</span>}
            {picked.map((i) => (
              <button key={i} className="rounded-xl bg-lav-100 px-3 py-1.5 dark:bg-ink-700" disabled={answered} onClick={() => setPicked(picked.filter((j) => j !== i))} aria-label={`收回「${tiles[i]}」`}>
                {tiles[i]}
              </button>
            ))}
          </div>
          {!answered && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="字卡">
              {remaining.map((i, n) => (
                <button key={i} className="jp flex items-center gap-1.5 rounded-xl border-2 border-sakura-200 bg-white px-3 py-2 text-xl hover:border-lav-400 dark:border-ink-600 dark:bg-ink-800" onClick={() => pickTile(i)} data-testid="tile">
                  <span className="font-sans text-xs text-ink-600 dark:text-lav-300">{n + 1}</span>
                  {tiles[i]}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : kind === 'typing' || kind === 'sentence' ? (
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
            placeholder={kind === 'sentence' ? '輸入日文句子（羅馬拼音會轉成假名）' : '輸入羅馬拼音會自動轉成假名，例如 kitte'}
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
        <section ref={feedbackRef} className="card anim-in space-y-3 p-5" data-testid="feedback" data-correct={correct ? 'true' : 'false'}>
          <div className={`text-lg font-bold ${correct ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
            {kind === 'reveal' ? <span className="text-ink-800 dark:text-lav-100">參考翻譯</span> : correct ? '答對了！' : chosen === null ? '時間到！' : '答錯了'}
            {!correct && errorType && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-sm font-medium dark:bg-red-950" data-testid="error-type">
                {ERROR_LABELS[errorType]}
              </span>
            )}
          </div>
          {kind === 'sentence' && chosen && !autoCorrect && (
            <div className="space-y-2 text-sm" data-testid="sentence-diff">
              <p>
                和課本原句比對：
                <span className="jp text-lg">
                  {diffSentence(q.answer, chosen).map((p, i) =>
                    p.kind === 'same' ? (
                      <span key={i}>{p.text}</span>
                    ) : p.kind === 'missing' ? (
                      <span key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-800 underline dark:bg-emerald-950 dark:text-emerald-200" title="課本有、你沒寫">
                        {p.text}
                      </span>
                    ) : (
                      <span key={i} className="rounded bg-red-100 px-0.5 text-red-700 line-through dark:bg-red-950 dark:text-red-200" title="你多寫或寫錯">
                        {p.text}
                      </span>
                    ),
                  )}
                </span>
              </p>
              <p className="text-xs text-ink-600 dark:text-lav-300">綠底＝課本有、你漏掉的字；紅字刪除線＝你多寫或寫錯的字。用了不同漢字或假名寫法也會標出來。</p>
              {!override && (
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOverride(true)} data-testid="override">
                  其實我寫對了（只是寫法不同）
                </button>
              )}
            </div>
          )}
          {kind !== 'sentence' && kind !== 'reveal' && !correct && chosen && (
            <p className="text-sm">
              你的答案：<span className="jp font-semibold">{chosen}</span>　正確答案：<span className="jp font-semibold">{q.answer}</span>
            </p>
          )}
          {q.explain && (
            <p className="whitespace-pre-line rounded-xl bg-lav-50 p-3 text-sm dark:bg-ink-700" data-testid="explain">
              {q.explain}
            </p>
          )}
          {w.kind === 'sentence' ? (
            <div className="space-y-1">
              <p className="jp text-xl font-bold">
                {w.speaker && <span className="mr-1 text-base font-normal text-ink-600 dark:text-lav-300">{w.speaker}：</span>}
                {w.kanji}
              </p>
              {w.reading && <p className="jp text-sm text-lav-700 dark:text-lav-200">{w.reading}</p>}
              <p>{w.meaning}</p>
            </div>
          ) : w.kind === 'grammar' ? null : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="jp text-2xl font-bold">{w.kanji || w.reading}</span>
            <span className="jp text-lg text-lav-700 dark:text-lav-200">{w.reading}</span>
            {w.pos && <span className="rounded bg-lav-100 px-1.5 text-xs dark:bg-ink-600">{w.pos}</span>}
            <span>{w.meaning}</span>
            {audioSupported() && (
              <button className="btn-ghost px-2 py-0.5" onClick={say} aria-label="重播發音">
                🔊
              </button>
            )}
          </div>
          )}
          {!w.kind && w.example && (
            <p className="text-sm">
              <span className="jp">{w.example}</span>
              {w.exampleTranslation && <span className="block text-ink-600 dark:text-lav-300">{w.exampleTranslation}</span>}
            </p>
          )}
          <div>
            <p className="mb-2 text-xs text-ink-600 dark:text-lav-300">
              {kind === 'reveal' ? '對照參考翻譯，你翻得如何？選「重來」＝翻錯，會收進錯題本' : w.kind === 'sentence' ? '自評這句記得多熟' : w.kind === 'grammar' ? '自評這個文法記得多熟' : '自評這個字記得多熟'}（鍵盤 1–4，Enter = {RATING_LABELS[defaultRating]}）
            </p>
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
      <p className="hidden text-center text-xs text-ink-600 sm:block dark:text-lav-300">
        鍵盤：{kind === 'reorder' ? '數字鍵選字卡・Backspace 收回' : kind === 'reveal' ? 'Enter 看答案' : kind === 'choice' ? '1–4 選答案' : 'Enter 送出'}・作答後 1–4 自評、Enter 下一題・Space 重播發音
      </p>
    </div>
  )
}

function normalizeTyped(v: string | null | undefined): string | null {
  return v === undefined || v === null ? null : anyToHiragana(v.trim())
}
