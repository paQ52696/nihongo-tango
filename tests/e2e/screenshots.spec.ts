// 每個主要頁面 × 桌機／手機寬度 × 淺色／深色 截圖（存到 screenshots/），並檢查沒有水平捲軸（排版跑掉）
import { test, expect, type Page } from '@playwright/test'
import { answerRound, fixture, openApp, startPractice } from './helpers'

const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } } as const
const SCHEMES = ['light', 'dark'] as const

async function noHorizontalOverflow(page: Page, name: string) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }))
  expect(r.sw, `${name} 出現水平捲軸（內容寬 ${r.sw}px > 視窗 ${r.w}px）`).toBeLessThanOrEqual(r.w + 1)
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const scheme of SCHEMES) {
    test(`截圖：${vpName} ${scheme}`, async ({ browser, browserName }) => {
      test.skip(browserName === 'webkit' && !(vpName === 'mobile' && scheme === 'light'), 'WebKit 只截手機淺色（Safari 代表）')
      test.setTimeout(180_000)
      const ctx = await browser.newContext({ viewport, colorScheme: scheme, isMobile: vpName === 'mobile' && browserName !== 'webkit' ? true : undefined, hasTouch: vpName === 'mobile' })
      const page = await ctx.newPage()
      const shot = async (name: string) => {
        await page.waitForTimeout(250)
        await noHorizontalOverflow(page, name)
        await page.screenshot({ path: `screenshots/${browserName}-${vpName}-${scheme}-${name}.png`, fullPage: true })
      }

      await openApp(page)
      // 準備一些資料：一輪練習（一半答錯）
      await startPractice(page, { count: 10 })
      await answerRound(page, (i) => i % 2 === 0)
      await shot('practice-result')

      await page.goto('/#/')
      await expect(page.getByTestId('deck-card').first()).toBeVisible()
      await shot('home')

      await page.getByTestId('deck-card').first().locator('a').first().click()
      await expect(page.getByTestId('deck-title')).toBeVisible()
      await shot('deck')

      await page.goto('/#/practice')
      await expect(page.getByTestId('start-practice')).toBeVisible()
      await shot('practice-setup')
      await page.getByTestId('start-practice').click()
      await shot('practice-question')
      await page.locator('[data-testid=option][data-correct=false]').first().click()
      await expect(page.getByTestId('feedback')).toBeVisible()
      await shot('practice-feedback')

      await page.goto('/#/')
      await page.goto('/#/practice')
      await page.getByRole('radio', { name: '例句填空' }).click()
      await page.getByTestId('start-practice').click()
      await shot('practice-cloze')

      await page.goto('/#/exam')
      await page.getByTestId('start-exam').click()
      await expect(page.getByTestId('exam-runner')).toBeVisible()
      for (let i = 0; i < 5; i++) {
        await page.getByTestId('option').first().click()
        await page.waitForTimeout(200)
      }
      await shot('exam-runner')
      await page.getByRole('button', { name: '交卷' }).first().click()
      await page.getByRole('button', { name: '交卷' }).last().click()
      await expect(page.getByTestId('exam-result')).toBeVisible()
      await shot('exam-result')

      await page.goto('/#/mistakes')
      await expect(page.getByTestId('mistake-list')).toBeVisible()
      await shot('mistakes')

      await page.goto('/#/stats')
      await expect(page.getByTestId('stats-total')).toBeVisible()
      await shot('stats')

      await page.goto('/#/words')
      await expect(page.getByTestId('word-row').first()).toBeVisible()
      await page.getByTestId('word-row').first().getByRole('checkbox').check()
      await shot('words')

      await page.goto('/#/import')
      await page.getByTestId('import-file').setInputFiles(fixture('midterm.csv'))
      await expect(page.getByTestId('import-summary')).toBeVisible()
      await shot('import')

      await page.goto('/#/settings')
      await shot('settings')

      await page.goto('/#/')
      await page.getByTestId('sync-badge').click()
      await shot('account-dialog')
      await page.keyboard.press('Escape')

      await page.getByTestId('new-deck').click()
      await shot('new-deck-dialog')
      await ctx.close()
    })
  }
}
