// 課文句子（中翻日、語順重組、助詞填空、日翻中）與內建文法題庫的完整流程，並在手機寬度截圖
import { test, expect, type Page } from '@playwright/test'
import { evalDb, fixture, importFile, openApp } from './helpers'

async function start(page: Page, deckId: string, mode: string) {
  await page.goto('/#/')
  await page.goto(`/#/practice?decks=${deckId}`)
  await page.getByTestId('mode-' + mode).click()
  await page.getByTestId('start-practice').click()
  await expect(page.getByTestId('practice-runner')).toBeVisible()
}

/** 目前題目對應的句子資料（用中文或日文題幹找） */
async function currentSentence(page: Page) {
  const prompt = (await page.getByTestId('prompt').textContent())!.trim()
  return evalDb<{ kanji: string; chunks: string[] }>(page, `return (await db.words.toArray()).find((w) => w.kind === 'sentence' && (w.meaning === ${JSON.stringify(prompt)} || w.kanji === ${JSON.stringify(prompt)}))`)
}

test('課文句子與文法題：匯入、四種句子題型、文法題', async ({ page, browserName }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)
  const deckId = await importFile(page, fixture('sentences-sample.csv'), { newDeck: '課文 13-16' })
  expect(await evalDb<number>(page, `return (await db.words.toArray()).filter((w) => w.kind === 'sentence').length`)).toBe(6)

  // 中翻日：打出原句（片假名、空白、標點不計）
  await start(page, deckId, 'zh2ja')
  const s1 = await currentSentence(page)
  await page.getByTestId('typing-input').fill(s1.chunks.join(' '))
  await page.getByTestId('typing-input').press('Enter')
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
  await page.getByTestId('rate-3').click()
  // 第二題故意寫錯：顯示比對結果，可以改判成對
  await expect(page.getByTestId('progress')).toHaveText(/^2 \//)
  const s2 = await currentSentence(page)
  await page.getByTestId('typing-input').fill(s2.kanji.slice(0, -3))
  await page.getByTestId('typing-input').press('Enter')
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'false')
  await expect(page.getByTestId('sentence-diff')).toBeVisible()
  await page.screenshot({ path: `screenshots/${browserName}-mobile-zh2ja.png`, fullPage: true })
  await page.getByTestId('override').click()
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')

  // 語順重組：依正確順序點字卡
  await start(page, deckId, 'reorder')
  const s3 = await currentSentence(page)
  await page.screenshot({ path: `screenshots/${browserName}-mobile-reorder.png`, fullPage: true })
  for (const c of s3.chunks.map((c) => c.replace(/[。！？]+$/, ''))) await page.getByTestId('tile').filter({ hasText: c }).first().click()
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')

  // 助詞填空：選擇題
  await start(page, deckId, 'particle')
  await expect(page.getByTestId('prompt')).toContainText('（　）')
  await page.locator('[data-testid=option][data-correct=true]').click()
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')

  // 日翻中：看答案後選「重來」＝翻錯，進錯題本
  await start(page, deckId, 'ja2zh')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('feedback')).toContainText('參考翻譯')
  await page.getByTestId('rate-1').click()
  expect(await evalDb<number>(page, `return (await db.reviewLogs.toArray()).filter((l) => l.mode === 'ja2zh' && !l.correct && l.errorType === 'translation').length`)).toBe(1)

  // 內建文法題庫
  await page.goto('/#/import')
  await page.getByTestId('add-grammar-minna-13-16').click()
  await expect(page.getByTestId('grammar-msg')).toContainText('已加入')
  await page.getByRole('link', { name: '去練文法題' }).click()
  await page.getByTestId('mode-grammar').click()
  await page.getByTestId('start-practice').click()
  await page.locator('[data-testid=option][data-correct=false]').first().click()
  await expect(page.getByTestId('explain')).toBeVisible()
  await page.screenshot({ path: `screenshots/${browserName}-mobile-grammar.png`, fullPage: true })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})
