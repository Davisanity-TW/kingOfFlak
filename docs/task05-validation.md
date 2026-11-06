# 工單 05：相容性與效能驗證

日期：2026-11-06。狀態：使用者於 2026-11-06 回報「工單五驗收通過」，依玩家確認結案。未提供的逐裝置版本與測試結果仍保留為紀錄缺口；下表為代理實際取得的證據，不將玩家確認改寫為自動化實測。

## 範圍與版本

以工單 04 的 `7329919` 為遊戲程式基準；本輪新增測試及本紀錄。依 Q13 使用 160 顆子彈、速度每秒 240 單位連續運作 10 分鐘，工單舊有 300 顆／300 速度已同步修正。

本機為 MacBook Neo（Mac17,5）、Apple A18 Pro、8 GB 記憶體，macOS 26.6.2（25G83）。下列版本均來自實際安裝環境，未額外確認是否為發行商最新穩定版。

## 瀏覽器與裝置矩陣

| 組合 | 版本與環境 | 驗證狀態 |
| --- | --- | --- |
| macOS Chrome | 本機 Chrome 156.0.8078.81；Playwright 操作實際安裝的 Chrome，無頭模式 | 11 項操作測試通過；真人操作待驗收 |
| macOS Safari | 本機 Safari 26.6.2（21624.5.1.11.3） | 待驗證；WebDriver 回覆需先在 Safari 設定啟用「允許遠端自動化」；另嘗試原生視窗操作工具，但其 native pipe 啟動失敗。本輪未更動系統設定 |
| Windows Chrome | 使用者可提供；裝置、Windows 與 Chrome 版本待填 | 待驗證 |
| Android Chrome | 尚無裝置；型號、Android 與 Chrome 版本待填 | 待驗證 |
| iPhone Chrome | 尚無裝置；型號、iOS 與 Chrome 版本待填 | 待驗證 |
| iPhone Safari | 使用者可提供；型號、iOS 與 Safari 版本待填 | 待驗證 |
| Playwright WebKit | WebKit 27.2，Playwright 建置 2370 | 11 項引擎操作測試通過；不能代替 macOS Safari 或 iPhone 實機結果 |

## 可重現指令

```sh
npm ci
npx playwright install webkit
npm run test:unit
npm run test:e2e
npm run test:e2e -- --project=chrome
npm run test:e2e -- --project=webkit
npm run test:performance
npm run typecheck
npm run format:check
npm run build
```

`test:e2e` 循序執行 Chrome 與 WebKit；手機案例使用模擬觸控環境及指標事件，不代表真實手指操作。`test:performance` 只執行 Chrome 壓測，需約 10 分鐘，使用真實時間與 `requestAnimationFrame`，不使用虛擬時鐘加速。測試期間避免切換測試視窗、讓系統睡眠或同時開另一輪瀏覽器測試，以免觸發失焦暫停或干擾效能。

一般瀏覽器證據位於忽略追蹤的 `test-results/`，效能報告與截圖位於 `performance-results/`；下一次同類測試會重建對應目錄，需另行保存所需證據。

## 測試方法與限制

- 操作案例涵蓋開始、方向鍵／搖桿、碰撞、結算、重玩、手動暫停、失焦、頁面隱藏及旋轉後恢復。
- 另加入全螢幕請求失敗後仍可遊玩，以及指標取消後搖桿歸零的案例。失焦／頁面隱藏案例派送瀏覽器事件；旋轉案例改變視窗尺寸。實際切換應用程式、通知打斷及觸控取消仍須實機確認。
- 壓測只在 Playwright 網路攔截的模組中改為 160 顆及最高速，執行原本的碰撞計算後忽略死亡結果，讓場景維持 10 分鐘；正式 `src/`、正式建置與一般遊玩沒有無敵模式。
- 每幀檢查遊戲狀態、子彈數、速度與邊界，記錄平均幀率、95 百分位幀間隔、最大幀間隔及超過 50ms 的幀數；結束後檢查鍵盤仍能移動。目標為每秒 60 幀，測試通過與否也需按實測數字判讀，不以無例外等同達標。
- 壓測忽略死亡，因此高速接觸結算與卡頓後碰撞仍以未修改碰撞規則的單元測試及一般操作測試驗證；不以壓測替代碰撞正確性驗證。
- 無頭 Chrome 的幀率不是螢幕實際顯示幀率，也不代表手機 GPU、耗電、溫度或真實觸控延遲。

