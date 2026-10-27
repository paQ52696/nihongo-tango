import { test, expect } from '@playwright/test'
import { openApp } from './helpers'

test('PWA：manifest 可安裝（名稱、圖示、standalone）', async ({ page, request }) => {
  await openApp(page)
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  expect(href).toBeTruthy()
  const res = await request.get(new URL(href!, page.url()).toString())
  const m = await res.json()
  expect(m.display).toBe('standalone')
  expect(m.name).toBe('日文單字練習')
  expect(m.icons.some((i: any) => i.sizes === '512x512')).toBe(true)
  expect(m.icons.some((i: any) => i.sizes === '192x192')).toBe(true)
  for (const i of m.icons) expect((await request.get(new URL(i.src, page.url()).toString())).ok()).toBe(true)
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveAttribute('href', /apple-touch-icon\.png/)
})

test('斷網後重新整理仍可使用（Service Worker 快取）', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright 的 WebKit 不支援 Service Worker；Safari 的離線行為見下一個測試與 README 說明')
  await openApp(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect(page.getByTestId('deck-card').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('deck-card').first()).toBeVisible()
  await page.getByRole('link', { name: '練習' }).first().click()
  await page.getByTestId('start-practice').click()
  await expect(page.getByTestId('practice-runner')).toBeVisible()
})

test('已開啟的 App 斷網後所有功能照常（資料在 IndexedDB）', async ({ page, context }) => {
  await openApp(page)
  await context.setOffline(true)
  for (const [link, testid] of [
    ['練習', 'start-practice'],
    ['錯題本', 'mistake-count'],
    ['統計', 'stats-total'],
  ] as const) {
    await page.getByRole('link', { name: link }).first().click()
    await expect(page.getByTestId(testid)).toBeVisible()
  }
  await page.getByRole('link', { name: '練習' }).first().click()
  await page.getByTestId('start-practice').click()
  await page.locator('[data-testid=option][data-correct=true]').click()
  await page.getByTestId('rate-3').click()
  await expect(page.getByTestId('progress')).toContainText('2 /')
})
