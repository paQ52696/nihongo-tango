# ☀️ 晨間報告（2026-10-28）

## 1. 完成了什麼、測試結果

**全部功能都做完了**，可以 `npm install && npm run dev` 直接用。

| 項目 | 結果 |
|---|---|
| `npm test`（Vitest 單元測試） | ✅ 112 / 112 通過：假名轉換、干擾選項（36 項）、錯誤類型歸類、FSRS（含邊界情況）、考試日期調整、匯入解析（CSV／Excel／JSON／Big5）、重複偵測、備份還原、同步合併、兩台裝置離線合併 |
| Python 腳本測試 | ✅ 6 / 6 通過 |
| E2E（Playwright） | ✅ Chromium 13 / 13、WebKit 9 / 9 通過；4 個刻意略過（見下） |
| 截圖檢查 | ✅ 16 個畫面 × 桌機／手機 × 淺色／深色（Chromium）＋ WebKit 手機，自動檢查沒有水平捲軸；我逐張看過並修了 8 個排版問題 |
| `npm run build` | ✅ 成功；PWA manifest、Service Worker、圖示齊全，斷網重新整理仍可使用（Chromium 驗證） |
| 實際匯入 `data/` | ✅ **N5 PDF：535 筆成功、0 筆失敗、0 筆欄位缺漏**（78 筆沒有漢字表記，是外來語／習慣寫假名的字，正常）。期中考檔案：**找不到**（見問題 1） |
| 備份 → 清空 → 還原 | ✅ 單元測試與 E2E 都驗證資料完全一致 |

E2E 涵蓋完成標準要求的全部流程：
- 匯入 N5 → 選 p.2–3 → 練完一輪（滑鼠＋鍵盤）→ 錯題進錯題本 → 統計更新 → 一鍵練錯題
- 建立「期中考」庫 → CSV 匯入並手動對應「Q」欄 → 只練該庫 → 兩庫進度獨立（同一個「学校」：示範庫那張還是新卡、期中考那張已複習）
- 同一個字匯入兩庫 → Word 1 筆、Card 2 筆
- 兩個瀏覽器登入同一帳號（MockBackend）→ A 作答 B 看得到 → 兩邊斷線各自作答 → 連線後合併，兩邊卡片進度逐筆一致

**刻意略過的 4 個**：WebKit 的 Service Worker 離線重新整理（Playwright 的 WebKit 不支援 Service Worker）；截圖在 WebKit 只跑手機淺色（其餘 3 種組合由 Chromium 涵蓋）。

Git：6 個 commit，在 `main` 分支，**還沒 push**（也沒有設定 remote）。

---

## 2. 需要你回答的問題（括號內是我先用的預設）

> **2026-10-28 你的回覆**：問題 1 → 目前還沒有期中考檔案，之後自行匯入。問題 2 → 頁碼就是 PDF 的頁數（PDF 上沒有另外印頁碼），維持 p.1–16，不需要 `--page-offset`。其餘維持預設。

1. ✅（已回覆）**期中考單字庫在哪？** 專案的 `data/` 原本是空的。我在你的「下載」資料夾找到 `N5單字表總整理學生版(new)pdf版 (1).pdf`，**複製**（沒有移動）到 `data/n5.pdf`；但找不到期中考的檔案。
   → 預設：寫了通用的 `scripts/convert_doc.py`（Word／PDF → CSV，會自動抓「第3課」當課次），CSV／Excel 可直接在 App 匯入。把檔案放進 `data/` 告訴我格式，我再針對它調整。
2. ✅（已回覆）**「p.12–15」是 PDF 的第幾頁，還是紙本上印的頁碼？**（預設：PDF 頁數 1–16，PDF 上沒有印頁碼）
   → 要改：`python scripts/import_pdf.py data/n5.pdf -o data/out/n5.json --page-offset 11`（PDF 第 1 頁 = p.12）
3. **詞性**：PDF 沒有詞性欄，我用規則推測（`(自V)`→動詞、`（な）`→な形容詞、送假名…），535 筆中 531 筆是推測的；只寫假名的動詞（例如「なる」）會被判成名詞。（預設：照推測匯入，報告在 `data/out/n5.report.md`）
   → 要改：`scripts/import_pdf.py` 的 `guess_pos()`，或在 App 單字頁手動改。
