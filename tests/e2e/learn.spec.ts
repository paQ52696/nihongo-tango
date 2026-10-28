// 講解頁：て形轉換器、我的動詞表（ます形單字＋分組），手機寬度截圖與版面檢查
import { test, expect } from '@playwright/test'
import { fixture, importFile, openApp } from './helpers'

test('講解頁：轉換器與我的動詞表', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  await importFile(page, fixture('verbs-masu.csv'), { newDeck: '動詞' })

  await page.goto('/#/learn')
  await expect(page.getByRole('heading', { name: '講解' })).toBeVisible()

  // 轉換器：打羅馬拼音會轉成假名
  await page.getByTestId('te-input').pressSequentially('kakimasu')
  await expect(page.getByTestId('te-result')).toContainText('かいて')
  await expect(page.getByTestId('te-result')).toContainText('き → いて')

  // 我的動詞表：預設遮住て形，點了才顯示
  const rows = page.getByTestId('verb-row')
  // 測試輔助會建立示範單字庫（裡面有「来る」），所以至少 5 個
  await expect(rows.filter({ hasText: '勉強します' })).toHaveCount(1)
  expect(await rows.count()).toBeGreaterThanOrEqual(5)
  const kaku = rows.filter({ hasText: '書きます' })
  await expect(kaku.locator('span').last()).toHaveClass(/text-transparent/)
  await kaku.click()
  await expect(kaku).toContainText('かいて')
  await expect(rows.filter({ hasText: '来ます' })).toContainText('きて')

  // 動詞變化題用ます形出題
  await page.goto('/#/practice?mode=conjugate')
  await expect(page.getByTestId('mode-conjugate')).toContainText(/[5-9]/)

  await page.goto('/#/learn')
  await page.screenshot({ path: `screenshots/${browserName}-mobile-learn.png`, fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
