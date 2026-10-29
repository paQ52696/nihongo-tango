// 講解：動詞分組、て形變化與用法、其他動詞變化、形容詞變化、數字・量詞、第 13–16 課文法、我的動詞表（說明都是自行撰寫）
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Lightbulb } from 'lucide-react'
import { bind, unbind } from 'wanakana'
import { useAppData } from '../hooks/useData'
import { PageTitle, Segmented, Toggle } from '../components/ui'
import { GRAMMAR_SETS } from '../data/grammar'
import { GROUP_LABELS, VERB_FORMS, convertVerb, formRule, masuForm, verbForm, verbInfo, type VerbForm, type VerbGroup } from '../lib/conjugate'
import { AdjectiveSection, CounterSection, VerbFormsSection } from './LearnMore'

const SECTIONS = [
  { id: 'groups', label: '動詞分組' },
  { id: 'te', label: 'て形變化' },
  { id: 'converter', label: '動詞轉換器' },
  { id: 'te-uses', label: 'て形的用法' },
  { id: 'verb-forms', label: 'ない形・た形・辭書形' },
  { id: 'adjectives', label: '形容詞變化' },
  { id: 'counters', label: '數字・量詞' },
  { id: 'grammar', label: '第13–16課文法' },
  { id: 'my-verbs', label: '我的動詞表' },
]

const TE_RULES: { from: string; to: string; examples: [string, string][]; note?: string }[] = [
  { from: 'い・ち・り', to: 'って', examples: [['会います', '会って'], ['待ちます', '待って'], ['帰ります', '帰って']] },
  { from: 'み・び・に', to: 'んで', examples: [['飲みます', '飲んで'], ['遊びます', '遊んで'], ['死にます', '死んで']] },
  { from: 'き', to: 'いて', examples: [['書きます', '書いて'], ['聞きます', '聞いて']], note: '例外：行きます → 行って' },
  { from: 'ぎ', to: 'いで', examples: [['泳ぎます', '泳いで'], ['急ぎます', '急いで']] },
  { from: 'し', to: 'して', examples: [['話します', '話して'], ['押します', '押して']] },
]

const TE_USES: { lesson: string; pattern: string; meaning: string; ja: string; zh: string }[] = [
  { lesson: '第14課', pattern: 'V て ください', meaning: '請（做）～', ja: 'ここに 名前を 書いて ください。', zh: '請在這裡寫名字。' },
  { lesson: '第14課', pattern: 'V て います', meaning: '正在～', ja: '今 雨が 降って います。', zh: '現在正在下雨。' },
  { lesson: '第15課', pattern: 'V ても いいですか', meaning: '可以～嗎？', ja: '写真を 撮っても いいですか。', zh: '可以拍照嗎？' },
  { lesson: '第15課', pattern: 'V ては いけません', meaning: '不可以～', ja: 'ここで たばこを 吸っては いけません。', zh: '這裡不可以抽菸。' },
  { lesson: '第15課', pattern: 'V て います', meaning: '狀態・習慣・職業', ja: '姉は 大阪に 住んで います。', zh: '姊姊住在大阪。' },
  { lesson: '第16課', pattern: 'V₁ て、V₂ て、V₃', meaning: '先～然後～', ja: '朝 起きて、ご飯を 食べて、学校へ 行きます。', zh: '早上起床、吃飯，然後去學校。' },
  { lesson: '第16課', pattern: 'V₁ て から、V₂', meaning: '做完～之後再～', ja: '手を 洗ってから、食べます。', zh: '洗完手再吃。' },
]