4. **例句翻譯**：PDF 沒有這欄，全部留空。（預設：留空）
5. **「已熟練」的門檻**（預設：複習間隔穩定度 ≥ 10 天）→ `src/lib/srs.ts` 的 `MASTERED_STABILITY`
6. **錯題本移出條件**（預設：照你說的連續答對 3 次）→ `src/lib/stats.ts` 的 `MISTAKE_CLEAR_STREAK`
7. **模擬考**（預設：25 題、20 分鐘；答錯的卡排入「重來」，答對不改變排程）→ `src/pages/ExamPage.tsx` 的 `EXAM_SIZE`、`EXAM_MINUTES`
8. **練習限時**（預設：每題 20 秒，時間到算答錯）→ `src/components/PracticeRunner.tsx` 的 `TIME_LIMIT`
9. **預設值**：每日目標 20 題、每庫每日新卡 20 張（都可在 App 裡改）→ `src/db/repo.ts` 的 `DEFAULT_SETTINGS`、`createDeck`
10. **考試日期怎麼提高複習量**（預設：考前 30／14／7／3 天把期望記憶率從 90% 提高到 92／93／95／97%；間隔不超過剩餘天數的一半；新卡數提高到「考前 2 天學完」，上限 200）→ `src/lib/srs.ts` 的 `examAdjust()`
11. **作答後的按鍵**：作答後 `1`–`4` 是自評（重來／困難／良好／簡單），`Enter` = 預設（答對＝良好、答錯＝重來）。連按兩下數字可能誤評。（預設：保留這個 Anki 式設計）→ `PracticeRunner.tsx` 的 `onKey`
12. **匯入時的「合併／另存」是整批一起選**，不是逐筆選。（預設：整批，預設合併）→ `src/pages/ImportPage.tsx`；`importDrafts()` 已經支援逐筆決定
13. **網址用 `#/`（HashRouter）**，因為 GitHub Pages 不支援 SPA 路由重新整理。（預設：HashRouter）
14. **深色模式設定不同步**（每台裝置各自跟隨系統），其餘設定（每日目標、語速）會同步。
15. **`data/` 不進 git**：你的 PDF 有版權，repo 若是公開的就會被散布。（預設：`.gitignore` 排除 `data/`，只留說明檔）
16. **Git 作者**：repo 內設定 `user.name = ssuuyyzzx`、`user.email = ssuuyyzzx@gmail.com`（從你的帳號 email 推得）；第一個 commit 的作者是「Claude」。要改名字：`git config user.name "你的名字"`。

---

## 3. 需要你親手做的步驟（照順序）

> 詳細圖文步驟在 README 第 6、7 節。

**待你處理**
1. ✅ ~~把這個專案移到你想放的資料夾~~：已移到 `C:\Users\Me\Downloads\JP APP`
2. ✅ ~~建立 Supabase 專案~~
3. ⚠️ **建表：請再跑一次 `supabase/schema.sql`**：6 個資料表都建好了，但新版 Supabase 專案預設不開放新資料表給 API，登入後同步會被拒絕（`permission denied`）。schema.sql 已補上授權（`grant ... to authenticated`），可以重複執行：SQL Editor → 貼上整份 → Run
4. ✅ ~~填金鑰~~：`.env` 已填好（publishable key），確認不會進 git，打包後也確實切換成 Supabase 同步
5. **設定登入導回網址**：Authentication → URL Configuration → Redirect URLs 加 `http://localhost:5173/`（部署後再加 GitHub Pages 網址）
6. **本機試登入**：`npm run dev` → 右上角「未登入」→ 輸入 Email → 用同一個瀏覽器開信中連結
7. **建立 GitHub repo**（例如 `nihongo-tango`）
8. **push**：
   ```bash
   git remote add origin https://github.com/<帳號>/nihongo-tango.git
   git push -u origin main
   ```
9. **開 Pages**：repo → Settings → Pages → Source 選「GitHub Actions」
10. **加 Secrets**：Settings → Secrets and variables → Actions → 新增 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` → 到 Actions 頁重跑一次 workflow
11. **把 `https://<帳號>.github.io/nihongo-tango/` 加進 Supabase 的 Site URL／Redirect URLs**
12. **在每台裝置**開網站 → 安裝成 App（README 第 8 節）→ 登入同一個 Email → 到「匯入」頁匯入 `data/out/n5.json`（只要在一台匯入，其他台同步就有）
13. （選用）Google 登入：Supabase → Authentication → Providers → Google

---

## 4. 已知限制與建議的下一步

**沒能驗證的部分（請你實際試一下）**
- **SupabaseBackend 沒有對真的 Supabase 跑過**：沒有金鑰，同步邏輯是用 MockBackend（伺服器規則與 schema.sql 的 trigger 相同）測試的；`schema.sql` 也還沒在真的 Postgres 執行過。第一次登入若有錯，錯誤訊息會顯示在右上角同步面板。
- **真的 Safari／iPhone 沒測過**：只用 Playwright 的 WebKit（Windows 版）測。發音（Web Speech）在 Playwright 裡沒有語音，只測到介面；iOS 第一次發音需要先點播放鈕。
- WebKit 的 Service Worker 離線重新整理只在 Chromium 驗證（Playwright 限制）。

**已知限制**
- Windows 版 WebKit 的 IndexedDB 每個請求約 15ms，匯入 535 筆要約 25 秒（只影響測試環境；Chromium 不到 1 秒）。若 iPhone 上也很慢，可改成分批匯入並顯示進度條。
- 打包後主程式約 880 KB（SheetJS 佔一半），可改成進匯入頁才載入。
- 干擾選項的「音訓混淆」只用內建約 350 個 N5 漢字讀音表＋從單字庫學到的讀法；熟字訓（今日、大人）不產生這類陷阱。
- 「聽音選字」的音質取決於作業系統內建的日文語音。
- Email 登入用 PKCE：登入信要在發出請求的同一個瀏覽器打開。

**建議的下一步**
1. 拿到期中考檔案後，針對它的格式調整 `convert_doc.py`
2. 在真的 Supabase 上跑一次兩台裝置同步
3. 補上例句翻譯（可以在單字頁編輯，或之後做批次翻譯）
4. 匯入進度條、單字表分頁效能（目前一次載入全部資料，幾千字內沒問題）
