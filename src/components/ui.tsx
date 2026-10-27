import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Deck } from '../types'

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card anim-in max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost px-2 py-1" onClick={onClose} aria-label="關閉">
            ✕
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
  className = 'btn-ghost text-red-600 dark:text-red-400',
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
    <span className="anim-in inline-flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300" role="alert">
      {confirmText}
      <button
        className="btn-danger px-3 py-1"
        onClick={async () => {
          await onConfirm()
          setAsking(false)
        }}
      >
        {confirmLabel}
      </button>
      <button className="btn-ghost px-3 py-1" onClick={() => setAsking(false)}>
        取消
      </button>
    </span>
  )
}

export function ProgressBar({ value, color = '#ec4f8c', label, segments }: { value?: number; color?: string; label?: string; segments?: { value: number; color: string; label: string }[] }) {
  if (segments) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1
    return (
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-sakura-100 dark:bg-ink-700" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join('、')}>
        {segments.map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label}：${s.value}`} />
        ))}
      </div>
    )
  }
  const pct = Math.round((value ?? 0) * 100)
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-sakura-100 dark:bg-ink-700" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export const MASTERY_COLORS = { new: 'var(--mastery-new)', learning: '#a688f8', mastered: '#ec4f8c' }
export const MASTERY_LABELS = { new: '未學', learning: '學習中', mastered: '已熟練' }

export function DeckTag({ deck, small }: { deck: Pick<Deck, 'name' | 'color' | 'icon'>; small?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium ${small ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'}`} style={{ background: deck.color + '22', color: deck.color }}>
      <span aria-hidden>{deck.icon}</span>
      <span className="text-ink-800 dark:text-lav-100">{deck.name}</span>
    </span>
  )
}

export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center text-ink-600 dark:text-lav-200">
      <div className="text-4xl" aria-hidden>
        🌸
      </div>
      <div>{children}</div>
      {action}
    </div>
  )
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl bg-lav-100 p-1 dark:bg-ink-700">
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${value === o.value ? 'bg-white font-semibold text-sakura-600 shadow-sm dark:bg-ink-900 dark:text-sakura-300' : 'text-ink-700 hover:bg-white/60 dark:text-lav-200 dark:hover:bg-ink-600'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-sakura-500' : 'bg-lav-200 dark:bg-ink-600'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-5.5' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-600 dark:text-lav-300">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-600 dark:text-lav-300">{sub}</div>}
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
