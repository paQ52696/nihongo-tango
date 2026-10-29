// 內建練習題庫：加入動詞變化、形容詞變化、數字・量詞三個單字庫，練習頁勾選變化形，講解頁的轉換器
import { test, expect } from '@playwright/test'
import { answerRound, openApp } from './helpers'

test('內建練習題庫：加入、練習、講解', async ({ page }) => {
  await openApp(page)
  await page.goto('/#/import')
  for (const [id, name] of [['verbs', '動詞變化'], ['adjectives', '形容詞變化'], ['counters', '數字・時間・量詞']]) {
    await page.getByTestId('add-drill-' + id).click()
    await expect(page.getByTestId('drill-msg')).toContainText(`「${name}」已加入`)
  }
  // 再按一次不會重複
  await page.getByTestId('add-drill-counters').click()
  await expect(page.getByTestId('drill-msg')).toContainText('已經加入過了')

  // 數字・量詞：從訊息的連結直接去練，題型已經選好
  await page.getByTestId('drill-msg').getByRole('link', { name: '去練習' }).click()
  await expect(page.getByTestId('mode-counter')).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: /10 題/ }).click()
  await page.getByTestId('start-practice').click()
  await expect(page.getByTestId('option')).toHaveCount(4)
  await answerRound(page, (i) => i % 3 !== 0)
  await expect(page.getByTestId('result-score')).toBeVisible()

  // 首頁的單字庫卡片：按「練習」直接選好動詞變化題型
  await page.goto('/#/')
  await page.getByRole('button', { name: '練習 動詞變化' }).click()
  await expect(page.getByTestId('mode-conjugate')).toHaveAttribute('aria-checked', 'true')
  // 只留ない形
  for (const f of ['masu', 'te', 'ta', 'dict']) {
    const chip = page.getByTestId('form-' + f)
    if ((await chip.getAttribute('aria-pressed')) === 'true') await chip.click()
  }
  await expect(page.getByTestId('form-nai')).toHaveAttribute('aria-pressed', 'true')
  // 最後一個不能取消
  await page.getByTestId('form-nai').click()
  await expect(page.getByTestId('form-nai')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('start-practice').click()
  await expect(page.getByTestId('practice-runner')).toContainText('→ ない形')
  await page.locator('[data-testid=option][data-correct=true]').click()
  await expect(page.getByTestId('explain')).toContainText('ない')

  // 勾選會記住
  await page.goto('/#/')
  await page.goto('/#/practice?mode=conjugate')
  await expect(page.getByTestId('form-te')).toHaveAttribute('aria-pressed', 'false')

  // 形容詞變化
  await page.goto('/#/')
  await page.goto('/#/practice?mode=adjective')
  await expect(page.getByTestId('mode-adjective')).toContainText(/\d{2}/)
  await page.getByTestId('start-practice').click()
  await expect(page.getByTestId('option')).toHaveCount(4)

  // 講解頁：動詞轉換器一次列出全部變化、形容詞轉換器、量詞表
  await page.goto('/#/learn')
  await page.getByTestId('te-input').pressSequentially('kakimasu')
  await expect(page.getByTestId('te-result')).toContainText('かかない')
  await expect(page.getByTestId('te-result')).toContainText('かいた')
  await expect(page.getByTestId('te-result')).toContainText('かく')
  await page.getByTestId('adj-input').pressSequentially('kirei')
  await expect(page.getByTestId('adj-result')).toContainText('きれいじゃない')
  await page.getByTestId('adj-input').fill('')
  await page.getByTestId('adj-input').pressSequentially('ii')
  await expect(page.getByTestId('adj-result')).toContainText('よくない')
  await page.getByTestId('counter-hon').locator('summary').click()
  await expect(page.getByTestId('counter-hon')).toContainText('ろっぽん')
})
