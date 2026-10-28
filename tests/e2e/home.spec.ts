// 首頁：今日の一語、單字庫卡片、設定考試日期；桌機／手機 × 淺色／深色截圖與版面檢查
import { test, expect } from '@playwright/test'
import { openApp } from './helpers'

for (const size of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`首頁 ${size.name} ${scheme}`, async ({ page, browserName }) => {
      test.skip(browserName === 'webkit' && (size.name === 'desktop' || scheme === 'dark'), '其餘組合由 Chromium 涵蓋')
      await page.emulateMedia({ colorScheme: scheme })
      await page.setViewportSize(size)
      await openApp(page)

      // 今日の一語：從單字庫挑一個字
      await expect(page.getByTestId('wotd-word')).not.toBeEmpty()

      // 整頁只有一個朱色實心按鈕
      await expect(page.locator('.btn-seal')).toHaveCount(1)
      await expect(page.locator('.btn-seal')).toHaveText('開始今日複習')

      // 點「設定考試日期」可以直接設定
      const card = page.getByTestId('deck-card').first()
      await card.getByRole('button', { name: '設定考試日期' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')

      // 可點擊元素至少 44px 高
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('main a, main button, header a, header button')]
          .filter((el) => (el as HTMLElement).offsetParent && el.getBoundingClientRect().height < 44)
          .map((el) => (el as HTMLElement).innerText || el.getAttribute('aria-label')),
      )
      expect(small).toEqual([])

      await page.screenshot({ path: `screenshots/${browserName}-${size.name}-${scheme}-home.png`, fullPage: true })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    })
  }
}
