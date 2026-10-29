# 🌸 日文單字練習（N5＋期中考）

看漢字選讀音、間隔重複（FSRS）、錯題本、模擬考、學習統計。完全離線可用，可安裝成 App，並透過 Supabase 在 Windows、Mac、手機之間同步進度。

- 技術：Vite + React + TypeScript + Tailwind、Dexie（IndexedDB）、PWA、Supabase、GitHub Pages
- 測試：Vitest（112 個單元測試）、Playwright E2E（Chromium + WebKit）、Python unittest

---

## 目錄

1. [安裝與啟動](#1-安裝與啟動)
2. [匯入單字（PDF／Word／CSV／Excel／JSON）](#2-匯入單字)
3. [管理單字庫](#3-管理單字庫)
4. [功能說明](#4-功能說明)
5. [資料備份與還原](#5-資料備份與還原)
6. [從零建立 Supabase（跨裝置同步）](#6-從零建立-supabase跨裝置同步)
7. [部署到 GitHub Pages](#7-部署到-github-pages)
8. [安裝成 App、Safari 注意事項](#8-安裝成-appsafari-注意事項)
9. [開發與測試](#9-開發與測試)

---

## 1. 安裝與啟動

需要：[Node.js](https://nodejs.org/) 22 以上；要轉 PDF／Word 的話再裝 [Python](https://www.python.org/) 3.10 以上。

```bash
npm install
npm run dev
```

打開 <http://localhost:5173>。第一次開啟會自動建立一個約 30 個字的「示範單字庫」，可以先試用所有功能。

```bash
npm run build      # 打包成靜態網站到 dist/
npm run preview    # 預覽打包結果（含離線功能）
```

沒有設定 Supabase 金鑰時，App 自動以「**僅本機模式**」運作：所有功能都能用，資料存在這個瀏覽器的 IndexedDB 裡。

---

## 2. 匯入單字

### 2-1. 日檢 N5 單字總整理 PDF

把 PDF 放在 `data/`（例如 `data/n5.pdf`），然後：

```bash
pip install pdfplumber
python scripts/import_pdf.py data/n5.pdf -o data/out/n5.json
```

- 輸出 `data/out/n5.json`（每筆：漢字、讀音、詞性、中文意思、例句、例句翻譯、頁碼、標籤、備註）
- 同時輸出報告 `data/out/n5.report.md`：解析失敗的列、欄位缺漏、詞性推測統計，方便你手動修正
- 只轉部分頁：`--pages 12-15`
- 頁碼＝PDF 的第幾頁（這份 PDF 每頁約 35 個字，共 16 頁）；如果你的紙本頁碼不同，加 `--page-offset 11` 表示 PDF 第 1 頁＝紙本 p.12

這份 PDF 的版面是「編號｜讀音｜漢字｜中文｜例句」五欄表格，**沒有詞性和例句翻譯欄**：詞性用規則推測（`開く(自V)` → 動詞、`（な）` → な形容詞……），例句翻譯留空。可以之後在 App 的「單字」頁修改。

接著到 App 的 **匯入** 頁，選 `n5.json` → 建立新單字庫（例如「N5」）→ 確認欄位對應 → 匯入。

### 2-2. 期中考單字（Word／PDF）

```bash
pip install python-docx pdfplumber
python scripts/convert_doc.py data/期中考.docx -o data/out/midterm.csv
```

- 會讀 Word 裡的表格；沒有表格就讀段落（用 Tab、兩個以上空白或「｜」分欄）
- 單獨一行的「第3課」「Lesson 3」會自動變成之後每個字的「課次」
- 輸出的 CSV 再到 App 匯入，在「欄位對應」指定哪一欄是漢字、讀音、意思
- `.doc`（舊版 Word）請先用 Word 另存成 `.docx`

### 2-3. CSV／Excel／JSON（App 內直接匯入）

1. **匯入** 頁 → 選擇檔案（CSV 支援 UTF-8 與 Big5，台灣版 Excel 存的 CSV 也可以）
2. 選要匯入到哪個單字庫，或當場建立新庫
3. **欄位對應**：App 會依欄位名稱自動猜（漢字／讀音／意思／詞性／例句／頁碼／課次／標籤），猜錯就手動改
4. **預覽**：會標示「新單字」「已存在（其他單字庫）」「已在此庫」「檔案內重複」「缺讀音」
5. 已存在的單字（漢字＋讀音相同）可以選：
   - **合併**（預設）：共用同一筆單字資料，兩個單字庫的進度各自獨立
   - **另存**：建立一筆新的單字資料

第一列必須是欄位名稱。範例：

```csv
漢字,讀音,意思,課次,標籤
学校,がっこう,學校,第1課,名詞
切手,きって,郵票,第2課,易錯
```

### 2-4. 匯出

單字庫頁 → **匯出 CSV**（Excel 可直接開）或 **匯出 JSON**（可再匯入）。

### 2-5. 單字發音音檔（VOICEVOX）

單字發音優先播放事先產生好的 VOICEVOX 音檔（預設聲音：**VOICEVOX:四国めたん**），所有裝置、瀏覽器聽到的都一樣，不需要裝置有日文語音；沒有音檔的字才改用瀏覽器語音。

1. 打開 [VOICEVOX](https://voicevox.hiroshiba.jp/)（讓引擎在 `http://127.0.0.1:50021` 執行）
2. 產生音檔（已產生過的會跳過，新增單字後重跑即可）：
   ```bash
   npm run gen-audio -- data/out/n5.json
   ```
   期中考等在 App 裡匯入的單字：先到「設定 → 匯出備份」，再 `npm run gen-audio -- 備份檔.json`
3. commit 並 push `public/audio/`，網站就會更新

- 換聲音：`--speaker 四国めたん --style あまあま --force`（`--force` 會全部重新產生）
- 腳本先用漢字讓 VOICEVOX 唸（重音較自然）；VOICEVOX 的讀法跟課本不同時（例如熟字訓），改用課本的假名讀音
- 使用 VOICEVOX 音聲須標示角色名稱，App 設定頁會顯示「VOICEVOX:四国めたん」

### 2-6. 課文句子（中翻日、日翻中、語順重組、助詞填空）

「匯入」頁選 CSV／Excel／JSON，內容類型選 **課文句子**（有「說話者」欄，或日文用 `|` 分文節時會自動判斷）：

```csv
課次,說話者,日文,讀音,中文
第16課,田中,毎朝|6時に|起きて、|ご飯を|食べます。,まいあさ|ろくじに|おきて、|ごはんを|たべます。,每天早上六點起床、吃飯。
```

- **日文**用 `|` 分出文節：語順重組的字卡、助詞填空的位置都從這裡來（沒有分的句子只能出中翻日／日翻中）
- **讀音**（選填）用同樣的分法：中翻日就能接受「毎朝」或「まいあさ」任一種寫法
- 同一課的句子依檔案順序排列，中翻日／日翻中會顯示「上一句」當對話提示
- 課本內容有版權：課文檔放在 `data/`（不進 git），只在 App 內匯入、存在自己的 Supabase 帳號

### 2-7. 內建文法題庫

「匯入」頁最下方「📘 內建文法題庫」→ **加入**，會建立「大家的日本語 第13–16課 文法」單字庫（16 個文法點、57 題）。每個文法點有說明、例句與 N5 形式的（　）選擇題、★ 排序題；說明與題目都是自行撰寫的（`src/data/grammar.ts`），不是課本內容。

### 2-8. 內建練習題庫（動詞變化、形容詞變化、數字・量詞）

「匯入」頁「內建練習題庫」→ **加入**，每個都會變成獨立的單字庫（有自己的複習排程與錯題本），從首頁按「練習」會直接選好對應題型：

| 題庫 | 內容 |
|---|---|
| 動詞變化 | N5 常用動詞 80 個（辭書形＋分組），練ます形、て形、ない形、た形、辭書形 |
| 形容詞變化 | い／な形容詞 33 個，練否定、過去、過去否定、て形、です體；包含 いい→よくない、きれい（な形容詞）這類陷阱 |
| 數字・時間・量詞 | 25 張卡：〜人、〜つ、〜本、〜杯、〜匹、〜枚、〜台、〜個、〜冊、〜回、〜階、〜歳、〜円、百、千・万、〜時、〜分、〜時間、日期、星期、〜月、〜か月、〜週間、〜年、〜番。每次隨機出一個數字問念法，特殊念法（ろっぽん、よっか、くじ）比較常出 |

資料在 `src/data/drills.ts`、`src/data/counters.ts`，念法全部逐一列出，「也算對」的說法（はっぽん／はちほん）不會被當成錯誤選項。

---

## 3. 管理單字庫

- **首頁** 卡片：今日待複習數、熟練度進度條、正確率、考試倒數；點「開始練習」直接複習今天到期的卡
- **新增**：首頁「＋ 新增單字庫」→ 名稱、顏色、圖示、考試日期（選填）、每日新卡上限
- **編輯／刪除**：單字庫頁 →「✎ 編輯」；「🗑 刪除單字庫」要在頁面上再按一次「確定刪除」
- **考試日期**：離考試越近，每日新卡數會自動提高（讓你在考前 2 天學完所有新字），複習間隔也會縮短，確保考前每張卡至少再複習一次
- **標籤**：單字頁勾選多個字 →「🏷 標籤」批次加上或移除
- **移動／複製**：單字頁勾選 →「複製到…」「移動到…」（新庫的進度從頭開始）
- 同一個字在兩個單字庫：單字資料只有一筆，兩庫的複習卡（進度）分開

---

## 4. 功能說明

### 練習（練習頁）
依序選：① 單字庫（可多選）② 範圍：全部／頁數範圍／課次章節／標籤／詞性／只練錯題／只練今天到期 ③ 題型、題數（10／20／50）、是否限時（每題 20 秒）

| 題型 | 說明 |
|---|---|
| 漢字 → 讀音 | **主要模式**，模仿 N5「看漢字選平假名」 |
| 讀音 → 漢字 | 同音字（暑い／熱い／厚い）不會同時出現在選項 |
| 漢字 → 中文意思 | |
| 中文 → 日文（打字） | 打羅馬拼音即時轉成平假名（kitte → きって），也接受漢字 |
| 聽音選字 | 播放 VOICEVOX 音檔（沒有音檔時用瀏覽器的日文語音）唸出讀音 |
| 例句填空 | 把例句中的目標單字挖空（活用形也找得到，例如 会いましょう） |
| 動詞變化 | 詞性是動詞的單字出「→ ます形／て形／ない形／た形／辭書形」（可勾選要練哪幾種），干擾選項是常見錯誤（かきて、みらない、あらない、かえりる）；答完顯示第幾類動詞與規則 |
| 形容詞變化 | 詞性是い／な形容詞的單字出否定、過去、過去否定、て形、です體（可勾選），干擾選項是い／な搞混（たかいじゃない、きれくない、いくない） |
| 中翻日（打字） | 課文句子：看中文打出課本原句；漢字或假名、空白、標點不計。不對時逐字標出漏掉（綠）與寫錯（紅），寫法不同可按「其實我寫對了」 |
| 日翻中 | 課文句子：先自己翻，再看參考翻譯自評（選「重來」＝翻錯，進錯題本） |
| 語順重組 | 課文句子：依序點選打亂的文節字卡（數字鍵也可以，Backspace 收回） |
| 助詞填空 | 課文句子：挖掉一個助詞選擇；に／へ 這種兩個都對的不會同時出現 |
| 文法題 | 內建文法題庫：（　）選擇題與 ★ 排序題，答完顯示文法說明 |
| 數字・時間・量詞 | 內建題庫：隨機出「6本」「4日」「9時」問念法，干擾選項是促音、清濁音、數字念法搞混（ろくほん、よんにち、きゅうじ） |

**干擾選項像真的考題**：優先產生 N5 常見陷阱——長音有無（おばさん／おばあさん、ここ／こうこう）、促音有無（きって／きて）、清濁音（はん／ばん／ぱん）、拗音大小寫（びょういん／びよういん）、同漢字的其他讀法（がっこう／がくこう、せんせい／せんしょう）；不夠時才用同詞性、字數相近的單字補。實測 N5 的 457 個漢字詞，約 84% 的干擾選項來自上述陷阱（陷阱不自然的字，例如 会う，才改用相近單字）。

答完會顯示正解、例句、錯誤類型，並自評 **重來／困難／良好／簡單**（按鈕上顯示下次複習間隔）。排程使用 FSRS-4.5。

**鍵盤**：`1`–`4` 選答案（作答後是自評）、`Enter` 下一題、`Space` 重播發音。

### 講解（講解頁）
動詞分組的判斷方法、て形變化規則與口訣（いちり って、みびに んで、き いて、ぎ いで、し して）、常見錯誤、**動詞變化轉換器**（輸入動詞看分組與全部變化形）、て形的用法、ない形・た形・辭書形、**形容詞變化**（表格、陷阱、轉換器）、**數字・時間・日期・量詞**念法表、第 13–16 課文法說明，以及「我的動詞表」（單字庫裡的動詞，可遮住て形／ない形／た形自我測驗）。說明都是自行撰寫的。

單字的詞性寫「動詞I／動詞II／動詞III」（課本的分組）時，ます形的單字也能出動詞變化題（ます形 → て形）。

### 錯題本
答錯自動收錄，**連續答對 3 次**才移出。可依單字庫篩選、依錯誤次數或最近答錯排序；顯示你當時選錯的選項與錯誤類型（漏長音、多加長音、漏促音、清濁音混淆、拗音大小寫、音訓混淆……），右側統計你最常犯哪一種錯。「針對錯題練習」一鍵出題。

### 模擬考
從選定範圍隨機 25 題「漢字 → 讀音」，限時 20 分鐘。交卷後顯示分數、每題解析（正解、我的答案、例句）、錯誤類型統計。答錯的卡會被排入複習。

### 統計
可切換全部／單一單字庫：連續學習天數、每日目標達成率、GitHub 式熱力圖、正確率趨勢、錯誤類型分布、**依頁碼／課次的熟練度**（未學／學習中／已熟練；點一段直接練那一段）。

### 設定
每日目標、發音開關與語速、出題時自動發音、深色模式（跟隨系統／淺色／深色）、帳號與同步、安裝成 App、備份還原。

---

## 5. 資料備份與還原

**設定 → 資料備份與還原**

- **匯出備份**：所有單字庫、單字、進度、作答紀錄、設定 → 一個 JSON 檔
- **從備份還原**：會先顯示檔案內容摘要，再按一次「確定還原」；目前裝置的資料會被清空並完整復原（已用自動測試驗證還原後與備份前完全一致）
- 沒有設定同步時，也可以用這個方式把資料搬到另一台電腦

---

## 6. 從零建立 Supabase（跨裝置同步）

1. 到 <https://supabase.com> 註冊（可用 GitHub 帳號），按 **New project**
   - Name：`nihongo-tango`（隨意）、Database Password：自己設一個並記下來、Region：**Northeast Asia (Tokyo)** 或 Singapore
2. 等專案建立完成（約 2 分鐘）
3. 左側 **SQL Editor** → **New query** → 把 [`supabase/schema.sql`](supabase/schema.sql) 整份貼上 → **Run**
   - 會建立 6 個資料表，並開啟 Row Level Security：每個人只能讀寫自己的資料
4. 左側 **Project Settings → API**（或 **Data API**），複製：
   - **Project URL**（`https://xxxx.supabase.co`）
   - **Publishable key**（`sb_publishable_...` 開頭；舊專案叫 **anon public**，`eyJ...` 開頭，兩種都可以。這個 key 本來就是公開給前端用的，安全性靠 RLS）
   - ⚠️ 不要用 **Secret key**／**service_role**，那個能繞過 RLS
5. 在專案根目錄複製 `.env.example` 為 `.env`，填入：
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```
   `.env` 已在 `.gitignore`，不會被 commit。
6. 左側 **Authentication → URL Configuration**：
   - **Site URL**：你的正式網址，例如 `https://<帳號>.github.io/<repo>/`
   - **Redirect URLs** 加上：`http://localhost:5173/`、`http://localhost:4173/`、`https://<帳號>.github.io/<repo>/`
7. 重新 `npm run dev`，右上角狀態會變成「未登入」→ 點它 → 輸入 Email →「寄送登入信」→ 用「**同一個瀏覽器**」打開信中的連結（使用 PKCE，安全性較高）
8. **安裝成 App 的裝置（iPhone／iPad 加入主畫面等）**：App 和瀏覽器的登入狀態不共用，信中連結會開到瀏覽器，所以 App 裡要用密碼登入：
   - 先在任一瀏覽器登入 → 右上角「帳號與同步」→「設定密碼」
   - 在 App 裡選「密碼登入」，輸入 Email 和密碼
   - （選用）設定自己的 SMTP 後，Supabase 才能編輯信件範本；在 **Magic link or OTP** 範本加 `{{ .Token }}`，信裡就會有驗證碼，可以在 App 裡輸入驗證碼登入
9. 在另一台裝置也登入同一個 Email。第一次登入時，若兩邊都有資料，會問你「合併」或「以雲端為準」

**Google 登入（選用，預設不顯示）**：Authentication → Providers → Google → 依畫面說明到 Google Cloud Console 建立 OAuth 用戶端，把 Client ID／Secret 填回 Supabase。設好後在 `.env` 和 GitHub Secrets 加 `VITE_GOOGLE_LOGIN=1`，「使用 Google 登入」按鈕才會出現。

**同步規則**：作答先寫本機，背景上傳；斷線時右上角顯示「離線、N 筆待上傳」，恢復連線自動重試。同一筆資料以較新的修改為準；作答紀錄只新增不修改，兩邊直接合併；刪除是軟刪除，會同步到其他裝置。

**還沒有金鑰也想試同步**：`npm run mock-cloud` 啟動模擬雲端，然後開 `http://localhost:5173/?mockSync=http://localhost:8787`，就能用兩個瀏覽器（例如 Chrome 和 Edge）測試同步。要關掉模擬雲端：在瀏覽器主控台執行 `localStorage.removeItem('mockSyncUrl')`。

---

## 7. 部署到 GitHub Pages

1. 在 GitHub 建立新的 repository（例如 `nihongo-tango`，Public 或 Private 皆可；Private 需要付費方案才能用 Pages）
2. 推上去：
   ```bash
   git remote add origin https://github.com/<帳號>/nihongo-tango.git
   git push -u origin main
   ```
3. repo → **Settings → Pages** → Source 選 **GitHub Actions**
4. repo → **Settings → Secrets and variables → Actions → New repository secret**，新增：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. 每次 push 到 `main`，[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 會自動跑單元測試、打包（base path 自動設為 `/<repo 名稱>/`）、部署。網址：`https://<帳號>.github.io/<repo 名稱>/`
6. 回到 Supabase 第 6 步，把這個網址加進 Site URL 與 Redirect URLs
7. **防止 Supabase 暫停**：免費專案一週沒有活動會自動暫停（同步失效，要到 Supabase 網站按 Restore）。[`.github/workflows/keepalive.yml`](.github/workflows/keepalive.yml) 每 3 天自動查詢一次資料庫，用的是第 4 步同一組 secrets，不用另外設定。到 repo 的 **Actions → Keep Supabase awake → Run workflow** 可以手動跑一次確認。
   > GitHub 會在 repo 60 天沒有任何 commit 時自動停用排程，並寄信通知；收到信後到 Actions 頁面按一下啟用即可。

> ⚠️ `data/` 資料夾已加入 `.gitignore`：你的 PDF 與轉出來的 JSON 有版權，不會被推到 GitHub。部署後在網站上用「匯入」頁匯入即可（登入後會同步到其他裝置）。

---

## 8. 安裝成 App、Safari 注意事項

| 裝置 | 安裝方式 |
|---|---|
| Windows / Mac 的 Chrome、Edge | 網址列右側的「安裝」圖示，或 設定頁 →「安裝到這台裝置」 |
| Mac Safari（macOS Sonoma 以上） | 選單「檔案」→「加入 Dock」 |
| iPhone / iPad | Safari 開網站 → 分享 →「加入主畫面」 |
| Android | Chrome 選單 →「安裝應用程式」 |

- **離線**：第一次開啟後，Service Worker 會快取整個 App；之後斷網也能開啟與練習，作答會在連線後同步
- **字型**：Noto Sans JP／TC 從 Google Fonts 載入並快取；第一次就離線開啟時會改用系統字型（Mac：Hiragino、Windows：Meiryo／微軟正黑體）
- **Safari 發音**：第一次播放需要使用者先點一下播放鈕（Safari 的自動播放限制），之後就能自動唸。沒有日文語音時，設定頁會顯示安裝方式；完全不支援語音的瀏覽器會停用「聽音選字」
- **Safari 儲存空間**：Safari 對「沒加入主畫面的網站」可能在 7 天沒開啟後清除資料；建議加入主畫面／Dock，並登入同步或定期備份

---

## 9. 開發與測試

```bash
npm test               # Vitest 單元測試（SRS、干擾選項、錯誤歸類、假名、匯入、重複偵測、同步合併、備份還原…）
npm run test:py        # Python 腳本測試
npx playwright install chromium webkit   # 第一次跑 E2E 前
npm run test:e2e       # Playwright E2E（Chromium + WebKit，含截圖檢查，截圖存在 screenshots/）
npm run mock-cloud     # 模擬雲端伺服器（E2E 會自動啟動）
```

專案結構：

```
src/lib/       純邏輯：kana、distractors、errorTypes、srs（FSRS）、importer、questions、session、stats
src/db/        Dexie 資料庫、所有寫入（repo）、示範資料、備份還原
src/sync/      同步層：SyncBackend 介面、SupabaseBackend、MockBackend、同步引擎、合併規則
src/pages/     各頁面
scripts/       import_pdf.py、convert_doc.py、mock-cloud.mjs
supabase/      schema.sql（資料表＋RLS）
tests/         unit（Vitest）、e2e（Playwright）、python、fixtures
```

更多設計細節見 [PLAN.md](PLAN.md)；待確認事項見 [QUESTIONS.md](QUESTIONS.md)。
