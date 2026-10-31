---
name: task-auto-commit
description: 在 kingOfFlak 專案執行 task 時套用；每完成一張 task 並通過相關驗證後，自動建立一筆本機 Git commit。
---

# 完成任務後自動提交

目標儲存庫為 `https://github.com/Davisanity-TW/kingOfFlak`。使用者已授權每完成一張 task 自動 commit，無須逐次詢問。此授權涵蓋本機提交；push 需使用者另行指示。

## 任務開始

- 讀取並遵循專案根目錄的 `skills/project-language/SKILL.md`。
- 執行 `git rev-parse --show-toplevel`、`git remote -v` 與 `git status --short`，記錄既有變更。確認目前工作區的 remote 指向目標儲存庫；接受 HTTPS 與 SSH 格式，以及可選的 `.git` 結尾。
- 若尚未初始化 Git、remote 缺少或不符，回報無法自動提交的原因；保留任務成果，等待使用者提供正確 checkout 或設定指示。不要自行初始化、切換儲存庫或修改 remote。

## 每張任務完成時

1. 確認該張 task 的要求已實作，並執行適用的測試或檢查。驗證失敗或任務未完成時，先處理問題，暫不提交。
2. 檢查 `git diff`、`git diff --cached` 與新增檔案內容，只選入本張 task 的變更。排除憑證、機密、產生的檔案及使用者原有的無關變更。
3. 使用明確路徑執行 `git add -- <paths>`；同一檔案混有無關變更時，僅暫存相關區塊。若 index 已有無關的暫存內容，保留原狀並回報阻礙，避免混入提交。
4. 再次確認暫存差異，以簡短英文祈使句建立一筆 commit，例如 `git commit -m "Add task completion tracking"`。有 task 編號時，將編號納入訊息，方便追溯。
5. 執行 `git log -1 --oneline` 與 `git status --short`，確認提交成功後，在對話框以繁體中文說明該次 commit 的變更內容及驗證結果，並附上 commit 短雜湊；Git commit 訊息仍維持英文。多張 task 分別完成、驗證與提交，無變更時略過空提交。
6. 同一則完成回覆還須提供測試網址，以及以玩家角度撰寫的本輪測試項目：
   - 測試網址：提供對應本輪版本的可點擊網址；本機測試須附上必要的啟動方式。若尚無可用網址，明確說明原因與取得方式，不得臆測網址或宣稱已部署。
   - 玩家測試項目：依本輪變更列出玩家可操作的步驟與預期可見結果，涵蓋受影響的遊玩流程，並區分已執行的驗證與待玩家測試的項目。若僅修改文件或工具、無玩家可見變更，明確標示本輪無需玩家測試並說明原因。

## 失敗處理

提交被權限、Git 身分、hook 或衝突阻擋時，保留成果並回報具體原因。遵守現有 hook 與簽署設定；不得為完成提交而略過檢查、變更身分、amend、reset 或強制推送。尚未成功提交時，明確標示提交仍待完成。
