import { useState } from 'react'
import { DECK_COLORS, DECK_ICONS } from '../db/repo'
import type { Deck } from '../types'

export interface DeckFormValue {
  name: string
  color: string
  icon: string
  examDate: string
  dailyNewLimit: number
}

export function DeckForm({ initial, onSubmit, submitLabel = '儲存', onCancel }: { initial?: Partial<Deck>; onSubmit: (v: DeckFormValue) => void; submitLabel?: string; onCancel?: () => void }) {
  const [v, setV] = useState<DeckFormValue>({
    name: initial?.name ?? '',
    color: initial?.color ?? DECK_COLORS[1],
    icon: initial?.icon ?? DECK_ICONS[1],
    examDate: initial?.examDate ?? '',
    dailyNewLimit: initial?.dailyNewLimit ?? 20,
  })
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (v.name.trim()) onSubmit({ ...v, name: v.name.trim() })
      }}
    >
      <div>
        <label className="label" htmlFor="deck-name">
          名稱
        </label>
        <input id="deck-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="例如：期中考單字" required maxLength={40} />
      </div>
      <div>
        <span className="label">紙膠帶顏色</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="顏色">
          {DECK_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={v.color === c}
              aria-label={c}
              onClick={() => setV({ ...v, color: c })}
              className={`h-11 w-11 rounded-full border-[1.5px] border-ink ring-offset-2 ring-offset-surface transition ${v.color === c ? 'ring-2 ring-ink' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <span className="label">漢字</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="漢字">
          {DECK_ICONS.map((ic) => (
            <button
              type="button"
              key={ic}
              role="radio"
              aria-checked={v.icon === ic}
              onClick={() => setV({ ...v, icon: ic })}
              className={`h-11 w-11 rounded-xl border-[1.5px] font-mincho text-xl font-extrabold ${v.icon === ic ? 'border-ink bg-ink text-surface' : 'border-line-soft bg-surface hover:border-ink'}`}
            >
              {ic}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="deck-exam">
            考試日期（選填）
          </label>
          <input id="deck-exam" type="date" className="input" value={v.examDate} onChange={(e) => setV({ ...v, examDate: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="deck-limit">
            每日新卡上限
          </label>
          <input id="deck-limit" type="number" min={1} max={200} className="input" value={v.dailyNewLimit} onChange={(e) => setV({ ...v, dailyNewLimit: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })} />
        </div>
      </div>
      <p className="text-xs text-muted">設定考試日期後，首頁會顯示倒數；離考試越近，每日新卡數與複習頻率會自動提高，確保考前每個字都至少再複習一次。</p>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            取消
          </button>
        )}
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