## 實機驗收步驟

本輪版本尚未發布。於本機執行 `npm run dev`，以 http://127.0.0.1:5174/ 驗收；跨裝置需先發布本輪版本或另行提供可連線的測試服務，既有公開網站不能視為本輪版本。

每種組合請記錄裝置型號、作業系統版本、瀏覽器版本、實測版本編號、測試日期與以下結果：

1. 開始後完成倒數，以方向鍵或搖桿移動，鬆開即停；斜向與貼牆正常。
2. 碰撞後秒數及畫面凍結，按「再飛一次」回到 0.0 秒與 40 顆。
3. 飛行中及倒數中暫停，等候後繼續；重新倒數 3 秒，不跳秒或補生彈幕。
4. 切換分頁／應用程式後回來，應維持暫停；主動繼續才倒數。
5. 手機橫直向切換、按住搖桿後取消觸控、全螢幕不可用時，地圖與控制區不重疊且仍可恢復。
6. 確認文字、按鈕、焦點與最小 640 × 360 橫向布局可辨識；附截圖與問題重現步驟。

效能實機結果需另記 10 分鐘滿量測試的實際幀率及卡頓；目前測試攔截場景僅能由本機 Playwright 啟動，正式公開遊戲不提供壓測入口。


## 10 分鐘 Chrome 壓測結果

測試於 2026-11-06 17:18:52（UTC+8）完成，Chrome 156.0.8078.81、1440 × 1000 視窗、前述 MacBook Neo，無頭模式。

| 指標 | 結果 |
| --- | --- |
| 真實觀測時間 | 600,008.9 ms |
| 樣本幀數 | 35,996 |
| 平均幀率 | 59.9924 FPS |
| 95 百分位幀間隔 | 16.7 ms |
| 最大幀間隔 | 49.9 ms |
| 超過 50 ms 的幀數 | 0 |
| 狀態／數量／速度／邊界異常幀數 | 0 |
| 結束後鍵盤移動 | 通過 |
| 瀏覽器執行錯誤 | 0 |

本機無頭 Chrome 達到約 60 FPS 的目標；此結論限於這次環境與場景，不代表所有目標裝置通過。原始數據與結束畫面存於 `performance-results/performance-160-bullets-at-308b3-onsive-for-ten-real-minutes-chrome/performance.json` 與同目錄的 `performance.png`。


## 跨引擎驗證結果與鍵盤差異

本輪 Chrome 與 WebKit 各 11 項操作案例通過。WebKit 的一般 Tab 不會在此環境聚焦開始按鈕，測試改用 Option+Tab；再以 Enter 開始，仍驗證鍵盤操作及結算後的焦點。此差異符合 [Apple Safari 快捷鍵說明](https://support.apple.com/guide/safari/keyboard-shortcuts-and-gestures-cpsh003/mac)，沒有為測試修改原生按鈕或系統鍵盤設定。

一般操作截圖由測試產生於 `test-results/desktop-result.png`、`test-results/desktop-playing.png`、`test-results/desktop-paused.png`、`test-results/mobile-landscape.png`、`test-results/mobile-paused.png`。兩個引擎依序執行時，同名截圖保留最後執行引擎的版本。

Windows PowerShell 若需執行相同的效能測試，可使用下列指令；`npm run test:performance` 的環境變數寫法適用 macOS／Linux：

```powershell
$env:FLAK_PERFORMANCE = "1"
npx playwright test --project=chrome
Remove-Item Env:FLAK_PERFORMANCE
```
