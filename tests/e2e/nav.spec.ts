// 上方選單：iPad 直式／橫式、各種桌機寬度都排成一行，不會換到第二行
import { test, expect } from '@playwright/test'
import { openApp } from './helpers'

for (const width of [768, 810, 820, 834, 1024, 1180, 1280]) {
  test(`上方選單 ${width}px 一行排完`, async ({ page, browserName }) => {
    test.skip(browserName === 'webkit' && width !== 820, '其餘寬度由 Chromium 涵蓋')
    await page.setViewportSize({ width, height: 900 })
    await openApp(page)
    const header = page.locator('header')
    const box = await header.boundingBox()
    const items = await header.locator('nav a').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
    expect(new Set(items).size, `選單項目分成 ${new Set(items).size} 行`).toBe(1)
    expect(box!.height).toBeLessThan(70)
  })
}