const GROUP_ORDER: VerbGroup[] = ['godan', 'ichidan', 'suru', 'kuru']

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20 space-y-3 p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Converter() {
  const [text, setText] = useState('')
  const [group, setGroup] = useState<'auto' | 'I' | 'II' | 'III'>('auto')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    bind(el, { IMEMode: true })
    return () => unbind(el)
  }, [])
  const v = convertVerb(text, group === 'auto' ? undefined : group)
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">輸入ます形或辭書形（可以打羅馬拼音，例如 kakimasu），看它屬於哪一類、每一種變化怎麼變。</p>
      <div className="flex flex-wrap items-end gap-3">
        <input
          ref={ref}
          className="input jp max-w-xs text-xl"
          placeholder="例：かきます、のむ"
          aria-label="輸入動詞"
          data-testid="te-input"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <Segmented
          label="分組"
          value={group}
          onChange={setGroup}
          options={[
            { value: 'auto', label: '自動' },
            { value: 'I', label: 'I 類' },
            { value: 'II', label: 'II 類' },
            { value: 'III', label: 'III 類' },
          ]}
        />
      </div>
      {text && !v && <p className="text-sm text-accent">看起來不是動詞。請輸入「〜ます」或辭書形（〜う段結尾）。</p>}
      {v && (
        <div className="rounded-xl border-[1.5px] border-dashed border-dash bg-washi p-4" data-testid="te-result">
          <p className="mb-2 text-sm">{GROUP_LABELS[v.group]}</p>
          <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5">
            {VERB_FORMS.map((f) => (
              <div key={f.id} className="contents">
                <dt className="text-sm text-muted">{f.label}</dt>
                <dd>
                  <strong className="jp text-xl text-accent">{verbForm(v, f.id)}</strong>
                  <span className="ml-2 text-xs text-muted">{formRule(v, f.id)}</span>
                </dd>
              </div>
            ))}
          </dl>
          {v.guessed && <p className="mt-1 text-xs text-muted">分組是自動判斷的；像「話します」（I 類）、「見ます」（II 類）這種看外表判斷不出來，不對的話請手動選分組。</p>}
        </div>
      )}
    </div>
  )
}

