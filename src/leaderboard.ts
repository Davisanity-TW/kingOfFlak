import { parseNickname } from "./nickname.ts";

export type Score = Readonly<{
  roundId: string;
  nickname: string;
  mode: "pc" | "mb";
  scoreTenths: number;
}>;
export type RankedScore = Score & {
  id: string;
  receivedAt: string;
};

export function toScoreTenths(seconds: number): number {
  const value = Math.round(seconds * 10);
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(value))
    throw new RangeError("Invalid survival time");
  return value;
}

export function parseScore(value: unknown): Score | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const score = value as Record<string, unknown>;
  if (
    Object.keys(score).sort().join(",") !==
      "mode,nickname,roundId,scoreTenths" ||
    typeof score.roundId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      score.roundId,
    ) ||
    (score.mode !== "pc" && score.mode !== "mb") ||
    typeof score.scoreTenths !== "number" ||
    !Number.isSafeInteger(score.scoreTenths) ||
    score.scoreTenths < 0
  )
    return null;
  const nickname = parseNickname(score.nickname);
  return nickname === null
    ? null
    : Object.freeze({
        roundId: score.roundId.toLowerCase(),
        nickname,
        mode: score.mode,
        scoreTenths: score.scoreTenths,
      });
}

export class ServiceError extends Error {
  status: number;
  constructor(status: number) {
    super(`Service returned ${status}`);
    this.status = status;
  }
}

export function formatTaipei(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

export async function submitScore(
  score: Score,
  base: string,
): Promise<RankedScore | { stored: false }> {
  const response = await fetch(`${base.replace(/\/$/, "")}/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(score),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new ServiceError(response.status);
  return response.json();
}

export async function readLeaderboard(
  base: string,
  requestedMode: Score["mode"],
): Promise<RankedScore[]> {
  const response = await fetch(
    `${base.replace(/\/$/, "")}/scores?mode=${requestedMode}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new ServiceError(response.status);
  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new ServiceError(502);
  }
  if (!Array.isArray(rows)) throw new ServiceError(502);
  return rows.slice(0, 50).map((row) => {
    if (!row || typeof row !== "object") throw new ServiceError(502);
    const { roundId, nickname, mode, scoreTenths, id, receivedAt } = row;
    const score = parseScore({ roundId, nickname, mode, scoreTenths });
    if (
      !score ||
      score.mode !== requestedMode ||
      typeof id !== "string" ||
      typeof receivedAt !== "string" ||
      !Number.isFinite(Date.parse(receivedAt))
    )
      throw new ServiceError(502);
    return { ...score, id, receivedAt };
  });
}
