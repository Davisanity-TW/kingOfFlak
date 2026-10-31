# 彈幕生存遊戲

工單 01：電腦版最小可玩循環。使用 TypeScript、原生 Canvas 與 Vite，無執行階段框架。以方向鍵移動，接觸子彈結算，按「再飛一次」重設本局。

目前使用 6 顆固定、可重現且會反彈的測試子彈；正式追蹤彈幕屬於工單 02。手機搖桿與暫停分別屬於工單 03、04。

## 安裝與啟動

需要 Node.js 22.18 以上；本次使用 Node.js 26。執行：

```sh
npm ci
npm run dev
```

本機測試網址：http://127.0.0.1:5174/ 。伺服器需保持執行；此網址只能在本機使用。

## 驗證與建置

```sh
npm run typecheck
npm run format:check
npm run test:unit
npm run test:e2e
npm test
npm run build
npm run preview
```

瀏覽器測試使用已安裝的 Google Chrome，由 Playwright 操作。截圖存於 `test-results/`。正式建置輸出至 `dist/`，預覽網址為 http://127.0.0.1:4173/ 。

## 目錄與進入點

- `index.html`：頁面進入點。
- `src/main.ts`：鍵盤、畫面與遊戲狀態串接。
- `src/game.ts`：移動、測試子彈、結算與重設。
- `src/collision.ts`：圓形子彈沿路徑接觸飛機輪廓的判定。
- `src/style.css`、`src/base.css`：版面與樣式。
- `tests/game.test.ts`：輸入、時間、邊界、輪廓、高速穿越與重設測試。
- `tests/browser.spec.ts`：鍵盤開始、畫面移動、結算凍結、重玩與等比例版面。
- `docs/`：遊戲規格與工作規劃。

目前沒有外部服務、憑證或必要環境變數。未進行手機實機、Safari 或真人平衡驗收。

## 本次驗證結果

2026-10-31：8 項遊戲狀態測試與 3 項本機 Google Chrome 瀏覽器測試通過；型別檢查、格式檢查與正式建置通過。瀏覽器已驗證鍵盤開始、方向鍵斜移、鬆開停止、碰撞結算、畫面凍結與立即重玩，並檢查 1440、900、640 像素寬度的地圖等比例顯示。結算與飛行截圖由測試產生於 `test-results/desktop-result.png`、`test-results/desktop-playing.png`。

標準與規格兩軸審查皆指出初始缺少 README，現已補齊。工作單完成狀態記錄於 `docs/work-plan.md`。

2026-10-31：修正 Chrome 首幀負時間差造成畫面凍結後，使用者於 MacBook／Chrome 確認工單 01 全數驗證完成。瀏覽器版本未提供；此確認僅涵蓋工單 01。

## 公開測試部署（工單 02A）

採用 GitHub Pages 與 `.github/workflows/pages.yml`，依照 [Vite 靜態部署指引](https://vite.dev/guide/static-deploy)設定專案資源路徑 `/kingOfFlak/`。目前尚未發布，實際測試網址與已發布 commit 待部署成功後記錄；工單 02A 尚未完成。

首次發布需將儲存庫 Settings → Pages → Source 設為 GitHub Actions。取得推送授權後，將部署流程推送至 `main`：

```sh
git push origin main
```

後續更新同樣推送已驗證的 commit 至 `main`，或使用 `gh workflow run pages.yml --ref main` 重新部署。可透過 `gh run list --workflow pages.yml` 與 `gh run watch <run-id>` 查看結果。流程使用 GitHub 自動提供的 `GITHUB_TOKEN`，不需將憑證寫入專案。

部署成功後，以流程輸出的 HTTPS 網址確認頁面、程式、樣式與重新整理正常；電腦驗證開始、方向鍵移動、碰撞結算與重玩。網址下的 `version.txt` 提供已發布的完整 Git commit，供後續工單確認版本。此靜態網站不依賴開發伺服器或同一個 Wi-Fi。

真實手機驗收尚待執行：使用行動網路開啟發布網址、重新整理並確認畫面載入，記錄裝置型號、瀏覽器與結果。手機搖桿由工單 03 交付。公開網址、電腦線上驗證與真實手機驗收全數完成前，維持 02A 未完成。
