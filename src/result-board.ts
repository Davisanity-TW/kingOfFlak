import {
  formatTaipei,
  readLeaderboard,
  ServiceError,
  submitScore,
} from "./leaderboard.ts";
import type { Score } from "./leaderboard.ts";

export function resultBoard(base: string | undefined) {
  const panel = document.querySelector<HTMLElement>("#leaderboard")!;
  const upload = document.querySelector<HTMLElement>("#upload-status")!;
  const status = document.querySelector<HTMLElement>("#board-status")!;
  const rows = document.querySelector<HTMLTableSectionElement>("#board-rows")!;
  const retry = document.querySelector<HTMLButtonElement>("#reload-board")!;
  let generation = 0;
  let busy = false;
  async function read(token: number): Promise<void> {
    if (!base || busy || token !== generation) return;
    busy = true;
    retry.disabled = true;
    rows.replaceChildren();
    status.textContent = "讀取排行榜中…";
    try {
      const scores = await readLeaderboard(base);
      if (token !== generation) return;
      scores.forEach((score, index) => {
        const tr = document.createElement("tr");
        for (const text of [
          String(index + 1),
          `${score.nickname}_${score.mode}`,
          (score.scoreTenths / 10).toFixed(1),
          formatTaipei(score.receivedAt),
        ]) {
          const td = document.createElement("td");
          td.textContent = text;
          tr.append(td);
        }
        rows.append(tr);
      });
      status.textContent = scores.length
        ? `共 ${scores.length} 筆紀錄；成功上傳不代表進入前 20 名。`
        : "尚無紀錄";
    } catch (error) {
      if (token !== generation) return;
      status.textContent =
        error instanceof ServiceError
          ? "排行榜暫時無法使用"
          : "離線，無法抓取排行榜";
    } finally {
      if (token === generation) {
        busy = false;
        retry.disabled = false;
      }
    }
  }
  retry.addEventListener("click", () => {
    void read(generation);
  });
  return {
    clear() {
      generation++;
      busy = false;
      panel.hidden = true;
      rows.replaceChildren();
      upload.textContent = "";
      status.textContent = "";
    },
    async finish(score: Score) {
      const token = ++generation;
      busy = false;
      panel.hidden = false;
      retry.disabled = true;
      rows.replaceChildren();
      if (!base) {
        upload.textContent = "未設定成績服務，本局未上傳。";
        status.textContent = "排行榜暫時無法使用";
        return;
      }
      upload.textContent = "上傳本局成績中…";
      try {
        await submitScore(score, base);
        if (token !== generation) return;
        upload.textContent = "本局成績已上傳。";
      } catch (error) {
        if (token !== generation) return;
        upload.textContent =
          error instanceof ServiceError && error.status < 500
            ? "本局成績未上傳：服務拒絕此次提交。"
            : "成績上傳狀態未確認";
      }
      if (token === generation) await read(token);
    },
  };
}
