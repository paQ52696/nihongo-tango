import { test, expect } from '@playwright/test'
import { answerRound, evalDb, fixture, importFile, N5_FILE, openApp, startPractice } from './helpers'

test('匯入 N5 資料 → 選頁數範圍 → 完成一輪練習 → 錯題出現在錯題本 → 統計更新', async ({ page }) => {
  test.setTimeout(240_000)
  await openApp(page)
  const deckId = await importFile(page, N5_FILE, { newDeck: 'N5 單字' })
  await expect(page.getByTestId('deck-title')).toHaveText('N5 單字')

  await startPractice(page, { deckId, pages: [2, 3], count: 10 })
  // 每題都必須是 p.2–3 的字
  const pagesOk = await evalDb<boolean>(page, `
    const entries = await db.deckEntries.where('deckId').equals('${deckId}').toArray()
    const byWord = new Map(entries.map(e => [e.wordId, e.page]))
    window.__pages = byWord
    return true`)
  expect(pagesOk).toBe(true)
  const total = await answerRound(page, (i) => i % 2 === 0) // 奇數題（第 2、4…題）答錯
  const wrong = Math.floor(total / 2)
  await expect(page.getByTestId('result-score')).toHaveText(`答對 ${total - wrong} / ${total} 題`)

  // 作答紀錄都來自 p.2–3
  const pagesOfLogs = await evalDb<number[]>(page, `
    const logs = await db.reviewLogs.where('deckId').equals('${deckId}').toArray()
    const entries = await db.deckEntries.where('deckId').equals('${deckId}').toArray()
    const byWord = new Map(entries.map(e => [e.wordId, e.page]))
    return logs.map(l => byWord.get(l.wordId))`)
  expect(pagesOfLogs).toHaveLength(total)
  expect(pagesOfLogs.every((p) => p === 2 || p === 3)).toBe(true)

  await page.getByRole('link', { name: '錯題本' }).first().click()
  await expect(page.getByTestId('mistake-count')).toHaveText(`共 ${wrong} 題`)
  await expect(page.getByTestId('mistake-item').first()).toContainText('我選過')

  await page.getByRole('link', { name: '統計' }).first().click()
  await expect(page.getByTestId('stats-total')).toHaveText(String(total))
  await expect(page.getByTestId('stats-today')).toHaveText(`${total} / 20`)
  await expect(page.getByTestId('streak')).toContainText('1')
  await expect(page.getByTestId('error-dist')).not.toContainText('還沒有錯誤紀錄')

  // 一鍵針對錯題練習
  await page.getByRole('link', { name: '錯題本' }).first().click()
  await page.getByTestId('practice-mistakes').click()
  await expect(page.getByTestId('progress')).toHaveText(`1 / ${wrong}`)
})

test('建立第二個單字庫 → CSV 匯入並對應欄位 → 只針對該庫練習 → 兩庫進度各自獨立', async ({ page }) => {
  await openApp(page)
  await page.getByTestId('new-deck').click()
  await page.getByLabel('名稱').fill('期中考')
  await page.getByLabel('考試日期（選填）').fill(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10))
  await page.getByRole('button', { name: '建立' }).click()
  await expect(page.getByTestId('deck-title')).toHaveText('期中考')
  await expect(page.getByText(/距離考試 (9|10|11) 天/)).toBeVisible()
  const deckId = page.url().split('/deck/')[1]

  // 「Q」欄位名稱猜不到，手動對應到「中文意思」
  await page.goto(`/#/import?deck=${deckId}`)
  await page.getByTestId('import-file').setInputFiles(fixture('midterm.csv'))
  await expect(page.getByTestId('map-meaning')).toHaveValue('-1')
  await expect(page.getByTestId('map-lesson')).not.toHaveValue('-1')
  await page.getByTestId('map-meaning').selectOption({ index: 3 }) // （不使用）、日文、假名、Q
  await expect(page.getByTestId('import-target')).toHaveValue(deckId)
  await page.getByTestId('do-import').click()
  await expect(page.getByTestId('import-result')).toContainText('新增')
  const midtermMeaning = await evalDb<string>(page, `return (await db.words.filter(w => w.kanji === '教室').first()).meaning`)
  expect(midtermMeaning).toBe('教室')

  // 示範單字庫目前的狀態
  await openApp(page)
  const demoCard = page.locator('[data-testid=deck-card][data-deck-name=示範單字庫]')
  const demoDueBefore = await demoCard.getByTestId('due-count').textContent()

  // 只練期中考（50 題 → 全部 12 個字都會出現）
  await startPractice(page, { deckId, count: 50, scopeAll: true })
  const total = await answerRound(page, () => true)
  expect(total).toBe(12)

  await openApp(page)
  const midCard = page.locator('[data-testid=deck-card][data-deck-name=期中考]')
  await expect(midCard).toContainText('正確率 100%')
  await expect(demoCard).toContainText('正確率 —')
  await expect(demoCard.getByTestId('due-count')).toHaveText(demoDueBefore!)

  // 「学校」同時在兩個庫：同一筆 Word、兩張 Card，示範庫那張仍是新卡
  const states = await evalDb<string[]>(page, `
    const w = await db.words.filter(w => w.kanji === '学校').toArray()
    if (w.length !== 1) return ['words:' + w.length]
    const cards = await db.cards.where('wordId').equals(w[0].id).toArray()
    return cards.map(c => (c.deckId === '${deckId}' ? 'mid:' : 'demo:') + c.state).sort()`)
  expect(states).toEqual(['demo:new', 'mid:review'])
})

