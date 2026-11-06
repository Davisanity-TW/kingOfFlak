import {
  formatTaipei,
  readLeaderboard,
  ServiceError,
  submitScore,
} from "./leaderboard.ts";
import type { Score } from "./leaderboard.ts";

export function resultBoard(base: string | undefined) {
  const panel = document.querySelector<HTMLDialogElement>("#leaderboard")!;
  const upload = document.querySelector<HTMLElement>("#upload-status")!;
  const summary = document.querySelector<HTMLElement>("#round-summary")!;
  const status = document.querySelector<HTMLElement>("#board-status")!;
  const rows = document.querySelector<HTMLTableSectionElement>("#board-rows")!;
  const retry = document.querySelector<HTMLButtonElement>("#reload-board")!;
  const result = document.querySelector<HTMLButtonElement>("#result-board")!;
  const record = document.querySelector<HTMLElement>("#new-record")!;
  const entry = document.querySelector<HTMLButtonElement>("#entry-board")!;
  const replay = document.querySelector<HTMLButtonElement>("#replay-board")!;
  let generation = 0;
  let busy = false;
  let submitting = false;
  let score: Score | undefined;
  let confirmed = false;
  let uploadMessage = "";
  let opener: HTMLElement | null = null;

  function badge(ranked: boolean) {
    record.hidden = !ranked;
    result.textContent = entry.textContent = ranked
      ? "查看排行榜 · 新入榜"
      : "查看排行榜";
  }
  function close() {
    panel.close();
    opener?.focus({ preventScroll: true });
  }
  function open(button: HTMLButtonElement) {
    if (panel.open) return;
    opener = button;
    panel.showModal();
    void read(generation);
  }
  entry.addEventListener("click", () => open(entry));
  result.addEventListener("click", () => open(result));
  document.querySelector("#back-board")!.addEventListener("click", close);
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const targets = [
      ...panel.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [tabindex='0']",
      ),
    ].filter((element) => !element.hidden);
    const index = targets.indexOf(document.activeElement as HTMLElement);
    const next =
      (index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
    event.preventDefault();
    targets[next]?.focus();
  });
  panel.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  panel.addEventListener("click", (event) => {
    const rect = panel.getBoundingClientRect();
    if (
      event.target === panel &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    )
      close();
  });

  async function read(token: number): Promise<void> {
    if (busy || submitting || token !== generation) return;
    rows.replaceChildren();
    badge(false);
    upload.textContent = uploadMessage;
    if (!base) {
      retry.disabled = true;
      status.textContent = "排行榜暫時無法使用";
      return;
    }
    busy = true;
    retry.disabled = true;
    status.textContent = "讀取排行榜中…";
    try {
      const scores = await readLeaderboard(base);
      if (token !== generation) return;
      let ranked = false;
      scores.forEach((row, index) => {
        const current =
          !!score &&
          row.roundId === score.roundId &&
          row.nickname === score.nickname &&
          row.mode === score.mode &&
          row.scoreTenths === score.scoreTenths;
        ranked ||= current;
        const tr = document.createElement("tr");
        if (current) tr.classList.add("current-round");
        for (const text of [
          `${index + 1}${current ? " · 本局 · 新入榜" : ""}`,
          `${row.nickname}_${row.mode}`,
          (row.scoreTenths / 10).toFixed(1),
          formatTaipei(row.receivedAt),
        ]) {
          const td = document.createElement("td");
          td.textContent = text;
          tr.append(td);
        }
        rows.append(tr);
      });
      if (ranked) {
        confirmed = true;
        uploadMessage = "本局成績已收錄。";
      }
      badge(ranked);
      if (score)
        upload.textContent = confirmed
          ? ranked
            ? "本局成績已收錄 · 新入榜"
            : "本局曾收錄 · 目前未入前 50 名"
          : uploadMessage;
      status.textContent = scores.length
        ? `共 ${scores.length} 筆紀錄`
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
  retry.addEventListener("click", () => void read(generation));
  return {
    close,
    isOpen: () => panel.open,
    clear() {
      generation++;
      close();
      busy = submitting = confirmed = false;
      score = undefined;
      result.hidden = replay.hidden = summary.hidden = true;
      badge(false);
      rows.replaceChildren();
      uploadMessage =
        upload.textContent =
        summary.textContent =
        status.textContent =
          "";
    },
    async finish(finished: Score) {
      const token = ++generation;
      score = finished;
      confirmed = false;
      busy = false;
      submitting = true;
      result.hidden = replay.hidden = summary.hidden = false;
      summary.textContent = `本局：${score.nickname}_${score.mode} · ${(score.scoreTenths / 10).toFixed(1)} 秒`;
      retry.disabled = true;
      rows.replaceChildren();
      badge(false);
      uploadMessage = upload.textContent = "上傳本局成績中…";
      if (!base) {
        submitting = false;
        uploadMessage = upload.textContent = "未設定成績服務，本局未上傳。";
        await read(token);
        return;
      }
      try {
        const submitted = await submitScore(score, base);
        if (token !== generation) return;
        confirmed = !("stored" in submitted);
        uploadMessage = confirmed
          ? "本局成績已上傳。"
          : "本局未入前 50 名，未收錄。";
      } catch (error) {
        if (token !== generation) return;
        uploadMessage =
          error instanceof ServiceError && error.status < 500
            ? "本局成績未上傳：服務拒絕此次提交。"
            : "成績上傳狀態未確認";
      }
      if (token === generation) {
        submitting = false;
        await read(token);
      }
    },
  };
}