export function LearnPage() {
  const data = useAppData()
  const [hideTe, setHideTe] = useState(true)
  const [col, setCol] = useState<VerbForm>('te')
  const [shown, setShown] = useState<Set<string>>(new Set())

  // 我的單字庫裡的動詞（依分組），同一個字只列一次
  const verbs = useMemo(() => {
    if (!data) return []
    const lessonOf = new Map(data.entries.filter((e) => !e.deleted).map((e) => [e.wordId, e.lesson ?? '']))
    // 同一個動詞出現多次（例如 N5 的「書く」和課本的「書きます」）只列一次，優先保留課本的ます形
    const byVerb = new Map<string, { w: (typeof data.words)[number]; v: NonNullable<ReturnType<typeof verbInfo>>; lesson: string }>()
    for (const w of data.words) {
      if (w.deleted || !lessonOf.has(w.id)) continue
      const v = verbInfo(w)
      if (!v) continue
      const key = v.group + (v.masu?.reading ?? masuForm(v)) // ます形的假名當 key（書く／書きます 都是 かきます）
      const prev = byVerb.get(key)
      if (!prev || (v.masu && !prev.v.masu)) byVerb.set(key, { w, v, lesson: lessonOf.get(w.id) ?? '' })
    }
    return [...byVerb.values()].sort((a, b) => a.lesson.localeCompare(b.lesson, 'zh-Hant', { numeric: true }) || a.v.dict.localeCompare(b.v.dict, 'ja'))
  }, [data])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle>講解</PageTitle>
      <nav className="flex flex-wrap gap-2" aria-label="講解目錄">
        {SECTIONS.map((s) => (
          <a key={s.id} href={'#/learn'} onClick={(e) => (e.preventDefault(), document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }))} className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-ink bg-surface px-3.5 text-sm transition-colors hover:bg-ink hover:text-surface">
            {s.label}
          </a>
        ))}
      </nav>

      <Section id="groups" title="① 動詞分組：先分類，才知道怎麼變">
        <p>從「ます形」看「ます」前面那個字（語幹最後一個音）：</p>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            <strong>します、来ます → 第 III 類</strong>（只有這兩個，加上「勉強します」這種「名詞＋します」）
          </li>
          <li>
            <strong>え段＋ます → 第 II 類</strong>：<span className="jp">食べます、寝ます、開けます、教えます、迎えます</span>
          </li>
          <li>
            <strong>い段＋ます → 大多是第 I 類</strong>：<span className="jp">書きます、飲みます、遊びます、帰ります、待ちます</span>
            <br />
            <span className="text-sm text-muted">
              但有一些是第 II 類，要直接背：<span className="jp">見ます、います、起きます、借ります、浴びます、降ります（おります）、できます、着ます</span>
            </span>
          </li>
        </ol>
        <p className="flex gap-2 rounded-xl border-[1.5px] border-dashed border-accent bg-accent-soft p-3 text-sm">
          <Lightbulb size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          <span>
          課本單字表的「I／II／III」就是分組，背單字時順便記。容易弄錯的：<span className="jp">帰ります、入ります、知ります、走ります</span> 都是<strong>第 I 類</strong>（て形是 帰って、入って），不要因為「〜ります」就以為是 II 類。
          </span>
        </p>
      </Section>

      <Section id="te" title="② て形怎麼變">
        <p>
          <strong>第 I 類</strong>看「ます」前面的音：
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="p-2">ます前面</th>
                <th className="p-2">變成</th>
                <th className="p-2">例子</th>
              </tr>
            </thead>
            <tbody>
              {TE_RULES.map((r) => (
                <tr key={r.from} className="border-t border-line-soft">
                  <td className="jp p-2 text-lg font-bold">{r.from}</td>
                  <td className="jp p-2 text-lg font-bold text-accent">{r.to}</td>
                  <td className="jp p-2">
                    {r.examples.map(([a, b]) => `${a} → ${b}`).join('、')}
                    {r.note && <span className="block text-xs text-accent">{r.note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rounded-xl border-[1.5px] border-accent bg-surface p-3">
          <span className="jp mr-2 inline-block -rotate-3 rounded-md border-[1.5px] border-accent px-1.5 font-mincho text-sm font-extrabold text-accent">口訣</span>
          照順序唸幾遍：<strong className="jp text-lg">いちり って、みびに んで、き いて、ぎ いで、し して</strong>
          <span className="block text-sm text-muted">再加一句「行きます是例外：行って」。</span>
        </p>
        <p>
          <strong>第 II 類</strong>：去掉「ます」直接加「て」→ <span className="jp">食べます → 食べて、見ます → 見て、起きます → 起きて</span>
        </p>
        <p>
          <strong>第 III 類</strong>：<span className="jp">します → して、来ます → 来て（きて）、勉強します → 勉強して</span>
        </p>
        <details className="rounded-xl border-[1.5px] border-dashed border-dash bg-washi p-3 text-sm">
          <summary className="cursor-pointer font-medium">常見錯誤（動詞變化題的錯誤選項就是這些）</summary>
          <ul className="jp mt-2 list-disc space-y-1 pl-5">
            <li>書きます → ✕ 書きて ✕ 書って → ○ 書いて（I 類不能直接去ます加て）</li>
            <li>帰ります → ✕ 帰て → ○ 帰って（帰ります是 I 類）</li>
            <li>見ます → ✕ 見って → ○ 見て（見ます是 II 類）</li>
            <li>泳ぎます → ✕ 泳いて → ○ 泳いで（ぎ 要變濁音 いで）</li>
            <li>飲みます → ✕ 飲んて → ○ 飲んで（ん 後面是 で）</li>
            <li>行きます → ✕ 行いて → ○ 行って（唯一的例外）</li>
          </ul>
        </details>
        <Link className="btn-primary w-fit" to="/practice?mode=conjugate">
          去練動詞變化
          <ArrowRight size={18} aria-hidden />
        </Link>
      </Section>

      <Section id="converter" title="③ 動詞變化轉換器">
        <Converter />
      </Section>

      <Section id="te-uses" title="④ て形的用法（第 14–16 課）">
        <ul className="divide-y divide-line-soft">
          {TE_USES.map((u) => (
            <li key={u.pattern + u.meaning} className="py-2">
              <p>
                <span className="mr-2 rounded border border-line-soft px-1.5 text-xs text-muted">{u.lesson}</span>
                <strong className="jp">{u.pattern}</strong>　{u.meaning}
              </p>
              <p className="jp mt-1">{u.ja}</p>
              <p className="text-sm text-muted">{u.zh}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="verb-forms" title="⑤ ない形・た形・辭書形">
        <VerbFormsSection />
      </Section>

      <Section id="adjectives" title="⑥ 形容詞變化">
        <AdjectiveSection />
      </Section>

      <Section id="counters" title="⑦ 數字・時間・日期・量詞">
        <CounterSection />
      </Section>

      <Section id="grammar" title="⑧ 第 13–16 課文法">
        {GRAMMAR_SETS.map((set) => {
          const lessons = [...new Set(set.points.map((p) => p.lesson))]
          return lessons.map((lesson) => (
            <div key={set.id + lesson} className="space-y-2">
              <h3 className="font-bold text-accent">{lesson}</h3>
              {set.points
                .filter((p) => p.lesson === lesson)
                .map((p) => (
                  <details key={p.id} className="rounded-xl border-[1.5px] border-line-soft bg-surface p-3">
                    <summary className="cursor-pointer">
                      <strong className="jp">{p.pattern}</strong>
                      <span className="ml-2 text-sm text-muted">{p.meaning}</span>
                    </summary>
                    <p className="mt-2 text-sm">{p.explanation}</p>
                    <ul className="mt-2 space-y-1">
                      {p.examples.map((ex) => (
                        <li key={ex.ja}>
                          <span className="jp">{ex.ja}</span>
                          <span className="block text-sm text-muted">{ex.zh}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
            </div>
          ))
        })}
        <p className="text-sm text-muted">
          文法題要先到「匯入」頁最下方加入內建文法題庫，才能在
          <Link className="mx-1 underline" to="/practice?mode=grammar">
            練習 → 文法題
          </Link>
          練習。
        </p>
      </Section>

      <Section id="my-verbs" title="⑨ 我的動詞表">
        {!data ? null : verbs.length === 0 ? (
          <p className="text-sm text-muted">單字庫裡還沒有動詞（詞性要寫「動詞」，ます形要加分組，例如「動詞I」）。</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted">單字庫裡的 {verbs.length} 個動詞。遮住變化形自己唸，點一下看答案。</p>
              <Segmented
                label="顯示哪一種變化"
                value={col}
                onChange={(v) => (setCol(v), setShown(new Set()))}
                options={VERB_FORMS.filter((f) => f.id === 'te' || f.id === 'nai' || f.id === 'ta').map((f) => ({ value: f.id, label: f.label }))}
              />
              <div className="min-w-40">
                <Toggle
                  checked={hideTe}
                  onChange={(v) => {
                    setHideTe(v)
                    setShown(new Set())
                  }}
                  label="遮住答案"
                />
              </div>
            </div>
            {GROUP_ORDER.map((g) => {
              const list = verbs.filter((x) => x.v.group === g)
              if (!list.length) return null
              return (
                <div key={g}>
                  <h3 className="mb-1 font-bold">
                    {GROUP_LABELS[g]}（{list.length}）
                  </h3>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {list.map(({ w, v, lesson }) => {
                      const key = w.id
                      const open = !hideTe || shown.has(key)
                      return (
                        <button
                          key={key}
                          className="jp flex min-h-11 items-baseline justify-between gap-2 rounded-xl border-[1.5px] border-line-soft bg-surface px-3 py-2 text-left transition-colors hover:border-ink"
                          onClick={() => setShown(new Set(shown).add(key))}
                          data-testid="verb-row"
                        >
                          <span>
                            {v.masu?.surface ?? v.surface}
                            <span className="ml-1 text-xs text-muted">{lesson}</span>
                          </span>
                          <span className={open ? 'font-bold text-accent ' : 'rounded bg-pattern-line px-2 text-transparent '}>{verbForm(v, col)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </Section>
    </div>
  )
}
