// 本地日期工具（連續天數、熱力圖、考試倒數都以「使用者所在時區的日期」計算）
const pad = (n: number) => String(n).padStart(2, '0')

export function dateKey(d: Date | string = new Date()): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

/** b - a 的天數差（以日期計，不受夏令時間影響） */
export function diffDays(a: string, b: string): number {
  const utc = (k: string) => {
    const [y, m, d] = k.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  const ua = utc(a)
  const ub = utc(b)
  return Math.round((ub - ua) / 86_400_000)
}

/** 距離考試還有幾天（今天考 = 0，已過 = 負數，沒設定 = null） */
export function daysUntil(examDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!examDate) return null
  return diffDays(dateKey(now), examDate)
}

export function endOfToday(now: Date = new Date()): Date {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d
}
