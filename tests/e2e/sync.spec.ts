import { test, expect, type Page } from '@playwright/test'
import { answerRound, login, openApp, startPractice, waitSynced } from './helpers'

const total = async (page: Page) => {
  await page.goto('/#/stats')
  return Number(await page.getByTestId('stats-total').textContent())
}

test('兩個瀏覽器登入同一帳號：A 作答後 B 同步就看到；兩邊離線各自作答，連線後正確合併', async ({ browser, request }) => {
  await request.post('http://localhost:8787/reset')
  const email = `e2e-${Date.now()}@example.com`
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const A = await ctxA.newPage()
  const B = await ctxB.newPage()

  // A 登入（雲端是空的 → 上傳本機資料）並作答一輪
  await openApp(A)
  await expect(A.getByTestId('sync-badge')).toHaveAttribute('data-status', 'signed-out')
  await login(A, email)
  await waitSynced(A)
  await startPractice(A, { count: 10 })
  const n1 = await answerRound(A, (i) => i !== 0)
  await waitSynced(A)

  // B 登入同一帳號（本機只有示範資料 → 以雲端為準），看到 A 的作答
  await openApp(B)
  await login(B, email)
  await waitSynced(B)
  expect(await total(B)).toBe(n1)
  await B.goto('/#/mistakes')
  await expect(B.getByTestId('mistake-count')).toHaveText('共 1 題')

  // 兩邊都離線、各自作答
  await ctxA.setOffline(true)
  await ctxB.setOffline(true)
  await startPractice(A, { count: 10 })
  const n2 = await answerRound(A, () => true)
  await startPractice(B, { count: 10 })
  const n3 = await answerRound(B, () => false)
  for (const p of [A, B]) {
    await expect(p.getByTestId('sync-badge')).toHaveAttribute('data-status', 'offline', { timeout: 20_000 })
    await expect(p.getByTestId('sync-badge')).toContainText('待上傳')
  }

  // 恢復連線 → 自動重試同步
  await ctxA.setOffline(false)
  await ctxB.setOffline(false)
  await waitSynced(A)
  await waitSynced(B)
  // 讓先同步完的一方再拉一次另一方的資料
  for (const p of [A, B]) {
    await p.getByTestId('sync-badge').click()
    await p.getByTestId('sync-now').click()
    await p.keyboard.press('Escape')
    await waitSynced(p)
  }

  const expected = n1 + n2 + n3
  expect(await total(A)).toBe(expected)
  expect(await total(B)).toBe(expected)
  // 兩邊的卡片進度完全一致
  const snap = (p: Page) => p.evaluate(async () => {
    const db = (window as any).__app.db
    const cards = await db.cards.toArray()
    return cards.map((c: any) => `${c.id}:${c.state}:${c.reps}:${c.updated_at}`).sort().join('|')
  })
  expect(await snap(A)).toBe(await snap(B))
  await ctxA.close()
  await ctxB.close()
})

test('用信中的驗證碼登入（安裝成 App 時用這個）；Google 按鈕沒設定時不顯示', async ({ page, request }) => {
  await request.post('http://localhost:8787/reset')
  await openApp(page)
  await page.getByTestId('sync-badge').click()
  await expect(page.getByRole('button', { name: '使用 Google 登入' })).toHaveCount(0)
  const email = `ipad+code-${Date.now()}@example.com`
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: '寄送登入信' }).click()
  const code = page.getByTestId('login-code')
  await expect(code).toBeVisible()
  await code.fill('000000')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await expect(page.getByText('驗證碼錯誤或已過期')).toBeVisible()
  await code.fill('123 456')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await expect(page.getByTestId('user-email')).toHaveText(email)
})

test('在瀏覽器登入後設定密碼，另一台裝置（例如 iPad 的 App）用密碼登入', async ({ browser, request }) => {
  await request.post('http://localhost:8787/reset')
  const email = `pw-${Date.now()}@example.com`
  const A = await (await browser.newContext()).newPage()
  await openApp(A)
  await login(A, email)
  await A.getByTestId('sync-badge').click()
  await A.getByLabel('設定密碼').fill('sakura2026')
  await A.getByRole('button', { name: '設定密碼' }).click()
  await expect(A.getByText('密碼已設定')).toBeVisible()

  const B = await (await browser.newContext()).newPage()
  await openApp(B)
  await B.getByTestId('sync-badge').click()
  await B.getByRole('radio', { name: '密碼登入' }).click()
  await B.getByLabel('Email').fill(email)
  await B.getByLabel('密碼', { exact: true }).fill('wrong-pass')
  await B.getByRole('button', { name: '登入', exact: true }).click()
  await expect(B.getByText('Email 或密碼錯誤')).toBeVisible()
  await B.getByLabel('密碼', { exact: true }).fill('sakura2026')
  await B.getByRole('button', { name: '登入', exact: true }).click()
  await expect(B.getByTestId('user-email')).toHaveText(email)
})
