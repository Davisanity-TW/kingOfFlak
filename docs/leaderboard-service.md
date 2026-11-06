# 工單 08：共同排行榜服務

本文件契約已同步工單 09 的前 50 名及榜外不留存修訂；新版目前僅完成本機實作，正式 Worker 仍為先前版本，須於發布時套用遷移並部署新版。歷史驗證結果保留於文末。

## 選型與部署

採用 Cloudflare Workers 執行驗證與 HTTP API，D1 持久保存成績；前端繼續使用 GitHub Pages。使用者已確認採用免費方案並完成本機 Wrangler 登入。本次不建立帳號、付費訂閱或額外網域。

正式 API：`https://king-of-flak-scores.king-of-flak.workers.dev`。

隔離測試 API：`https://king-of-flak-scores-test.king-of-flak.workers.dev`。兩者使用不同 D1，測試成績不寫入正式榜單。資料庫 ID 為公開資源識別碼，不是憑證；部署登入資料由 Wrangler 保存在使用者設定目錄，不加入 Git。

依 2026-11-06 查閱的 [Workers 費用](https://developers.cloudflare.com/workers/platform/pricing/)，免費方案每天 100,000 次請求，每次 10 毫秒 CPU；[D1 費用](https://developers.cloudflare.com/d1/platform/pricing/)提供每天 500 萬列讀取、10 萬列寫入與合計 5 GB 儲存。索引維護、限流表更新及清理也會消耗寫入量；這些額度不是玩家局數保證。維持免費方案，超額可能造成請求失敗，不自動升級。日常於 Cloudflare 儀表板檢查使用量；資料表只保留短期限流雜湊，沒有玩家帳號或裝置識別碼。

## 契約

- `GET /scores`：回傳陣列，依 `scoreTenths` 降冪、完整 `receivedAt` 升冪、`id` 升冪固定取前 50 筆。空榜回傳 `[]`。不做日期格式化或用隱藏小數破同分，停用 HTTP 快取。
- `POST /scores`：只接受 `application/json`，UTF-8 負載最多 1,024 bytes。欄位恰為 `roundId`（UUID v4）、`nickname`（原名）、`mode`（`pc` 或 `mb`）、`scoreTenths`（0 至 `Number.MAX_SAFE_INTEGER` 的整數）；未知欄位拒絕。暱稱使用工單 07 的共用 `parseNickname`，不信任前端檢查。
- 成績換算共用 `toScoreTenths(seconds) = Math.round(seconds * 10)`；拒絕非有限、負數或換算後無法精確表示的數值。畫面與提交皆使用同一結果，沒有任意局長上限。
- 成功新增回傳 `201` 與紀錄，新增獨立伺服器 UUID `id`、UTC 毫秒 `receivedAt`；相同局次與相同正規化內容回傳原紀錄及 `200`，時間不變。同 ID 不同內容回傳 `409 round_conflict`。不同 ID 即使同名同分仍各自競爭榜位。未入前 50 名回傳 `200 { "stored": false }`，不是提交失敗；前端保留本局摘要並顯示未收錄。
- `400`：JSON 或欄位錯誤；`403`：來源不允許；`404`：路徑錯誤；`405`：不允許的方法；`413`：負載過大；`415`：非 JSON；`429`：限流，附 `Retry-After` 秒數；`503`：儲存服務失敗。錯誤回傳 `{ "error": "代碼" }`，不回傳內部 SQL 或憑證。

2026-11-06 追加保留政策：D1 成績表只保留目前前 50 名。同一原子批次內完成候選新增、依原排序刪除榜外成績及查詢提交結果，提交後不留榜外資料；限流桶另依原有期限清理。交易內暫時寫入再刪除仍消耗 D1 寫入額度。未入榜與被擠出資料不另留歷史或局次墓碑，因此防重複與內容衝突檢查只對榜內仍存在的局次有效；前端仍只提交一次，不補傳。榜單滿 50 筆時，同分沿用完整伺服器時間及 ID 決定前後。

既有資料以 `server/migrations/0002_keep_top_fifty.sql` 按相同排序裁切至 50 筆；部署新版前須套用對應正式／隔離環境遷移，會移除原本第 51 名以後的資料。本輪只驗證獨立本機資料，尚未修改正式資料庫。

正式環境只允許網站來源 `https://davisanity-tw.github.io`；來源的單位是 origin，無 `/kingOfFlak/` 路徑。無 Origin 的直接 GET 可讀取公開榜單；POST 必須附允許的 Origin。測試及本機來源由 `wrangler.jsonc` 分開設定，不使用萬用 CORS，也不開放更新、刪除或 SQL API。

每個 Cloudflare 可信 `CF-Connecting-IP` 每 UTC 分鐘最多 20 次新局提交嘗試；原紀錄重送不消耗新名額，同時到達的重送可能消耗名額，但仍不新增重複紀錄。D1 原子批次完成限流與新增，以唯一局次鍵處理競爭。分鐘重設可能允許邊界前後短時間各 20 次；同一網路共用 IP 的玩家共用額度。資料庫只保存 IP 與分鐘的 SHA-256 雜湊，不保存原始 IP；過期桶於後續新提交清理。本機測試可指定此標頭，線上由 Cloudflare 覆寫。

來源限制與限流不是身分驗證或防作弊；能偽造請求的玩家仍可提交虛構成績。這是接受用戶端成績的休閒榜，沒有重播認證、跨裝置玩家識別或離線補傳。

## 遊戲串接邊界

有效開局建立新 UUID，死亡時固定原名、模式、局次及換算後分數，只自動提交一次。未死亡、暫停、重新載入或倒數不提交。重玩立即建立下一局，舊局請求不修改新局狀態。請求 5 秒逾時，不自動重送。

目前僅在設定 `VITE_LEADERBOARD_URL` 時啟用提交；未設定就維持工單 07 離線遊戲。工單 09 才呈現上傳結果、共同榜單、台北日期與弱網提示；本單不把讀榜成功當作上榜成功。公開 GitHub Pages 尚未推送本輪前端；部署流程已設定正式 API，下一次發布會使用它。

## 重現與維護

```sh
npm ci
npm run api:migrate:local
npm run api:dev
```

另一個終端執行：

```sh
VITE_LEADERBOARD_URL=http://127.0.0.1:8787 npm run dev
```

開啟 `http://127.0.0.1:5174/` 完成一局，再開啟 `http://127.0.0.1:8787/scores` 查看收錄。手機模式可在瀏覽器觸控模擬下橫放測試；跨實機可用正式網站發布後驗收，不把各自 localStorage 當共同榜單。

```sh
npm run test:unit
npm run test:api
npm run test:e2e
npm run build
npm run format:check
```

`test:api` 建立暫存 D1、啟動真正 Worker，依序驗證 API、實際電腦／手機模擬局次、排序及重新啟動後持久化；結束後刪除自建的暫存資料。使用已安裝的 Chrome，需要可啟動原生瀏覽器的環境。不要與其他瀏覽器測試同時執行，以免失焦觸發遊戲暫停。

線上驗證只允許隔離測試 Worker；須先確認測試資料庫為空，不能對已有他人測試資料的環境直接重跑。下列命令不會清除資料：

```sh
FLAK_TEST_API_URL=https://king-of-flak-scores-test.king-of-flak.workers.dev npm run test:api
```

線上測試略過大量灌分、同 IP 限流及本機程序重啟項目；這三項由本機 D1 測試覆蓋，避免用同一真實 IP 在測試中繞過限制。重跑前僅由管理者確認測試環境資料可清除後，使用 Wrangler 清理測試表；不得將測試環境的全量清空命令套用正式表；正式部署僅執行既定的前 50 名裁切遷移。

初次建立其他帳號的環境，先 `npx wrangler login`，再執行 `npx wrangler d1 create <資料庫名稱>`，把回傳 ID 填入對應 `wrangler.jsonc` 綁定；正式與測試各一份。部署及遷移只使用管理者登入，不提供前端資料庫金鑰：

```sh
npx wrangler d1 migrations apply king-of-flak-scores --remote
npm run api:deploy
npx wrangler d1 migrations apply king-of-flak-scores-test --remote --env test
npx wrangler deploy --env test
```

資料結構見 `server/migrations/0001_scores.sql`，服務入口為 `server/worker.ts`，前後端契約與換算為 `src/leaderboard.ts`。本機 Wrangler 狀態及 `.env`、`.dev.vars` 已忽略；`.env.example` 只含公開 API URL 範例。遷移及部署方式依 [D1 官方入門](https://developers.cloudflare.com/d1/get-started/)。

## 本輪驗證結果

2026-11-06：29 項單元測試、8 項本機 Worker／D1 測試、36 項 Chrome／Playwright WebKit 遊戲回歸、型別檢查、格式與正式建置皆通過。線上測試 5 項通過、3 項依上述計畫略過。兩個獨立 Chrome 環境（電腦、640×360 觸控手機模擬）使用本輪實際遊戲完成局次，確認死亡前無提交、死亡後各新增一筆、顯示秒數與提交一致，以及兩邊讀取同一份線上 D1。API 同時重送只新增一筆，衝突拒絕；測試榜共 4 筆，正式榜仍為空。

正式 Worker 版本為 d387278e-217b-4833-b30c-628ec340609e；測試 Worker 重新部署版本為 e86b06a1-637b-4afe-b202-c9b30f6423d8。重新部署後再次讀取並逐欄比較，4 筆紀錄、ID 與收錄時間均未變動。新網域首次 TLS 佈建曾暫時無法握手，後續 HTTPS 與瀏覽器請求已驗證正常。

回歸測試的移動情境改用固定隨機彈幕，避免隨機撞擊提早結算；旋轉測試先等待暫停生效才轉回。曾在修改設定觸發 Vite 重載期間產生失敗，最終保持設定不變、依序執行的完整測試為 36／36 通過。本輪未重跑真實手機／Safari 軟鍵盤或 10 分鐘壓測；這些不由手機模擬替代。

## 正式發布授權

2026-11-06 使用者確認工單 08 本機測試成功並授權正式發布。GitHub Pages 部署於建置時指定正式 API；本機 `.env.local` 不納入 Git。發布版本以公開網站 `version.txt` 為準。排行榜介面與上傳結果提示仍由工單 09 交付。
