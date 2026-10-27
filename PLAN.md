# 日文單字練習 App — 實作計畫

## 架構總覽

```
React (Vite + TS + Tailwind v4) ── HashRouter（GitHub Pages 友善）
   │
   ├─ src/lib/        純邏輯（無 DOM，全部有 Vitest 單元測試）
   │    kana.ts         假名正規化、長音/促音/濁音/拗音轉換、羅馬拼音
   │    distractors.ts  N5 陷阱干擾選項產生器
   │    errorTypes.ts   錯誤類型歸類
   │    srs.ts          FSRS-4.5 排程 + 考試日期調整
   │    importer.ts     CSV / XLSX / JSON 解析、欄位自動對應、重複偵測
   │    questions.ts    各題型出題（四選一 / 打字 / 聽音 / 例句填空）
   │    stats.ts        連續天數、熱力圖、正確率、熟練度、錯題本計算
   │    dates.ts        本地日期工具
   │
   ├─ src/db/         Dexie (IndexedDB) — offline-first
   │    schema.ts       資料表定義
   │    repo.ts         所有寫入都經過這裡：自動補 updated_at、_dirty 旗標
   │    backup.ts       全部資料匯出/還原（單一 JSON）
   │    demo.ts         內建 30 筆示範單字庫
   │
   ├─ src/sync/       同步層（抽象化）
   │    types.ts        SyncBackend 介面
   │    mock.ts         MockBackend（記憶體 or HTTP 模擬雲端）
   │    supabase.ts     SupabaseBackend（magic link / Google）
   │    engine.ts       push dirty → pull since cursor → LWW 合併；離線重試
   │    merge.ts        衝突合併規則（純函式，有單元測試）
   │
   └─ src/pages/      首頁、單字庫、練習、模擬考、錯題本、統計、單字列表、匯入、設定
```

## 資料模型（Dexie / Supabase 共用欄位）

所有同步資料表共通欄位：`id (UUID)`、`updated_at (ISO 字串)`、`deleted (軟刪除)`；
本機另有 `_dirty`（1 = 待上傳），上傳前移除。

| 表 | 主要欄位 |
|---|---|
| words | kanji, reading, pos, meaning, example, exampleTranslation, tags[], favorite, note |
| decks | name, color, icon, examDate?, dailyNewLimit, sortOrder |
| deckEntries | deckId, wordId, page?, lesson?, order |
| cards | deckId, wordId, state(new/learning/review/relearning), due, stability, difficulty, reps, lapses, lastReview, scheduledDays |
| reviewLogs | cardId, deckId, wordId, mode, prompt, answer, chosen, options[], correct, errorType, rating, durationMs, reviewedAt, source(practice/exam) — 只新增 |
| settings | id='settings'：dailyGoal, ttsEnabled, ttsRate, theme |

- Word 以「漢字＋讀音」決定性 UUID v5 產生 id → 不同裝置匯入同一單字會得到同一 id，同步不會重複。
  使用者選「另存」時才用隨機 UUID。
- DeckEntry / Card 的 id 由 (deckId, wordId) 決定性產生 → 同庫同字不會重複，兩庫各自一張 Card。
- 錯題本、正確率、熱力圖全部由 reviewLogs 推算（只新增的紀錄在同步時最安全）。

## 同步規則
- 寫入一律先寫 IndexedDB 並標 `_dirty=1`；背景 debounce 上傳；`online` 事件與定時退避重試。
- 拉取以伺服器端 `synced_at`（Supabase trigger / Mock 遞增序號）當游標，避免裝置時鐘誤差影響游標。
- 合併：updated_at 較新者勝；reviewLogs 依 id 聯集；刪除為軟刪除。
- Supabase 端 trigger 拒絕較舊的 updated_at 覆寫較新的資料。
- 第一次登入：本機與雲端皆有資料 → 詢問「合併」或「以雲端為準」。

## 實作階段（每階段：測試全過 → git commit）
1. 專案骨架、PLAN.md、QUESTIONS.md、工具鏈（Vite/Tailwind/Vitest/Playwright）
2. 核心邏輯：kana、干擾選項、錯誤類型、FSRS（含單元測試）
3. 資料層：Dexie schema、repo、示範資料、匯入解析＋重複偵測、備份還原（含 fake-indexeddb 測試）
4. 同步層：介面、Mock、Supabase、引擎、合併（含測試）＋ schema.sql
5. UI：首頁、單字庫管理、練習（6 題型）、模擬考、錯題本、統計、單字列表、匯入、設定、同步狀態
6. Python 匯入腳本（PDF / Word）＋實際跑 data/ 檔案
7. E2E（Chromium + WebKit）＋截圖檢查（桌機/手機 × 淺色/深色）
8. PWA、GitHub Actions 部署、README、晨間報告
