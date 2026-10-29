import { expect, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import path from 'node:path'

export const ROOT = process.cwd()
export const fixture = (name: string) => path.join(ROOT, 'tests/fixtures', name)
/** 有實際轉好的 N5 資料就用它，否則用自製範例 */
export const N5_FILE = existsSync(path.join(ROOT, 'data/out/n5.json')) ? path.join(ROOT, 'data/out/n5.json') : fixture('n5-sample.json')

export async function openApp(page: Page, hash = '/') {
  await page.goto('/#' + hash)
  // App 不再自動建立示範單字庫；測試用它當起始資料（等啟動清理跑完再建，避免被刪）
  await page.waitForFunction(() => (window as any).__app?.ready)
  await page.evaluate(async () => {
    await (window as any).__app.ready
    await (window as any).__app.seedDemoIfEmpty()
  })
  await expect(page.getByTestId('deck-card').first()).toBeVisible()
}

/** 匯入檔案。newDeck 有給就建立新單字庫，否則匯入到網址帶的單字庫。回傳單字庫 id */
export async function importFile(page: Page, file: string, opts: { newDeck?: string; deckId?: string; mapMeaning?: string } = {}) {
  await page.goto('/#/import' + (opts.deckId ? `?deck=${opts.deckId}` : ''))
  await page.getByTestId('import-file').setInputFiles(file)
  await expect(page.getByTestId('import-summary')).toBeVisible()
  if (opts.newDeck) {
    await page.getByTestId('import-target').selectOption('__new')
    await page.getByTestId('import-new-name').fill(opts.newDeck)
  }
  if (opts.mapMeaning) await page.getByTestId('map-meaning').selectOption({ label: opts.mapMeaning })
  await page.getByTestId('do-import').click()
  // WebKit（Windows 版）的 IndexedDB 每個請求約 15ms，535 筆要等比較久
  await expect(page.getByTestId('import-result')).toBeVisible({ timeout: 120_000 })
  await page.getByRole('link', { name: '前往單字庫' }).click()
  await expect(page.getByTestId('deck-title')).toBeVisible()
  return page.url().split('/deck/')[1]
}

/**
 * 答完一整輪練習。plan(i) 回傳 true = 答對、false = 答錯。
 * 偶數題用滑鼠、奇數題用鍵盤（1–4 選答案、Enter 下一題），兩種操作都測到。
 */
export async function answerRound(page: Page, plan: (i: number) => boolean): Promise<number> {
  await expect(page.getByTestId('practice-runner')).toBeVisible()
  const progress = page.getByTestId('progress')
  const total = Number((await progress.textContent())!.split('/')[1].trim())
  for (let i = 0; i < total; i++) {
    await expect(progress).toHaveText(`${i + 1} / ${total}`)
    const right = plan(i)
    if (i % 2 === 0) {
      await page.locator(`[data-testid=option][data-correct=${right}]`).first().click()
    } else {
      const flags = await page.getByTestId('option').evaluateAll((els) => els.map((e) => e.getAttribute('data-correct')))
      await page.keyboard.press(String(flags.findIndex((f) => f === String(right)) + 1))
    }
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', String(right))
    if (i % 2 === 0) await page.getByTestId(right ? 'rate-3' : 'rate-1').click()
    else await page.keyboard.press('Enter')
  }
  await expect(page.getByTestId('practice-result')).toBeVisible()
  return total
}

export async function startPractice(page: Page, opts: { deckId?: string; pages?: [number, number]; count?: 10 | 20 | 50; scopeAll?: boolean } = {}) {
  // 先離開練習頁，確保練習頁重新載入（同一個網址再 goto 不會重設畫面）
  if (page.url().includes('#/practice')) await page.goto('/#/')
  await page.goto('/#/practice' + (opts.deckId ? `?decks=${opts.deckId}` : ''))
  await expect(page.getByTestId('start-practice')).toBeVisible()
  if (opts.scopeAll) await page.getByRole('radio', { name: /^全部/ }).click()
  if (opts.pages) {
    await page.getByRole('radio', { name: /頁數範圍/ }).click()
    await page.getByTestId('page-from').fill(String(opts.pages[0]))
    await page.getByTestId('page-to').fill(String(opts.pages[1]))
  }
  if (opts.count) await page.getByRole('radio', { name: `${opts.count} 題` }).click()
  await page.getByTestId('start-practice').click()
}

export async function evalDb<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(async () => { const db = window.__app.db; ${fn} })()`) as Promise<T>
}

export async function waitSynced(page: Page) {
  await expect(page.getByTestId('sync-badge')).toHaveAttribute('data-status', 'synced', { timeout: 20_000 })
  await expect(page.getByTestId('sync-badge')).not.toContainText('待上傳', { timeout: 20_000 })
}

export async function login(page: Page, email: string) {
  await page.getByTestId('sync-badge').click()
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: '寄送登入信' }).click()
  await expect(page.getByTestId('user-email')).toHaveText(email)
  await page.keyboard.press('Escape')
}
