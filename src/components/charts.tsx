// 輕量 SVG 圖表（不依賴圖表套件，離線也能用）
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { HeatCell, SectionMastery } from '../lib/stats'
import { MASTERY_COLORS, MASTERY_LABELS } from './ui'

// 朱色深淺：沒學 → 達成每日目標
const HEAT = ['var(--line-soft)', ...[28, 50, 75, 100].map((p) => `color-mix(in srgb, var(--accent) ${p}%, var(--surface))`)]

export function Heatmap({ cols }: { cols: HeatCell[][] }) {
  const size = 12
  const gap = 3
  const w = cols.length * (size + gap)
  const h = 7 * (size + gap) + 16
  const months: { x: number; label: string }[] = []
  cols.forEach((c, i) => {
    const d = c[0]?.date
    if (d && Number(d.slice(8)) <= 7) months.push({ x: i * (size + gap), label: `${Number(d.slice(5, 7))}月` })
  })
  // 手機寬度放不下時，預設捲到最右邊（今天）
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (box.current) box.current.scrollLeft = box.current.scrollWidth
  }, [cols.length])
  return (
    <div ref={box} className="overflow-x-auto">
      <svg width={w} height={h} role="img" aria-label="學習熱力圖" className="block">
        {months.map((m) => (
          <text key={m.x} x={m.x} y={10} fontSize={10} className="fill-muted">
            {m.label}
          </text>
        ))}
        {cols.map((col, i) =>
          col.map((c, j) => (
            <rect key={c.date} x={i * (size + gap)} y={16 + j * (size + gap)} width={size} height={size} rx={3} fill={HEAT[c.level]} data-date={c.date} data-count={c.count}>
              <title>{`${c.date}：${c.count} 題`}</title>
            </rect>
          )),
        )}
      </svg>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        少
        {HEAT.map((c, i) => (
          <span key={i} className="inline-block h-3 w-3 rounded-sm" style={{ background: c }} />
        ))}
        多（以每日目標為基準）
      </div>
    </div>
  )
}

export function LineChart({ points, height = 160 }: { points: { label: string; value: number | null }[]; height?: number }) {
  const w = 600
  const pad = { l: 34, r: 10, t: 10, b: 22 }
  const iw = w - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const x = (i: number) => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw)
  const y = (v: number) => pad.t + (1 - v) * ih
  const segs: string[] = []
  let cur = ''
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segs.push(cur)
      cur = ''
      return
    }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`
  })
  if (cur) segs.push(cur)
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label="正確率趨勢">
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={w - pad.r} y1={y(g)} y2={y(g)} className="stroke-line-soft" />
          <text x={pad.l - 6} y={y(g) + 4} fontSize={11} textAnchor="end" className="fill-muted">
            {g * 100}%
          </text>
        </g>
      ))}
      {segs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {points.map((p, i) =>
        p.value === null ? null : (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--accent)">
            <title>{`${p.label}：${Math.round(p.value * 100)}%`}</title>
          </circle>
        ),
      )}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
          <text key={'l' + i} x={x(i)} y={height - 6} fontSize={11} textAnchor={i === points.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'} className="fill-muted">
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

export function BarList({ items, color = 'var(--ink)' }: { items: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.length) return <p className="text-sm text-muted">還沒有錯誤紀錄</p>
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate">{i.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-line-soft">
            <span className="block h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: color }} />
          </span>
          <span className="text-right tabular-nums">{i.value}</span>
        </li>
      ))}
    </ul>
  )
}

export function SectionMasteryList({ sections, deckId }: { sections: SectionMastery[]; deckId?: string }) {
  if (!sections.length) return <p className="text-sm text-muted">這個單字庫沒有頁碼或課次資訊。</p>
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-3 text-xs">
        {(['new', 'learning', 'mastered'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: MASTERY_COLORS[k] }} />
            {MASTERY_LABELS[k]}
          </span>
        ))}
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="section-mastery">
        {sections.map((s) => {
          const total = s.counts.new + s.counts.learning + s.counts.mastered
          const pageNum = s.key.startsWith('p') ? Number(s.key.slice(1)) : null
          const link = deckId ? (pageNum !== null ? `/practice?decks=${deckId}&scope=pages&from=${pageNum}&to=${pageNum}` : s.key.startsWith('l:') ? `/practice?decks=${deckId}&scope=lessons&lessons=${encodeURIComponent(s.label)}` : null) : null
          const body = (
            <>
              <span className="w-16 shrink-0 truncate text-sm font-medium">{s.label}</span>
              <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-line-soft">
                {(['mastered', 'learning', 'new'] as const).map((k) => (
                  <span key={k} style={{ width: `${(s.counts[k] / total) * 100}%`, background: MASTERY_COLORS[k] }} />
                ))}
              </span>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted">
                {s.counts.mastered}/{total}
              </span>
            </>
          )
          return (
            <li key={s.key}>
              {link ? (
                <Link to={link} className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 hover:bg-pattern-line" title={`練習 ${s.label}`}>
                  {body}
                </Link>
              ) : (
                <div className="flex items-center gap-2 px-2 py-1">{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
