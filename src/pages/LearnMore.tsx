// 講解頁（續）：ない形・た形・辭書形、形容詞變化、數字・時間・日期・量詞（說明都是自行撰寫）
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Lightbulb } from 'lucide-react'
import { bind, unbind } from 'wanakana'
import { Segmented } from '../components/ui'
import { ADJ_FORMS, ADJ_LABELS, adjForm, adjRule, convertAdj, type AdjType } from '../lib/adjective'
import { COUNTER_CATEGORIES, countersIn } from '../lib/counters'
import { entryWeight } from '../data/counters'

const Tip = ({ children }: { children: React.ReactNode }) => (
  <p className="flex gap-2 rounded-xl border-[1.5px] border-dashed border-accent bg-accent-soft p-3 text-sm">
    <Lightbulb size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
    <span>{children}</span>
  </p>
)

function RuleTable({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="p-1.5 sm:p-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line-soft">
              {r.map((c, j) => (
                <td key={j} className={`jp p-1.5 align-top sm:p-2 ${j === 0 ? 'whitespace-nowrap font-bold' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Em = ({ children }: { children: React.ReactNode }) => <strong className="text-accent">{children}</strong>

export function VerbFormsSection() {
  return (
    <>
      <h3 className="font-bold">ない形（否定：不～）</h3>
      <RuleTable
        head={['分組', '怎麼變', '例子']}
        rows={[
          ['第 I 類', <>ます前的 い段 → <Em>あ段</Em>＋ない（<Em>い → わ</Em>）</>, '書きます → 書かない、飲みます → 飲まない、買います → 買わない'],
          ['第 II 類', '去掉「ます」加「ない」', '食べます → 食べない、見ます → 見ない'],
          ['第 III 類', '直接背', 'します → しない、来ます → 来ない（こない）'],
          ['例外', 'ある 的否定', <>あります → <Em>ない</Em>（不是 あらない）</>],
        ]}
      />
      <Tip>
        第 I 類「〜います」的 い 要變成 <strong className="jp">わ</strong>，不是 あ：<span className="jp">会います → 会わない（不是 会あない）、言います → 言わない</span>。
      </Tip>

      <h3 className="font-bold">た形（過去：～了）</h3>
      <p>
        <strong>把て形的「て／で」換成「た／だ」</strong>就好，規則和て形完全一樣：
      </p>
      <RuleTable
        head={['て形', 'た形']}
        rows={[
          ['書いて、待って、飲んで', '書いた、待った、飲んだ'],
          ['泳いで、話して', '泳いだ、話した'],
          ['食べて、して、来て', '食べた、した、来た（きた）'],
          ['行って（例外）', '行った'],
        ]}
      />

      <h3 className="font-bold">辭書形（字典上的原形）</h3>
      <RuleTable
        head={['分組', '怎麼變', '例子']}
        rows={[
          ['第 I 類', <>ます前的 い段 → <Em>う段</Em></>, '書きます → 書く、待ちます → 待つ、帰ります → 帰る'],
          ['第 II 類', '去掉「ます」加「る」', '食べます → 食べる、起きます → 起きる'],
          ['第 III 類', '直接背', 'します → する、来ます → 来る（くる）'],
        ]}
      />
      <details className="rounded-xl border-[1.5px] border-dashed border-dash bg-washi p-3 text-sm">
        <summary className="cursor-pointer font-medium">常見錯誤（動詞變化題的錯誤選項就是這些）</summary>
        <ul className="jp mt-2 list-disc space-y-1 pl-5">
          <li>見ます → ✕ 見らない → ○ 見ない（見ます是 II 類）</li>
          <li>帰ります → ✕ 帰ない → ○ 帰らない（帰ります是 I 類）</li>
          <li>あります → ✕ あらない → ○ ない</li>
          <li>来ます → ✕ きない → ○ こない</li>
          <li>飲みます → ✕ 飲みた → ○ 飲んだ（た形跟著て形變）</li>
          <li>帰ります → ✕ 帰りる → ○ 帰る（I 類 り → る）</li>
        </ul>
      </details>
      <Link className="btn-primary w-fit" to="/practice?mode=conjugate">
        去練動詞變化
        <ArrowRight size={18} aria-hidden />
      </Link>
    </>
  )
}

function AdjConverter() {
  const [text, setText] = useState('')
  const [type, setType] = useState<'auto' | AdjType>('auto')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    bind(el, { IMEMode: true })
    return () => unbind(el)
  }, [])
  const a = convertAdj(text, type === 'auto' ? undefined : type)
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">輸入形容詞（假名，可以打羅馬拼音，例如 takai、shizukana），看全部的變化。</p>
      <div className="flex flex-wrap items-end gap-3">
        <input
          ref={ref}
          className="input jp max-w-xs text-xl"
          placeholder="例：たかい、しずかな"
          aria-label="輸入形容詞"
          data-testid="adj-input"
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <Segmented
          label="類型"
          value={type}
          onChange={setType}
          options={[
            { value: 'auto', label: '自動' },
            { value: 'i', label: 'い形容詞' },
            { value: 'na', label: 'な形容詞' },
          ]}
        />
      </div>
      {text && !a && <p className="text-sm text-accent">い形容詞要以「い」結尾；な形容詞可以加「な」輸入。</p>}
      {a && (
        <div className="rounded-xl border-[1.5px] border-dashed border-dash bg-washi p-4" data-testid="adj-result">
          <p className="mb-2 text-sm">
            {ADJ_LABELS[a.type]}
            {a.guessed && <span className="ml-2 text-xs text-muted">（自動判斷；きれい、有名 這類「い」結尾的な形容詞請手動選）</span>}
          </p>
          <dl className="jp grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {ADJ_FORMS.map((f) => (
              <div key={f.id} className="contents">
                <dt className="font-sans text-sm text-muted">{f.label}</dt>
                <dd className="text-lg">
                  <strong className="text-accent">{adjForm(a, f.id)}</strong>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">{adjRule(a, 'nai')}</p>
        </div>
      )}
    </div>
  )
}

export function AdjectiveSection() {
  return (
    <>
      <RuleTable
        head={['', 'い形容詞（たかい）', 'な形容詞（しずか）']}
        rows={[
          ['現在', 'たかい', 'しずかだ（しずかです）'],
          ['否定', <>たか<Em>くない</Em></>, <>しずか<Em>じゃない</Em></>],
          ['過去', <>たか<Em>かった</Em></>, <>しずか<Em>だった</Em></>],
          ['過去否定', <>たか<Em>くなかった</Em></>, <>しずか<Em>じゃなかった</Em></>],
          ['て形（連接）', <>たか<Em>くて</Em></>, <>しずか<Em>で</Em></>],
          ['接名詞', 'たかい くるま', <>しずか<Em>な</Em> へや</>],
        ]}
      />
      <p className="text-sm">
        です體：い形容詞直接加「です」（たかくないです、たかかったです）；な形容詞是 <span className="jp">しずかじゃありません、しずかでした</span>。
        <span className="block text-muted">「じゃ」是口語，「では」比較正式，兩個都對。</span>
      </p>
      <Tip>
        兩個最常考的陷阱：
        <br />① <strong className="jp">いい</strong> 變化時要換成 <strong className="jp">よ</strong>：<span className="jp">よくない、よかった、よくて</span>（不是 いくない）。
        <br />② <strong className="jp">きれい、ゆうめい、きらい</strong> 雖然是「い」結尾，其實是<strong>な形容詞</strong>：<span className="jp">きれいじゃない</span>（不是 きれくない）。
      </Tip>
      <AdjConverter />
      <Link className="btn-primary w-fit" to="/practice?mode=adjective">
        去練形容詞變化
        <ArrowRight size={18} aria-hidden />
      </Link>
    </>
  )
}

export function CounterSection() {
  return (
    <>
      <p>
        量詞前面的數字常常會變音（<span className="jp">いっ、ろっ、はっ、じゅっ</span>），量詞本身也會變成濁音或半濁音（<span className="jp">ほん → ぼん・ぽん</span>）。
        <Em>朱色粗體</Em>是要特別背的念法；「／」後面是也可以的說法。
      </p>
      <Tip>
        大原則：<strong>1・6・8・10</strong> 後面接 か・さ・た・は 行時容易變成「っ」（<span className="jp">いっぽん、ろっぽん、はっぽん、じゅっぽん</span>）；<strong>3・何</strong> 後面的 は 行常變濁音（<span className="jp">さんぼん、なんぼん</span>）。
      </Tip>
      {COUNTER_CATEGORIES.map((cat) => (
        <div key={cat} className="space-y-2">
          <h3 className="font-bold text-accent">{cat}</h3>
          {countersIn(cat).map((c) => (
            <details key={c.id} className="rounded-xl border-[1.5px] border-line-soft bg-surface p-3" data-testid={'counter-' + c.id}>
              <summary className="cursor-pointer">
                <strong className="jp">{c.counter}</strong>
                <span className="ml-2 text-sm text-muted">
                  {c.meaning}・{c.hint}
                </span>
              </summary>
              {c.note && <p className="mt-2 text-sm">{c.note}</p>}
              <ul className="jp mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                {c.entries.map((e) => (
                  <li key={e.label} className="flex items-baseline gap-2">
                    <span className="shrink-0 text-muted">{e.label}</span>
                    <span className={entryWeight(c, e) > 1 ? 'font-bold text-accent' : ''}>
                      <span className="whitespace-nowrap">{e.reading}</span>
                      {e.alts.length > 0 && <span className="block text-xs font-normal text-muted">也可以：{e.alts.join('、')}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ))}
      <p className="text-sm text-muted">
        到「匯入」頁加入內建的「數字・時間・量詞」題庫後，就能在
        <Link className="mx-1 underline" to="/practice?mode=counter">
          練習 → 數字・時間・量詞
        </Link>
        練習，每次會隨機出一個數字。
      </p>
    </>
  )
}
