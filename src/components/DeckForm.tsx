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
        <span className="label">顏色</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="顏色">
          {DECK_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={v.color === c}
              aria-label={c}
              onClick={() => setV({ ...v, color: c })}
              className={`h-8 w-8 rounded-full ring-offset-2 transition dark:ring-offset-ink-800 ${v.color === c ? 'ring-2 ring-ink-700 dark:ring-lav-100' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div>
        <span className="label">圖示</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="圖示">
          {DECK_ICONS.map((ic) => (
            <button
              type="button"
              key={ic}
              role="radio"
              aria-checked={v.icon === ic}
              onClick={() => setV({ ...v, icon: ic })}
              className={`h-9 w-9 rounded-lg text-xl ${v.icon === ic ? 'bg-sakura-100 ring-2 ring-sakura-400 dark:bg-ink-600' : 'hover:bg-sakura-50 dark:hover:bg-ink-700'}`}
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
      <p className="text-xs text-ink-600 dark:text-lav-300">設定考試日期後，首頁會顯示倒數；離考試越近，每日新卡數與複習頻率會自動提高，確保考前每個字都至少再複習一次。</p>
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