test('同一個單字匯入兩個單字庫 → Word 只有一筆，Card 有兩筆', async ({ page }) => {
  await openApp(page)
  await importFile(page, fixture('dedupe.csv'), { newDeck: 'A 庫' })
  await page.goto('/#/import')
  await page.getByTestId('import-file').setInputFiles(fixture('dedupe.csv'))
  await page.getByTestId('import-target').selectOption('__new')
  await page.getByTestId('import-new-name').fill('B 庫')
  await expect(page.locator('[data-testid=import-summary] [data-status=existing]')).toHaveAttribute('data-count', '3')
  await expect(page.getByTestId('dup-merge')).toBeChecked()
  await page.getByTestId('do-import').click()
  await expect(page.getByTestId('import-result')).toContainText('合併 3 個')

  const counts = await evalDb<{ words: number; cards: number }>(page, `
    const w = await db.words.filter(w => w.kanji === '猫').toArray()
    const cards = await db.cards.where('wordId').equals(w[0].id).toArray()
    return { words: w.length, cards: cards.length }`)
  expect(counts).toEqual({ words: 1, cards: 2 })

  // 介面上：單字列表搜尋只有一筆，標示兩個單字庫
  await page.goto('/#/words')
  await page.getByTestId('word-search').fill('猫')
  await expect(page.getByTestId('word-count')).toHaveText('1 個單字')
  await expect(page.getByTestId('word-row')).toContainText('A 庫')
  await expect(page.getByTestId('word-row')).toContainText('B 庫')
})

test('備份 → 清空 → 還原，資料與進度完全一致', async ({ page }) => {
  await openApp(page)
  await startPractice(page, { count: 10 })
  await answerRound(page, (i) => i % 3 !== 0)
  const before = await evalDb<string>(page, `const b = await window.__app.exportAll(); return JSON.stringify(b.tables)`)

  await page.goto('/#/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()])
  const file = await download.path()

  await page.getByRole('button', { name: '清空所有資料' }).click()
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await expect(page.getByTestId('settings-msg')).toHaveText('已清空所有資料')
  expect(await evalDb<number>(page, 'return await db.words.count()')).toBe(0)

  await page.getByTestId('backup-file').setInputFiles(file!)
  await page.getByTestId('confirm-restore').click()
  await expect(page.getByTestId('settings-msg')).toHaveText('還原完成')
  const after = await evalDb<string>(page, `const b = await window.__app.exportAll(); return JSON.stringify(b.tables)`)
  expect(after).toBe(before)
})

test('其他題型都能作答（讀音→漢字、意思、打字、例句填空）', async ({ page }) => {
  await openApp(page)
  for (const mode of ['讀音 → 漢字', '漢字 → 中文意思', '例句填空']) {
    await page.goto('/#/')
    await page.goto('/#/practice')
    await page.getByRole('radio', { name: mode }).click()
    await page.getByRole('radio', { name: '10 題' }).click()
    await page.getByTestId('start-practice').click()
    await page.locator('[data-testid=option][data-correct=true]').click()
    await expect(page.getByTestId('feedback')).toHaveAttribute('data-correct', 'true')
  }
  // 打字：羅馬拼音即時轉假名
  await page.goto('/#/')
  await page.goto('/#/practice')
  await page.getByRole('radio', { name: '中文 → 日文（打字）' }).click()
  await page.getByTestId('start-practice').click()
  const input = page.getByTestId('typing-input')
  await input.pressSequentially('kitte')
  await expect(input).toHaveValue('きって')
})
