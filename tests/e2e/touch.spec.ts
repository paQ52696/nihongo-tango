// 全站：可點擊元素至少 44px 高（文字裡的行內連結除外），沒有 emoji 圖示
import { test, expect } from '@playwright/test'
import { openApp } from './helpers'

const PAGES = ['/', '/practice', '/learn', '/exam', '/mistakes', '/stats', '/words', '/import', '/settings']
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F0}-\u{23FF}\u{2B50}\u{2705}]/u

test('每一頁的按鈕都夠大、沒有 emoji', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Chromium 涵蓋')
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  const deckId = await page.getByTestId('deck-card').first().locator('a').first().getAttribute('href')
  for (const p of [...PAGES, deckId!.replace(/^#/, '')]) {
    await page.goto('/#' + p)
    await page.waitForTimeout(400)
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('a, button, select, input:not([type=checkbox]):not([type=radio]):not([type=range]), summary, [role=switch]')]
        .filter((el) => {
          const e = el as HTMLElement
          if (!e.offsetParent || e.closest('.sr-only')) return false
          if (getComputedStyle(e).display === 'inline') return false // 文字裡的連結
          if (e.getAttribute('role') === 'switch') return (e.closest('label')?.getBoundingClientRect().height ?? 0) < 44
          return e.getBoundingClientRect().height < 43.5
        })
        .map((e) => `${e.tagName} ${(e as HTMLElement).innerText?.slice(0, 20) || e.getAttribute('aria-label')} ${Math.round(e.getBoundingClientRect().height)}px`),
    )
    expect(small, p).toEqual([])
    // 下拉選單的選項（單字庫名稱前的圖示）也要檢查
    const text = ((await page.locator('body').innerText()) + (await page.locator('option').allTextContents()).join('')).replace(/★/g, '') // ★ 是 N5 排序題的符號，不是圖示
    expect(text.match(EMOJI)?.[0] ?? null, p).toBeNull()
  }
})

test('發音按鈕：按下後顯示播放中，唸完恢復', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Chromium 涵蓋')
  await openApp(page)
  await page.goto('/#/settings')
  const btn = page.getByRole('button', { name: '試聽' })
  await btn.click()
  await expect(btn).toHaveAttribute('data-playing', 'true')
  await expect(btn).not.toHaveAttribute('data-playing', /.*/, { timeout: 16_000 })
})
