import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Deck } from '../types'
import { deckGlyph, tapeColor } from '../lib/deckStyle'

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card anim-in max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost -mr-2 w-11 px-0" onClick={onClose} aria-label="關閉">
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** 二次確認按鈕：第一次點顯示確認，第二次才執行（不使用瀏覽器 confirm） */
export function ConfirmButton({
  onConfirm,
  children,
  confirmText = '確定要刪除？',
  confirmLabel = '確定刪除',
  className = 'btn-ghost text-accent',
}: {
  onConfirm: () => void | Promise<void>
  children: ReactNode
  confirmText?: string
  confirmLabel?: string
  className?: string
}) {
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button className={className} onClick={() => setAsking(true)}>
        {children}
      </button>
    )
  return (
    <span className="anim-in inline-flex flex-wrap items-center gap-2 rounded-2xl border-[1.5px] border-accent bg-accent-soft px-3 py-1.5 text-sm text-accent" role="alert">
      {confirmText}
      <button
        className="btn-danger px-3"
        onClick={async () => {
          await onConfirm()
          setAsking(false)
        }}
      >
        {confirmLabel}
      </button>
      <button className="btn-ghost px-3" onClick={() => setAsking(false)}>
        取消
      </button>
    </span>
  )
}

export function ProgressBar({ value, color, label, segments }: { value?: number; color?: string; label?: string; segments?: { value: number; color: string; label: string }[] }) {
  if (segments) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1
    return (
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-line-soft" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join('、')}>
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}：${s.value}`} />
        ))}
      </div>
    )
  }
  const pct = Math.round((value ?? 0) * 100)
  return (
    <div className="h-3 w-full overflow-hidden rounded-full border-[1.5px] border-ink bg-surface" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full transition-all ${color ? '' : 'stripe-fill'}`} style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export const MASTERY_COLORS = { new: 'var(--mastery-new)', learning: 'var(--muted)', mastered: 'var(--ink)' }
export const MASTERY_LABELS = { new: '未學', learning: '學習中', mastered: '已熟練' }

export function DeckTag({ deck, small }: { deck: Pick<Deck, 'name' | 'color' | 'icon'>; small?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line-soft bg-surface font-medium text-ink-2 ${small ? 'py-0.5 pr-2 pl-0.5 text-xs' : 'py-0.5 pr-2.5 pl-0.5 text-sm'}`}>
      <span className={`grid shrink-0 place-items-center rounded-full font-mincho font-extrabold text-ink ${small ? 'h-5 w-5 text-[11px]' : 'h-6 w-6 text-xs'}`} style={{ background: tapeColor(deck) }} aria-hidden>
        {deckGlyph(deck)}
      </span>
      <span>{deck.name}</span>
    </span>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-dash bg-surface p-8 text-center text-muted">
      <div className="grid h-[52px] w-[52px] place-items-center rounded-xl border-[1.5px] border-dash font-mincho text-[28px] font-extrabold text-dash" aria-hidden>
        空
      </div>
      <div>{children}</div>
      {action}
    </div>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-[24px] border-[1.5px] border-ink bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 rounded-full px-3.5 text-sm transition-colors ${value === o.value ? 'bg-ink font-bold text-surface' : 'text-ink-2 hover:bg-pattern-line'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1">
      <span>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border-[1.5px] border-ink transition-colors ${checked ? 'bg-ink' : 'bg-line-soft'}`}
      >
        <span className={`absolute top-[1.5px] h-[18px] w-[18px] rounded-full border-[1.5px] border-ink bg-surface transition-all ${checked ? 'left-[20px]' : 'left-[1.5px]'}`} />
      </button>
    </label>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function pct(x: number | null | undefined) {
  return x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{children}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
